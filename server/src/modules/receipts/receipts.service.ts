import type { PoolClient } from 'pg'
import { RECEIPT_ADMIN_SIGNERS, RECEIPT_PREFIX } from '../../config'
import { lockForNumbering, pool, retryOnUniqueViolation, withTransaction } from '../../db'
import { HttpError, isIsoDate, roundMoney } from '../../shared'
import { DOCUMENT_LANGUAGES, isDocumentLanguage } from '../../shared/i18n/documentLabels'
import * as receiptsRepository from './receipts.repository'

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseHeader(body: Record<string, unknown>) {
  const receipt_number = typeof body.receipt_number === 'string' ? body.receipt_number.trim() : ''
  const receipt_date = body.receipt_date
  const receiver_name = optionalText(body.receiver_name)
  const amount = body.amount
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD'
  const reason = optionalText(body.reason)
  const issued_by_admin = typeof body.issued_by_admin === 'string' ? body.issued_by_admin.trim() : ''
  const document_language = body.document_language ?? 'en'

  if (!receipt_number) throw new HttpError(400, 'Receipt number is required')
  if (!isIsoDate(receipt_date)) throw new HttpError(400, 'Receipt date is required')
  if (!receiver_name) throw new HttpError(400, "Receiver's name is required")
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Amount must be greater than 0')
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Currency must be a 3-letter code such as USD')
  if (!reason) throw new HttpError(400, 'Reason for the payment is required')
  if (!RECEIPT_ADMIN_SIGNERS.includes(issued_by_admin)) {
    throw new HttpError(400, 'Issuing admin must be one of: ' + RECEIPT_ADMIN_SIGNERS.join(', '))
  }
  if (!isDocumentLanguage(document_language)) {
    throw new HttpError(400, 'Document language must be one of: ' + DOCUMENT_LANGUAGES.join(', '))
  }

  return {
    receipt_number,
    receipt_date,
    client_id: body.client_id ? body.client_id : null,
    project_id: body.project_id ? body.project_id : null,
    receiver_name,
    receiver_email: optionalText(body.receiver_email),
    amount: roundMoney(amount),
    currency,
    reason,
    issued_by_admin,
    document_language,
  }
}

export async function listReceipts(organizationId: string) {
  return receiptsRepository.selectReceipts(organizationId)
}

export async function loadReceipt(organizationId: string, id: string | number, db: { query: PoolClient['query'] } = pool) {
  return receiptsRepository.selectReceiptById(organizationId, id, db)
}

// The next free receipt number (within this company): the highest trailing number in this company's
// existing receipt numbers, plus one. Mirrors nextEstimateNumber() - no shared, cross-company DB sequence to race on.
export async function nextReceiptNumber(organizationId: string, db: { query: PoolClient['query'] } = pool): Promise<string> {
  const rows = await receiptsRepository.selectAllReceiptNumbers(organizationId, db)
  let highest = 0
  for (const row of rows) {
    const match = /(\d+)\s*$/.exec(row.receipt_number)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  let candidate = highest + 1
  for (;;) {
    const number = RECEIPT_PREFIX + String(candidate).padStart(4, '0')
    const taken = await receiptsRepository.selectReceiptNumberTaken(organizationId, number, db)
    if (!taken) return number
    candidate++
  }
}

export async function createReceipt(organizationId: string, header: ReturnType<typeof parseHeader>, autoNumber: boolean) {
  return retryOnUniqueViolation(
    () =>
      withTransaction(async (client) => {
        if (!(await receiptsRepository.assertClientExists(client, organizationId, header.client_id))) {
          throw new HttpError(400, 'Client does not exist')
        }
        if (!(await receiptsRepository.assertProjectExists(client, organizationId, header.project_id))) {
          throw new HttpError(400, 'Project does not exist')
        }
        let finalHeader = header
        if (autoNumber) {
          await lockForNumbering(client, organizationId, 'receipt_number')
          finalHeader = { ...header, receipt_number: await nextReceiptNumber(organizationId, client) }
        }
        return receiptsRepository.insertReceipt(client, organizationId, finalHeader)
      }),
    autoNumber ? 5 : 1
  )
}

export async function updateReceiptById(organizationId: string, id: string, header: ReturnType<typeof parseHeader>) {
  await withTransaction(async (client) => {
    const locked = await receiptsRepository.lockReceiptForUpdate(client, organizationId, id)
    if (!locked) throw new HttpError(404, 'Receipt not found')
    if (!(await receiptsRepository.assertClientExists(client, organizationId, header.client_id))) {
      throw new HttpError(400, 'Client does not exist')
    }
    if (!(await receiptsRepository.assertProjectExists(client, organizationId, header.project_id))) {
      throw new HttpError(400, 'Project does not exist')
    }
    await receiptsRepository.updateReceipt(client, organizationId, id, header)
  })
}
