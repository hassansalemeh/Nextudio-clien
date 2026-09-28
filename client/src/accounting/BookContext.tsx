import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchJson } from './format'

const STORAGE_KEY = 'nx_accounting_book'
const DEFAULT_BOOK_CODE = 'NEXTUDIO'

export type AccountingBook = { id: string; code: string; name: string; currency_code: string; is_active: boolean }

type BookContextValue = {
  books: AccountingBook[]
  loading: boolean
  bookCode: string
  book: AccountingBook | null
  setBookCode: (code: string) => void
}

const BookContext = createContext<BookContextValue | null>(null)

function readStoredBookCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// The current book lives in the URL (?book=NEXTUDIO), so it's shareable and survives navigation between
// accounting pages, and is mirrored to localStorage so the choice "sticks" the next time Accounting is opened
// without a book in the URL. Every accounting page reads this instead of keeping its own book state.
export function AccountingBookProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<AccountingBook[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const urlBook = searchParams.get('book')
  const [bookCode, setBookCodeState] = useState(() => urlBook || readStoredBookCode() || DEFAULT_BOOK_CODE)

  useEffect(() => {
    fetchJson('/api/accounting/books')
      .then(setBooks)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (urlBook && urlBook !== bookCode) setBookCodeState(urlBook)
    // only react to the URL changing (e.g. back/forward, a pasted link) - setBookCode below is the write path
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlBook])

  const setBookCode = useCallback(
    (code: string) => {
      setBookCodeState(code)
      try {
        localStorage.setItem(STORAGE_KEY, code)
      } catch {
        // private browsing / storage blocked: the choice just won't persist across visits
      }
      const next = new URLSearchParams(searchParams)
      next.set('book', code)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  // Keep the URL in sync even on first render, so links can always be copied with a book attached
  useEffect(() => {
    if (!urlBook) setBookCode(bookCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const book = useMemo(() => books.find((b) => b.code === bookCode) ?? null, [books, bookCode])

  return <BookContext.Provider value={{ books, loading, bookCode, book, setBookCode }}>{children}</BookContext.Provider>
}

export function useAccountingBook() {
  const context = useContext(BookContext)
  if (!context) throw new Error('useAccountingBook must be used inside AccountingBookProvider')
  return context
}
