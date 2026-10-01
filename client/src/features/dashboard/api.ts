import { apiGet } from '../../shared/api/client'

export function fetchDashboard(dayFrom: string, dayTo: string) {
  return apiGet(`/api/dashboard?day_from=${encodeURIComponent(dayFrom)}&day_to=${encodeURIComponent(dayTo)}`)
}
