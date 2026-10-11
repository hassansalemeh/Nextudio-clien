import { apiGet } from '../../shared/api/client'

export function fetchDocumentPdf(collection: 'estimates' | 'invoices' | 'receipts' | 'letters', id: string) {
  return apiGet(`/api/${collection}/${id}/pdf`)
}
