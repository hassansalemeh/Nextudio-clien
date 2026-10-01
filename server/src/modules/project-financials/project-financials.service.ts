import { roundMoney } from '../../shared'
import * as projectFinancialsRepository from './project-financials.repository'

export async function recordedTimeByProjectEmployee(projectId?: string) {
  return projectFinancialsRepository.selectRecordedTimeByProjectEmployee(projectId)
}

// Each employee's cost is rounded to cents, then summed, so the totals always add up to the rows shown
export function totalLaborCost(rows: { cost: string }[]) {
  return roundMoney(rows.reduce((sum, row) => sum + roundMoney(Number(row.cost)), 0))
}

// Pending fees count as $0 revenue; only a confirmed fee is revenue
export function confirmedRevenue(project: { fee_status: string; total_fee: string | null }) {
  return project.fee_status === 'confirmed' ? Number(project.total_fee) : 0
}

// Amount (confirmed revenue), labor cost deducted and remaining for every project. The single place these are combined.
export async function projectFinancials() {
  const projects = await projectFinancialsRepository.selectProjectsForFinancials()
  const time = await recordedTimeByProjectEmployee()

  return projects.map((project) => {
    const amount = confirmedRevenue(project)
    const deducted = totalLaborCost(time.filter((row) => String(row.project_id) === String(project.id)))
    return {
      project_id: project.id,
      name: project.name,
      fee_status: project.fee_status as string,
      status: project.status as string,
      entered_fee: project.total_fee === null ? null : Number(project.total_fee),
      amount,
      deducted,
      remaining: roundMoney(amount - deducted),
    }
  })
}
