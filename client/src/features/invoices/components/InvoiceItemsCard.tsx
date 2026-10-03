import { UNIT_LABELS } from '../constants'
import type { InvoiceDetail } from '../types'

type Props = {
  invoice: InvoiceDetail
  isClientFunds: boolean
  isLumpSum: boolean
  hasDiscount: boolean
  money: (value: number | string) => string
}

function InvoiceItemsCard({ invoice, isClientFunds, isLumpSum, hasDiscount, money }: Props) {
  return (
    <div className="card">
      <h2>{isClientFunds ? 'Items' : 'Services'}</h2>
      {invoice.introduction && (
        <div className="terms-view" style={{ marginTop: 0, marginBottom: '1rem' }}>
          <div className="terms-text">{invoice.introduction}</div>
        </div>
      )}
      {isLumpSum ? (
        <div className="scope-sections">
          {invoice.items.map((item) => (
            <div key={item.id} className="terms-view" style={{ marginTop: 0 }}>
              <h3 style={{ marginBottom: item.description ? '0.35rem' : 0 }}>{item.name}</h3>
              {item.description && <div className="terms-text">{item.description}</div>}
            </div>
          ))}
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{isClientFunds ? 'Description' : 'Service'}</th>
              <th className="num">Quantity</th>
              <th>Unit</th>
              <th className="num">Unit Price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td data-label={isClientFunds ? 'Description' : 'Service'} className="col-wrap">
                  <strong>{item.name}</strong>
                  {item.description && <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.25rem' }}>{item.description}</div>}
                </td>
                <td data-label="Quantity" className="num">{Number(item.quantity)}</td>
                <td data-label="Unit">{UNIT_LABELS[item.unit] ?? item.unit}</td>
                <td data-label="Unit Price" className="num">{money(item.unit_price)}</td>
                <td data-label="Amount" className="num">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="inv-totals">
        <div>{isLumpSum ? 'Lump Sum Fee' : 'Subtotal'}</div>
        <div>{money(invoice.subtotal)}</div>
        {hasDiscount && (
          <>
            <div>{invoice.discount_type === 'percent' ? `Discount (${Number(invoice.discount_value)}%)` : 'Discount'}</div>
            <div>({money(invoice.discount)})</div>
          </>
        )}
        <div>
          <strong>Invoice Total</strong>
        </div>
        <div>
          <strong>{money(invoice.total)}</strong>
        </div>
        <div>Amount Paid</div>
        <div>{money(invoice.paid)}</div>
        <div>
          <strong>Amount Due</strong>
        </div>
        <div>
          <strong>{money(invoice.amount_due)}</strong>
        </div>
      </div>
      {[
        { title: 'Payment Terms', text: invoice.payment_terms },
        { title: 'Timeline', text: invoice.timeline },
        { title: 'Notes', text: invoice.notes },
        { title: 'Exclusions', text: invoice.exclusions },
      ]
        .filter((section) => section.text && section.text.trim())
        .map((section) => (
          <div key={section.title} className="terms-view">
            <h3>{section.title}</h3>
            <div className="terms-text">{section.text}</div>
          </div>
        ))}
    </div>
  )
}

export default InvoiceItemsCard
