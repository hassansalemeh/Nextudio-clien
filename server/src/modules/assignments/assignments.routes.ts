import type { Express } from 'express'
import { allow, organizationIdOf, resolveEmployeeId } from '../../middleware/auth'
import { HttpError, Role } from '../../shared'
import { validate } from '../../middleware/validate'
import { addProjectAssignmentBody, assignmentIdParams, projectIdParams, workAssignmentBody, workAssignmentsListQuery } from './assignments.schemas'
import * as assignmentsService from './assignments.service'

export function registerAssignmentRoutes(app: Express) {
  app.get('/api/projects/:projectId/assignments', allow(Role.Admin), validate({ params: projectIdParams }), async (req, res) => {
    try {
      res.json(await assignmentsService.listProjectAssignments(organizationIdOf(req), req.params.projectId))
    } catch {
      res.status(500).json({ error: 'Failed to fetch assignments' })
    }
  })

  app.post(
    '/api/projects/:projectId/assignments',
    allow(Role.Admin),
    validate({ params: projectIdParams, body: addProjectAssignmentBody }),
    async (req, res) => {
      try {
        const assignment = await assignmentsService.addProjectAssignment(organizationIdOf(req), req.params.projectId, req.body.employee_id)
        res.status(201).json(assignment)
      } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
        res.status(500).json({ error: 'Failed to assign employee' })
      }
    }
  )

  app.get('/api/work-assignments', allow(Role.Admin, Role.Employee), validate({ query: workAssignmentsListQuery }), async (req, res) => {
    const { project_id, date } = req.query as { project_id: string | null; date: string | null }
    const employee_id = resolveEmployeeId(req, req.query.employee_id) as string | null
    try {
      res.json(await assignmentsService.listWorkAssignments(organizationIdOf(req), project_id, employee_id, date))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to fetch work assignments' })
    }
  })

  app.post('/api/work-assignments', allow(Role.Admin), validate({ body: workAssignmentBody }), async (req, res) => {
    const { project_id, employee_id, start_date, end_date, description } = req.body
    try {
      const assignment = await assignmentsService.createWorkAssignment(organizationIdOf(req), project_id, employee_id, start_date, end_date, description)
      res.status(201).json(assignment)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to create work assignment' })
    }
  })

  app.put(
    '/api/work-assignments/:assignmentId',
    allow(Role.Admin),
    validate({ params: assignmentIdParams, body: workAssignmentBody }),
    async (req, res) => {
      const { project_id, employee_id, start_date, end_date, description } = req.body
      try {
        const assignment = await assignmentsService.updateWorkAssignment(
          organizationIdOf(req),
          req.params.assignmentId,
          project_id,
          employee_id,
          start_date,
          end_date,
          description
        )
        res.json(assignment)
      } catch (err) {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
        res.status(500).json({ error: 'Failed to update assignment' })
      }
    }
  )
}
