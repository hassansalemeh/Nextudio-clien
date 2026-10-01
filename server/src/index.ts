import 'dotenv/config'
import { app } from './app'
import { isProduction } from './middleware/security'

// The host (GoDaddy / Passenger) supplies the port in PORT; 4000 is only the local development default
const port = process.env.PORT ?? 4000

// Errors must be easy to diagnose after launch: everything goes to stdout / stderr, which the host keeps as its logs
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err)
  process.exit(1) // the host restarts the app
})

app.listen(Number(port), () => {
  console.log(`Server started on port ${port} (${isProduction ? 'production' : 'development'})`)
})
