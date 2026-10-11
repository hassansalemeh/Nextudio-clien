export type Client = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
}

export type Project = {
  id: string
  name: string
}

export type LetterListItem = {
  id: string
  letter_number: string
  letter_date: string
  recipient_name: string
  subject: string
  issued_by_admin: string
}

export type LetterDetail = {
  id: string
  letter_number: string
  letter_date: string
  client_id: string | null
  project_id: string | null
  recipient_name: string
  subject: string
  body: string
  issued_by_admin: string
  document_language: string
}
