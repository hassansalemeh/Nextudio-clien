import EmployeeCalendarReview from './EmployeeCalendarReview'
import PageHeader from '../../../shared/components/PageHeader'

function TimeTrackingPage() {
  return (
    <>
      <PageHeader title="Time Tracking" description="Review when employees clocked in and the time they recorded on projects." />
      <EmployeeCalendarReview />
    </>
  )
}

export default TimeTrackingPage