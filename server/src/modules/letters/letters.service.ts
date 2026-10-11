import type { PoolClient } from 'pg'
import { ADMIN_SIGNERS, LETTER_PREFIX } from '../../config'
import { lockForNumbering, pool, retryOnUniqueViolation, withTransaction } from '../../db'
import { HttpError, isIsoDate } from '../../shared'
import { DOCUMENT_LANGUAGES, isDocumentLanguage } from '../../shared/i18n/documentLabels'
import * as lettersRepository from './letters.repository'

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Letters keep their body's own line breaks exactly as typed - blank lines separate paragraphs, lines
// starting with "- "/"* " become a bullet list (see documents.layout.ts's formatBody) - only
// whitespace-only text counts as empty.
function longText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function parseHeader(body: Record<string, unknown>) {
  const letter_number = typeof body.letter_number === 'string' ? body.letter_number.trim() : ''
  const letter_date = body.letter_date
  const recipient_name = optionalText(body.recipient_name)
  const subject = optionalText(body.subject)
  const letterBody = longText(body.body)
  const issued_by_admin = typeof body.issued_by_admin === 'string' ? body.issued_by_admin.trim() : ''
  const document_language = body.document_language ?? 'en'

  if (!letter_number) throw new HttpError(400, 'Letter number is required')
  if (!isIsoDate(letter_date)) throw new HttpError(400, 'Letter date is required')
  if (!recipient_name) throw new HttpError(400, 'Recipient is required')
  if (!subject) throw new HttpError(400, 'Subject is required')
  if (!letterBody) throw new HttpError(400, 'Body is required')
  if (!ADMIN_SIGNERS.includes(issued_by_admin)) {
    throw new HttpError(400, 'Issuing admin must be one of: ' + ADMIN_SIGNERS.join(', '))
  }
  if (!isDocumentLanguage(document_language)) {
    throw new HttpError(400, 'Document language must be one of: ' + DOCUMENT_LANGUAGES.join(', '))
  }

  return {
    letter_number,
    letter_date,
    client_id: body.client_id ? body.client_id : null,
    project_id: body.project_id ? body.project_id : null,
    recipient_name,
    subject,
    body: letterBody,
    issued_by_admin,
    document_language,
  }
}

export async function listLetters(organizationId: string) {
  return lettersRepository.selectLetters(organizationId)
}

export async function loadLetter(organizationId: string, id: string | number, db: { query: PoolClient['query'] } = pool) {
  return lettersRepository.selectLetterById(organizationId, id, db)
}

// The next free letter number (within this company): the highest trailing number in this company's
// existing letter numbers, plus one. Mirrors nextReceiptNumber() - no shared, cross-company DB sequence to race on.
export async function nextLetterNumber(organizationId: string, db: { query: PoolClient['query'] } = pool): Promise<string> {
  const rows = await lettersRepository.selectAllLetterNumbers(organizationId, db)
  let highest = 0
  for (const row of rows) {
    const match = /(\d+)\s*$/.exec(row.letter_number)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  let candidate = highest + 1
  for (;;) {
    const number = LETTER_PREFIX + String(candidate).padStart(4, '0')
    const taken = await lettersRepository.selectLetterNumberTaken(organizationId, number, db)
    if (!taken) return number
    candidate++
  }
}

export async function createLetter(organizationId: string, header: ReturnType<typeof parseHeader>, autoNumber: boolean) {
  return retryOnUniqueViolation(
    () =>
      withTransaction(async (client) => {
        if (!(await lettersRepository.assertClientExists(client, organizationId, header.client_id))) {
          throw new HttpError(400, 'Client does not exist')
        }
        if (!(await lettersRepository.assertProjectExists(client, organizationId, header.project_id))) {
          throw new HttpError(400, 'Project does not exist')
        }
        let finalHeader = header
        if (autoNumber) {
          await lockForNumbering(client, organizationId, 'letter_number')
          finalHeader = { ...header, letter_number: await nextLetterNumber(organizationId, client) }
        }
        return lettersRepository.insertLetter(client, organizationId, finalHeader)
      }),
    autoNumber ? 5 : 1
  )
}

export async function updateLetterById(organizationId: string, id: string, header: ReturnType<typeof parseHeader>) {
  await withTransaction(async (client) => {
    const locked = await lettersRepository.lockLetterForUpdate(client, organizationId, id)
    if (!locked) throw new HttpError(404, 'Letter not found')
    if (!(await lettersRepository.assertClientExists(client, organizationId, header.client_id))) {
      throw new HttpError(400, 'Client does not exist')
    }
    if (!(await lettersRepository.assertProjectExists(client, organizationId, header.project_id))) {
      throw new HttpError(400, 'Project does not exist')
    }
    await lettersRepository.updateLetter(client, organizationId, id, header)
  })
}

// Permanently removes a letter. Unlike a Receipt (a financial record), a letter is free to delete outright.
export async function deleteLetter(organizationId: string, id: string) {
  await withTransaction(async (client) => {
    const locked = await lettersRepository.lockLetterForUpdate(client, organizationId, id)
    if (!locked) throw new HttpError(404, 'Letter not found')
    await lettersRepository.deleteLetterById(client, id)
  })
}
