import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../app/auth'
import EmptyState from '../../../shared/components/EmptyState'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { daysBetween, localDateString } from '../../../shared/lib/timeUtils'
import { Role } from '../../../shared/lib/role'
import { fetchActiveProjectNames } from '../../time-tracking/api'
import type { ActiveProject } from '../../time-tracking/types'
import { fetchSiteVisitors, fetchSiteVisits, fetchSiteVisitsSummary } from '../api'
import type { SiteVisit, SiteVisitor, SiteVisitSummary } from '../types'
import SiteVisitFormDialog from '../components/SiteVisitFormDialog'
import SiteVisitCard, { type SiteVisitCardChip, type SiteVisitCardRow } from '../components/SiteVisitCard'
import styles from '../SiteVisits.module.css'

const EDIT_WINDOW_DAYS = 7

function currentMonth() {
  return localDateString().slice(0, 7)
}

// weekday + day number for a row's date block - visits already arrive newest-date-first, and grouping
// by key below preserves that order within each group.
function splitDateBlock(dateString: string): { weekday: string; day: number } {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return { weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(), day }
}

function formatTimeRange(visit: SiteVisit): string {
  return visit.end_time ? `${visit.start_time} – ${visit.end_time}` : visit.start_time
}

function groupByKey<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const list = map.get(key(item))
    if (list) list.push(item)
    else map.set(key(item), [item])
  }
  return map
}

function SiteVisitsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role !== Role.Employee

  const [month, setMonth] = useState(currentMonth())
  const [visits, setVisits] = useState<SiteVisit[]>([])
  const [summary, setSummary] = useState<SiteVisitSummary | null>(null)
  const [visitors, setVisitors] = useState<SiteVisitor[]>([])
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
      fetchSiteVisitors().then(setVisitors).catch(() => undefined)
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

  const visitsById = useMemo(() => new Map(visits.map((visit) => [visit.id, visit])), [visits])
  const visitsByMember = useMemo(() => groupByKey(visits, (visit) => visit.member_id), [visits])
  const visitsByProject = useMemo(() => groupByKey(visits, (visit) => visit.project_id), [visits])

  function rowsFor(groupVisits: SiteVisit[], titleOf: (visit: SiteVisit) => string): SiteVisitCardRow[] {
    return groupVisits.map((visit) => {
      const { weekday, day } = splitDateBlock(visit.visit_date)
      const meta = visit.note ? `${formatTimeRange(visit)} · ${visit.note}` : formatTimeRange(visit)
      return { id: visit.id, weekday, day, title: titleOf(visit), meta, pressable: canEdit(visit) }
    })
  }

  function handleRowClick(id: string) {
    const visit = visitsById.get(id)
    if (visit) openEdit(visit)
  }

  const ownSummary = !isAdmin ? summary?.by_member[0] ?? null : null

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
        ) : isAdmin ? (
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
              !summary || summary.by_member.length === 0 ? (
                <EmptyState message="No site visits logged yet this month." />
              ) : (
                <div className={styles.cardsGrid}>
                  {summary.by_member.map((member) => {
                    const chips: SiteVisitCardChip[] = member.projects.map((project) => ({
                      key: project.project_id,
                      label: project.project_name,
                      count: project.count,
                    }))
                    const rows = rowsFor(visitsByMember.get(member.member_id) ?? [], (visit) => visit.project_name)
                    return (
                      <SiteVisitCard
                        key={member.member_id}
                        name={member.visitor_name}
                        totalVisits={member.total_visits}
                        chips={chips}
                        rows={rows}
                        onRowClick={handleRowClick}
                      />
                    )
                  })}
                </div>
              )
            ) : !summary || summary.by_project.length === 0 ? (
              <EmptyState message="No site visits logged yet this month." />
            ) : (
              <div className={styles.cardsGrid}>
                {summary.by_project.map((project) => {
                  const chips: SiteVisitCardChip[] = project.visitors.map((visitor) => ({
                    key: visitor.member_id,
                    label: visitor.visitor_name,
                    count: visitor.count,
                  }))
                  const rows = rowsFor(visitsByProject.get(project.project_id) ?? [], (visit) => visit.visitor_name)
                  return (
                    <SiteVisitCard
                      key={project.project_id}
                      name={project.project_name}
                      totalVisits={project.total_visits}
                      chips={chips}
                      rows={rows}
                      onRowClick={handleRowClick}
                    />
                  )
                })}
              </div>
            )}
          </div>
        ) : !ownSummary ? (
          <EmptyState message="No site visits logged yet this month." />
        ) : (
          <div className={styles.cardsGrid}>
            <SiteVisitCard
              name={ownSummary.visitor_name}
              totalVisits={ownSummary.total_visits}
              chips={ownSummary.projects.map((project) => ({ key: project.project_id, label: project.project_name, count: project.count }))}
              rows={rowsFor(visitsByMember.get(ownSummary.member_id) ?? [], (visit) => visit.project_name)}
              onRowClick={handleRowClick}
            />
          </div>
        )}
      </div>

      <div className={styles.mobileAddBar}>
        <button type="button" className="btn-solid" onClick={openAdd}>
          + Add visit
        </button>
      </div>

      {formOpen && user && (
        <SiteVisitFormDialog
          isAdmin={isAdmin}
          visitors={visitors}
          ownMemberId={user.memberId}
          projects={projects}
          visit={editingVisit}
          onClose={() => setFormOpen(false)}
          onSaved={load}
        />
      )}
    </>
  )
}

export default SiteVisitsPage
