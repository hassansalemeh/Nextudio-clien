// Minimal mysqldump reader: pulls row tuples out of `INSERT INTO \`table\` VALUES (...),(...);` statements
// without needing a MySQL client. Respects single-quoted strings (backslash-escaped, matching mysqldump's
// default), so commas/parens inside narration text never break field boundaries.
import { readFileSync } from 'fs'

export type Row = (string | null)[]

function parseTuples(valuesStr: string): Row[] {
  const out: Row[] = []
  let i = 0
  const n = valuesStr.length
  while (i < n) {
    while (i < n && valuesStr[i] !== '(') i++
    if (i >= n) break
    i++
    const fields: (string | null)[] = []
    let cur = ''
    let inStr = false
    let sawQuote = false
    while (i < n) {
      const ch = valuesStr[i]
      if (inStr) {
        if (ch === '\\') {
          cur += valuesStr[i + 1] === "'" || valuesStr[i + 1] === '\\' ? valuesStr[i + 1] : '\\' + (valuesStr[i + 1] ?? '')
          i += 2
          continue
        } else if (ch === "'") {
          if (valuesStr[i + 1] === "'") {
            cur += "'"
            i += 2
            continue
          }
          inStr = false
          i++
          continue
        } else {
          cur += ch
          i++
          continue
        }
      } else {
        if (ch === "'") {
          inStr = true
          sawQuote = true
          i++
          continue
        } else if (ch === ',') {
          fields.push(cur === 'NULL' && !sawQuote ? null : cur)
          cur = ''
          sawQuote = false
          i++
          continue
        } else if (ch === ')') {
          fields.push(cur === 'NULL' && !sawQuote ? null : cur)
          cur = ''
          sawQuote = false
          i++
          break
        } else {
          cur += ch
          i++
          continue
        }
      }
    }
    out.push(fields)
  }
  return out
}

// Loads every requested table from one mysqldump file in a single read of the file.
export function loadTables(filePath: string, tableNames: string[]): Record<string, Row[]> {
  const content = readFileSync(filePath, 'latin1')
  const result: Record<string, Row[]> = {}
  for (const table of tableNames) {
    const re = new RegExp('INSERT INTO `' + table + '` VALUES (.*?);\\r?\\n', 'gs')
    const rows: Row[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      rows.push(...parseTuples(m[1]))
    }
    result[table] = rows
  }
  return result
}

export function num(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
