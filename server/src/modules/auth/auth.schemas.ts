import { z } from 'zod'

// A single combined message for either field missing, matching the one error the login form has always
// shown - which field was empty isn't useful information to hand back on a login form.
const REQUIRED_MESSAGE = 'Email and password are required'

export const loginBody = z.object({
  email: z.string({ error: REQUIRED_MESSAGE }).trim().min(1, REQUIRED_MESSAGE).max(254, REQUIRED_MESSAGE),
  // Never trimmed: a password is used exactly as typed, whitespace and all.
  password: z.string({ error: REQUIRED_MESSAGE }).min(1, REQUIRED_MESSAGE).max(200, REQUIRED_MESSAGE),
})
