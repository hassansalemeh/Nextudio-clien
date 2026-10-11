import { CloseIcon, PlusIcon } from './icons'

type Props = {
  label: string
  emails: string[]
  onChange: (emails: string[]) => void
  placeholder?: string
}

// One input per address, with a "+" to add another and an "x" to remove one (used for CC on
// "Send by Email" dialogs). `emails` always has at least one entry, which may be empty.
function MultiEmailField({ label, emails, onChange, placeholder }: Props) {
  function updateAt(index: number, value: string) {
    onChange(emails.map((email, i) => (i === index ? value : email)))
  }

  function removeAt(index: number) {
    const next = emails.filter((_, i) => i !== index)
    onChange(next.length ? next : [''])
  }

  return (
    <div className="form-field">
      <span>{label}</span>
      <div className="cc-field-list">
        {emails.map((email, index) => (
          <div className="cc-field-row" key={index}>
            <input
              type="email"
              value={email}
              onChange={(e) => updateAt(index, e.target.value)}
              placeholder={index === 0 ? placeholder : 'another@nextudio.co'}
            />
            {emails.length > 1 && (
              <button type="button" className="doc-icon" aria-label="Remove this email" onClick={() => removeAt(index)}>
                <CloseIcon />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="cc-add-btn" onClick={() => onChange([...emails, ''])}>
        <PlusIcon size={13} /> Add another
      </button>
    </div>
  )
}

export default MultiEmailField
