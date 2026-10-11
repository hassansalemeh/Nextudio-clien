import styles from '../Letters.module.css'

type Props = {
  adminName: string
}

// A preview of the PDF's single hand-signature block (the issuing admin only - a letter has no second
// party to sign). No digital signature yet - just a name and a line to sign by hand.
function LetterSignaturePreview({ adminName }: Props) {
  return (
    <div className={styles.signaturePreview}>
      <div className={styles.signatureParty}>Issued By</div>
      <div className={styles.signatureName}>{adminName || '—'}</div>
      <div className={styles.signatureLine}>Signature</div>
    </div>
  )
}

export default LetterSignaturePreview
