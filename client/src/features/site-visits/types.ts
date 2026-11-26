export type SiteVisit = {
  id: string
  employee_id: string
  employee_name: string
  project_id: string
  project_name: string
  visit_date: string
  start_time: string
  end_time: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type SiteVisitSummaryProjectCount = { project_id: string; project_name: string; count: number }
export type SiteVisitSummaryEmployeeCount = { employee_id: string; employee_name: string; count: number }

export type SiteVisitSummaryEmployee = {
  employee_id: string
  employee_name: string
  total_visits: number
  projects: SiteVisitSummaryProjectCount[]
}

export type SiteVisitSummaryProject = {
  project_id: string
  project_name: string
  total_visits: number
  visitors: SiteVisitSummaryEmployeeCount[]
}

export type SiteVisitSummary = {
  by_employee: SiteVisitSummaryEmployee[]
  by_project: SiteVisitSummaryProject[]
}

export type CreateSiteVisitInput = {
  employee_id: string | null
  project_id: string
  visit_date: string
  start_time: string
  end_time: string | null
  note: string | null
}

export type UpdateSiteVisitInput = {
  project_id: string
  visit_date: string
  start_time: string
  end_time: string | null
  note: string | null
}
