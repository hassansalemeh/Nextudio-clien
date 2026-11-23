import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { HttpError, Role } from '../../shared'
import { validate } from '../../middleware/validate'
import { projectBody, projectIdParams } from './projects.schemas'
import { sendTimeError } from '../time-tracking/time-tracking.service'
import * as projectsService from './projects.service'

export function registerProjectRoutes(app: Express) {
  app.get('/api/projects', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await projectsService.listProjects(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch projects' })
    }
  })

  // Employee-safe project list for "Add Work Manually": names only, no client, fee or financial data,
  // and only projects that are actually open for new work.
  app.get('/api/projects/active-names', allow(Role.Admin, Role.Employee), async (req, res) => {
    try {
      res.json(await projectsService.listActiveProjectNames(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch projects' })
    }
  })

  app.post('/api/projects', allow(Role.Admin), validate({ body: projectBody }), async (req, res) => {
    try {
      const project = await projectsService.createProject(organizationIdOf(req), req.body)
      res.status(201).json(project)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to create project' })
    }
  })

  app.get('/api/projects/:projectId', allow(Role.Admin), validate({ params: projectIdParams }), async (req, res) => {
    try {
      const detail = await projectsService.getProjectDetail(organizationIdOf(req), req.params.projectId)
      if (!detail) {
        return res.status(404).json({ error: 'Project not found' })
      }
      res.json(detail)
    } catch {
      res.status(500).json({ error: 'Failed to fetch project details' })
    }
  })

  app.put('/api/projects/:projectId', allow(Role.Admin), validate({ params: projectIdParams, body: projectBody }), async (req, res) => {
    try {
      const project = await projectsService.updateProjectById(organizationIdOf(req), req.params.projectId, req.body)
      res.json(project)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to update project' })
    }
  })

  // Permanently removes a project and everything that belongs to it. The client and employees are kept.
  app.delete('/api/projects/:projectId', allow(Role.Admin), validate({ params: projectIdParams }), async (req, res) => {
    try {
      await projectsService.deleteProjectById(organizationIdOf(req), req.params.projectId)
      res.json({ ok: true })
    } catch (err) {
      sendTimeError(res, err, 'Failed to delete project')
    }
  })
}
