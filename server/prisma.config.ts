import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// This file configures the Prisma CLI only (schema location, and the connection URL used by
// `prisma db pull`/`prisma generate`). It has no effect at runtime - the running server always
// connects through the existing `pg` Pool in src/db/pool.ts via @prisma/adapter-pg. See the
// comment at the top of prisma/schema.prisma for why `prisma migrate`/`db push` must never run.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
