// One-off, re-runnable: splits the combined notes of existing estimates/invoices into the four sections
// (Payment Terms, Timeline, Notes, Exclusions) using the headings already written inside the text.
//   npx tsx tools/one-off/FILE.ts
// Rows that already have a split section are skipped, so running it twice changes nothing.
import { pool } from '../../src/db'

type Sections = { payment_terms: string; timeline: string; notes: string; exclusions: string }

// A line that is only a section heading, e.g. "Payment terms :", "Timeline:", "Notes :", "Exclusions / Notes :"
function headingOf(line: string): keyof Sections | null {
  const text = line.trim()
  if (/^payment terms\s*:?$/i.test(text)) return 'payment_terms'
  if (/^timeline\s*:?$/i.test(text)) return 'timeline'
  if (/^exclusions(\s*\/\s*notes)?\s*:?$/i.test(text)) return 'exclusions'
  if (/^notes\s*:?$/i.test(text)) return 'notes'
  return null
}

export function splitNotes(text: string): Sections {
  const parts: Record<keyof Sections, string[]> = { payment_terms: [], timeline: [], notes: [], exclusions: [] }
  let current: keyof Sections = 'notes' // text before any heading (e.g. bank details) is general notes
  for (const line of text.split('\n')) {
    const heading = headingOf(line)
    if (heading) {
      current = heading
      continue
    }
    parts[current].push(line)
  }
  const clean = (lines: string[]) => lines.join('\n').replace(/^\s*\n+|\n\s*$/g, '')
  return {
    payment_terms: clean(parts.payment_terms),
    timeline: clean(parts.timeline),
    notes: clean(parts.notes),
    exclusions: clean(parts.exclusions),
  }
}

async function main() {
  for (const table of ['estimates', 'invoices']) {
    const rows = (
      await pool.query(
        `SELECT id, notes FROM ${table}
         WHERE notes IS NOT NULL AND payment_terms IS NULL AND timeline IS NULL AND exclusions IS NULL`
      )
    ).rows
    for (const row of rows) {
      const s = splitNotes(row.notes)
      const empty = (value: string) => (value.trim() ? value : null)
      await pool.query(`UPDATE ${table} SET payment_terms = $2, timeline = $3, notes = $4, exclusions = $5 WHERE id = $1`, [
        row.id,
        empty(s.payment_terms),
        empty(s.timeline),
        empty(s.notes),
        empty(s.exclusions),
      ])
      console.log(
        `${table} #${row.id}: payment terms ${s.payment_terms.split('\n').length} lines, timeline ${s.timeline.split('\n').length}, ` +
          `notes ${s.notes ? s.notes.split('\n').length : 0}, exclusions ${s.exclusions ? s.exclusions.split('\n').length : 0}`
      )
    }
  }
  await pool.end()
}

if (require.main === module) {
  main().catch((err) => {
    console.log('Failed:', err.message)
    process.exit(1)
  })
}
