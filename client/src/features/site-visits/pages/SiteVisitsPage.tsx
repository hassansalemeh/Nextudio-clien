import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../app/auth'
import { useConfirm } from '../../../shared/components/ConfirmDialog'
import EmptyState from '../../../shared/components/EmptyState'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { daysBetween, localDateString } from '../../../shared/lib/timeUtils'
import { Role } from '../../../shared/lib/role'
import { fetchEmployees } from '../../employees/api'
import { fetchActiveProjectNames } from '../../time-tracking/api'
import type { ActiveProject } from '../../time-tracking/types'
import { deleteSiteVisit, fetchSiteVisits, fetchSiteVisitsSummary } from '../api'
import type { SiteVisit, SiteVisitSummary } from '../types'
import SiteVisitFormDialog from '../components/SiteVisitFormDialog'
import styles from '../SiteVisits.module.css'

const EDIT_WINDOW_DAYS = 7

function currentMonth() {
  return localDateString().slice(0, 7)
}

function formatGroupHeading(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// visits already arrive newest-date-first from the API, so grouping by run preserves that order.
function groupByDate(visits: SiteVisit[]): { date: string; visits: SiteVisit[] }[] {
  const groups: { date: string; visits: SiteVisit[] }[] = []
  for (const visit of visits) {
    const current = groups[groups.length - 1]
    if (current && current.date === visit.visit_date) current.visits.push(visit)
    else groups.push({ date: visit.visit_date, visits: [visit] })
  }
  return groups
}

function SiteVisitsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const isAdmin = user?.role !== Role.Employee

  const [month, setMonth] = useState(currentMonth())
  const [visits, setVisits] = useState<SiteVisit[]>([])
  const [summary, setSummary] = useState<SiteVisitSummary | null>(null)
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([])
  const [projects, setProjects] = useState<ActiveProject[]>([])
  const [summaryTab, setSummaryTab] = useState<'person' | 'project'>('person')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingVisit, setEditingVisit] = useState<SiteVisit | null>(null)

  useEffect(() => {
    fetchActiveProjectNames()
      .then((response) => response.json())
      .then(setProjects)
      .catch(() => undefined)
    if (isAdmin) {
      fetchEmployees()
        .then((list) => setEmployees(list.filter((employee) => employee.kind === 'staff' && employee.is_active)))
        .catch(() => undefined)
    }
  }, [isAdmin])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [visitsData, summaryData] = await Promise.all([fetchSiteVisits(month), fetchSiteVisitsSummary(month)])
      setVisits(visitsData)
      setSummary(summaryData)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load site visits.'))
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  function canEdit(visit: SiteVisit) {
    return isAdmin || daysBetween(visit.visit_date, localDateString()) <= EDIT_WINDOW_DAYS
  }

  function openAdd() {
    setEditingVisit(null)
    setFormOpen(true)
  }

  function openEdit(visit: SiteVisit) {
    setEditingVisit(visit)
    setFormOpen(true)
  }

  async function handleDelete(visit: SiteVisit) {
    const ok = await confirm({
      title: 'Delete this visit?',
      message: `This removes ${visit.employee_name}'s visit to ${visit.project_name} on ${formatGroupHeading(visit.visit_date)}.`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        await deleteSiteVisit(visit.id)
      },
    })
    if (!ok) return
    toast.success('Visit deleted.')
    load()
  }

  const groups = useMemo(() => groupByDate(visits), [visits])
  const ownSummary = !isAdmin ? summary?.by_employee[0] ?? null : null

  return (
    <>
      <div className="doc-topbar">
        <PageHeader title="Site visits" description="Log when you went to a project site, and see who went where." />
        <button type="button" className={`btn-pill ${styles.desktopAddButton}`} onClick={openAdd}>
          + Add visit
        </button>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.monthBar}>
          <label className={styles.monthLabel}>
            Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        </div>

        {error && <p className="error-message">{error}</p>}

        {loading ? (
          <PageLoader label="Loading site visits..." />
        ) : (
          <>
            {isAdmin && summary && (
              <div className={styles.summarySection}>
                <div className={styles.tabBar}>
                  <button
                    type="button"
                    className={summaryTab === 'person' ? styles.tabActive : styles.tab}
                    onClick={() => setSummaryTab('person')}
                  >
                    By person
                  </button>
                  <button
                    type="button"
                    className={summaryTab === 'project' ? styles.tabActive : styles.tab}
                    onClick={() => setSummaryTab('project')}
                  >
                    By project
                  </button>
                </div>

                {summaryTab === 'person' ? (
                  summary.by_employee.length === 0 ? (
                    <EmptyState message="No site visits logged yet this month." />
                  ) : (
                    <div className={styles.summaryGrid}>
                      {summary.by_employee.map((employee) => (
                        <div className="card" key={employee.employee_id}>
                          <h2>{employee.employee_name}</h2>
                          <p className={styles.summaryCount}>
                            {employee.total_visits} visit{employee.total_visits === 1 ? '' : 's'} this month
                          </p>
                          <div className={styles.chipRow}>
                            {employee.projects.map((project) => (
                              <span className={styles.chip} key={project.project_id}>
                                {project.project_name} · {project.count}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : summary.by_project.length === 0 ? (
                  <EmptyState message="No site visits logged yet this month." />
                ) : (
                  <div className={styles.summaryGrid}>
                    {summary.by_project.map((project) => (
                      <div className="card" key={project.project_id}>
                        <h2>{project.project_name}</h2>
                        <p className={styles.summaryCount}>
                          {project.total_visits} visit{project.total_visits === 1 ? '' : 's'} this month
                        </p>
                        <div className={styles.chipRow}>
                          {project.visitors.map((visitor) => (
                            <span className={styles.chip} key={visitor.employee_id}>
                              {visitor.employee_name} · {visitor.count}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isAdmin && ownSummary && (
              <div className="card">
                <h2>This month</h2>
                <p className={styles.summaryCount}>
                  {ownSummary.total_visits} visit{ownSummary.total_visits === 1 ? '' : 's'}
                </p>
                <div className={styles.chipRow}>
                  {ownSummary.projects.map((project) => (
                    <span className={styles.chip} key={project.project_id}>
                      {project.project_name} · {project.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.visitList}>
              {groups.length === 0 ? (
                <EmptyState message="No site visits logged yet this month." />
              ) : (
                groups.map((group) => (
                  <div key={group.date} className={styles.dateGroup}>
                    <h3 className={styles.dateHeading}>{formatGroupHeading(group.date)}</h3>
                    {group.visits.map((visit) => (
                      <div className="card" key={visit.id}>
                        <div className={styles.visitCardHeader}>
                          <strong>{visit.employee_name}</strong>
                          <span className={styles.visitTime}>
                            {visit.start_time}
                            {visit.end_time ? ` – ${visit.end_time}` : ''}
                          </span>
                        </div>
                        <p className={styles.visitProject}>{visit.project_name}</p>
                        {visit.note && <p className={styles.visitNote}>{visit.note}</p>}
                        {canEdit(visit) && (
                          <div className="edit-actions">
                            <button type="button" className="btn-sm btn-ghost" onClick={() => openEdit(visit)}>
                              Edit
                            </button>
                            <button type="button" className="btn-sm btn-ghost-danger" onClick={() => handleDelete(visit)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className={styles.mobileAddBar}>
        <button type="button" className="btn-solid" onClick={openAdd}>
          + Add visit
        </button>
      </div>

      {formOpen && (
        <SiteVisitFormDialog isAdmin={isAdmin} employees={employees} projects={projects} visit={editingVisit} onClose={() => setFormOpen(false)} onSaved={load} />
      )}
    </>
  )
}

export default SiteVisitsPage
