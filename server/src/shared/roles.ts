// The roles a user can have in the application.
// The values must match what is stored in the database (app_users.role),
// so they stay lowercase strings.
export enum Role {
  Admin = 'admin',
  Employee = 'employee',
}