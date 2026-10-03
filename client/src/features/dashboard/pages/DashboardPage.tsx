import { lazy, Suspense, useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { Link } from 'react-router-dom'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { dayRange, formatDuration, formatTime, localDateString } from '../../../shared/lib/timeUtils'
import { INVOICE_STATUS_LABELS } from '../../invoices/types'
import { fetchDashboard } from '../api'

const ProjectValueChart = lazy(() => import('../../../shared/components/ProjectValueChart'))
const ReceiptBreakdownChart = lazy(() => import('../../../shared/components/ReceiptBreakdownChart'))

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (amount: number, currency = 'USD') =>
  currency === 'USD' ? usd.format(amount) : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

type Dashboard = {
  cards: {
    confirmed_value: number
    labor_cost: number
    project_remaining: number
    invoiced: number
    payments_received: number
    outstanding: number
    pending_exposure: number
    client_funds_invoiced: number
    client_funds_received: number
    client_funds_outstanding: number
    total_client_receipts: number
  }
  projects: { project_id: string; name: string; fee_status: string; amount: number; deducted: number; remaining: number }[]
  invoices: {
    id: string
    invoice_number: string
    client_name: string
    currency: string
    total: number
    paid: number
    amount_due: number
    status: string
  }[]
  recent_payments: { id: string; project_id: string; project_name: string; client_name: string; payment_date: string; amount: string; reason: string }[]
  today: {
    clocked_in: { employee_name: string; clock_in: string }[]
    working_now: { employee_name: string; project_name: string; started_at: string }[]
    hours_recorded: number
  }
}

function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function load() {
      const { from, to } = dayRange(localDateString())
      fetchDashboard(from, to)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((json) => {
          setData(json)
          setError('')
        })
        .catch((err) => setError(getErrorMessage(err, 'Could not load the dashboard.')))
    }

    load()
    // keep the numbers fresh: when the tab is shown again, and once a minute
    window.addEventListener('focus', load)
    const timer = setInterval(load, 60000)
    return () => {
      window.removeEventListener('focus', load)
      clearInterval(timer)
    }
  }, [])

  if (error && !data) return <p className="error-message">{error}</p>
  if (!data) return <PageLoader label="Loading dashboard..." />

  const { cards, projects, invoices, today, recent_payments: recentPayments } = data
  const pendingCount = projects.filter((project) => project.fee_status !== 'confirmed').length

  return (
    <>
      <PageHeader title="Dashboard" description="A quick view of project value, payments, invoices, and today's team activity." />
      {error && <p className="error-message">{error}</p>}

      <dl className="dashboard-metrics">
        <div><dt>Confirmed Project Value</dt><dd>{money(cards.confirmed_value)}<span>Fees agreed with clients</span></dd></div>
        <div><dt>Payments Received</dt><dd>{money(cards.payments_received)}<span>Professional fee payments</span></dd></div>
        <div><dt>Outstanding Invoices</dt><dd>{money(cards.outstanding)}<span>Professional fees still due</span></dd></div>
        <div><dt>Project Remaining</dt><dd className={cards.project_remaining < 0 ? 'negative' : undefined}>{money(cards.project_remaining)}<span>Confirmed fees minus staff cost</span></dd></div>
      </dl>
      <dl className="dashboard-context">
        <div><dt>Staff cost on confirmed work</dt><dd>{money(cards.labor_cost)}</dd></div>
        <div><dt>Professional fees invoiced</dt><dd>{money(cards.invoiced)}</dd></div>
        <div><dt>Staff cost before fee approval <span>({pendingCount} {pendingCount === 1 ? 'project' : 'projects'})</span></dt><dd>{money(cards.pending_exposure)}</dd></div>
      </dl>

      <Suspense fallback={<PageLoader label="Loading charts..." />}>
        <div className="dashboard-charts">
          <ProjectValueChart projects={projects} />
          <ReceiptBreakdownChart
            professionalReceived={cards.payments_received}
            clientFundsReceived={cards.client_funds_received}
            totalReceived={cards.total_client_receipts}
            clientFundsInvoiced={cards.client_funds_invoiced}
            clientFundsOutstanding={cards.client_funds_outstanding}
          />
        </div>
      </Suspense>

      <details className="card dashboard-details">
        <summary>Project figures <span>{projects.length} projects</span></summary>
        <div className="dashboard-detail-content">
        {projects.length === 0 ? (
          <EmptyState message="No projects yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th className="num">Amount</th>
                <th className="num">Labor Cost</th>
                <th className="num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.project_id}>
                  <td data-label="Project">
                    <Link to={`/projects/${project.project_id}`}>{project.name}</Link>
                  </td>
                  <td data-label="Status">
                    <span className={`status-badge status-${project.fee_status}`}>
                      {project.fee_status === 'confirmed' ? 'Confirmed' : 'Pending'}
                    </span>
                  </td>
                  <td data-label="Amount" className="num">{money(project.amount)}</td>
                  <td data-label="Labor Cost" className="num">{money(project.deducted)}</td>
                  <td data-label="Remaining" className={'num' + (project.remaining < 0 ? ' negative' : '')} style={{ fontWeight: 600 }}>
                    {money(project.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="dashboard-more"><Link to="/financial-summary">View Financial Summary →</Link></p>
        </div>
      </details>

      <details className="card dashboard-details">
        <summary>Invoices <span>Open and recent professional invoices</span></summary>
        <div className="dashboard-detail-content">
        {invoices.length === 0 ? (
          <EmptyState message="No invoices yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice">
                    <Link to={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link>
                  </td>
                  <td data-label="Client">{invoice.client_name}</td>
                  <td data-label="Total" className="num">{money(invoice.total, invoice.currency)}</td>
                  <td data-label="Paid" className="num">{money(invoice.paid, invoice.currency)}</td>
                  <td data-label="Due" className="num">{money(invoice.amount_due, invoice.currency)}</td>
                  <td data-label="Status">
                    <span className={`status-badge status-${invoice.status}`}>{INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginBottom: 0 }}>
          <Link to="/invoices">View all invoices →</Link>
        </p>
        </div>
      </details>

      <details className="card dashboard-details">
        <summary>Recent payments <span>{recentPayments.length} latest payments</span></summary>
        <div className="dashboard-detail-content">
        {recentPayments.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Client</th>
                <th className="num">Amount</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((payment) => (
                <tr key={payment.id}>
                  <td data-label="Date">{payment.payment_date}</td>
                  <td data-label="Project">
                    <Link to={`/projects/${payment.project_id}`}>{payment.project_name}</Link>
                  </td>
                  <td data-label="Client">{payment.client_name}</td>
                  <td data-label="Amount" className="num">{money(Number(payment.amount))}</td>
                  <td data-label="Reason">{payment.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginBottom: 0 }}>
          <Link to="/payments">All payments →</Link>
        </p>
        </div>
      </details>

      <details className="card dashboard-details">
        <summary>Team today <span>{today.clocked_in.length} clocked in · {formatDuration(today.hours_recorded * 3600000)} recorded</span></summary>
        <div className="dashboard-detail-content">
        <div className="today-grid">
          <div>
            <div className="stat-label">Employees clocked in</div>
            <div className="stat-value small">{today.clocked_in.length}</div>
            {today.clocked_in.length === 0 ? (
              <div className="stat-note">Nobody is clocked in.</div>
            ) : (
              today.clocked_in.map((person) => (
                <div key={person.employee_name + person.clock_in} className="stat-note">
                  {person.employee_name} · since {formatTime(person.clock_in)}
                </div>
              ))
            )}
          </div>
          <div>
            <div className="stat-label">Work hours recorded today</div>
            <div className="stat-value small">{formatDuration(today.hours_recorded * 3600000)}</div>
            <div className="stat-note">All employees, including running timers</div>
          </div>
          <div>
            <div className="stat-label">Working on a project now</div>
            <div className="stat-value small">{today.working_now.length}</div>
            {today.working_now.length === 0 ? (
              <div className="stat-note">No project timer is running.</div>
            ) : (
              today.working_now.map((person) => (
                <div key={person.employee_name + person.started_at} className="stat-note">
                  {person.employee_name} — {person.project_name} · since {formatTime(person.started_at)}
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      </details>
    </>
  )
}

export default DashboardPage
