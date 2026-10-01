import { useCallback, useRef, useState } from 'react'

// Wraps a server-call handler (form submit, button click) with a loading flag and a guard against
// double-submits: a second call while one is already running is ignored instead of firing twice.
// Usage: const [submit, saving] = useAsyncAction(handleSubmit); <button disabled={saving}>
export function useAsyncAction<Args extends unknown[]>(action: (...args: Args) => Promise<void>) {
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  const run = useCallback(
    async (...args: Args) => {
      // Always prevent a form's native submit/reload, even on a call this guard is about to ignore -
      // otherwise a rapid second click, short-circuited below before reaching the caller's own
      // event.preventDefault(), falls through to a real page navigation instead of being silently dropped.
      ;(args[0] as { preventDefault?: () => void } | undefined)?.preventDefault?.()

      if (pendingRef.current) return
      pendingRef.current = true
      setPending(true)
      try {
        await action(...args)
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    },
    [action]
  )

  return [run, pending] as const
}
