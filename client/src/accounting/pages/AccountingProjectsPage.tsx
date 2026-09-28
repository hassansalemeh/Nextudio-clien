import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type Project = { id: string; name: string; client_name: string; status: string }
type Totals = { received: number; paid: number }
type LegacyJob = { id: string; legacy_job_code: string; legacy_job_name: string; status: string; mapped_project_id: string | null; received: number; paid: number }

function AccountingProjectsPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [projects, setProjects] = useState<Project[]>([])
  const [totals, setTotals] = useState<Record<string, Totals>>({})
  const [legacyJobs, setLegacyJobs] = useState<LegacyJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!book) return
    setLoading(true)
    fetchJson('/api/projects')
      .then(async (list: Project[]) => {
        setProjects(list)
        const entries = await Promise.all(
          list.map(async (project) => {
            try {
              const statement = await fetchJson(`/api/accounting/reports/project-statement?project_id=${project.id}`)
              return [project.id, { received: statement.received, paid: statement.paid }] as const
            } catch {
              return [project.id, { received: 0, paid: 0 }] as const
            }
          })
        )
        setTotals(Object.fromEntries(entries))
      })
      .catch(() => setError('Could not load projects.'))
      .finally(() => setLoading(false))
    fetchJson(`/api/accounting/legacy-jobs?book_id=${book.id}`)
      .then(setLegacyJobs)
      .catch(() => setLegacyJobs([]))
  }, [book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <h1>Projects</h1>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : projects.length === 0 ? (
          <p className="empty-state">No projects yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Money Received</th>
                <th>Money Paid</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link to={`/accounting/projects/${project.id}`}>{project.name}</Link>
                  </td>
                  <td>{project.client_name}</td>
                  <td>{money(totals[project.id]?.received ?? 0, book.currency_code)}</td>
                  <td>{money(totals[project.id]?.paid ?? 0, book.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Historical Jobs (imported from Polypus)</h2>
      <p className="empty-state" style={{ marginTop: 0 }}>
        Not Control projects - each stays a separate historical record with its own imported money received/spent, payees, categories, cash movements and
        journal history. None of these are linked to a Control project unless explicitly confirmed.
      </p>
      <div className="card">
        {legacyJobs.length === 0 ? (
          <p className="empty-state">No historical jobs for this book.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Historical Job</th>
                <th>Status</th>
                <th>Money Received</th>
                <th>Money Paid</th>
              </tr>
            </thead>
            <tbody>
              {legacyJobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/accounting/legacy-jobs/${job.id}`}>{job.legacy_job_name}</Link>
                  </td>
                  <td>{job.mapped_project_id ? 'Confirmed mapping' : 'Historical-only'}</td>
                  <td>{money(job.received, book.currency_code)}</td>
                  <td>{money(job.paid, book.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default AccountingProjectsPage
