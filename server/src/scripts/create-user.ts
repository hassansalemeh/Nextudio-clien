// Usage:
//   npx tsx src/scripts/create-user.ts admin <email> <password> <organization>
//   npx tsx src/scripts/create-user.ts employee <email> <password> <employee_id> <organization>
//
// <organization> is the company's name (case-insensitive), e.g. "Nextudio". The user gets both the
// legacy app_users row (role stays 'admin'/'employee' for the frontend) and an organization_members
// row for that company, with the same role - every session now opens inside a specific company, so a
// login with no organization_members row anywhere is rejected (see auth.routes.ts).
import { hashPassword } from '../modules/auth/auth.service'
import { pool } from '../db'
import { Role } from '../shared'

async function main() {
  const [role, email, password, ...rest] = process.argv.slice(2)
  const employeeId = role === Role.Employee ? rest[0] : undefined
  const organizationName = role === Role.Employee ? rest[1] : rest[0]

  if ((role !== Role.Admin && role !== Role.Employee) || !email || !password || !organizationName || (role === Role.Employee && !employeeId)) {
    console.log('Usage:\n  admin <email> <password> <organization>\n  employee <email> <password> <employee_id> <organization>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.log('Password must be at least 8 characters')
    process.exit(1)
  }

  const org = await pool.query('SELECT id FROM organizations WHERE lower(name) = lower($1)', [organizationName])
  if (org.rows.length === 0) {
    console.log(`No organization named "${organizationName}"`)
    process.exit(1)
  }
  const organizationId = org.rows[0].id

  if (role === Role.Employee) {
    const employee = await pool.query('SELECT id, kind FROM employees WHERE id = $1 AND organization_id = $2', [employeeId, organizationId])
    if (employee.rows.length === 0) {
      console.log(`Employee ${employeeId} does not belong to "${organizationName}"`)
      process.exit(1)
    }
    if (employee.rows[0].kind === 'site_worker') {
      console.log(`Employee ${employeeId} is a site worker and never gets a login`)
      process.exit(1)
    }
  }

  const user = await pool.query(
    'INSERT INTO app_users (email, password_hash, role, employee_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [email.trim(), hashPassword(password), role, role === Role.Employee ? employeeId : null]
  )
  await pool.query('INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)', [
    organizationId,
    user.rows[0].id,
    role,
  ])

  console.log(`Created ${role} account for ${email} in "${organizationName}"`)
  await pool.end()
}

main().catch((err) => {
  console.log('Failed:', err.message)
  process.exit(1)
})
