import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dayRange, formatDuration, formatTime, localDateString } from '../timeUtils'
import { INVOICE_STATUS_LABELS } from './InvoicesPage'

const API_URL = import.meta.env.VITE_API_URL ?? ''

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

function StatCard({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'negative' | 'warning' }) {
  return (
    <div className={`stat-card${tone === 'warning' ? ' stat-warning' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${tone === 'negative' ? ' negative' : ''}`}>{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  )
}

function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function load() {
      const { from, to } = dayRange(localDateString())
      fetch(`${API_URL}/api/dashboard?day_from=${encodeURIComponent(from)}&day_to=${encodeURIComponent(to)}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((json) => {
          setData(json)
          setError('')
        })
        .catch(() => setError('Could not load the dashboard.'))
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
  if (!data) return <p className="empty-state">Loading dashboard...</p>

  const { cards, projects, invoices, today, recent_payments: recentPayments } = data
  const pendingCount = projects.filter((project) => project.fee_status !== 'confirmed').length

  return (
    <>
      <h1>Dashboard</h1>
      {error && <p className="error-message">{error}</p>}

      <div className="stat-grid">
        <StatCard label="Confirmed Project Value" value={money(cards.confirmed_value)} note="Value of approved (confirmed) work" />
        <StatCard label="Employee Labor Cost" value={money(cards.labor_cost)} note="Cost of employee time on confirmed projects" />
        <StatCard
          label="Project Remaining"
          value={money(cards.project_remaining)}
          note="Confirmed value minus labor cost"
          tone={cards.project_remaining < 0 ? 'negative' : undefined}
        />
        <StatCard label="Amount Invoiced" value={money(cards.invoiced)} note="Total value of all invoices" />
        <StatCard label="Payments Received" value={money(cards.payments_received)} note="Cash actually collected (every recorded payment)" />
        <StatCard label="Outstanding Invoices" value={money(cards.outstanding)} note="What invoices still have due after their payments" />
      </div>

      <StatCard
        label="Pending Project Exposure"
        value={money(cards.pending_exposure)}
        note={`Labor already spent on ${pendingCount} Pending / Unconfirmed project${pendingCount === 1 ? '' : 's'} with no confirmed revenue yet`}
        tone="warning"
      />

      <h2 style={{ marginTop: '1.5rem' }}>Client Funds (Project Expenses)</h2>
      <p className="empty-state" style={{ marginTop: 0 }}>
        Money held on behalf of clients for construction workers, suppliers, materials and site expenses. Never part of Nextudio's
        professional/design fee revenue above.
      </p>
      <div className="stat-grid">
        <StatCard label="Client Funds Invoiced" value={money(cards.client_funds_invoiced)} note="Total value of all Client Funds invoices" />
        <StatCard label="Client Funds Received" value={money(cards.client_funds_received)} note="Cash received for project expenses, not design fees" />
        <StatCard label="Client Funds Outstanding" value={money(cards.client_funds_outstanding)} note="What Client Funds invoices still have due" />
        <StatCard
          label="Total Client Receipts"
          value={money(cards.total_client_receipts)}
          note="Professional payments + Client Funds received. A cash-in / turnover figure, not a revenue figure."
        />
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Projects Financial Overview</h2>
        {projects.length === 0 ? (
          <p className="empty-state">No projects yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Labor Cost</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.project_id}>
                  <td>
                    <Link to={`/projects/${project.project_id}`}>{project.name}</Link>
                  </td>
                  <td>
                    <span className={`status-badge status-${project.fee_status}`}>
                      {project.fee_status === 'confirmed' ? 'Confirmed' : 'Pending'}
                    </span>
                  </td>
                  <td>{money(project.amount)}</td>
                  <td>{money(project.deducted)}</td>
                  <td className={project.remaining < 0 ? 'negative' : undefined} style={{ fontWeight: 600 }}>
                    {money(project.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Invoices</h2>
        {invoices.length === 0 ? (
          <p className="empty-state">No invoices yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link>
                  </td>
                  <td>{invoice.client_name}</td>
                  <td>{money(invoice.total, invoice.currency)}</td>
                  <td>{money(invoice.paid, invoice.currency)}</td>
                  <td>{money(invoice.amount_due, invoice.currency)}</td>
                  <td>
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

      <div className="card">
        <h2>Recent Payments</h2>
        {recentPayments.length === 0 ? (
          <p className="empty-state">No payments recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.payment_date}</td>
                  <td>
                    <Link to={`/projects/${payment.project_id}`}>{payment.project_name}</Link>
                  </td>
                  <td>{payment.client_name}</td>
                  <td>{money(Number(payment.amount))}</td>
                  <td>{payment.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ marginBottom: 0 }}>
          <Link to="/payments">All payments →</Link>
        </p>
      </div>

      <div className="card">
        <h2>Today</h2>
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
    </>
  )
}

export default DashboardPage
