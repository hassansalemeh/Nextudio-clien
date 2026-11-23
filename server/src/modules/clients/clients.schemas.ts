import { z } from 'zod'
import { email, idString, optionalEmail, optionalText, text } from '../../shared'

export const clientIdParams = z.object({ clientId: idString('Client id') })

export const clientBody = z.object({
  name: text('Client name'),
  contact_name: optionalText('Contact name'),
  email: optionalEmail('Client email'),
  phone: optionalText('Phone', { max: 50 }),
  address: optionalText('Address', { max: 500 }),
})
