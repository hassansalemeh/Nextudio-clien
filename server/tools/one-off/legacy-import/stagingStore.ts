// On-disk idempotency ledger for the dry run. Simulates the `unique (legacy_book_code,
// legacy_voucher_entry_id)` constraint the real accounting_legacy_journal_line_ref table will enforce
// (see the approved design), without touching any database. Running the pipeline twice against the same
// ledger file must report the second run's lines as 100% already-staged / 0 newly inserted.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export type StagingLedger = { keys: string[] }

export function loadLedger(path: string): Set<string> {
  if (!existsSync(path)) return new Set()
  const data: StagingLedger = JSON.parse(readFileSync(path, 'utf8'))
  return new Set(data.keys)
}

export function saveLedger(path: string, keys: Set<string>) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ keys: [...keys].sort() } satisfies StagingLedger, null, 0))
}

export function key(bookCode: string, legacyVoucherEntryId: number): string {
  return `${bookCode}:${legacyVoucherEntryId}`
}

// Applies a batch of keys against the ledger, returning how many were new vs already present, then
// persists the union. Mirrors what a real "INSERT ... ON CONFLICT DO NOTHING" against the unique
// constraint would report.
export function applyBatch(path: string, newKeys: string[]): { inserted: number; alreadyStaged: number; total: number } {
  const existing = loadLedger(path)
  let inserted = 0
  let alreadyStaged = 0
  for (const k of newKeys) {
    if (existing.has(k)) alreadyStaged++
    else {
      existing.add(k)
      inserted++
    }
  }
  saveLedger(path, existing)
  return { inserted, alreadyStaged, total: newKeys.length }
}
