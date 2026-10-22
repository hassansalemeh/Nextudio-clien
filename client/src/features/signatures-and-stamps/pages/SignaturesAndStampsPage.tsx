import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import Spinner from '../../../shared/components/Spinner'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { createSigner, fetchSigners } from '../document-signers-api'
import type { DocumentSigner } from '../document-signers-api'
import { fetchStamps, updateStamp } from '../organization-stamps-api'
import type { OrganizationStamp } from '../organization-stamps-api'
import ImageUploadSlot from '../components/ImageUploadSlot'
import SignerRow from '../components/SignerRow'

function SignaturesAndStampsPage() {
  const toast = useToast()
  const [signers, setSigners] = useState<DocumentSigner[]>([])
  const [stamps, setStamps] = useState<OrganizationStamp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [addingSigner, setAddingSigner] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    Promise.all([fetchSigners(), fetchStamps()])
      .then(([signerRows, stampRows]) => {
        setSigners(signerRows)
        setStamps(stampRows)
      })
      .catch((err) => setError(getErrorMessage(err, 'Could not load signatures and stamps.')))
      .finally(() => setLoading(false))
  }, [])

  async function handleAddSigner(event: React.FormEvent) {
    event.preventDefault()
    if (!newName.trim()) return setAddError("Enter the signer's name.")

    setAddingSigner(true)
    setAddError('')
    try {
      setSigners(await createSigner(newName.trim()))
      setNewName('')
      toast.success('Signer added.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not add the signer.')
      setAddError(message)
      toast.error(message)
    } finally {
      setAddingSigner(false)
    }
  }

  if (loading) return <PageLoader label="Loading signatures and stamps..." />

  const paidStamp = stamps.find((stamp) => stamp.kind === 'paid_stamp')
  const companyStamp = stamps.find((stamp) => stamp.kind === 'company_stamp')

  return (
    <>
      <PageHeader title="Signatures & Stamps" description="Manage this company's signers and the PAID / company stamps used on receipt PDFs." />
      {error && <p className="error-message">{error}</p>}

      <div className="card">
        <h2>Add a signer</h2>
        <form onSubmit={handleAddSigner} className="form-grid">
          <label className="form-field">
            Name
            <input value={newName} disabled={addingSigner} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jane Doe" />
          </label>
          <button type="submit" className="btn-primary" disabled={addingSigner}>
            {addingSigner && <Spinner />} Add signer
          </button>
        </form>
        {addError && <p className="error-message">{addError}</p>}
      </div>

      {signers.map((signer) => (
        <SignerRow key={signer.id} signer={signer} onSaved={setSigners} />
      ))}

      <div className="card">
        <h2>PAID stamp</h2>
        <p className="empty-state" style={{ marginTop: 0 }}>Shown near the amount on a receipt's PDF, when that receipt opts in.</p>
        <ImageUploadSlot
          label="PAID stamp"
          dataUri={paidStamp?.data_uri ?? null}
          onUpload={async (input) => setStamps(await updateStamp('paid_stamp', input))}
        />
      </div>

      <div className="card">
        <h2>Company stamp</h2>
        <p className="empty-state" style={{ marginTop: 0 }}>Stamped over the "Issued By" signature on a receipt's PDF, when that receipt opts in.</p>
        <ImageUploadSlot
          label="Company stamp"
          dataUri={companyStamp?.data_uri ?? null}
          onUpload={async (input) => setStamps(await updateStamp('company_stamp', input))}
        />
      </div>
    </>
  )
}

export default SignaturesAndStampsPage
