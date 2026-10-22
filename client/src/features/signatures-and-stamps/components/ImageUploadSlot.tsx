import { useState } from 'react'
import Spinner from '../../../shared/components/Spinner'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { resizeImageForUpload } from '../resizeImage'

// A backstop against an unresized payload (resizeImageForUpload already keeps it far smaller in the
// normal case) - matches the server's own limit.
const MAX_BYTES = 2 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg']

type Props = {
  label: string
  dataUri: string | null
  onUpload: (input: { mime_type: string; image_base64: string }) => Promise<void>
}

// One upload slot - a signer's signature, the PAID stamp, or the company stamp. Shows the current image
// (if any) and lets the admin replace it with a new PNG/JPG, resized in the browser before it's sent.
function ImageUploadSlot({ label, dataUri, onUpload }: Props) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only PNG or JPG images are allowed.')
      return
    }

    setBusy(true)
    try {
      const { mimeType, base64 } = await resizeImageForUpload(file)
      if (base64.length * 0.75 > MAX_BYTES) {
        setError('The image is too large even after resizing.')
        return
      }
      await onUpload({ mime_type: mimeType, image_base64: base64 })
      toast.success(`${label} updated.`)
    } catch (err) {
      const message = getErrorMessage(err, 'Could not save the image.')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="signature-slot-preview">
        {dataUri ? <img src={dataUri} alt={label} /> : <p className="empty-state">Not uploaded yet.</p>}
      </div>
      <label className={'btn-outline signature-upload-label' + (busy ? ' is-busy' : '')}>
        {busy && <Spinner />} {dataUri ? 'Replace' : 'Upload'}
        <input type="file" accept="image/png,image/jpeg" hidden disabled={busy} onChange={handleFile} />
      </label>
      {error && <p className="error-message">{error}</p>}
    </div>
  )
}

export default ImageUploadSlot
