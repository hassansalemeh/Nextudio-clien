import { pool } from '../../db'

export async function insertSession(tokenHash: string, userId: string, organizationId: string, sessionDays: number) {
  await pool.query(
    `INSERT INTO auth_sessions (token_hash, user_id, organization_id, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [tokenHash, userId, organizationId, String(sessionDays)]
  )
}

export async function selectUserBySession(tokenHash: string) {
  const result = await pool.query(
    `SELECT app_users.id, app_users.email, app_users.role, app_users.employee_id,
            employees.full_name AS employee_name, employees.is_active
     FROM auth_sessions
     JOIN app_users ON app_users.id = auth_sessions.user_id
     LEFT JOIN employees ON employees.id = app_users.employee_id
     WHERE auth_sessions.token_hash = $1 AND auth_sessions.expires_at > now()`,
    [tokenHash]
  )
  return result.rows[0] ?? null
}

export async function selectUserByEmail(email: string) {
  const result = await pool.query('SELECT id, password_hash FROM app_users WHERE lower(email) = lower($1)', [email])
  return result.rows[0] ?? null
}

export async function deleteSession(tokenHash: string) {
  await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash])
}
// Every company this user belongs to, oldest first
export async function selectOrganizationMembersByUser(userId: string) {
  const result = await pool.query(
    `SELECT organization_members.organization_id, organizations.name AS organization_name,
            organization_members.role
     FROM organization_members
     JOIN organizations ON organizations.id = organization_members.organization_id
     WHERE organization_members.user_id = $1
     ORDER BY organization_members.id`,
    [userId]
  )
  return result.rows
}