// The daily work-submission reminder's email body. Kept separate from documents/documents.layout.ts (the
// PDF document styling) since that module renders multi-page print documents, not an email - but it
// deliberately mirrors its look: the same font stack and muted grays, and the app's own accent color for
// the button.
const ACCENT_COLOR = '#315f57' // client/src/index.css --color-accent

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function reminderEmailHtml(name: string, workUrl: string, logoUrl: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5f2;font-family:'Segoe UI',Arial,sans-serif;color:#252d2a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #deded7;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0;">
                <img src="${escapeHtml(logoUrl)}" alt="Nextudio architects" width="160" style="display:block;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px;font-size:15px;line-height:1.6;">
                Hi ${escapeHtml(name)},<br /><br />
                Please submit your work for today.
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;">
                <a href="${escapeHtml(workUrl)}" style="display:inline-block;background:${ACCENT_COLOR};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:6px;">Submit my work</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;border-top:1px solid #deded7;font-size:14px;color:#626b66;">
                Thank you,<br />Nextudio
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function reminderEmailText(name: string, workUrl: string): string {
  return `Hi ${name},\n\nPlease submit your work for today.\n\nSubmit my work: ${workUrl}\n\nThank you,\nNextudio`
}
