import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { Link, useParams } from 'react-router-dom'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { formatDuration } from '../../../shared/lib/timeUtils'
import { fetchProjectDetails } from '../api'
import type { ProjectDetails } from '../types'

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

function formatHours(hours: number) {
  return formatDuration(hours * 3600000)
}

function ProjectDetailPage() {
  const { id } = useParams()
  const [details, setDetails] = useState<ProjectDetails | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function load() {
      fetchProjectDetails(id!)
        .then((data) => {
          setDetails(data)
          setError('')
        })
        .catch((err) => setError(getErrorMessage(err, 'Could not load project.')))
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
    return <PageLoader label="Loading project..." />
  }

  const { project, employees } = details

  return (
    <>
      <p>
        <Link to="/projects">← Back to Projects</Link>
      </p>
      <PageHeader title={project.name} description="See this project's details, payments, invoices, and team work in one place." />

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
          <strong className={details.client_balance_due < 0 ? 'negative' : undefined}>
            {currencyFormatter.format(details.client_balance_due)}
          </strong>
        </p>
        <div className="money-divider">Employee cost: kept separate from client payments</div>
        <p>
          Labor Cost: <strong>{currencyFormatter.format(details.total_labor_cost)}</strong>
        </p>
        <p>
          Project Remaining After Labor:{' '}
          <strong className={details.current_position < 0 ? 'negative' : undefined}>
            {currencyFormatter.format(details.current_position)}
          </strong>
        </p>
      </div>

      <div className="card">
        <h2>Payments</h2>
        {details.payments.length === 0 ? (
          <EmptyState message="No payments recorded for this project yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {details.payments.map((payment) => (
                <tr key={payment.id}>
                  <td data-label="Date">{payment.payment_date}</td>
                  <td data-label="Reason">{payment.reason}</td>
                  <td data-label="Amount" className="num">{currencyFormatter.format(Number(payment.amount))}</td>
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
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Amount Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {details.client_funds.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice">
                    <Link to={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link>
                  </td>
                  <td data-label="Total" className="num">{new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.total)}</td>
                  <td data-label="Paid" className="num">{new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.paid)}</td>
                  <td data-label="Amount Due" className="num">{new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.amount_due)}</td>
                  <td data-label="Status">
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
          <EmptyState message="No employees have been assigned to this project yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Position</th>
                <th>Assignment</th>
                <th className="num">Hours Worked</th>
                <th className="num">Hourly Cost</th>
                <th className="num">Labor Cost</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.employee_id}>
                  <td data-label="Employee">{employee.full_name}</td>
                  <td data-label="Position">{employee.position}</td>
                  <td data-label="Assignment" className="col-wrap">
                    {employee.assignments.length === 0
                      ? '—'
                      : employee.assignments.map((assignment, index) => (
                          <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
                            {assignment.start_date} → {assignment.end_date}: {assignment.description}
                          </div>
                        ))}
                  </td>
                  <td data-label="Hours Worked" className="num">{formatHours(employee.hours_worked)}</td>
                  <td data-label="Hourly Cost" className="num">{currencyFormatter.format(employee.hourly_cost)}</td>
                  <td data-label="Labor Cost" className="num">{currencyFormatter.format(employee.labor_cost)}</td>
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
