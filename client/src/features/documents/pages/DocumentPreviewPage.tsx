import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageLoader from '../../../shared/components/PageLoader'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { fetchDocumentPdf } from '../api'

// Shows the real generated PDF (the same file the admin downloads) for a quotation or an invoice
function DocumentPreviewPage({ kind }: { kind: 'estimate' | 'invoice' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [filename, setFilename] = useState(`${kind}-${id}.pdf`)
  const [error, setError] = useState('')

  const collection = kind === 'estimate' ? 'estimates' : 'invoices'

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
        <h1>{kind === 'estimate' ? 'Quotation preview' : 'Invoice preview'}</h1>
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
