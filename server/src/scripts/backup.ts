// Creates a complete backup of the database as one file.
//   npm run backup                 -> backups/nextudio-YYYY-MM-DD-HHMMSS.json
//   npm run backup -- my-file.json -> a file name of your choice
// The file holds ALL business data (including password hashes): keep it private and never commit it.
import fs from 'fs'
import path from 'path'
import { pool } from '../db'
import { connectToTarget } from './migrate'

// tables that hold only temporary data are not backed up
const SKIP_TABLES = new Set(['auth_sessions', 'schema_migrations'])

async function main() {
  const schema = process.env.TARGET_SCHEMA ?? 'public'
  const client = await connectToTarget()
  try {
    // one consistent snapshot of everything, even if people are using the app while it runs
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')

    const tables = (
      await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [schema]
      )
    ).rows
      .map((r) => r.table_name as string)
      .filter((name) => !SKIP_TABLES.has(name))

    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    const requested = process.argv.slice(2).find((a) => !a.startsWith('--'))
    const dir = path.resolve(process.env.BACKUP_DIR ?? 'backups')
    const file = requested ? path.resolve(requested) : path.join(dir, `nextudio-${stamp}.json`)
    fs.mkdirSync(path.dirname(file), { recursive: true })

    const migrations = (await client.query('SELECT to_regclass($1) AS t', [`"${schema}".schema_migrations`])).rows[0].t
      ? (await client.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map((r) => r.filename)
      : []

    const counts: Record<string, number> = {}
    const parts: string[] = []
    for (const table of tables) {
      // json_agg keeps every value exactly (money stays 7975.00, timestamps keep their time zone)
      const result = await client.query(`SELECT coalesce(json_agg(t), '[]'::json)::text AS rows, count(*)::int AS n FROM "${table}" t`)
      counts[table] = result.rows[0].n
      parts.push(`${JSON.stringify(table)}: ${result.rows[0].rows}`)
    }
    await client.query('COMMIT')

    const meta = { format: 'nextudio-backup-v1', created_at: new Date().toISOString(), schema, migrations, counts }
    fs.writeFileSync(file, `{"meta": ${JSON.stringify(meta)},\n"tables": {\n${parts.join(',\n')}\n}}\n`, { mode: 0o600 })

    console.log(`Backup written: ${file}  (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`)
    for (const table of tables) console.log(`  ${table.padEnd(24)} ${counts[table]} rows`)
  } finally {
    client.release()
  }
}

main()
  .catch((err) => {
    console.error('Backup failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
