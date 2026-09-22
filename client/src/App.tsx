import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { LogoutIcon } from './components/icons'
import ClientsPage from './pages/ClientsPage'
import DashboardPage from './pages/DashboardPage'
import DocumentPreviewPage from './pages/DocumentPreviewPage'
import EmployeesPage from './pages/EmployeesPage'
import EstimateEditorPage from './pages/EstimateEditorPage'
import EstimatesPage from './pages/EstimatesPage'
import InvoiceDetailPage from './pages/InvoiceDetailPage'
import InvoicesPage from './pages/InvoicesPage'
import LoginPage from './pages/LoginPage'
import PaymentsPage from './pages/PaymentsPage'
import PendingWorkEntriesPage from './pages/PendingWorkEntriesPage'
import MyWorkPage from './pages/MyWorkPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ProjectFinancialSummaryPage from './pages/ProjectFinancialSummaryPage'
import ProjectsPage from './pages/ProjectsPage'
import AssignWorkPage from './pages/AssignWorkPage'
import TimeTrackingPage from './pages/TimeTrackingPage'
// import FinancePage from './pages/FinancePage'

function App() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return null
  }

  if (!user) {
    return (
      <main>
        <LoginPage />
      </main>
    )
  }

  // Employees get a single page. The server also blocks every admin API route for them.
  if (user.role === 'employee') {
    return (
      <>
        <header className="app-header">
          <img className="app-logo" src="/nextudio-logo.webp" alt="Nextudio architects" />
          <span className="nav-link">{user.employeeName}</span>
          <button type="button" className="btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={logout}>
            <LogoutIcon /> Log out
          </button>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<MyWorkPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </>
    )
  }

  return (
    <>
      <header className="app-header">
        <img className="app-logo" src="/nextudio-logo.webp" alt="Nextudio architects" />
        <nav>
          <NavLink to="/dashboard" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Dashboard
          </NavLink>
          <NavLink to="/clients" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Clients
          </NavLink>
          <NavLink to="/employees" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Employees
          </NavLink>
          <NavLink to="/projects" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Projects
          </NavLink>
          <NavLink to="/assignments" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Assignments
          </NavLink>
          <NavLink to="/time-tracking" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Time Tracking
          </NavLink>
          <NavLink to="/pending-work" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Pending Work
          </NavLink>
          <NavLink to="/estimates" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Estimates
          </NavLink>
          <NavLink to="/invoices" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Invoices
          </NavLink>
          <NavLink to="/payments" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Payments
          </NavLink>
          <NavLink to="/financial-summary" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Financial Summary
          </NavLink>
          {/* <NavLink to="/finance" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Finance
          </NavLink> */}
        </nav>
        <button type="button" className="btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={logout}>
          <LogoutIcon /> Log out
        </button>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/assignments" element={<AssignWorkPage />} />
          <Route path="/time-tracking" element={<TimeTrackingPage />} />
          <Route path="/pending-work" element={<PendingWorkEntriesPage />} />
          <Route path="/estimates" element={<EstimatesPage />} />
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
          <Route path="/estimates/:id/preview" element={<DocumentPreviewPage kind="estimate" />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/invoices/:id/preview" element={<DocumentPreviewPage kind="invoice" />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/financial-summary" element={<ProjectFinancialSummaryPage />} />
          {/* <Route path="/finance" element={<FinancePage />} /> */}
        </Routes>
      </main>
    </>
  )
}

export default App
