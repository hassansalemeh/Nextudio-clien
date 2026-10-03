import { useId } from 'react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import EmptyState from './EmptyState'

type Props = {
  professionalReceived: number
  clientFundsReceived: number
  totalReceived: number
  clientFundsInvoiced: number
  clientFundsOutstanding: number
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
})

function ReceiptBreakdownChart({ professionalReceived, clientFundsReceived, totalReceived, clientFundsInvoiced, clientFundsOutstanding }: Props) {
  const titleId = useId()
  const receipts = [
    { name: 'Professional fees', value: professionalReceived, color: 'var(--color-accent)' },
    { name: 'Client expense funds', value: clientFundsReceived, color: 'var(--color-chart-secondary)' },
  ]
  const hasReceipts = totalReceived > 0 && receipts.every((receipt) => receipt.value >= 0)

  return (
    <figure className="card chart-panel" aria-labelledby={titleId}>
      <figcaption>
        <h2 id={titleId}>What is the money received for?</h2>
        <p className="chart-note">Professional fees and money received for client expenses. Amounts in USD.</p>
      </figcaption>
      {hasReceipts ? (
        <div className="receipts-donut">
          <PieChart responsive style={{ width: '100%', height: 184 }} accessibilityLayer>
            <Pie data={receipts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={80} stroke="var(--color-surface)" strokeWidth={3} isAnimationActive={false}>
              {receipts.map((receipt) => <Cell key={receipt.name} fill={receipt.color} />)}
            </Pie>
            <Tooltip formatter={(value) => money.format(Number(value))} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }} />
          </PieChart>
          <div className="donut-total" aria-hidden="true">
            <strong>{compactMoney.format(totalReceived)}</strong>
            <span>Total received</span>
          </div>
        </div>
      ) : <EmptyState message="No money received yet. Recorded payments will appear here." />}
      <dl className="receipt-breakdown">
        {receipts.map((receipt, index) => (
          <div key={receipt.name}>
            <dt><i className={`chart-key${index === 1 ? ' chart-key-secondary' : ''}`} />{receipt.name}</dt>
            <dd>{money.format(receipt.value)}</dd>
          </div>
        ))}
        <div className="receipt-total"><dt>Total Client Receipts</dt><dd>{money.format(totalReceived)}</dd></div>
      </dl>
      <details className="chart-values">
        <summary>Client expense fund details</summary>
        <p className="chart-note">Held for suppliers, workers, and materials; separate from professional fee revenue.</p>
        <dl className="receipt-breakdown">
          <div><dt>Client Funds Invoiced</dt><dd>{money.format(clientFundsInvoiced)}</dd></div>
          <div><dt>Client Funds Outstanding</dt><dd>{money.format(clientFundsOutstanding)}</dd></div>
        </dl>
      </details>
    </figure>
  )
}

export default ReceiptBreakdownChart
