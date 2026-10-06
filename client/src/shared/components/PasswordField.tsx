import { useId, useState } from 'react'
import { EyeIcon, EyeOffIcon } from './icons'
import styles from './PasswordField.module.css'

type PasswordFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  required?: boolean
}

function PasswordField({ label, value, onChange, autoComplete, required }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const inputId = useId()

  return (
    <div className="form-field">
      <label htmlFor={inputId}>{label}</label>
      <div className={styles.wrapper}>
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          className={styles.input}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>
    </div>
  )
}

export default PasswordField
