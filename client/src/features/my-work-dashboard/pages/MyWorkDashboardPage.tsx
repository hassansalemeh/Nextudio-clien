import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { localDateString } from '../../../shared/lib/timeUtils'
import { fetchFirstActivityDate, fetchMonthEntries } from '../api'
import DayDetailPanel from '../components/DayDetailPanel'
import MonthCalendar from '../components/MonthCalendar'
import MonthSummaryCard from '../components/MonthSummaryCard'
import { buildMonthGrid, summarizeMonth } from '../lib/calendar'
import type { TimeEntry } from '../../../shared/lib/timeUtils'

function MyWorkDashboardPage() {
  const today = localDateString()
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const [year, setYear] = useState(todayYear)
  const [month, setMonth] = useState(todayMonth)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [firstActivityDate, setFirstActivityDate] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(today)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchFirstActivityDate()
      .then(setFirstActivityDate)
      .catch(() => setFirstActivityDate(null))
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchMonthEntries(year, month)
      setEntries(data.entries)
    } catch (err) {
      setError(getErrorMessage(err, "Could not load this month's work."))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    reload()
  }, [reload])

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

  const weeks = buildMonthGrid(year, month, entries, today, firstActivityDate)
  const summary = summarizeMonth(weeks)
  const selectedDay = selectedDate ? weeks.flat().find((day) => day.date === selectedDate) ?? null : null

  return (
    <>
      <PageHeader title="My Calendar" description="See which days you logged work this month, and how your hours add up." />
      {error && <p className="error-message">{error}</p>}
      {loading ? (
        <PageLoader label="Loading your calendar..." />
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
          <DayDetailPanel day={selectedDay} />
        </>
      )}
    </>
  )
}

export default MyWorkDashboardPage
