import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { LogoutIcon, MenuIcon, CloseIcon } from '../shared/components/icons'
import ClientFundsInvoiceEditorPage from '../features/invoices/pages/ClientFundsInvoiceEditorPage'
import ClientsPage from '../features/clients/pages/ClientsPage'
import DashboardPage from '../features/dashboard/pages/DashboardPage'
import DocumentPreviewPage from '../features/documents/pages/DocumentPreviewPage'
import EmployeesPage from '../features/employees/pages/EmployeesPage'
import EstimateEditorPage from '../features/estimates/pages/EstimateEditorPage'
import EstimatesPage from '../features/estimates/pages/EstimatesPage'
import InvoiceDetailPage from '../features/invoices/pages/InvoiceDetailPage'
import InvoicesPage from '../features/invoices/pages/InvoicesPage'
import LoginPage from '../features/auth/pages/LoginPage'
import PaymentsPage from '../features/payments/pages/PaymentsPage'
import PendingWorkEntriesPage from '../features/pending-work/pages/PendingWorkEntriesPage'
import MyWorkPage from '../features/time-tracking/pages/MyWorkPage'
import ProjectDetailPage from '../features/projects/pages/ProjectDetailPage'
import ProjectFinancialSummaryPage from '../features/projects/pages/ProjectFinancialSummaryPage'
import ProjectsPage from '../features/projects/pages/ProjectsPage'
import AssignWorkPage from '../features/work-assignments/pages/AssignWorkPage'
import TimeTrackingPage from '../features/time-tracking/pages/TimeTrackingPage'

const NAV_SECTIONS = [
  { title: 'Overview', links: [{ to: '/dashboard', label: 'Dashboard' }] },
  { title: 'Clients & Projects', links: [
    { to: '/clients', label: 'Clients' },
    { to: '/projects', label: 'Projects' },
    { to: '/estimates', label: 'Estimates' },
    { to: '/invoices', label: 'Invoices' },
  ] },
  { title: 'Money', links: [
    { to: '/payments', label: 'Payments' },
    { to: '/financial-summary', label: 'Financial Summary' },
  ] },
  { title: 'Team', links: [
    { to: '/employees', label: 'Employees' },
    { to: '/assignments', label: 'Assignments' },
    { to: '/time-tracking', label: 'Time Tracking' },
    { to: '/pending-work', label: 'Approvals' },
  ] },
]

function App() {
  const { user, loading, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<string[]>([])
  const [pendingCount, setPendingCount] = useState<number | null>(null)
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

  const isEmployee = user.role === 'employee'
  const sections = isEmployee ? [{ title: 'My work', links: [{ to: '/', label: 'My Work' }] }] : NAV_SECTIONS

  return (
    <div className="app-shell">
      <header className="mobile-toolbar">
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <img className="app-logo" src="/nextudio-logo.webp" alt="Nextudio architects" />
      </header>
      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside id="app-sidebar" className={'app-sidebar' + (menuOpen ? ' sidebar-open' : '')}>
        <div className="sidebar-brand">
          <img className="app-logo" src="/nextudio-logo.webp" alt="Nextudio architects" />
          <button type="button" className="sidebar-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <CloseIcon />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {sections.map((section) => {
            const collapsed = collapsedSections.includes(section.title)
            const activeSection = section.links.some((link) =>
              link.to === '/' ? location.pathname === '/' : location.pathname === link.to || location.pathname.startsWith(link.to + '/')
            )
            return (
              <div className="nav-section" key={section.title}>
                <button
                  type="button"
                  className={'nav-section-toggle' + (activeSection && collapsed ? ' section-active' : '')}
                  aria-expanded={!collapsed}
                  onClick={() => setCollapsedSections((current) =>
                    collapsed ? current.filter((title) => title !== section.title) : [...current, section.title]
                  )}
                >
                  <span>{section.title}</span>
                  <span className={'section-chevron' + (collapsed ? ' collapsed' : '')} aria-hidden="true">⌄</span>
                </button>
                {!collapsed && <div className="nav-section-links">
                  {section.links.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.to === '/' || link.to === '/dashboard'}
                      className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                    >
                      <span>{link.label}</span>
                      {link.to === '/pending-work' && pendingCount !== null && pendingCount > 0 &&
                        <span className="nav-count" aria-label={`${pendingCount} pending`}>{pendingCount}</span>}
                    </NavLink>
                  ))}
                </div>}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          {isEmployee && <span className="employee-name">{user.employeeName}</span>}
          <button type="button" className="sidebar-logout" onClick={logout}><LogoutIcon /> Log out</button>
        </div>
      </aside>

      <main className="app-main">
        {isEmployee ? <Routes>
          <Route path="/" element={<MyWorkPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes> : <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/assignments" element={<AssignWorkPage />} />
          <Route path="/time-tracking" element={<TimeTrackingPage />} />
          <Route path="/pending-work" element={<PendingWorkEntriesPage onPendingCountChange={setPendingCount} />} />
          <Route path="/estimates" element={<EstimatesPage />} />
          <Route path="/estimates/:id" element={<EstimateEditorPage />} />
          <Route path="/estimates/:id/preview" element={<DocumentPreviewPage kind="estimate" />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/new" element={<ClientFundsInvoiceEditorPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/invoices/:id/edit" element={<ClientFundsInvoiceEditorPage />} />
          <Route path="/invoices/:id/preview" element={<DocumentPreviewPage kind="invoice" />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/financial-summary" element={<ProjectFinancialSummaryPage />} />
        </Routes>}
      </main>
    </div>
  )
}

export default App
