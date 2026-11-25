// Prisma Client, wired to the EXISTING `pg` Pool (see pool.ts) through @prisma/adapter-pg, so
// Prisma and the hand-written SQL in *.repository.ts share one connection pool everywhere -
// including in the test harness, which patches `Pool.prototype` to route through an in-memory
// PGlite database (see tools/test-harness/README.md).
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { pool } from './pool'

const adapter = new PrismaPg(pool)

export const prisma = new PrismaClient({ adapter })
