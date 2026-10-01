import FormattedTextField from '../../../shared/components/FormattedTextField'
import { CURRENCIES, TERMS_SECTIONS, UNITS } from '../constants'
import type { ItemForm } from '../types'

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

type Props = {
  introduction: string
  onIntroductionChange: (value: string) => void
  items: ItemForm[]
  isLumpSum: boolean
  currency: string
  updateItem: (key: number, field: keyof ItemForm, value: string) => void
  moveItem: (index: number, direction: -1 | 1) => void
  deleteItem: (key: number) => void
  addItem: () => void
  lineAmount: (item: ItemForm) => number
  subtotal: number
  lumpSumFee: string
  onLumpSumFeeChange: (value: string) => void
  discountType: string
  onDiscountTypeChange: (value: string) => void
  discountValue: string
  onDiscountValueChange: (value: string) => void
  discount: number
  onCurrencyChange: (value: string) => void
  total: number
  termValues: Record<'payment_terms' | 'timeline' | 'notes' | 'exclusions', string>
  onTermChange: (field: 'payment_terms' | 'timeline' | 'notes' | 'exclusions', value: string) => void
}

function EstimateItemsSection({
  introduction,
  onIntroductionChange,
  items,
  isLumpSum,
  currency,
  updateItem,
  moveItem,
  deleteItem,
  addItem,
  lineAmount,
  subtotal,
  lumpSumFee,
  onLumpSumFeeChange,
  discountType,
  onDiscountTypeChange,
  discountValue,
  onDiscountValueChange,
  discount,
  onCurrencyChange,
  total,
  termValues,
  onTermChange,
}: Props) {
  return (
    <>
      <FormattedTextField
        id="est-introduction"
        label="Introduction"
        tall
        reuseField="introduction"
        value={introduction}
        placeholder={
          'e.g. Nextudio Architects is pleased to submit this proposal for the architectural design and consultancy ' +
          'services for the above-mentioned project...'
        }
        onChange={onIntroductionChange}
      />
      <div className="doc-hint" style={{ marginTop: '-0.75rem', marginBottom: '1rem' }}>
        A proper opening paragraph for the quotation — separate from Summary, Notes/Terms. Shown before Services, in the
        Preview/PDF.
      </div>

      <table className={`doc-items${isLumpSum ? ' doc-items-lump' : ''}`}>
        <thead>
          <tr>
            <th>Services</th>
            {!isLumpSum && (
              <>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </>
            )}
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.key}>
              <td className="doc-item-main">
                <input
                  className="doc-item-name"
                  placeholder="Service (e.g. CD - Concept Design)"
                  value={item.name}
                  onChange={(e) => updateItem(item.key, 'name', e.target.value)}
                />
                <textarea
                  className="doc-item-desc"
                  placeholder="Description (scope, deliverables...). Line breaks are kept."
                  value={item.description}
                  onChange={(e) => updateItem(item.key, 'description', e.target.value)}
                />
              </td>
              {!isLumpSum && (
                <>
                  <td>
                    <input
                      className="doc-item-num"
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Quantity"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, 'quantity', e.target.value)}
                    />
                  </td>
                  <td>
                    <select aria-label="Unit" value={item.unit} onChange={(e) => updateItem(item.key, 'unit', e.target.value)}>
                      {UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="doc-item-num"
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Unit price"
                      value={item.unit_price}
                      onChange={(e) => updateItem(item.key, 'unit_price', e.target.value)}
                    />
                  </td>
                  <td className="doc-amount">{formatMoney(lineAmount(item), currency)}</td>
                </>
              )}
              <td className="doc-item-actions">
                <button type="button" className="doc-icon" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="doc-icon"
                  title="Move down"
                  aria-label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="doc-icon doc-icon-delete"
                  title="Delete item"
                  aria-label="Delete item"
                  onClick={() => deleteItem(item.key)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={isLumpSum ? 2 : 6}>
              <button type="button" className="doc-link" onClick={addItem}>
                ⊕ Add item
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="doc-totals">
        <div>{isLumpSum ? 'Lump Sum Fee' : 'Subtotal'}</div>
        {isLumpSum ? (
          <input
            className="doc-lump-sum-input"
            type="number"
            min="0"
            step="any"
            aria-label="Lump sum fee"
            value={lumpSumFee}
            onChange={(e) => onLumpSumFeeChange(e.target.value)}
          />
        ) : (
          <div>{formatMoney(subtotal, currency)}</div>
        )}
        <div className="doc-discount-row">
          <span>Discount</span>
          <select aria-label="Discount type" value={discountType} onChange={(e) => onDiscountTypeChange(e.target.value)}>
            <option value="fixed">Fixed amount</option>
            <option value="percent">Percentage %</option>
          </select>
          <input
            type="number"
            min="0"
            step="any"
            aria-label="Discount value"
            value={discountValue}
            onChange={(e) => onDiscountValueChange(e.target.value)}
          />
        </div>
        <div>{discount > 0 ? `(${formatMoney(discount, currency)})` : formatMoney(0, currency)}</div>
        <div className="doc-total-row">
          <strong>Grand Total</strong>
          <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)} aria-label="Currency">
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <strong>{formatMoney(total, currency)}</strong>
        </div>
      </div>

      <div className="doc-terms">
        {TERMS_SECTIONS.map((section) => (
          <FormattedTextField
            key={section.field}
            id={`est-${section.field}`}
            label={section.label}
            tall={section.tall}
            reuseField={section.field}
            value={termValues[section.field]}
            placeholder={section.placeholder}
            onChange={(value) => onTermChange(section.field, value)}
          />
        ))}
      </div>
    </>
  )
}

export default EstimateItemsSection
