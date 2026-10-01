import type { Express } from 'express'
import { HttpError } from '../../shared'
import { createEmployee, listEmployees, parseCreateEmployeeInput, parseUpdateEmployeeInput, updateEmployee } from './employees.service'

export function registerEmployeeRoutes(app: Express) {
  app.get('/api/employees', async (_req, res) => {
    try {
      res.json(await listEmployees())
    } catch {
      res.status(500).json({ error: 'Failed to fetch employees' })
    }
  })

  app.post('/api/employees', async (req, res) => {
    let input
    try {
      input = parseCreateEmployeeInput(req.body)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      throw err
    }

    try {
      res.status(201).json(await createEmployee(input))
    } catch {
      res.status(500).json({ error: 'Failed to create employee' })
    }
  })

  app.put('/api/employees/:employeeId', async (req, res) => {
    const { employeeId } = req.params
    let input
    try {
      input = parseUpdateEmployeeInput(req.body)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      throw err
    }

    try {
      const employee = await updateEmployee(employeeId, input)
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' })
      }
      res.json(employee)
    } catch {
      res.status(500).json({ error: 'Failed to update employee' })
    }
  })
}
