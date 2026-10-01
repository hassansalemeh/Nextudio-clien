type Props = {
  message: string
  actionLabel?: string
  onAction?: () => void
}

// Friendly placeholder for an empty list/table, in place of a blank table. The action button only appears
// where a "create" action already exists on that page.
function EmptyState({ message, actionLabel, onAction }: Props) {
  return (
    <div className="empty-state-block">
      <p className="empty-state">{message}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn-sm btn-ghost" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export default EmptyState
