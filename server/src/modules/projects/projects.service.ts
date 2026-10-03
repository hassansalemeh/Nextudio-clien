import { withTransaction } from '../../db'
import { hourlyRateFromSalary } from '../../config'
import { HttpError, isIsoDate, roundMoney } from '../../shared'
import { confirmedRevenue, recordedTimeByProjectEmployee, totalLaborCost } from '../project-financials/project-financials.service'
import { listInvoices } from '../invoices/invoices.service'
import * as projectsRepository from './projects.repository'

export const PROJECT_STATUSES = ['planning', 'in_progress', 'completed', 'on_hold']
export const FEE_STATUSES = ['pending', 'confirmed']

// Pending projects may have no fee yet; confirmed projects must have one
export function parseFee(body: { fee_status?: unknown; total_fee?: unknown }): { fee_status: string; total_fee: number | null } {
  const fee_status = body.fee_status ?? 'pending'
  if (typeof fee_status !== 'string' || !FEE_STATUSES.includes(fee_status)) {
    throw new HttpError(400, 'fee_status must be pending or confirmed')
  }
  const raw = body.total_fee
  const hasFee = raw !== null && raw !== undefined && raw !== ''
  if (hasFee && (typeof raw !== 'number' || Number.isNaN(raw) || raw < 0)) {
    throw new HttpError(400, 'total_fee must be a non-negative number')
  }
  if (fee_status === 'confirmed' && !hasFee) {
    throw new HttpError(400, 'total_fee is required when the fee is confirmed')
  }
  return { fee_status, total_fee: hasFee ? (raw as number) : null }
}

export async function listProjects(organizationId: string) {
  return projectsRepository.selectProjects(organizationId)
}

export async function listActiveProjectNames(organizationId: string) {
  return projectsRepository.selectActiveProjectNames(organizationId)
}

export async function createProject(organizationId: string, body: Record<string, unknown>) {
  const client_id = body.client_id
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : null
  const start_date = typeof body.start_date === 'string' && body.start_date ? body.start_date : null
  const status = body.status
  const fee = parseFee(body)

  if (!client_id) throw new HttpError(400, 'client_id is required')
  if (!name) throw new HttpError(400, 'name is required')
  if (!PROJECT_STATUSES.includes(status as string)) {
    throw new HttpError(400, 'status must be one of: ' + PROJECT_STATUSES.join(', '))
  }

  const client_name = await projectsRepository.selectClientName(organizationId, client_id)
  if (client_name === null) throw new HttpError(400, 'Client does not exist')

  const project = await projectsRepository.insertProject(organizationId, {
    client_id, name, description, total_fee: fee.total_fee, fee_status: fee.fee_status, start_date, status: status as string,
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
  const paymentRows = await projectsRepository.selectProjectPayments(organizationId, projectId)
  const professionalPaymentRows = paymentRows.filter((row) => row.invoice_type !== 'client_funds')
  const clientFundsPaymentRows = paymentRows.filter((row) => row.invoice_type === 'client_funds')
  const paymentsReceived = roundMoney(professionalPaymentRows.reduce((total, row) => total + Number(row.amount), 0))

  const clientFundsInvoices = (await listInvoices(organizationId)).filter(
    (invoice) => invoice.invoice_type === 'client_funds' && String(invoice.project_id) === String(projectId)
  )
  const clientFundsReceived = roundMoney(clientFundsPaymentRows.reduce((total, row) => total + Number(row.amount), 0))
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

export async function updateProjectById(organizationId: string, projectId: string, body: Record<string, unknown>) {
  const client_id = body.client_id
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : null
  const start_date = body.start_date ? body.start_date : null
  const status = body.status
  const fee = parseFee(body)

  if (!client_id) throw new HttpError(400, 'client_id is required')
  if (!name) throw new HttpError(400, 'name is required')
  if (start_date !== null && !isIsoDate(start_date)) throw new HttpError(400, 'start_date must be a valid date')
  if (!PROJECT_STATUSES.includes(status as string)) {
    throw new HttpError(400, 'status must be one of: ' + PROJECT_STATUSES.join(', '))
  }

  const clientName = await projectsRepository.selectClientName(organizationId, client_id)
  if (clientName === null) throw new HttpError(400, 'Client does not exist')

  const project = await projectsRepository.updateProject(organizationId, projectId, {
    client_id, name, description, total_fee: fee.total_fee, fee_status: fee.fee_status, start_date: start_date as string | null, status: status as string,
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
