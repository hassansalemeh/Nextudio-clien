// Usage:
//   npm run remove-login -- <email>
//
// Removes a user's LOGIN only: the app_users row and every organization_members row for them (deleting
// app_users cascades to auth_sessions, so every device is signed out immediately). If the login belongs to
// an employee, the employee record itself, and all of their recorded hours and project costs, are left
// completely untouched - only their organization_member_id link is cleared, since that row is going away.
//
// Prints exactly what it is about to remove and asks for confirmation before doing anything. Refuses if
// this user is the only admin/owner of an organization they belong to.
import readline from 'readline/promises'
import { pool, withTransaction } from '../db'

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`${question} Type "yes" to continue: `)
    return answer.trim().toLowerCase() === 'yes'
  } finally {
    rl.close()
  }
}

async function main() {
  const [email] = process.argv.slice(2)
  if (!email) {
    console.log('Usage: npm run remove-login -- <email>')
    process.exit(1)
  }

  const user = await pool.query('SELECT id, email FROM app_users WHERE lower(email) = lower($1)', [email.trim()])
  if (user.rows.length === 0) {
    console.log(`No account found for "${email}"`)
    process.exit(1)
  }
  const userId = user.rows[0].id

  const memberships = await pool.query(
    `SELECT organization_members.id, organization_members.organization_id, organizations.name AS organization_name, organization_members.role
     FROM organization_members
     JOIN organizations ON organizations.id = organization_members.organization_id
     WHERE organization_members.user_id = $1
     ORDER BY organization_members.id`,
    [userId]
  )
  const membershipIds = memberships.rows.map((m) => m.id)

  const employees = await pool.query(
    `SELECT full_name FROM employees WHERE organization_member_id = ANY($1::bigint[])`,
    [membershipIds]
  )

  console.log(`This will remove the login for ${user.rows[0].email}:`)
  console.log('  - the app_users row (and every session currently signed in)')
  for (const m of memberships.rows) {
    console.log(`  - the organization_members row in "${m.organization_name}" (role: ${m.role})`)
  }
  if (memberships.rows.length === 0) {
    console.log('  - (no organization memberships found)')
  }
  for (const e of employees.rows) {
    console.log(`  - nothing else: the employee record "${e.full_name}", their hours and their project costs are kept - only the login goes`)
  }

  for (const m of memberships.rows) {
    if (m.role !== 'admin' && m.role !== 'owner') continue
    const others = await pool.query(
      `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id <> $2 AND role IN ('owner', 'admin') LIMIT 1`,
      [m.organization_id, userId]
    )
    if (others.rows.length === 0) {
      console.log(`Refusing: ${user.rows[0].email} is the last admin/owner of "${m.organization_name}".`)
      process.exit(1)
    }
  }

  const proceed = await confirm('Proceed?')
  if (!proceed) {
    console.log('Cancelled.')
    process.exit(0)
  }

  await withTransaction(async (client) => {
    await client.query('UPDATE employees SET organization_member_id = NULL WHERE organization_member_id = ANY($1::bigint[])', [membershipIds])
    await client.query('DELETE FROM organization_members WHERE user_id = $1', [userId])
    await client.query('DELETE FROM app_users WHERE id = $1', [userId])
  })

  console.log(`Removed login for ${user.rows[0].email}.`)
  await pool.end()
}

main().catch((err) => {
  console.log('Failed:', err.message)
  process.exit(1)
})
