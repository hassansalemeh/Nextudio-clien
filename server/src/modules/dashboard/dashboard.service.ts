import { roundMoney } from '../../shared'
import { listInvoices } from '../invoices/invoices.service'
import { projectFinancials } from '../project-financials/project-financials.service'
import * as dashboardRepository from './dashboard.repository'

// Company overview for the admin Dashboard. Three different things are kept apart on purpose:
//   value of approved work (confirmed fees), cash actually collected (payments), cost of employee time (labor).
export async function getDashboard(organizationId: string, dayFromParam: string | undefined, dayToParam: string | undefined) {
  const projects = await projectFinancials(organizationId)
  const sum = (values: number[]) => roundMoney(values.reduce((total, value) => total + value, 0))

  // Confirmed projects carry revenue; pending ones have $0 revenue, so their labor cost is money spent ahead of approval
  const confirmed = projects.filter((project) => project.fee_status === 'confirmed')
  const pending = projects.filter((project) => project.fee_status !== 'confirmed')
  const confirmedValue = sum(confirmed.map((project) => project.amount))
  const laborCost = sum(confirmed.map((project) => project.deducted))

  // Invoices and cash come from the invoice records themselves (payments are summed there).
  // Client Funds invoices/payments (money held for project expenses, not Nextudio's design fee) are kept
  // out of every professional/design-fee figure below, and reported separately instead.
  const invoices = await listInvoices(organizationId)
  const professionalInvoices = invoices.filter((invoice) => invoice.invoice_type === 'professional_services')
  const clientFundsInvoices = invoices.filter((invoice) => invoice.invoice_type === 'client_funds')
  const invoiced = sum(professionalInvoices.map((invoice) => Number(invoice.total)))
  // cash actually collected: every payment record not applied to a Client Funds invoice
  const paymentsReceived = roundMoney(await dashboardRepository.selectProfessionalPaymentsReceivedTotal(organizationId))
  const clientFundsReceived = roundMoney(await dashboardRepository.selectClientFundsPaymentsReceivedTotal(organizationId))
  const clientFundsInvoiced = sum(clientFundsInvoices.map((invoice) => Number(invoice.total)))
  const clientFundsOutstanding = sum(clientFundsInvoices.map((invoice) => invoice.amount_due))
  const recentPayments = await dashboardRepository.selectRecentPayments(organizationId)

  // Open invoices first, plus the few most recent ones. Professional Services only - Client Funds invoices
  // are reported separately (see the client_funds cards below and the Invoices page).
  const recentInvoices = professionalInvoices
    .filter((invoice, index) => invoice.amount_due > 0 || index < 5)
    .slice(0, 10)
    .map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      currency: invoice.currency,
      total: Number(invoice.total),
      paid: invoice.paid,
      amount_due: invoice.amount_due,
      status: invoice.status,
    }))

  // Today: the browser sends its local day boundaries
  const dayFrom = typeof dayFromParam === 'string' ? new Date(dayFromParam) : new Date(new Date().setUTCHours(0, 0, 0, 0))
  const dayTo = typeof dayToParam === 'string' ? new Date(dayToParam) : new Date(dayFrom.getTime() + 86400000)
  const clockedIn = await dashboardRepository.selectClockedIn(organizationId)
  const workingNow = await dashboardRepository.selectWorkingNow(organizationId)
  const hoursToday = await dashboardRepository.selectHoursToday(organizationId, dayFrom, dayTo)

  return {
    cards: {
      confirmed_value: confirmedValue,
      labor_cost: laborCost,
      project_remaining: roundMoney(confirmedValue - laborCost),
      invoiced,
      payments_received: paymentsReceived,
      // what invoices still have due (only payments applied to an invoice reduce it) - Professional Services only
      outstanding: sum(professionalInvoices.map((invoice) => invoice.amount_due)),
      pending_exposure: sum(pending.map((project) => project.deducted)),
      // Money received on behalf of / for the client's project expenses. Never part of Nextudio's own
      // professional/design fee revenue, confirmed project value or profitability above.
      client_funds_invoiced: clientFundsInvoiced,
      client_funds_received: clientFundsReceived,
      client_funds_outstanding: clientFundsOutstanding,
      // Annual cash-in / turnover view: every dollar actually collected, professional or client funds.
      // This is a receipts total, not a revenue figure - it must never be relabelled as professional revenue.
      total_client_receipts: roundMoney(paymentsReceived + clientFundsReceived),
    },
    projects: projects.map((project) => ({
      project_id: project.project_id,
      name: project.name,
      fee_status: project.fee_status,
      amount: project.amount,
      deducted: project.deducted,
      remaining: project.remaining,
    })),
    invoices: recentInvoices,
    recent_payments: recentPayments,
    today: {
      clocked_in: clockedIn,
      working_now: workingNow,
      hours_recorded: hoursToday,
    },
  }
}
