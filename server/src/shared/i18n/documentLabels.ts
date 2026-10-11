// Fixed labels for the generated Quotation / Invoice PDF, in every supported Document Language.
// This never translates anything the admin writes (Introduction, service names/descriptions, Notes,
// Terms, Exclusions, Contract/Acceptance Terms) - only the surrounding layout labels.
export const DOCUMENT_LANGUAGES = ['en', 'fr', 'ar'] as const
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number]

export const DIRECTION: Record<DocumentLanguage, 'ltr' | 'rtl'> = { en: 'ltr', fr: 'ltr', ar: 'rtl' }

export type DocumentLabels = {
  quotation: string
  invoice: string
  receipt: string
  receiptSubtitle: string
  letter: string
  to: string
  letterNumber: string
  letterDate: string
  clientFunds: string
  clientFundsSubtitle: string
  billTo: string
  receivedFrom: string
  estimateNumber: string
  invoiceNumber: string
  receiptNumber: string
  estimateDate: string
  invoiceDate: string
  receiptDate: string
  reasonForPayment: string
  amountReceived: string
  issuedBy: string
  receivedBy: string
  validUntil: string
  paymentDue: string
  projectLocation: string
  services: string
  quantity: string
  unit: string
  unitPrice: string
  amount: string
  subtotal: string
  lumpSumFee: string
  discount: string
  grandTotal: string
  total: string
  amountDue: string
  amountPaid: string
  paymentOn: string
  using: string
  paymentTerms: string
  timeline: string
  notes: string
  exclusions: string
  introduction: string
  phone: string
  mobile: string
  footerPage: string
  footerOf: string
  footerFor: string
  thankYou: string
  fundsReceived: string
  fundsSpent: string
  fundsRemaining: string
  acceptanceSignatures: string
  acceptanceParagraph: string
  client: string
  nextudioParty: string
  companyName: string
  authorizedRepresentative: string
  titlePosition: string
  signature: string
  signatureDate: string
  methods: { cash: string; bank_transfer: string; cheque: string; card: string; other: string }
}

