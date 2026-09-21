// Usage:
//   npx tsx src/scripts/create-user.ts admin <email> <password>
//   npx tsx src/scripts/create-user.ts employee <email> <password> <employee_id>
import { hashPassword } from '../auth'
import { pool } from '../db'

async function main() {
  const [role, email, password, employeeId] = process.argv.slice(2)

  if ((role !== 'admin' && role !== 'employee') || !email || !password || (role === 'employee' && !employeeId)) {
    console.log('Usage:\n  admin <email> <password>\n  employee <email> <password> <employee_id>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.log('Password must be at least 8 characters')
    process.exit(1)
  }

  await pool.query('INSERT INTO app_users (email, password_hash, role, employee_id) VALUES ($1, $2, $3, $4)', [
    email.trim(),
    hashPassword(password),
    role,
    role === 'employee' ? employeeId : null,
  ])
  console.log(`Created ${role} account for ${email}`)
  await pool.end()
}

main().catch((err) => {
  console.log('Failed:', err.message)
  process.exit(1)
})
