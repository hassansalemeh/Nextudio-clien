// Fixed labels for the generated Quotation / Invoice PDF, in every supported Document Language.
// This never translates anything the admin writes (Introduction, service names/descriptions, Notes,
// Terms, Exclusions, Contract/Acceptance Terms) - only the surrounding layout labels.
export const DOCUMENT_LANGUAGES = ['en', 'fr', 'ar'] as const
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number]

export const DIRECTION: Record<DocumentLanguage, 'ltr' | 'rtl'> = { en: 'ltr', fr: 'ltr', ar: 'rtl' }

export type DocumentLabels = {
  quotation: string
  invoice: string
  clientFunds: string
  clientFundsSubtitle: string
  billTo: string
  estimateNumber: string
  invoiceNumber: string
  estimateDate: string
  invoiceDate: string
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
  clientFunds: 'Client Funds / Project Expenses',
  clientFundsSubtitle: 'Funds held for project expenses — not a professional/design fee invoice',
  billTo: 'Bill To',
  estimateNumber: 'Estimate Number',
  invoiceNumber: 'Invoice Number',
  estimateDate: 'Estimate Date',
  invoiceDate: 'Invoice Date',
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
  clientFunds: 'Fonds Client / Dépenses de Projet',
  clientFundsSubtitle: "Fonds détenus pour les dépenses du projet — pas une facture d'honoraires professionnels",
  billTo: 'Facturé à',
  estimateNumber: 'Numéro de devis',
  invoiceNumber: 'Numéro de facture',
  estimateDate: 'Date du devis',
  invoiceDate: 'Date de facture',
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
  clientFunds: 'أموال العميل / مصاريف المشروع',
  clientFundsSubtitle: 'أموال محتفظ بها لمصاريف المشروع — وليست فاتورة أتعاب مهنية',
  billTo: 'إلى',
  estimateNumber: 'رقم عرض السعر',
  invoiceNumber: 'رقم الفاتورة',
  estimateDate: 'تاريخ عرض السعر',
  invoiceDate: 'تاريخ الفاتورة',
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
