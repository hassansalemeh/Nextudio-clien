import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { LogoutIcon, MenuIcon, CloseIcon } from './components/icons'
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

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/clients', label: 'Clients' },
  { to: '/employees', label: 'Employees' },
  { to: '/projects', label: 'Projects' },
  { to: '/assignments', label: 'Assignments' },
  { to: '/time-tracking', label: 'Time Tracking' },
  { to: '/pending-work', label: 'Pending Work' },
  { to: '/estimates', label: 'Estimates' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/payments', label: 'Payments' },
  { to: '/financial-summary', label: 'Financial Summary' },
]

function App() {
  const { user, loading, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Close the mobile menu whenever the route changes (a link was followed, or the browser back/forward was used)
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

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
          <span className="nav-link employee-name">{user.employeeName}</span>
          <button type="button" className="btn-sm btn-ghost header-logout" onClick={logout}>
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
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <nav className={menuOpen ? 'nav-open' : ''}>
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn-sm btn-ghost header-logout" onClick={logout}>
          <LogoutIcon /> Log out
        </button>
      </header>
      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}

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
