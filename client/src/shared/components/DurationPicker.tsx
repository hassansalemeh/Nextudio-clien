import { addDays, daysBetween, formatLongDate } from '../lib/timeUtils'

type Props = {
  resultLabel: string
  baseDate: string
  value: string
  onChange: (value: string) => void
  options?: number[]
}

const DEFAULT_OPTIONS = [7, 14, 30]

// A picker for a date that's always some number of days after another date (an estimate's "Valid
// until", an invoice's payment due date): three preset durations, plus a read-only "Custom" state for
// a saved date that doesn't match any preset (an old document isn't forced onto a new option just by
// opening it - only picking a preset here changes it).
function DurationPicker({ resultLabel, baseDate, value, onChange, options = DEFAULT_OPTIONS }: Props) {
  const selectedDays = baseDate && value ? daysBetween(baseDate, value) : null
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
