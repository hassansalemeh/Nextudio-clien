import type { PoolClient } from 'pg'
import type { z } from 'zod'
import { LETTER_PREFIX } from '../../config'
import { lockForNumbering, pool, retryOnUniqueViolation, withTransaction } from '../../db'
import { HttpError } from '../../shared'
import type { letterHeaderShape } from './letters.schemas'
import * as lettersRepository from './letters.repository'

// letter_number and body are optional at the schema level (see letters.schemas), but by the time a header
// reaches these functions both are always concrete strings: updateLetterBody's refine requires letter_number
// for PUT and the POST route fills in an auto-generated one, and the shared shape already requires body to
// be non-null for either verb.
export type LetterHeader = Omit<z.infer<typeof letterHeaderShape>, 'letter_number' | 'body'> & { letter_number: string; body: string }

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

export async function createLetter(organizationId: string, header: LetterHeader, autoNumber: boolean) {
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

export async function updateLetterById(organizationId: string, id: string, header: LetterHeader) {
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
