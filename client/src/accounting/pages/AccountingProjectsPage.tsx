import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type Project = { id: string; name: string; client_name: string; status: string }
type Totals = { received: number; paid: number }

function AccountingProjectsPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [projects, setProjects] = useState<Project[]>([])
  const [totals, setTotals] = useState<Record<string, Totals>>({})
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
    </>
  )
}

export default AccountingProjectsPage
