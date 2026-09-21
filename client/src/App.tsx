import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import ClientsPage from './pages/ClientsPage'
import EmployeesPage from './pages/EmployeesPage'
import ProjectsPage from './pages/ProjectsPage'
import TimeTrackingPage from './pages/TimeTrackingPage'
import FinancePage from './pages/FinancePage'

function App() {
  return (
    <>
      <header className="app-header">
        <span className="app-title">Control</span>
        <nav>
          <NavLink to="/clients" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Clients
          </NavLink>
          <NavLink to="/employees" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Employees
          </NavLink>
          <NavLink to="/projects" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Projects
          </NavLink>
          <NavLink to="/time-tracking" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Time Tracking
          </NavLink>
          {/* <NavLink to="/finance" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Finance
          </NavLink> */}
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/time-tracking" element={<TimeTrackingPage />} />
          {/* <Route path="/finance" element={<FinancePage />} /> */}
        </Routes>
      </main>
    </>
  )
}

export default App
