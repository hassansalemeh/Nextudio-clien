// Usage:
//   npm run set-name -- <email> "<name>"
//
// Sets organization_members.display_name for every membership the given user has (a person can belong
// to more than one company). For a user with no employee record (an admin/owner, e.g. mo@nextudio.co),
// this is the only name they have anywhere in the app - otherwise site visits (and anything else that
// resolves a member's name) falls back to the part of their email before "@".
//
// Pass "" as <name> to clear it back to unset.
//
// Prints the current value, what it will become, and asks for confirmation before updating.
import readline from 'readline/promises'
import { pool } from '../db'

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`${question} Type "yes" to continue: `)
    return answer.trim().toLowerCase() === 'yes'
  } finally {
    rl.close()
  }
}

const MAX_NAME_LENGTH = 100

async function main() {
  const [email, name] = process.argv.slice(2)
  if (!email || name === undefined) {
    console.log('Usage: npm run set-name -- <email> "<name>"')
    process.exit(1)
  }
  const trimmedName = name.trim()
  if (trimmedName.length > MAX_NAME_LENGTH) {
    console.log(`Name must be ${MAX_NAME_LENGTH} characters or fewer`)
    process.exit(1)
  }

  const user = await pool.query('SELECT id, email FROM app_users WHERE lower(email) = lower($1)', [email.trim()])
  if (user.rows.length === 0) {
    console.log(`No account found for "${email}"`)
    process.exit(1)
  }
  const userId = user.rows[0].id

  const memberships = await pool.query(
    `SELECT organization_members.id, organizations.name AS organization_name, organization_members.display_name
     FROM organization_members
     JOIN organizations ON organizations.id = organization_members.organization_id
     WHERE organization_members.user_id = $1
     ORDER BY organization_members.id`,
    [userId]
  )
  if (memberships.rows.length === 0) {
    console.log(`${user.rows[0].email} has no organization memberships.`)
    process.exit(1)
  }

  const newValue = trimmedName || null
  console.log(`This will set the display name for ${user.rows[0].email}:`)
  for (const m of memberships.rows) {
    console.log(`  - "${m.organization_name}": ${m.display_name ?? '(none)'} -> ${newValue ?? '(none)'}`)
  }

  const proceed = await confirm('Proceed?')
  if (!proceed) {
    console.log('Cancelled.')
    process.exit(0)
  }

  const membershipIds = memberships.rows.map((m) => m.id)
  await pool.query('UPDATE organization_members SET display_name = $1 WHERE id = ANY($2::bigint[])', [newValue, membershipIds])

  console.log(`Display name updated for ${user.rows[0].email}.`)
  await pool.end()
}

main().catch((err) => {
  console.log('Failed:', err.message)
  process.exit(1)
})
