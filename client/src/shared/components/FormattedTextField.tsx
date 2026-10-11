import { useRef, useState } from 'react'
import { useConfirm } from './ConfirmDialog'
import ReuseTextDialog from './ReuseTextDialog'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  tall?: boolean
  // Section key for the "Reuse previous text" picker (must match a field in server REUSE_TEXT_FIELDS). Omit to hide the picker.
  reuseField?: string
  // Adds a "Bullet list" toggle next to Bold, prefixing each selected line with "- " (the same convention
  // documents.layout.ts's formatBody() turns into a <ul>). Off by default so every existing caller is unaffected.
  allowBullets?: boolean
}

// A plain textarea plus a minimal Bold toggle (wraps the selection in **markers**, same convention the
// PDF/preview renderer and the Reuse-text picker understand), an optional Bullet list toggle, and an
// optional "Reuse previous text" picker. Deliberately not a rich-text/contentEditable editor - normal
// text, bold text, bullet lines, and line/paragraph breaks is all this supports.
function FormattedTextField({ id, label, value, onChange, placeholder, tall, reuseField, allowBullets }: Props) {
  const confirm = useConfirm()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [reuseOpen, setReuseOpen] = useState(false)

  function toggleBold() {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = value.slice(0, start)
    const selected = value.slice(start, end)
    const after = value.slice(end)

    if (selected) {
      if (before.endsWith('**') && after.startsWith('**')) {
        // Already bold: unwrap
        onChange(before.slice(0, -2) + selected + after.slice(2))
        requestAnimationFrame(() => el.setSelectionRange(start - 2, end - 2))
      } else {
        onChange(`${before}**${selected}**${after}`)
        requestAnimationFrame(() => el.setSelectionRange(start + 2, end + 2))
      }
      return
    }
    // Nothing selected: insert a placeholder, pre-selected so typing replaces it
    onChange(`${before}**bold text**${after}`)
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 11))
  }

  // Toggles a "- " prefix on every line the selection touches (or the current line, if nothing is
  // selected). Lines already prefixed have it removed instead, so the button also un-bullets a list.
  function toggleBullets() {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    // Expand the selection to whole lines, so a selection that only touches part of the first/last line
    // still toggles those lines completely.
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const nextBreak = value.indexOf('\n', end)
    const lineEnd = nextBreak === -1 ? value.length : nextBreak

    const before = value.slice(0, lineStart)
    const after = value.slice(lineEnd)
    const lines = value.slice(lineStart, lineEnd).split('\n')
    const allBulleted = lines.every((line) => /^[-*]\s/.test(line) || line.trim() === '')
    const nextLines = allBulleted ? lines.map((line) => line.replace(/^[-*]\s/, '')) : lines.map((line) => (line.trim() ? `- ${line}` : line))
    const nextText = nextLines.join('\n')

    onChange(`${before}${nextText}${after}`)
    requestAnimationFrame(() => el.setSelectionRange(lineStart, lineStart + nextText.length))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      toggleBold()
    }
  }

  async function handleReuse(text: string) {
    if (value.trim()) {
      const ok = await confirm({
        title: 'Replace current text?',
        message: `This will replace what's currently typed in ${label}. This cannot be undone.`,
        confirmLabel: 'Replace',
        tone: 'danger',
      })
      if (!ok) return
    }
    onChange(text)
    setReuseOpen(false)
  }

  return (
    <div className={`doc-notes${tall ? ' tall' : ''}`}>
      <div className="doc-notes-toolbar">
        <label htmlFor={id}>{label}</label>
        <div className="doc-notes-actions">
          <button type="button" className="doc-format-btn" title="Bold (Ctrl+B)" aria-label="Bold" onClick={toggleBold}>
            B
          </button>
          {allowBullets && (
            <button type="button" className="doc-format-btn" title="Bullet list" aria-label="Bullet list" onClick={toggleBullets}>
              •
            </button>
          )}
          {reuseField && (
            <button type="button" className="doc-link" onClick={() => setReuseOpen(true)}>
              Reuse previous text
            </button>
          )}
        </div>
      </div>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {reuseOpen && reuseField && (
        <ReuseTextDialog field={reuseField} fieldLabel={label} onClose={() => setReuseOpen(false)} onInsert={handleReuse} />
      )}
    </div>
  )
}

export default FormattedTextField
