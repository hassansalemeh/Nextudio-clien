import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDuration } from '../timeUtils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
}

type ProjectDetails = {
  project: {
    id: string
    client_name: string
    name: string
    description: string | null
    location: string | null
    total_fee: string | null
    fee_status: string
    start_date: string | null
    status: string
  }
  employees: {
    employee_id: string
    full_name: string
    position: string
    assignments: { start_date: string; end_date: string; description: string }[]
    hours_worked: number
    hourly_cost: number
    labor_cost: number
  }[]
  total_hours: number
  total_labor_cost: number
  confirmed_revenue: number
  current_position: number
  payments: { id: string; payment_date: string; reason: string; amount: string }[]
  payments_received: number
  client_balance_due: number
  client_funds: {
    invoices: { id: string; invoice_number: string; currency: string; total: number; paid: number; amount_due: number; status: string }[]
    invoiced: number
    received: number
    spent: number
    remaining: number
  }
}

function formatHours(hours: number) {
  return formatDuration(hours * 3600000)
}

function ProjectDetailPage() {
  const { id } = useParams()
  const [details, setDetails] = useState<ProjectDetails | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function load() {
      fetch(`${API_URL}/api/projects/${id}`)
        .then(async (response) => {
          if (response.status === 404) throw new Error('Project not found.')
          if (!response.ok) throw new Error('Could not load project.')
          return response.json()
        })
        .then((data) => {
          setDetails(data)
          setError('')
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load project.'))
    }

    load()
    // Refresh when this tab is shown again, so edits made elsewhere appear
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [id])

  if (error) {
    return (
      <>
        <p>
          <Link to="/projects">← Back to Projects</Link>
        </p>
        <p className="error-message">{error}</p>
      </>
    )
  }

  if (!details) {
    return <p className="empty-state">Loading project...</p>
  }

  const { project, employees } = details

  return (
    <>
      <p>
        <Link to="/projects">← Back to Projects</Link>
      </p>
      <h1>{project.name}</h1>

      <div className="card">
        <h2>Project Details</h2>
        <p>
          Client: <strong>{project.client_name}</strong>
        </p>
        <p>
          Location: <strong>{project.location || '—'}</strong>
        </p>
        <p>
          Description: <strong>{project.description || '—'}</strong>
        </p>
        <p>
          Start Date: <strong>{project.start_date || '—'}</strong>
        </p>
        <p>
          Status:{' '}
          <span className={`status-badge status-${project.status}`}>
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
        </p>
        <p>
          Total Fee: <strong>{project.total_fee === null ? '—' : currencyFormatter.format(Number(project.total_fee))}</strong>
        </p>
        <p>
          Fee Status:{' '}
          <span className={`status-badge status-${project.fee_status}`}>
            {project.fee_status === 'confirmed' ? 'Confirmed' : 'Pending / Unconfirmed'}
          </span>
        </p>
        <div className="money-divider">Client side: value and payments</div>
        <p>
          Project Value: <strong>{currencyFormatter.format(details.confirmed_revenue)}</strong>
          {project.fee_status !== 'confirmed' && <span className="stat-note"> (fee not confirmed yet, so the value is $0)</span>}
        </p>
        <p>
          Payments Received: <strong>{currencyFormatter.format(details.payments_received)}</strong>
        </p>
        <p>
          Client Balance Due:{' '}
          <strong style={{ color: details.client_balance_due < 0 ? '#b3261e' : undefined }}>
            {currencyFormatter.format(details.client_balance_due)}
          </strong>
        </p>
        <div className="money-divider">Employee cost: kept separate from client payments</div>
        <p>
          Labor Cost: <strong>{currencyFormatter.format(details.total_labor_cost)}</strong>
        </p>
        <p>
          Project Remaining After Labor:{' '}
          <strong style={{ color: details.current_position < 0 ? '#b3261e' : undefined }}>
            {currencyFormatter.format(details.current_position)}
          </strong>
        </p>
      </div>

      <div className="card">
        <h2>Payments</h2>
        {details.payments.length === 0 ? (
          <p className="empty-state">No payments recorded for this project yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {details.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.payment_date}</td>
                  <td>{payment.reason}</td>
                  <td>{currencyFormatter.format(Number(payment.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginBottom: 0 }}>
          <Link to={`/payments?project=${project.id}`}>Record a payment for this project →</Link>
        </p>
      </div>

      {details.client_funds.invoices.length > 0 && (
        <div className="card">
          <h2>Client Funds (Project Expenses)</h2>
          <p className="empty-state" style={{ marginTop: 0 }}>
            Money held for this project's expenses. Kept separate from the design fee and profitability figures above.
          </p>
          <div className="inv-totals" style={{ marginBottom: '1.25rem' }}>
            <div>Funds Invoiced</div>
            <div>{currencyFormatter.format(details.client_funds.invoiced)}</div>
            <div>Funds Received</div>
            <div>{currencyFormatter.format(details.client_funds.received)}</div>
            <div>Funds Spent</div>
            <div>{currencyFormatter.format(details.client_funds.spent)}</div>
            <div>
              <strong>Funds Remaining</strong>
            </div>
            <div>
              <strong>{currencyFormatter.format(details.client_funds.remaining)}</strong>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Amount Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {details.client_funds.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link>
                  </td>
                  <td>{new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.total)}</td>
                  <td>{new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.paid)}</td>
                  <td>{new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.amount_due)}</td>
                  <td>
                    <span className={`status-badge status-${invoice.status}`}>{invoice.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Employees / Project Work</h2>
        {employees.length === 0 ? (
          <p className="empty-state">No employees have been assigned to this project yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Position</th>
                <th>Assignment</th>
                <th>Hours Worked</th>
                <th>Hourly Cost</th>
                <th>Labor Cost</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.employee_id}>
                  <td>{employee.full_name}</td>
                  <td>{employee.position}</td>
                  <td className="col-wrap">
                    {employee.assignments.length === 0
                      ? '—'
                      : employee.assignments.map((assignment, index) => (
                          <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
                            {assignment.start_date} → {assignment.end_date}: {assignment.description}
                          </div>
                        ))}
                  </td>
                  <td>{formatHours(employee.hours_worked)}</td>
                  <td>{currencyFormatter.format(employee.hourly_cost)}</td>
                  <td>{currencyFormatter.format(employee.labor_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          Total Project Hours: <strong>{formatHours(details.total_hours)}</strong>
        </p>
        <p>
          Total Project Labor Cost: <strong>{currencyFormatter.format(details.total_labor_cost)}</strong>
        </p>
      </div>
    </>
  )
}

export default ProjectDetailPage
