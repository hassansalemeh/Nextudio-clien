import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// This file configures the Prisma CLI only (schema location, and the connection URL used by
// `prisma db pull`/`prisma generate`). It has no effect at runtime - the running server always
// connects through the existing `pg` Pool in src/db/pool.ts via @prisma/adapter-pg. See the
// comment at the top of prisma/schema.prisma for why `prisma migrate`/`db push` must never run.
//
// `prisma generate` (part of `npm run build`) only reads the schema and doesn't touch the
// database, so it must keep working in CI/Docker builds where DATABASE_URL isn't set (.env is
// deliberately excluded from the Docker build context). Only `db pull` needs a real value here -
// using env('DATABASE_URL') would throw during generate/build when it's unset, so read it
// directly off process.env instead and let it be empty/undefined for everything but db pull.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
