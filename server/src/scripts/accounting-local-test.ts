// Isolated PostgreSQL (PGlite) test harness. No network database connections, persistent data or seed apply.
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import type { PoolClient } from 'pg'
import { PGlite, type Extension } from '@electric-sql/pglite'
// This server uses legacy CommonJS module resolution; the extension exposes types only via package exports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist') as { btree_gist: Extension }

async function main() {
  // Set before importing any application module. dotenv cannot override this inert URL.
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/accounting_local_test'
  const db = new PGlite({ extensions: { btree_gist }, parsers: { 20: (value) => value, 1700: (value) => value } })
  const { pool } = await import('../db')
  // Fail closed if a service accidentally uses its own pool instead of the injected test connection.
  pool.connect = (() => { throw new Error('Network database access is forbidden in the local test harness') }) as typeof pool.connect
  pool.query = (() => { throw new Error('Network database access is forbidden in the local test harness') }) as typeof pool.query
  try {
    const directory = path.resolve(__dirname, '../../../supabase/migrations')
    const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()
    for (const file of files) {
      await db.exec(fs.readFileSync(path.join(directory, file), 'utf8'))
    }
    console.log(`Loaded ${files.length} repository migrations into isolated in-memory PostgreSQL.`)
    const { runAccountingSmokeTests } = await import('./accounting-smoke-test')
    // Application code needs only query(). PGlite uses the same parameterized SQL and PostgreSQL engine.
    const client = { query: (sql: string, params?: unknown[]) => db.query(sql, params) } as unknown as PoolClient
    await runAccountingSmokeTests(client)
    const remaining = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM accounting_books WHERE code IN ('SMOKE_A', 'SMOKE_B')`)
    assert.strictEqual(remaining.rows[0].n, 0)
    const entries = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM accounting_journal_entries')
    assert.strictEqual(entries.rows[0].n, 0)
    console.log('Rollback verified: no fixture books or journal entries remain. Production was never connected.')
  } finally {
    await db.close()
    await pool.end()
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
