import { apiGet } from '../../shared/api/client'

export function fetchDocumentPdf(collection: 'estimates' | 'invoices' | 'receipts', id: string) {
  return apiGet(`/api/${collection}/${id}/pdf`)
}
