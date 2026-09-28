import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../auth'
import { CloseIcon, LogoutIcon, MenuIcon } from '../components/icons'
import './accounting.css'
import { AccountingBookProvider, useAccountingBook } from './BookContext'
import AccountingDashboardPage from './pages/AccountingDashboardPage'
import AddTransactionPage from './pages/AddTransactionPage'
import AccountingLegacyJobDetailPage from './pages/AccountingLegacyJobDetailPage'
import AccountingProjectDetailPage from './pages/AccountingProjectDetailPage'
import AccountingProjectsPage from './pages/AccountingProjectsPage'
import CashBankPage from './pages/CashBankPage'
import JournalEntryDetailPage from './pages/JournalEntryDetailPage'
import JournalPage from './pages/JournalPage'
import PayeeDetailPage from './pages/PayeeDetailPage'
import PayeesPage from './pages/PayeesPage'
import ReportsPage from './pages/ReportsPage'
import SetupPage from './pages/SetupPage'

const NAV_ITEMS = [
  { to: '/accounting/dashboard', label: 'Dashboard' },
  { to: '/accounting/add', label: 'Add Transaction' },
  { to: '/accounting/projects', label: 'Projects' },
  { to: '/accounting/payees', label: 'Payees' },
  { to: '/accounting/cash-bank', label: 'Cash & Bank' },
  { to: '/accounting/journal', label: 'Journal' },
  { to: '/accounting/reports', label: 'Reports' },
  { to: '/accounting/setup', label: 'Setup' },
]

function BookSelector() {
  const { books, bookCode, setBookCode } = useAccountingBook()
  return (
    <select className="accounting-book-select" value={bookCode} onChange={(e) => setBookCode(e.target.value)} aria-label="Accounting book">
      {books.length === 0 ? (
        <option value={bookCode}>{bookCode}</option>
      ) : (
        books.map((book) => (
          <option key={book.code} value={book.code}>
            {book.name}
          </option>
        ))
      )}
    </select>
  )
}

function AccountingShell() {
  const { logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="accounting-shell">
      <button
        type="button"
        className="accounting-menu-toggle"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <CloseIcon /> : <MenuIcon />}
      </button>
      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`accounting-sidebar${menuOpen ? ' open' : ''}`}>
        <Link to="/dashboard" className="accounting-back">
          ← Nextudio Control
        </Link>
        <div className="accounting-title">Accounting</div>
        <BookSelector />
        <nav className="accounting-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 'accounting-nav-link' + (isActive ? ' active' : '')}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn-sm btn-ghost accounting-logout" onClick={logout}>
          <LogoutIcon /> Log out
        </button>
      </aside>

      <main className="accounting-main">
        <Routes>
          <Route path="/accounting" element={<Navigate to="/accounting/dashboard" replace />} />
          <Route path="/accounting/dashboard" element={<AccountingDashboardPage />} />
          <Route path="/accounting/add" element={<AddTransactionPage />} />
          <Route path="/accounting/projects" element={<AccountingProjectsPage />} />
          <Route path="/accounting/projects/:id" element={<AccountingProjectDetailPage />} />
          <Route path="/accounting/legacy-jobs/:id" element={<AccountingLegacyJobDetailPage />} />
          <Route path="/accounting/payees" element={<PayeesPage />} />
          <Route path="/accounting/payees/:id" element={<PayeeDetailPage />} />
          <Route path="/accounting/cash-bank" element={<CashBankPage />} />
          <Route path="/accounting/journal" element={<JournalPage />} />
          <Route path="/accounting/journal/:id" element={<JournalEntryDetailPage />} />
          <Route path="/accounting/reports" element={<ReportsPage />} />
          <Route path="/accounting/setup" element={<SetupPage />} />
          <Route path="*" element={<Navigate to="/accounting/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function AccountingApp() {
  return (
    <AccountingBookProvider>
      <AccountingShell />
    </AccountingBookProvider>
  )
}

export default AccountingApp
