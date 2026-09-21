import { pool } from './db'

async function main() {
  try {
    await pool.query('SELECT 1 AS ok')
    console.log('Database connection succeeded')
  } catch {
    console.log('Database connection failed')
  } finally {
    await pool.end()
  }
}

main()
