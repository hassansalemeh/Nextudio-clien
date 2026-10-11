import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useConfirm } from '../../../shared/components/ConfirmDialog'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { localDateString } from '../../../shared/lib/timeUtils'
import { TO_WHOM_IT_MAY_CONCERN } from '../constants'
import { deleteLetter, fetchClientsForLetters, fetchLetter, fetchNextLetterNumber, fetchProjectsForLetters, saveLetter } from '../api'
import type { Client, Project } from '../types'

function emptyForm() {
  return {
    letter_number: '',
    letter_date: localDateString(),
    client_id: '',
    project_id: '',
    recipient_name: '',
    subject: '',
    body: '',
    issued_by_admin: '',
    document_language: 'en',
  }
}

// Everything the letter editor page needs: form state and the handlers the page's sections call.
// Same shape as the receipt editor's hook, minus amount/currency, plus delete (letters aren't a
// financial record the way a receipt is, so there's less reason to block removal).
export function useLetterEditor() {
  const confirm = useConfirm()
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // /letters/new and /letters/:id are the same route, so saving a new letter does not remount the editor
  const isNew = id === 'new'
  const justSavedId = useRef<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)

  const [form, setForm] = useState(emptyForm())
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  // A new letter gets the next free number automatically; the field stays editable
  useEffect(() => {
    if (!isNew) return
    fetchNextLetterNumber()
      .then((data) => setForm((previous) => (previous.letter_number ? previous : { ...previous, letter_number: data.letter_number })))
      .catch(() => undefined)
  }, [isNew])

  useEffect(() => {
    fetchClientsForLetters()
      .then(setClients)
      .catch(() => setError('Could not load clients.'))
    fetchProjectsForLetters()
      .then(setProjects)
      .catch(() => setError('Could not load projects.'))
  }, [])

  // Puts a saved letter (as returned by the server) into the editor
  function applyLetter(letter: any) {
    setForm({
      letter_number: letter.letter_number,
      letter_date: letter.letter_date,
      client_id: letter.client_id ?? '',
      project_id: letter.project_id ?? '',
      recipient_name: letter.recipient_name,
      subject: letter.subject,
      body: letter.body,
      issued_by_admin: letter.issued_by_admin,
      document_language: letter.document_language ?? 'en',
    })
  }

  useEffect(() => {
    if (isNew) return
    if (justSavedId.current === id) {
      // this letter was just saved from this editor, so its data is already on screen
      justSavedId.current = null
      return
    }
    setLoading(true)
    fetchLetter(id!)
      .then(applyLetter)
      .catch((err) => setError(getErrorMessage(err, 'Could not load letter.')))
      .finally(() => setLoading(false))
  }, [id, isNew])

  // The Preview page's "Send by Email" button links here with ?send=1 so the dialog opens automatically
  useEffect(() => {
    if (isNew || loading) return
    if (searchParams.get('send') === '1') {
      setEmailOpen(true)
      searchParams.delete('send')
      setSearchParams(searchParams, { replace: true })
    }
  }, [isNew, loading, searchParams, setSearchParams])

  const update = (field: keyof ReturnType<typeof emptyForm>, value: string) => {
    setSaved(false)
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function useToWhomItMayConcern() {
    update('recipient_name', TO_WHOM_IT_MAY_CONCERN)
  }

  const client = clients.find((c) => c.id === form.client_id)

  // Picking a client only prefills the recipient's name if it's still empty - it never overwrites
  // something the admin already typed by hand.
  function chooseClient(clientId: string) {
    const chosen = clients.find((c) => c.id === clientId)
    setSaved(false)
    setForm((previous) => ({
      ...previous,
      client_id: clientId,
      recipient_name: previous.recipient_name || chosen?.contact_name || chosen?.name || '',
    }))
    setPickingCustomer(false)
  }

  // Saves the letter; returns the saved letter, or null when something is wrong (the error is shown)
  async function save(): Promise<any | null> {
    setError('')
    setSaved(false)

    if (!form.letter_date) return setError('Letter date is required.'), null
    if (!form.recipient_name.trim()) return setError('Enter the recipient.'), null
    if (!form.subject.trim()) return setError('Enter a subject.'), null
    if (!form.body.trim()) return setError('Enter the body.'), null
    if (!form.issued_by_admin) return setError('Choose the issuing admin.'), null

    try {
      const letter = await saveLetter(id, isNew, {
        ...form,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
      })
      applyLetter(letter)
      setSaved(true)
      if (isNew) {
        justSavedId.current = String(letter.id)
        navigate(`/letters/${letter.id}`, { replace: true })
      }
      return letter
    } catch (err) {
      const message = getErrorMessage(err, 'Could not save letter.')
      setError(message)
      toast.error(message)
      return null
    }
  }

  async function handleSave() {
    setBusy(true)
    const letter = await save()
    setBusy(false)
    if (letter) toast.success('Letter saved.')
  }

  async function handlePreview() {
    setBusy(true)
    const letter = await save()
    setBusy(false)
    if (letter) navigate(`/letters/${letter.id}/preview`)
  }

  // Permanently removes the letter.
  async function handleDelete() {
    setError('')
    const ok = await confirm({
      title: `Delete letter ${form.letter_number}?`,
      message: `This will permanently delete letter ${form.letter_number}${client ? ` for ${client.name}` : ''}. This cannot be undone.`,
      confirmLabel: 'Delete letter',
      tone: 'danger',
      onConfirm: async () => {
        await deleteLetter(id!)
      },
    })
    if (!ok) return
    toast.success('Letter deleted.')
    navigate('/letters')
  }

  return {
    id,
    isNew,
    emailOpen,
    setEmailOpen,
    form,
    clients,
    projects,
    loading,
    pickingCustomer,
    setPickingCustomer,
    error,
    saved,
    busy,
    update,
    useToWhomItMayConcern,
    client,
    chooseClient,
    handleSave,
    handlePreview,
    handleDelete,
    applyLetter,
  }
}