const en: DocumentLabels = {
  quotation: 'Quotation',
  invoice: 'Invoice',
  receipt: 'Receipt',
  receiptSubtitle: 'Proof of payment received',
  letter: 'Letter',
  to: 'To',
  letterNumber: 'Letter Number',
  letterDate: 'Date',
  clientFunds: 'Client Funds / Project Expenses',
  clientFundsSubtitle: 'Funds held for project expenses — not a professional/design fee invoice',
  billTo: 'Bill To',
  receivedFrom: 'Received From',
  estimateNumber: 'Estimate Number',
  invoiceNumber: 'Invoice Number',
  receiptNumber: 'Receipt Number',
  estimateDate: 'Estimate Date',
  invoiceDate: 'Invoice Date',
  receiptDate: 'Receipt Date',
  reasonForPayment: 'Reason for Payment',
  amountReceived: 'Amount Received',
  issuedBy: 'Issued By',
  receivedBy: 'Received By',
  validUntil: 'Valid Until',
  paymentDue: 'Payment Due',
  projectLocation: 'Project Location',
  services: 'Services',
  quantity: 'Quantity',
  unit: 'Unit',
  unitPrice: 'Unit Price',
  amount: 'Amount',
  subtotal: 'Subtotal',
  lumpSumFee: 'Lump Sum Fee',
  discount: 'Discount',
  grandTotal: 'Grand Total',
  total: 'Total',
  amountDue: 'Amount Due',
  amountPaid: 'Amount Paid',
  paymentOn: 'Payment on',
  using: 'using',
  paymentTerms: 'Payment Terms',
  timeline: 'Timeline',
  notes: 'Notes',
  exclusions: 'Exclusions',
  introduction: 'Introduction',
  phone: 'Phone',
  mobile: 'Mobile',
  footerPage: 'Page',
  footerOf: 'of',
  footerFor: 'for',
  thankYou: 'Thank you for your cooperation',
  fundsReceived: 'Funds Received',
  fundsSpent: 'Funds Spent',
  fundsRemaining: 'Funds Remaining',
  acceptanceSignatures: 'Acceptance & Signatures',
  acceptanceParagraph:
    'By signing below, both parties acknowledge and accept the scope of services, professional fees, payment terms and other conditions contained in this document.',
  client: 'Client',
  nextudioParty: 'Nextudio',
  companyName: 'Client / Company Name',
  authorizedRepresentative: 'Authorized Representative',
  titlePosition: 'Title / Position',
  signature: 'Signature',
  signatureDate: 'Date',
  methods: { cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', card: 'Card', other: 'Other' },
}

const fr: DocumentLabels = {
  quotation: 'Devis',
  invoice: 'Facture',
  receipt: 'Reçu',
  receiptSubtitle: 'Preuve de paiement reçu',
  letter: 'Lettre',
  to: 'À',
  letterNumber: 'Numéro de lettre',
  letterDate: 'Date',
  clientFunds: 'Fonds Client / Dépenses de Projet',
  clientFundsSubtitle: "Fonds détenus pour les dépenses du projet — pas une facture d'honoraires professionnels",
  billTo: 'Facturé à',
  receivedFrom: 'Reçu de',
  estimateNumber: 'Numéro de devis',
  invoiceNumber: 'Numéro de facture',
  receiptNumber: 'Numéro de reçu',
  estimateDate: 'Date du devis',
  invoiceDate: 'Date de facture',
  receiptDate: 'Date du reçu',
  reasonForPayment: 'Motif du paiement',
  amountReceived: 'Montant reçu',
  issuedBy: 'Émis par',
  receivedBy: 'Reçu par',
  validUntil: "Valable jusqu'au",
  paymentDue: 'Échéance de paiement',
  projectLocation: 'Emplacement du projet',
  services: 'Services',
  quantity: 'Quantité',
  unit: 'Unité',
  unitPrice: 'Prix unitaire',
  amount: 'Montant',
  subtotal: 'Sous-total',
  lumpSumFee: 'Forfait global',
  discount: 'Remise',
  grandTotal: 'Total général',
  total: 'Total',
  amountDue: 'Montant dû',
  amountPaid: 'Montant payé',
  paymentOn: 'Paiement du',
  using: 'par',
  paymentTerms: 'Conditions de paiement',
  timeline: 'Calendrier',
  notes: 'Remarques',
  exclusions: 'Exclusions',
  introduction: 'Introduction',
  phone: 'Téléphone',
  mobile: 'Mobile',
  footerPage: 'Page',
  footerOf: 'sur',
  footerFor: 'pour',
  thankYou: 'Merci pour votre coopération',
  fundsReceived: 'Fonds reçus',
  fundsSpent: 'Fonds dépensés',
  fundsRemaining: 'Fonds restants',
  acceptanceSignatures: 'Acceptation et Signatures',
  acceptanceParagraph:
    "En signant ci-dessous, les deux parties reconnaissent et acceptent l'étendue des services, les honoraires professionnels, les modalités de paiement et les autres conditions contenues dans le présent document.",
  client: 'Client',
  nextudioParty: 'Nextudio',
  companyName: 'Nom du client / de la société',
  authorizedRepresentative: 'Représentant autorisé',
  titlePosition: 'Titre / Fonction',
  signature: 'Signature',
  signatureDate: 'Date',
  methods: { cash: 'Espèces', bank_transfer: 'Virement bancaire', cheque: 'Chèque', card: 'Carte', other: 'Autre' },
}

const ar: DocumentLabels = {
  quotation: 'عرض سعر',
  invoice: 'فاتورة',
  receipt: 'إيصال',
  receiptSubtitle: 'إثبات استلام الدفعة',
  letter: 'خطاب',
  to: 'إلى',
  letterNumber: 'رقم الخطاب',
  letterDate: 'التاريخ',
  clientFunds: 'أموال العميل / مصاريف المشروع',
  clientFundsSubtitle: 'أموال محتفظ بها لمصاريف المشروع — وليست فاتورة أتعاب مهنية',
  billTo: 'إلى',
  receivedFrom: 'استلم من',
  estimateNumber: 'رقم عرض السعر',
  invoiceNumber: 'رقم الفاتورة',
  receiptNumber: 'رقم الإيصال',
  estimateDate: 'تاريخ عرض السعر',
  invoiceDate: 'تاريخ الفاتورة',
  receiptDate: 'تاريخ الإيصال',
  reasonForPayment: 'سبب الدفعة',
  amountReceived: 'المبلغ المستلم',
  issuedBy: 'صادر عن',
  receivedBy: 'استلمها',
  validUntil: 'صالح حتى',
  paymentDue: 'تاريخ استحقاق الدفع',
  projectLocation: 'موقع المشروع',
  services: 'الخدمات',
  quantity: 'الكمية',
  unit: 'الوحدة',
  unitPrice: 'سعر الوحدة',
  amount: 'المبلغ',
  subtotal: 'المجموع الفرعي',
  lumpSumFee: 'المبلغ الإجمالي المقطوع',
  discount: 'الخصم',
  grandTotal: 'الإجمالي الكلي',
  total: 'الإجمالي',
  amountDue: 'المبلغ المستحق',
  amountPaid: 'المبلغ المدفوع',
  paymentOn: 'دفعة بتاريخ',
  using: 'بواسطة',
  paymentTerms: 'شروط الدفع',
  timeline: 'الجدول الزمني',
  notes: 'ملاحظات',
  exclusions: 'الاستثناءات',
  introduction: 'مقدمة',
  phone: 'هاتف',
  mobile: 'جوال',
  footerPage: 'صفحة',
  footerOf: 'من',
  footerFor: 'لـ',
  thankYou: 'شكراً لتعاونكم',
  fundsReceived: 'الأموال المستلمة',
  fundsSpent: 'الأموال المصروفة',
  fundsRemaining: 'الأموال المتبقية',
  acceptanceSignatures: 'القبول والتوقيعات',
  acceptanceParagraph:
    'بالتوقيع أدناه، يقر الطرفان ويوافقان على نطاق الخدمات والأتعاب المهنية وشروط الدفع والشروط الأخرى الواردة في هذه الوثيقة.',
  client: 'العميل',
  nextudioParty: 'نكستوديو',
  companyName: 'اسم العميل / الشركة',
  authorizedRepresentative: 'الممثل المفوض',
  titlePosition: 'المسمى الوظيفي',
  signature: 'التوقيع',
  signatureDate: 'التاريخ',
  methods: { cash: 'نقداً', bank_transfer: 'تحويل بنكي', cheque: 'شيك', card: 'بطاقة', other: 'أخرى' },
}

const LABELS: Record<DocumentLanguage, DocumentLabels> = { en, fr, ar }

export function labelsFor(language: string): DocumentLabels {
  return LABELS[(language as DocumentLanguage) in LABELS ? (language as DocumentLanguage) : 'en']
}

export function isDocumentLanguage(value: unknown): value is DocumentLanguage {
  return typeof value === 'string' && (DOCUMENT_LANGUAGES as readonly string[]).includes(value)
}
