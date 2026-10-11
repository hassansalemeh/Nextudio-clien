import styles from '../MyWorkDashboard.module.css'
import { formatDuration } from '../../../shared/lib/timeUtils'
import type { MonthSummary } from '../lib/calendar'

type Props = {
  summary: MonthSummary
}

function MonthSummaryCard({ summary }: Props) {
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
          <div className="stat-label">Days submitted</div>
          <div className="stat-value small">{summary.daysSubmitted}</div>
        </div>
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
