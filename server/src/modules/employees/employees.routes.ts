import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role } from '../../shared'
import { createEmployee, listEmployees, updateEmployee } from './employees.service'
import { createEmployeeBody, employeeIdParams, updateEmployeeBody } from './employees.schemas'
import { validate } from '../../middleware/validate'

export function registerEmployeeRoutes(app: Express) {
  app.get('/api/employees', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await listEmployees(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch employees' })
    }
  })

  app.post('/api/employees', allow(Role.Admin), validate({ body: createEmployeeBody }), async (req, res) => {
    try {
      res.status(201).json(await createEmployee(organizationIdOf(req), req.body))
    } catch {
      res.status(500).json({ error: 'Failed to create employee' })
    }
  })

  app.put(
    '/api/employees/:employeeId',
    allow(Role.Admin),
    validate({ params: employeeIdParams, body: updateEmployeeBody }),
    async (req, res) => {
      try {
        const employee = await updateEmployee(organizationIdOf(req), req.params.employeeId, req.body)
        if (!employee) {
          return res.status(404).json({ error: 'Employee not found' })
        }
        res.json(employee)
      } catch {
        res.status(500).json({ error: 'Failed to update employee' })
      }
    }
  )
}
