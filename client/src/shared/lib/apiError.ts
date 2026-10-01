// fetch() rejects with a TypeError when the request never reached a server (offline, DNS failure, connection
// refused, CORS). An HTTP error response (404, 500, ...) resolves normally instead, so by the time code gets
// here it has already been turned into a regular Error with a message - only the unreachable case is a TypeError.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    return "Can't reach the server. Check your connection and try again."
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}
