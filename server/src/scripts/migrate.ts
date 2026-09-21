// Applies the database migrations (the .sql files in the migrations folder) that have not been applied yet.
//   npm run migrate              apply pending migrations
//   npm run migrate:status       show what is applied / pending, change nothing
//   npm run migrate -- --baseline   ONE TIME ONLY on a database whose schema was created by hand: record every current
//                                   migration file as already applied, without running it
// Set TARGET_SCHEMA=name to work in a separate schema (used to test restores without touching the real tables).
import fs from 'fs'
import path from 'path'
import type { PoolClient } from 'pg'
import { pool } from '../db'

export function findMigrationsDir(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(__dirname, '../../migrations'), // deployed package
    path.resolve(__dirname, '../../../supabase/migrations'), // repository
  ].filter(Boolean) as string[]
  const found = candidates.find((dir) => fs.existsSync(dir))
  if (!found) throw new Error('Migrations folder not found (looked in: ' + candidates.join(', ') + ')')
  return found
}

export async function connectToTarget(): Promise<PoolClient> {
  const client = await pool.connect()
  const schema = process.env.TARGET_SCHEMA
  if (schema) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('TARGET_SCHEMA must be lowercase letters, digits and underscores')
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
    await client.query(`SET search_path TO "${schema}", public`)
  }
  return client
}

async function tableExists(client: PoolClient, schema: string, table: string) {
  const result = await client.query('SELECT to_regclass($1) AS t', [`"${schema}"."${table}"`])
  return result.rows[0].t !== null
}

async function main() {
  const args = process.argv.slice(2)
  const statusOnly = args.includes('--status')
  const baseline = args.includes('--baseline')
  const dir = findMigrationsDir()
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const client = await connectToTarget()

  try {
    const schema = process.env.TARGET_SCHEMA ?? 'public'
    const hasTracking = await tableExists(client, schema, 'schema_migrations')
    const hasSchema = await tableExists(client, schema, 'clients')

    // A database that already has the application tables but no migration record was set up by hand.
    if (!hasTracking && hasSchema && !baseline) {
      console.log('This database already contains the application tables, but migrations have never been tracked here.')
      console.log('If it is up to date (it was set up by running the migration files by hand), run ONCE:')
      console.log('    npm run migrate -- --baseline')
      console.log(`That records the ${files.length} existing migration files as applied. Nothing is changed or run.`)
      if (!statusOnly) process.exitCode = 1
      return
    }
    if (!hasTracking && statusOnly) {
      console.log(`Empty database: all ${files.length} migrations are pending.`)
      return
    }
    if (!hasTracking) {
      await client.query('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    }

    const applied = new Set<string>((await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename))

    if (baseline) {
      for (const file of files) {
        if (!applied.has(file)) await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      }
      console.log(`Baseline recorded: ${files.length} migrations marked as applied.`)
      return
    }

    const pending = files.filter((f) => !applied.has(f))
    console.log(`${files.length} migration files, ${files.length - pending.length} applied, ${pending.length} pending.`)
    for (const f of pending) console.log(`  pending: ${f}`)
    if (statusOnly || pending.length === 0) return

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`  applied: ${file}`)
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw new Error(`Migration ${file} failed and was rolled back: ${(err as Error).message}`)
      }
    }
    console.log('All migrations applied.')
  } finally {
    client.release()
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Migration error:', err.message)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
