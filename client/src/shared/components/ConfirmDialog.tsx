import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getErrorMessage } from '../lib/apiError'
import Spinner from './Spinner'

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  // "danger" makes the confirm button red (deleting); the default is the normal blue
  tone?: 'danger' | 'primary'
  // When given, the dialog stays open and the confirm button shows a loading state while this runs.
  // On success the dialog closes (confirm() resolves true); on failure it stays open and shows the error.
  onConfirm?: () => Promise<void>
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// A friendly replacement for the browser's plain confirm() box. Use: const confirm = useConfirm(); if (await confirm({...})) ...
// Or, to run the action inside the dialog itself (so its confirm button shows the loading state):
// await confirm({ ..., onConfirm: async () => { await deleteThing() } })
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyError, setBusyError] = useState('')
  const resolver = useRef<((value: boolean) => void) | null>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setBusyError('')
      setOptions(next)
    })
  }, [])

  const close = useCallback((result: boolean) => {
    resolver.current?.(result)
    resolver.current = null
    setOptions(null)
    setBusyError('')
  }, [])

  async function handleConfirm() {
    if (!options?.onConfirm) return close(true)
    setBusy(true)
    setBusyError('')
    try {
      await options.onConfirm()
      setBusy(false)
      close(true)
    } catch (err) {
      setBusy(false)
      setBusyError(getErrorMessage(err, 'Something went wrong.'))
    }
  }

  useEffect(() => {
    if (!options) return
    confirmButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options, busy, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && close(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">{options.title}</h2>
            <p className="modal-message">{options.message}</p>
            {busyError && <p className="error-message">{busyError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-sm btn-ghost" disabled={busy} onClick={() => close(false)}>
                {options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                ref={confirmButton}
                className={`btn-sm ${options.tone === 'danger' ? 'btn-danger-solid' : 'btn-solid'}`}
                disabled={busy}
                onClick={handleConfirm}
              >
                {busy && <Spinner />}
                {options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider')
  return confirm
}
