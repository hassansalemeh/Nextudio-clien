import styles from '../MyWorkDashboard.module.css'
import { formatDuration } from '../../../shared/lib/timeUtils'
import type { MonthSummary } from '../lib/calendar'

type Props = {
  summary: MonthSummary
  // True on the admin's review screen, false on an employee's own calendar - employees must never see
  // whether a day off is paid or unpaid.
  showPaidUnpaid: boolean
}

function MonthSummaryCard({ summary, showPaidUnpaid }: Props) {
  const projectRows = Object.entries(summary.hoursByProject).sort((a, b) => b[1] - a[1])

  return (
    <div className="card">
      <h2>This month</h2>
      <div className={styles.summaryGrid}>
        <div>
          <div className="stat-label">Total hours</div>
          <div className="stat-value small">{formatDuration(summary.totalHours * 3600000)}</div>
          {summary.pendingHours > 0 && (
            <div className="stat-note">+{formatDuration(summary.pendingHours * 3600000)} pending approval</div>
          )}
        </div>
        <div>
          <div className="stat-label">Days worked</div>
          <div className="stat-value small">{summary.daysSubmitted}</div>
        </div>
        {showPaidUnpaid ? (
          <>
            <div>
              <div className="stat-label">Paid days off</div>
              <div className="stat-value small">{summary.daysOffPaid}</div>
            </div>
            <div>
              <div className="stat-label">Unpaid days off</div>
              <div className="stat-value small">{summary.daysOffUnpaid}</div>
            </div>
          </>
        ) : (
          <div>
            <div className="stat-label">Days off</div>
            <div className="stat-value small">{summary.daysOff}</div>
          </div>
        )}
        <div>
          <div className="stat-label">Days missed</div>
          <div className="stat-value small">{summary.daysMissed}</div>
        </div>
      </div>

      {projectRows.length > 0 && (
        <div className={styles.projectBreakdown}>
          <div className="stat-label">Hours by project</div>
          {projectRows.map(([project, hours]) => (
            <div key={project} className={styles.projectRow}>
              <span>{project}</span>
              <span>{formatDuration(hours * 3600000)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MonthSummaryCard
