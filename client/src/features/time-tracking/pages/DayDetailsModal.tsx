import { useState } from 'react'
import { CloseIcon } from '../../../shared/components/icons'
import DayDetailPanel from '../../my-work-dashboard/components/DayDetailPanel'
import type { CalendarDay } from '../../my-work-dashboard/lib/calendar'
import AddHoursForEmployeeForm from '../components/AddHoursForEmployeeForm'
import TimeReview from './TimeReview'

type Props = {
  employeeId: string
  employeeName: string
  day: CalendarDay | null
  date: string
  onClose: () => void
  onSaved: () => void
  onDeleteDayOff: (id: string) => void
}

function DayDetailsModal({ employeeId, employeeName, day, date, onClose, onSaved, onDeleteDayOff }: Props) {
  // Bumped whenever hours are added, to force TimeReview to refetch the day's records below (its own
  // effect only re-runs on employeeId/date changing, neither of which happens when hours are just added).
  const [addedCount, setAddedCount] = useState(0)

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

        <DayDetailPanel day={day} onDeleteDayOff={onDeleteDayOff} />
        <AddHoursForEmployeeForm
          employeeId={employeeId}
          date={date}
          onSaved={() => {
            setAddedCount((count) => count + 1)
            onSaved()
          }}
        />
        <TimeReview key={addedCount} employeeId={employeeId} date={date} onSaved={onSaved} />
      </div>
    </div>
  )
}

export default DayDetailsModal