import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '../../../shared/components/ConfirmDialog'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { localDateString } from '../../../shared/lib/timeUtils'
import type { TimeEntry } from '../../../shared/lib/timeUtils'
import PageLoader from '../../../shared/components/PageLoader'
import { deleteDayOffRequest, fetchDayOffRequests } from '../../day-off-requests/api'
import type { DayOffRequest } from '../../day-off-requests/types'
import RecordDaysOffDialog from '../../day-off-requests/components/RecordDaysOffDialog'
import { fetchFirstActivityDate, fetchMonthEntries } from '../../my-work-dashboard/api'
import MonthCalendar from '../../my-work-dashboard/components/MonthCalendar'
import MonthSummaryCard from '../../my-work-dashboard/components/MonthSummaryCard'
import { buildMonthGrid, summarizeMonth } from '../../my-work-dashboard/lib/calendar'
import { fetchEmployeesForReview } from '../api'
import type { Employee } from '../types'
import DayDetailsModal from './DayDetailsModal'

function EmployeeCalendarReview() {
  const confirm = useConfirm()
  const toast = useToast()
  const today = localDateString()
  const [todayYear, todayMonth] = today.split('-').map(Number)

  // 1. Which employee, which month, which day
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [year, setYear] = useState(todayYear)
  const [month, setMonth] = useState(todayMonth)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)

  // 2. The data for the calendar
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [dayOffRequests, setDayOffRequests] = useState<DayOffRequest[]>([])
  const [firstActivityDate, setFirstActivityDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load the employee list once, for the dropdown
  useEffect(() => {
    fetchEmployeesForReview()
      .then(setEmployees)
      .catch((err) => setError(getErrorMessage(err, 'Could not load employees.')))
  }, [])

  const reloadDayOffRequests = useCallback(() => {
    if (!employeeId) return
    fetchDayOffRequests(employeeId)
      .then(setDayOffRequests)
      .catch(() => setDayOffRequests([]))
  }, [employeeId])

  // When the employee changes: load their first activity date and day-off requests
  useEffect(() => {
    if (!employeeId) return
    fetchFirstActivityDate(employeeId)
      .then(setFirstActivityDate)
      .catch(() => setFirstActivityDate(null))
    reloadDayOffRequests()
  }, [employeeId, reloadDayOffRequests])

  // When the employee or month changes: load that month's entries
  const reload = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchMonthEntries(year, month, employeeId)
      setEntries(data.entries)
    } catch (err) {
      setError(getErrorMessage(err, "Could not load this month's work."))
    } finally {
      setLoading(false)
    }
  }, [employeeId, year, month])

  useEffect(() => {
    reload()
  }, [reload])

  // Everything that can change after an action in the day-details modal (hours added, a day off
  // recorded or removed): the month's entries and its day-off requests, together.
  function reloadAll() {
    reload()
    reloadDayOffRequests()
  }

  async function handleDeleteDayOff(id: string) {
    const ok = await confirm({
      title: 'Remove this day off?',
      message: 'This permanently removes the recorded day off.',
      confirmLabel: 'Remove day off',
      tone: 'danger',
      onConfirm: async () => {
        await deleteDayOffRequest(id)
      },
    })
    if (!ok) return
    toast.success('Day off removed.')
    reloadAll()
  }

  // Same month navigation as My Calendar
  function navigate(direction: -1 | 1) {
    setSelectedDate(null)
    setMonth((current) => {
      const next = current + direction
      if (next < 1) {
        setYear((y) => y - 1)
        return 12
      }
      if (next > 12) {
        setYear((y) => y + 1)
        return 1
      }
      return next
    })
  }

  const selectedEmployee = employees.find((employee) => employee.id === employeeId)
  const weeks = buildMonthGrid(year, month, entries, today, firstActivityDate, dayOffRequests, selectedEmployee?.kind !== 'site_worker')
  const summary = summarizeMonth(weeks)
  const selectedDay = selectedDate ? weeks.flat().find((day) => day.date === selectedDate) ?? null : null

  return (
    <>
      <div className="doc-topbar">
        <div className="card" style={{ flex: 1 }}>
          <label className="form-field">
            Employee
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select an employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {employeeId && selectedEmployee?.kind !== 'site_worker' && (
          <button type="button" className="btn-pill" onClick={() => setRecordDialogOpen(true)}>
            Record day off
          </button>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}

      {employeeId &&
        (loading ? (
          <PageLoader label="Loading calendar..." />
        ) : (
          <>
            <MonthCalendar
              year={year}
              month={month}
              weeks={weeks}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onNavigate={navigate}
            />
            <MonthSummaryCard summary={summary} />
            {selectedDate && (
              <DayDetailsModal
                employeeId={employeeId}
                employeeName={employees.find((e) => e.id === employeeId)?.full_name ?? ''}
                day={selectedDay}
                date={selectedDate}
                onClose={() => setSelectedDate(null)}
                onSaved={reloadAll}
                onDeleteDayOff={handleDeleteDayOff}
              />
            )}
          </>
        ))}

      {recordDialogOpen && (
        <RecordDaysOffDialog
          employeeId={employeeId}
          employeeName={selectedEmployee?.full_name ?? ''}
          onClose={() => setRecordDialogOpen(false)}
          onRecorded={reloadAll}
        />
      )}
    </>
  )
}

export default EmployeeCalendarReview
