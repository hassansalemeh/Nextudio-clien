export type DayOffStatus = 'pending' | 'approved' | 'rejected'

export type DayOffRequest = {
  id: string
  employee_id: string
  employee_name: string
  request_date: string
  reason: string | null
  status: DayOffStatus
  reviewed_at: string | null
  created_at: string
}

export type WhatsAppLink = {
  admin: string
  url: string
}

export type CreatedDayOffRequest = DayOffRequest & { whatsappLinks: WhatsAppLink[] }
