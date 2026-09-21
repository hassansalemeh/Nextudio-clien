// Restores a backup file made by `npm run backup`.
//   npm run restore -- backups/file.json --dry-run     check the file and the database, change nothing
//   npm run restore -- backups/file.json               load into an EMPTY, already-migrated database
//   npm run restore -- backups/file.json --wipe --confirm=YES   DELETE everything first, then load (destructive!)
// Restoring to a brand new database: run `npm run migrate` first (creates the empty tables), then this.
import fs from 'fs'
import path from 'path'
import { pool } from '../db'
import { connectToTarget } from './migrate'

async function main() {
  const args = process.argv.slice(2)
  const fileArg = args.find((a) => !a.startsWith('--'))
  if (!fileArg) throw new Error('Usage: npm run restore -- <backup-file.json> [--dry-run] [--wipe --confirm=YES]')
  const dryRun = args.includes('--dry-run')
  const wipe = args.includes('--wipe')
  if (wipe && !args.includes('--confirm=YES')) throw new Error('--wipe deletes all current data. Add --confirm=YES if you really mean it.')

  const backup = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8')) as {
    meta: { format: string; created_at: string; counts: Record<string, number> }
    tables: Record<string, Record<string, unknown>[]>
  }
  if (backup.meta?.format !== 'nextudio-backup-v1') throw new Error('This is not a Nextudio backup file')
  console.log(`Backup from ${backup.meta.created_at}`)

  const schema = process.env.TARGET_SCHEMA ?? 'public'
  const client = await connectToTarget()
  try {
    const names = Object.keys(backup.tables)

    // every table in the backup must exist in the database (run the migrations first)
    const existing = new Set(
      (await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1`, [schema])).rows.map((r) => r.table_name)
    )
    const missing = names.filter((n) => !existing.has(n))
    if (missing.length) throw new Error(`These tables do not exist in the database: ${missing.join(', ')}. Run "npm run migrate" first.`)

    // Load order: a table after the tables it references. Some data links in a circle (an estimate belongs to a project,
    // and that project points back at its estimate and invoice). For those links the column is loaded empty first and
    // filled in a second step once every table exists.
    const strip = (name: unknown) => String(name).replace(/^"?[a-z_0-9]+"?\./, '').replace(/"/g, '')
    const deps = (
      await client.query(
        `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
                (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.contype = 'f' AND n.nspname = $1`,
        [schema]
      )
    ).rows.map((r) => ({ child: strip(r.child), parent: strip(r.parent), cols: r.cols as string[] }))

    const ordered: string[] = []
    const state = new Map<string, 'visiting' | 'done'>()
    const deferred: { table: string; cols: string[] }[] = [] // links that close a circle
    const visit = (name: string) => {
      if (state.has(name) || !names.includes(name)) return
      state.set(name, 'visiting')
      for (const d of deps.filter((x) => x.child === name && x.parent !== name && names.includes(x.parent))) {
        if (state.get(d.parent) === 'visiting') deferred.push({ table: name, cols: d.cols })
        else visit(d.parent)
      }
      state.set(name, 'done')
      ordered.push(name)
    }
    names.forEach((n) => visit(n))

    // the target must be empty unless --wipe
    const nonEmpty: string[] = []
    for (const name of names) {
      const n = (await client.query(`SELECT count(*)::int AS n FROM "${name}"`)).rows[0].n
      if (n > 0) nonEmpty.push(`${name} (${n} rows)`)
    }
    if (nonEmpty.length && !wipe) {
      throw new Error(`The database is not empty: ${nonEmpty.join(', ')}. Restore into an empty database, or use --wipe --confirm=YES.`)
    }

    console.log(`${ordered.length} tables, ${ordered.reduce((sum, n) => sum + backup.tables[n].length, 0)} rows to restore.`)
    if (dryRun) {
      for (const name of ordered) console.log(`  ${name.padEnd(24)} ${backup.tables[name].length} rows`)
      console.log('Dry run finished: the file is valid and the database can receive it. Nothing was changed.')
      return
    }

    await client.query('BEGIN')
    if (wipe) await client.query(`TRUNCATE ${ordered.map((n) => `"${n}"`).join(', ')} RESTART IDENTITY CASCADE`)

    for (const name of ordered) {
      const rows = backup.tables[name]
      if (rows.length === 0) continue
      // only ordinary columns: generated columns (like line amounts) are recalculated by the database
      const cols = (
        await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' ORDER BY ordinal_position`,
          [schema, name]
        )
      ).rows.map((r) => `"${r.column_name}"`)
      // columns that close a circle start empty and are filled in below
      const later = new Set(deferred.filter((d) => d.table === name).flatMap((d) => d.cols.map((c) => `"${c}"`)))
      await client.query(
        `INSERT INTO "${name}" (${cols.join(', ')}) OVERRIDING SYSTEM VALUE
         SELECT ${cols.map((c) => (later.has(c) ? 'NULL' : c)).join(', ')} FROM json_populate_recordset(null::"${name}", $1::json)`,
        [JSON.stringify(rows)]
      )
    }
    for (const link of deferred) {
      const rows = backup.tables[link.table]
      if (rows.length === 0) continue
      const set = link.cols.map((c) => `"${c}" = x."${c}"`).join(', ')
      await client.query(
        `UPDATE "${link.table}" t SET ${set} FROM json_populate_recordset(null::"${link.table}", $1::json) x WHERE t.id = x.id`,
        [JSON.stringify(rows)]
      )
    }

    // numbering continues after the highest restored id / invoice number
    for (const name of ordered) {
      const seq = (await client.query(`SELECT pg_get_serial_sequence($1, 'id') AS s`, [`"${schema}"."${name}"`])).rows[0].s
      if (seq) await client.query(`SELECT setval($1, coalesce((SELECT max(id) FROM "${name}"), 1), (SELECT count(*) > 0 FROM "${name}"))`, [seq])
    }
    if (ordered.includes('invoices')) {
      const seq = await client.query(`SELECT to_regclass($1) AS s`, [`"${schema}".invoice_number_seq`])
      if (seq.rows[0].s) {
        await client.query(
          `SELECT setval($1, greatest(coalesce((SELECT max(substring(invoice_number from 9)::int) FROM invoices WHERE invoice_number ~ '^NEX-INV-[0-9]+$'), 0), 1),
                         coalesce((SELECT max(substring(invoice_number from 9)::int) FROM invoices WHERE invoice_number ~ '^NEX-INV-[0-9]+$'), 0) > 0)`,
          [`"${schema}".invoice_number_seq`]
        )
      }
    }

    // prove every table came back complete before committing
    for (const name of ordered) {
      const n = (await client.query(`SELECT count(*)::int AS n FROM "${name}"`)).rows[0].n
      if (n !== backup.tables[name].length) throw new Error(`Table ${name}: restored ${n} rows but the backup has ${backup.tables[name].length}`)
    }
    await client.query('COMMIT')
    console.log('Restore complete. Every table matches the backup.')
    for (const name of ordered) console.log(`  ${name.padEnd(24)} ${backup.tables[name].length} rows`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

main()
  .catch((err) => {
    console.error('Restore failed (nothing was changed):', err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
