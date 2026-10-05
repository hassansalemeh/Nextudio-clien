// Usage:
//   npx tsx src/scripts/reset-password.ts <email> [password]
//
// Resets an existing app_users account's password, hashed the same way login verifies it
// (modules/auth/auth.service.ts), and deletes all of that user's auth_sessions rows so any
// device currently logged in is signed out immediately.
//
// If [password] is omitted, a strong random 12-character password is generated (no look-alike
// characters like 0/O or 1/l/I) and printed once - this is the recommended way to run this script.
// A supplied password must be at least 10 characters.
import crypto from 'crypto'
import { hashPassword } from '../modules/auth/auth.service'
import { pool } from '../db'

const MIN_PASSWORD_LENGTH = 10
const GENERATED_PASSWORD_LENGTH = 12

// No 0/O or 1/l/I - easy to misread, especially handing a password over verbally or by chat.
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*-_=+'
const ALL = LOWER + UPPER + DIGITS + SYMBOLS

function randomChar(charset: string): string {
  return charset[crypto.randomInt(charset.length)]
}

function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  // Guarantee at least one of each category, then fill the rest and shuffle.
  const chars = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)]
  while (chars.length < length) chars.push(randomChar(ALL))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

async function main() {
  const [email, password] = process.argv.slice(2)

  if (!email) {
    console.log(`Usage: npm run reset-password -- <email> [password]\n  If [password] is omitted, a strong random one is generated and printed once.\n  A supplied password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
    process.exit(1)
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    console.log(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    process.exit(1)
  }

  const user = await pool.query('SELECT id FROM app_users WHERE lower(email) = lower($1)', [email.trim()])
  if (user.rows.length === 0) {
    console.log(`No account found for "${email}"`)
    process.exit(1)
  }
  const userId = user.rows[0].id

  const newPassword = password ?? generatePassword()
  await pool.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [hashPassword(newPassword), userId])
  const sessions = await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId])

  console.log(`Password reset for ${email}. ${sessions.rowCount} existing session(s) logged out.`)
  if (!password) {
    console.log(`New password (shown once): ${newPassword}`)
  }

  await pool.end()
}

main().catch((err) => {
  console.log('Failed:', err.message)
  process.exit(1)
})
