export type SiteVisit = {
  id: string
  member_id: string
  visitor_name: string
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
export type SiteVisitSummaryMemberCount = { member_id: string; visitor_name: string; count: number }

export type SiteVisitSummaryMember = {
  member_id: string
  visitor_name: string
  total_visits: number
  projects: SiteVisitSummaryProjectCount[]
}

export type SiteVisitSummaryProject = {
  project_id: string
  project_name: string
  total_visits: number
  visitors: SiteVisitSummaryMemberCount[]
}

export type SiteVisitSummary = {
  by_member: SiteVisitSummaryMember[]
  by_project: SiteVisitSummaryProject[]
}

// A member who can validly be picked as a visitor (GET /api/site-visits/visitors) - a site worker or a
// deactivated employee is never offered here, since logging a visit for one would only fail validation.
export type SiteVisitor = {
  id: string
  name: string
  role: 'owner' | 'admin' | 'employee'
}

export type CreateSiteVisitInput = {
  member_id: string | null
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
