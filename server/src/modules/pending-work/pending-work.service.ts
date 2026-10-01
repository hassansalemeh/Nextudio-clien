import { withTransaction } from '../../db'
import { HttpError, isIsoDate } from '../../shared'
import * as pendingWorkRepository from './pending-work.repository'

export async function listPendingWorkEntries() {
  return pendingWorkRepository.selectPendingWorkEntries()
}

export async function rejectPendingWorkEntry(id: string) {
  const rowCount = await pendingWorkRepository.rejectPendingWorkEntry(id)
  if (rowCount === 0) {
    throw new HttpError(400, 'This request was already reviewed')
  }
}

// Approves a pending entry and, unless the employee is already assigned to the project on that date,
// creates the matching work assignment in the same transaction - never an approved entry with no assignment.
export async function approvePendingWorkEntry(id: string, start_date: string, end_date: string, description: string) {
  await withTransaction(async (client) => {
    const entry = await pendingWorkRepository.selectWorkEntryForApproval(client, id)
    if (!entry) throw new HttpError(404, 'Work entry not found')
    if (entry.status !== 'pending') throw new HttpError(400, 'This request was already reviewed')

    const covered = await pendingWorkRepository.selectAssignmentCoversDate(client, entry.employee_id, entry.project_id, entry.entry_date)

    if (!covered) {
      // Not covered yet: create the assignment now, exactly as "Assign Work" would
      if (!isIsoDate(start_date)) throw new HttpError(400, 'Assignment start date is required')
      if (!isIsoDate(end_date)) throw new HttpError(400, 'Assignment end date is required')
      if (end_date < start_date) throw new HttpError(400, 'End date cannot be before start date')
      if (!description) throw new HttpError(400, 'Task description is required')
      if (start_date > entry.entry_date || end_date < entry.entry_date) {
        throw new HttpError(400, 'This assignment does not cover the selected date')
      }
      await pendingWorkRepository.insertWorkAssignmentForApproval(client, entry.project_id, entry.employee_id, start_date, end_date, description)
    }

    await pendingWorkRepository.markTimeEntryApproved(client, entry.id)
  })
}
