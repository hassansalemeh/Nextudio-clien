import { CloseIcon } from '../../../shared/components/icons'
import DayDetailPanel from '../../my-work-dashboard/components/DayDetailPanel'
import type { CalendarDay } from '../../my-work-dashboard/lib/calendar'
import TimeReview from './TimeReview'

type Props = {
  employeeId: string
  employeeName: string
  day: CalendarDay | null
  date: string
  onClose: () => void
  onSaved: () => void
}

function DayDetailsModal({ employeeId, employeeName, day, date, onClose, onSaved }: Props) {
  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-details-title"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <h2 id="day-details-title">{employeeName}</h2>
          <button type="button" className="doc-icon" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <DayDetailPanel day={day} />
        <TimeReview employeeId={employeeId} date={date} onSaved={onSaved} />
      </div>
    </div>
  )
}

export default DayDetailsModal