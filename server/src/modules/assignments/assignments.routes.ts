import type { Express } from 'express'
import { organizationIdOf, resolveEmployeeId } from '../../middleware/auth'
import { HttpError } from '../../shared'
import * as assignmentsService from './assignments.service'

export function registerAssignmentRoutes(app: Express) {
  app.get('/api/projects/:projectId/assignments', async (req, res) => {
    const { projectId } = req.params
    try {
      res.json(await assignmentsService.listProjectAssignments(organizationIdOf(req), projectId))
    } catch {
      res.status(500).json({ error: 'Failed to fetch assignments' })
    }
  })

  app.post('/api/projects/:projectId/assignments', async (req, res) => {
    const { projectId } = req.params
    try {
      const assignment = await assignmentsService.addProjectAssignment(organizationIdOf(req), projectId, req.body.employee_id)
      res.status(201).json(assignment)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to assign employee' })
    }
  })

  app.get('/api/work-assignments', async (req, res) => {
    const { project_id, date } = req.query
    const employee_id = resolveEmployeeId(req, req.query.employee_id)
    try {
      res.json(await assignmentsService.listWorkAssignments(organizationIdOf(req), project_id, employee_id, date))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to fetch work assignments' })
    }
  })

  app.post('/api/work-assignments', async (req, res) => {
    const project_id = req.body.project_id
    const employee_id = req.body.employee_id
    const start_date = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : ''
    const end_date = typeof req.body.end_date === 'string' ? req.body.end_date.trim() : ''
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

    try {
      const assignment = await assignmentsService.createWorkAssignment(organizationIdOf(req), project_id, employee_id, start_date, end_date, description)
      res.status(201).json(assignment)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to create work assignment' })
    }
  })

  app.put('/api/work-assignments/:assignmentId', async (req, res) => {
    const { assignmentId } = req.params
    const { project_id, employee_id } = req.body
    const start_date = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : ''
    const end_date = typeof req.body.end_date === 'string' ? req.body.end_date.trim() : ''
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

    try {
      const assignment = await assignmentsService.updateWorkAssignment(organizationIdOf(req), assignmentId, project_id, employee_id, start_date, end_date, description)
      res.json(assignment)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to update assignment' })
    }
  })
}
