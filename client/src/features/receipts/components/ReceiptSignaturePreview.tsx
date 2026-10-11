import styles from '../Receipts.module.css'

type Props = {
  adminName: string
  receiverName: string
}

// A preview of the PDF's two hand-signature blocks. No digital signature yet - just a name and a line
// to sign by hand - structured so a stored signature image can be dropped in above the line later.
function ReceiptSignaturePreview({ adminName, receiverName }: Props) {
  return (
    <div className={styles.signaturePreview}>
      <div className={styles.signatureBlock}>
        <div className={styles.signatureParty}>Issued By</div>
        <div className={styles.signatureName}>{adminName || '—'}</div>
        <div className={styles.signatureLine}>Signature</div>
      </div>
      <div className={styles.signatureBlock}>
        <div className={styles.signatureParty}>Received By</div>
        <div className={styles.signatureName}>{receiverName || '—'}</div>
        <div className={styles.signatureLine}>Signature</div>
      </div>
    </div>
  )
}

export default ReceiptSignaturePreview
