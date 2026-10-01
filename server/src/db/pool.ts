// Connects Node.js to PostgreSQL (hosted on Supabase).
import 'dotenv/config'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// The connection to the database always uses TLS (encrypted), except for a database on this same machine or when
// DATABASE_SSL=false is set explicitly. If DATABASE_CA_CERT holds the database's CA certificate (PEM text), the server's
// identity is verified as well; without it the traffic is encrypted but the server certificate is not checked.
function wantsTls(): boolean {
  if (process.env.DATABASE_SSL === 'false') return false
  if (process.env.DATABASE_SSL === 'true') return true
  try {
    return !['localhost', '127.0.0.1', '::1'].includes(new URL(connectionString as string).hostname)
  } catch {
    return true
  }
}

const ssl = wantsTls()
  ? process.env.DATABASE_CA_CERT
    ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true }
    : { rejectUnauthorized: false }
  : undefined

export const pool = new Pool({
  connectionString,
  ssl,
  // small pool: shared hosting and Supabase both limit simultaneous connections
  max: Number(process.env.DB_POOL_MAX) || 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})

// An idle connection dropped by the network must not crash the whole server
pool.on('error', (err) => {
  console.error('[db] idle connection error:', err.message)
})
