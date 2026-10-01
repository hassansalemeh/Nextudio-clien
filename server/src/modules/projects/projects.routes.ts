import type { Express } from 'express'
import { HttpError } from '../../shared'
import { sendTimeError } from '../time-tracking/time-tracking.service'
import * as projectsService from './projects.service'

export function registerProjectRoutes(app: Express) {
  app.get('/api/projects', async (_req, res) => {
    try {
      res.json(await projectsService.listProjects())
    } catch {
      res.status(500).json({ error: 'Failed to fetch projects' })
    }
  })

  // Employee-safe project list for "Add Work Manually": names only, no client, fee or financial data,
  // and only projects that are actually open for new work.
  app.get('/api/projects/active-names', async (_req, res) => {
    try {
      res.json(await projectsService.listActiveProjectNames())
    } catch {
      res.status(500).json({ error: 'Failed to fetch projects' })
    }
  })

  app.post('/api/projects', async (req, res) => {
    try {
      const project = await projectsService.createProject(req.body)
      res.status(201).json(project)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to create project' })
    }
  })

  app.get('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params
    if (!/^\d+$/.test(projectId)) {
      return res.status(404).json({ error: 'Project not found' })
    }

    try {
      const detail = await projectsService.getProjectDetail(projectId)
      if (!detail) {
        return res.status(404).json({ error: 'Project not found' })
      }
      res.json(detail)
    } catch {
      res.status(500).json({ error: 'Failed to fetch project details' })
    }
  })

  app.put('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params
    try {
      const project = await projectsService.updateProjectById(projectId, req.body)
      res.json(project)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      res.status(500).json({ error: 'Failed to update project' })
    }
  })

  // Permanently removes a project and everything that belongs to it. The client and employees are kept.
  app.delete('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params
    if (!/^\d+$/.test(projectId)) {
      return res.status(404).json({ error: 'Project not found' })
    }

    try {
      await projectsService.deleteProjectById(projectId)
      res.json({ ok: true })
    } catch (err) {
      sendTimeError(res, err, 'Failed to delete project')
    }
  })
}
