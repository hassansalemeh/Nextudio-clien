import { useState } from 'react'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { updateSigner, updateSignerImage } from '../document-signers-api'
import type { DocumentSigner } from '../document-signers-api'
import ImageUploadSlot from './ImageUploadSlot'

type Props = {
  signer: DocumentSigner
  onSaved: (signers: DocumentSigner[]) => void
}

// One signer: their name (renameable), active/inactive toggle, and their signature image. A signer can
// be deactivated (then no longer offered on new receipts) and reactivated, but never deleted - a receipt
// may already reference them.
function SignerRow({ signer, onSaved }: Props) {
  const toast = useToast()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(signer.display_name)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveName() {
    if (!name.trim()) return setError("Enter the signer's name.")
    setSaving(true)
    setError('')
    try {
      onSaved(await updateSigner(signer.id, { display_name: name.trim(), is_active: signer.is_active }))
      setEditingName(false)
    } catch (err) {
      const message = getErrorMessage(err, 'Could not rename the signer.')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    try {
      onSaved(await updateSigner(signer.id, { display_name: signer.display_name, is_active: !signer.is_active }))
      toast.success(signer.is_active ? 'Signer deactivated.' : 'Signer reactivated.')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the signer.'))
    }
  }

  return (
    <div className="card">
      <div className="signer-row-header">
        {editingName ? (
          <>
            <input value={name} disabled={saving} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="btn-sm btn-solid" disabled={saving} onClick={saveName}>
              Save
            </button>
            <button
              type="button"
              className="btn-sm btn-ghost"
              disabled={saving}
              onClick={() => {
                setEditingName(false)
                setName(signer.display_name)
                setError('')
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2>{signer.display_name}</h2>
            <span className={`status-badge ${signer.is_active ? 'status-approved' : 'status-draft'}`}>
              {signer.is_active ? 'Active' : 'Inactive'}
            </span>
            <button type="button" className="btn-sm btn-ghost" onClick={() => setEditingName(true)}>
              Rename
            </button>
            <button type="button" className="btn-sm btn-ghost" onClick={toggleActive}>
              {signer.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
          </>
        )}
      </div>
      {error && <p className="error-message">{error}</p>}
      <ImageUploadSlot
        label={`${signer.display_name}'s signature`}
        dataUri={signer.data_uri}
        onUpload={async (input) => onSaved(await updateSignerImage(signer.id, input))}
      />
    </div>
  )
}

export default SignerRow
