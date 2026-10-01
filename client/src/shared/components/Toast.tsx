import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CloseIcon } from './icons'

type Toast = {
  id: number
  tone: 'success' | 'error'
  message: string
}

type ToastFn = {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastFn | null>(null)

const SUCCESS_TIMEOUT = 4000

// A small notification in the corner of the screen. Success toasts disappear on their own; errors stay until
// dismissed, since the user needs time to read what went wrong. Use: const toast = useToast(); toast.success('Saved')
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (tone: Toast['tone'], message: string) => {
      const id = nextId.current++
      setToasts((previous) => [...previous, { id, tone, message }])
      if (tone === 'success') {
        setTimeout(() => dismiss(id), SUCCESS_TIMEOUT)
      }
    },
    [dismiss]
  )

  const toast: ToastFn = {
    success: (message) => push('success', message),
    error: (message) => push('error', message),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            <span className="toast-message">{item.message}</span>
            <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast must be used inside ToastProvider')
  return toast
}
