import type { z } from 'zod'
import { withTransaction } from '../../db'
import { hourlyRateFromSalary } from '../../config'
import { HttpError, roundMoney } from '../../shared'
import { confirmedRevenue, recordedTimeByProjectEmployee, totalLaborCost } from '../project-financials/project-financials.service'
import { listInvoices } from '../invoices/invoices.service'
import type { projectBody } from './projects.schemas'
import * as projectsRepository from './projects.repository'

export type ProjectInput = z.infer<typeof projectBody>

export async function listProjects(organizationId: string) {
  return projectsRepository.selectProjects(organizationId)
}

export async function listActiveProjectNames(organizationId: string) {
  return projectsRepository.selectActiveProjectNames(organizationId)
}

export async function createProject(organizationId: string, input: ProjectInput) {
  const { client_id, name, description, start_date, status, fee_status, total_fee } = input

  const client_name = await projectsRepository.selectClientName(organizationId, client_id)
  if (client_name === null) throw new HttpError(400, 'Client does not exist')

  const project = await projectsRepository.insertProject(organizationId, {
    client_id, name, description, total_fee, fee_status, start_date, status,
  })
  return { ...project, client_name }
}

export async function getProjectDetail(organizationId: string, projectId: string) {
  const project = await projectsRepository.selectProjectDetail(organizationId, projectId)
  if (!project) return null

  const employeeRows = await projectsRepository.selectProjectEmployees(projectId)
  const taskRows = await projectsRepository.selectProjectTasks(projectId)

  const timeRows = await recordedTimeByProjectEmployee(organizationId, projectId)
  const timeByEmployee = new Map(timeRows.map((row) => [String(row.employee_id), row]))

  const employees = employeeRows.map((employee) => {
    const time = timeByEmployee.get(String(employee.id))
    const hours = time ? Number(time.hours) : 0
    const laborCost = time ? roundMoney(Number(time.cost)) : 0
    return {
      employee_id: employee.id,
      full_name: employee.full_name,
      position: employee.position,
      assignments: taskRows.filter((task) => String(task.employee_id) === String(employee.id)),
      hours_worked: hours,
      // Effective rate of the work actually done; the current rate if nothing has been recorded yet
      hourly_cost: time && hours > 0 ? Number(time.cost) / hours : hourlyRateFromSalary(Number(employee.monthly_salary)),
      labor_cost: laborCost,
    }
  })

  const laborCostTotal = totalLaborCost(timeRows)
  const revenue = confirmedRevenue(project)

  // Client Funds payments (money held for this project's expenses, not Nextudio's design fee) are kept out
  // of this project's client-side figures below, and reported separately in the client_funds block instead.
  // Cancelled payments stay in the list (shown greyed out), but never count toward a total
  const paymentRows = await projectsRepository.selectProjectPayments(organizationId, projectId)
  const professionalPaymentRows = paymentRows.filter((row) => row.invoice_type !== 'client_funds')
  const clientFundsPaymentRows = paymentRows.filter((row) => row.invoice_type === 'client_funds')
  const paymentsReceived = roundMoney(
    professionalPaymentRows.filter((row) => !row.cancelled_at).reduce((total, row) => total + Number(row.amount), 0)
  )

  const clientFundsInvoices = (await listInvoices(organizationId)).filter(
    (invoice) => invoice.invoice_type === 'client_funds' && String(invoice.project_id) === String(projectId)
  )
  const clientFundsReceived = roundMoney(
    clientFundsPaymentRows.filter((row) => !row.cancelled_at).reduce((total, row) => total + Number(row.amount), 0)
  )
  const disbursementRows =
    clientFundsInvoices.length === 0 ? [] : await projectsRepository.selectDisbursementAmounts(clientFundsInvoices.map((i) => i.id))
  const clientFundsSpent = roundMoney(disbursementRows.reduce((total, row) => total + Number(row.amount), 0))

  return {
    project,
    employees,
    payments: professionalPaymentRows,
    payments_received: paymentsReceived,
    // what the client still owes on the confirmed project value; unrelated to employee labor cost
    client_balance_due: roundMoney(revenue - paymentsReceived),
    total_hours: employees.reduce((sum, e) => sum + e.hours_worked, 0),
    total_labor_cost: laborCostTotal,
    confirmed_revenue: revenue,
    current_position: roundMoney(revenue - laborCostTotal),
    // Funds held for this project's expenses - never part of the design-fee figures above
    client_funds: {
      invoices: clientFundsInvoices.map((invoice) => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        currency: invoice.currency,
        total: Number(invoice.total),
        paid: invoice.paid,
        amount_due: invoice.amount_due,
        status: invoice.status,
      })),
      invoiced: roundMoney(clientFundsInvoices.reduce((total, invoice) => total + Number(invoice.total), 0)),
      received: clientFundsReceived,
      spent: clientFundsSpent,
      remaining: roundMoney(clientFundsReceived - clientFundsSpent),
    },
  }
}

export async function updateProjectById(organizationId: string, projectId: string, input: ProjectInput) {
  const { client_id, name, description, start_date, status, fee_status, total_fee } = input

  const clientName = await projectsRepository.selectClientName(organizationId, client_id)
  if (clientName === null) throw new HttpError(400, 'Client does not exist')

  const project = await projectsRepository.updateProject(organizationId, projectId, {
    client_id, name, description, total_fee, fee_status, start_date, status,
  })
  if (!project) throw new HttpError(404, 'Project not found')

  return { ...project, client_name: clientName }
}

// Permanently removes a project and everything that belongs to it. The client and employees are kept.
export async function deleteProjectById(organizationId: string, projectId: string) {
  await withTransaction(async (client) => {
    const project = await projectsRepository.lockProjectForDelete(client, organizationId, projectId)
    if (!project) {
      throw new HttpError(404, 'Project not found')
    }
    const { source_invoice_id: invoiceId, source_estimate_id: estimateId } = project

    // Money records are never deleted silently: block the delete if the project has any
    const hasFinancialRecords = await projectsRepository.selectFinancialRecordsForProject(client, projectId)
    if (hasFinancialRecords) {
      throw new HttpError(400, "This project has financial records and can't be deleted.")
    }

    // A receipt (and the payment behind it) is never deleted with its project - cancel it first
    const hasReceipts = await projectsRepository.selectReceiptsForProject(client, projectId)
    if (hasReceipts) {
      throw new HttpError(400, "This project has receipts and can't be deleted. Cancel them first.")
    }

    // Every payment recorded against the project (applied to its invoice or not) goes with it, then the invoice (items go with it)
    await projectsRepository.deletePaymentsForProject(client, projectId, invoiceId)
    if (invoiceId) {
      await projectsRepository.deleteInvoiceById(client, invoiceId)
    }
    await projectsRepository.deleteProjectChildren(client, projectId)
    await projectsRepository.deleteProjectById(client, projectId)
    // ...and so does the quotation it was created from (its items are removed with it)
    if (estimateId) {
      await projectsRepository.deleteEstimateById(client, estimateId)
    }
  })
}
