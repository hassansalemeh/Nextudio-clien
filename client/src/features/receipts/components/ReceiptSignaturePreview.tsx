import styles from '../Receipts.module.css'

type Props = {
  adminName: string
  receivedByAdmin: string
}

// A preview of the PDF's two hand-signature blocks: the admin who issued the receipt, and the admin who
// received the money - never the client's name (shown separately, under "Received From").
function ReceiptSignaturePreview({ adminName, receivedByAdmin }: Props) {
  return (
    <div className={styles.signaturePreview}>
      <div className={styles.signatureBlock}>
        <div className={styles.signatureParty}>Issued By</div>
        <div className={styles.signatureName}>{adminName || '—'}</div>
        <div className={styles.signatureLine}>Signature</div>
      </div>
      <div className={styles.signatureBlock}>
        <div className={styles.signatureParty}>Received By</div>
        <div className={styles.signatureName}>{receivedByAdmin || '—'}</div>
        <div className={styles.signatureLine}>Signature</div>
      </div>
    </div>
  )
}

export default ReceiptSignaturePreview
