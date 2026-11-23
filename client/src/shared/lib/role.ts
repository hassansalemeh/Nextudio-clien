// The roles a user can have in the application.
// The values must match what the backend sends (server/src/shared/roles.ts), so they stay lowercase strings.
// client/tsconfig.app.json has "erasableSyntaxOnly": true, which forbids a TypeScript `enum`, so we use this
// object-plus-type pattern instead - it erases to a plain object with no runtime cost beyond that.
export const Role = {
  Admin: 'admin',
  Employee: 'employee',
} as const

export type Role = (typeof Role)[keyof typeof Role]
