import { COMPANY } from '../../../shared/lib/companyProfile'

type Props = {
  headerOpen: boolean
  setHeaderOpen: (value: boolean) => void
  title: string
  onTitleChange: (value: string) => void
  summary: string
  onSummaryChange: (value: string) => void
}

function EstimateHeaderPanel({ headerOpen, setHeaderOpen, title, onTitleChange, summary, onSummaryChange }: Props) {
  return (
    <div className="doc-panel">
      <button type="button" className="doc-panel-header" onClick={() => setHeaderOpen(!headerOpen)}>
        <span>Business address and contact details, title, summary, and logo</span>
        <span className={`doc-chevron${headerOpen ? ' open' : ''}`}>⌃</span>
      </button>
      {headerOpen && (
        <div className="doc-panel-body">
          <img className="doc-logo-img" src="/nextudio-logo.webp" alt="Nextudio architects" />
          <div>
            <input className="doc-title-input" value={title} placeholder="Quotation" onChange={(e) => onTitleChange(e.target.value)} />
            <input
              className="doc-summary-input"
              value={summary}
              placeholder="Summary (e.g. project name, description of estimate)"
              onChange={(e) => onSummaryChange(e.target.value)}
            />
            <div className="doc-address">
              <strong>{COMPANY.name}</strong>
              {COMPANY.addressLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
              <div>Phone: {COMPANY.phone}</div>
              <div>Mobile: {COMPANY.mobile}</div>
              <div>{COMPANY.website}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EstimateHeaderPanel
