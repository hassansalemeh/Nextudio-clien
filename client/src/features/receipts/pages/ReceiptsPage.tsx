import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { OpenIcon, PlusIcon } from '../../../shared/components/icons'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { useNavigate } from 'react-router-dom'
import { fetchReceipts } from '../api'
import type { ReceiptListItem } from '../types'

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

function ReceiptsPage() {
  const navigate = useNavigate()
  const [receipts, setReceipts] = useState<ReceiptListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchReceipts()
      .then(setReceipts)
      .catch((err) => setError(getErrorMessage(err, 'Could not load receipts.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="doc-topbar">
        <PageHeader title="Receipts" description="Proof of payments received, ready to print or send." />
        <button type="button" className="btn-pill" onClick={() => navigate('/receipts/new')}>
          <PlusIcon /> New Receipt
        </button>
      </div>

      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <PageLoader label="Loading receipts..." />
        ) : receipts.length === 0 ? (
          <EmptyState message="No receipts yet." actionLabel="New Receipt" onAction={() => navigate('/receipts/new')} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt Number</th>
                <th>Receiver</th>
                <th>Date</th>
                <th className="num">Amount</th>
                <th>Issued By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr
                  key={receipt.id}
                  className={'clickable-row' + (receipt.cancelled_at ? ' row-cancelled' : '')}
                  onClick={() => navigate(`/receipts/${receipt.id}`)}
                >
                  <td data-label="Receipt">
                    {receipt.receipt_number}
                    {receipt.cancelled_at && <span className="status-badge status-rejected" title={receipt.cancel_reason ?? ''}>Cancelled</span>}
                  </td>
                  <td data-label="Receiver">{receipt.receiver_name}</td>
                  <td data-label="Date">{receipt.receipt_date}</td>
                  <td data-label="Amount" className="num">{formatMoney(receipt.amount, receipt.currency)}</td>
                  <td data-label="Issued By">{receipt.issued_by_admin}</td>
                  <td data-label="Actions">
                    <button type="button" className="btn-sm btn-ghost" onClick={(event) => { event.stopPropagation(); navigate(`/receipts/${receipt.id}`) }}>
                      Open <OpenIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default ReceiptsPage
