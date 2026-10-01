import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../lib/apiError'

// Loads a page's data on mount (and whenever `deps` changes), tracking loading/error state so pages don't
// each reinvent it. `setData` is exposed for optimistic updates (e.g. after creating an item).
// Usage: const { data: clients, setData: setClients, loading, error, reload } = useLoadData(fetchClients, [], 'Could not load clients.')
export function useLoadData<T>(loader: () => Promise<T>, deps: unknown[], fallbackError: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    return loader()
      .then((result) => setData(result))
      .catch((err) => setError(getErrorMessage(err, fallbackError)))
      .finally(() => setLoading(false))
    // deps spread intentionally: callers pass the loader's own dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    reload()
  }, [reload])

  return { data, setData, loading, error, setError, reload }
}
