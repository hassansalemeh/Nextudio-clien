import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { useNavigate, useParams } from 'react-router-dom'
import PageLoader from '../../../shared/components/PageLoader'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { fetchDocumentPdf } from '../api'

const COLLECTIONS = { estimate: 'estimates', invoice: 'invoices', receipt: 'receipts', letter: 'letters' } as const

const TITLES = { estimate: 'Quotation preview', invoice: 'Invoice preview', receipt: 'Receipt preview', letter: 'Letter preview' } as const

const DESCRIPTIONS = {
  estimate: 'Check how this estimate will look when shared or downloaded.',
  invoice: 'Check how this invoice will look when shared or downloaded.',
  receipt: 'Check how this receipt will look when shared or downloaded.',
  letter: 'Check how this letter will look when shared or downloaded.',
} as const

// Shows the real generated PDF (the same file the admin downloads) for a quotation, invoice, receipt, or letter
function DocumentPreviewPage({ kind }: { kind: 'estimate' | 'invoice' | 'receipt' | 'letter' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [filename, setFilename] = useState(`${kind}-${id}.pdf`)
  const [error, setError] = useState('')

  const collection = COLLECTIONS[kind]

  useEffect(() => {
    let objectUrl = ''
    setUrl('')
    setError('')
    fetchDocumentPdf(collection, id!)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error || 'Could not generate the PDF.')
        }
        const disposition = response.headers.get('Content-Disposition') ?? ''
        const match = /filename="([^"]+)"/.exec(disposition)
        if (match) setFilename(match[1])
        return response.blob()
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => setError(getErrorMessage(err, 'Could not generate the PDF.')))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [collection, id])

  return (
    <>
      <div className="doc-topbar">
        <PageHeader title={TITLES[kind]} description={DESCRIPTIONS[kind]} />
        <div className="doc-actions">
          <button type="button" className="btn-outline" onClick={() => navigate(`/${collection}/${id}`)}>
            Back
          </button>
          <button type="button" className="btn-outline" onClick={() => navigate(`/${collection}/${id}?send=1`)}>
            Send by Email
          </button>
          {url && (
            <a className="btn-pill doc-download" href={url} download={filename}>
              Download PDF
            </a>
          )}
        </div>
      </div>
      {error && <p className="error-message">{error}</p>}
      {!url && !error && <PageLoader label="Generating the PDF..." />}
      {url && <iframe className="doc-preview-frame" src={url} title="Document preview" />}
    </>
  )
}

export default DocumentPreviewPage
