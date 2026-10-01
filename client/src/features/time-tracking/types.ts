import type { TimeSession } from '../../shared/lib/timeUtils'

export type Employee = {
  id: string
  full_name: string
}

export type Editing = {
  kind: 'entries' | 'sessions'
  id: string
  start: string
  end: string
}

export type TodayAssignment = {
  id: string
  project_id: string
  project_name: string
  description: string
  start_date: string
  end_date: string
}

export type ActiveProject = {
  id: string
  name: string
}

export type Status = {
  session: TimeSession | null
  active_entry: { id: string; project_id: string; project_name: string; started_at: string } | null
}
