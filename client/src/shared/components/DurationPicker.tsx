import { addDays, daysBetween, formatLongDate } from '../lib/timeUtils'

type Props = {
  resultLabel: string
  baseDate: string
  value: string
  onChange: (value: string) => void
  options?: number[]
  // When set, adds a button that clears the date (e.g. an optional invoice due date). Omit it for a
  // date that's always set, like an estimate's "Valid until".
  noneLabel?: string
}

const DEFAULT_OPTIONS = [7, 14, 30]

// A picker for a date that's always some number of days after another date (an estimate's "Valid
// until", an invoice's payment due date): three preset durations, plus a read-only "Custom" state for
// a saved date that doesn't match any preset (an old document isn't forced onto a new option just by
// opening it - only picking a preset here changes it).
function DurationPicker({ resultLabel, baseDate, value, onChange, options = DEFAULT_OPTIONS, noneLabel }: Props) {
  const selectedDays = baseDate && value ? daysBetween(baseDate, value) : null
  const isNone = Boolean(noneLabel) && !value
  const isCustom = selectedDays !== null && !options.includes(selectedDays)

  return (
    <div className="duration-picker">
      <div className="duration-picker-options" role="group" aria-label={resultLabel}>
        {options.map((days) => (
          <button
            key={days}
            type="button"
            className={'duration-option' + (selectedDays === days ? ' active' : '')}
            aria-pressed={selectedDays === days}
            onClick={() => baseDate && onChange(addDays(baseDate, days))}
          >
            {days} days
          </button>
        ))}
        {noneLabel && (
          <button
            type="button"
            className={'duration-option' + (isNone ? ' active' : '')}
            aria-pressed={isNone}
            onClick={() => onChange('')}
          >
            {noneLabel}
          </button>
        )}
        {isCustom && (
          <span className="duration-option duration-option-custom" aria-label="Custom (saved date)">
            Custom
          </span>
        )}
      </div>
      {baseDate && value && (
        <div className="doc-hint">
          {resultLabel}: {formatLongDate(value)}
        </div>
      )}
    </div>
  )
}

export default DurationPicker
