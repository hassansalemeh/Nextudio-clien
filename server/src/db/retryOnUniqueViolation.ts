// A safety net for auto-generated, per-company numbers (estimate/invoice numbers): lockForNumbering()
// (see advisoryLock.ts) is what actually prevents two concurrent requests for the same company from
// picking the same number, on a real connection pool where each request gets its own Postgres session.
// This retry exists in case that's ever bypassed, so a collision self-heals with a freshly computed
// number instead of surfacing an error. Never used for a number the caller typed in themselves - pass
// maxAttempts 1 for that case, so a genuine duplicate still fails with its normal "already used" message.
export async function retryOnUniqueViolation<T>(attempt: () => Promise<T>, maxAttempts: number): Promise<T> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await attempt()
    } catch (err) {
      if ((err as { code?: string }).code === '23505' && i < maxAttempts) continue
      throw err
    }
  }
  /* istanbul ignore next - unreachable: the loop above always returns or throws */
  throw new Error('unreachable')
}
