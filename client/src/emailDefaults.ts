// Default Subject/Message text for "Send by Email", one set per Document Language. The admin can
// still edit both before sending - these are only a sensible starting point.
export type DocumentLanguage = 'en' | 'fr' | 'ar'

const GREETING: Record<DocumentLanguage, (name: string) => string> = {
  en: (name) => `Dear ${name || 'Sir/Madam'},`,
  fr: (name) => `Cher/Chère ${name || 'Madame, Monsieur'},`,
  ar: (name) => `عزيزي/عزيزتي ${name || 'السيد/السيدة'}،`,
}

const CLOSING: Record<DocumentLanguage, string> = {
  en: 'Kind regards,\nNextudio Architects',
  fr: 'Cordialement,\nNextudio Architects',
  ar: 'مع أطيب التحيات،\nNextudio Architects',
}

const FALLBACK_PROJECT: Record<DocumentLanguage, string> = {
  en: 'your project',
  fr: 'votre projet',
  ar: 'مشروعكم',
}

const FALLBACK_TITLE: Record<DocumentLanguage, string> = {
  en: 'Project',
  fr: 'Projet',
  ar: 'المشروع',
}

export function estimateEmailDefaults(language: DocumentLanguage, contactName: string, title: string) {
  const project = title || FALLBACK_PROJECT[language]
  const subject: Record<DocumentLanguage, string> = {
    en: `Quotation - ${title || FALLBACK_TITLE.en} - Nextudio`,
    fr: `Devis - ${title || FALLBACK_TITLE.fr} - Nextudio`,
    ar: `عرض سعر - ${title || FALLBACK_TITLE.ar} - Nextudio`,
  }
  const body: Record<DocumentLanguage, string> = {
    en: `Please find attached our quotation for ${project}.`,
    fr: `Veuillez trouver ci-joint notre devis pour ${project}.`,
    ar: `تجدون طيه عرض السعر الخاص بـ${project}.`,
  }
  return { subject: subject[language], message: `${GREETING[language](contactName)}\n\n${body[language]}\n\n${CLOSING[language]}` }
}

export function invoiceEmailDefaults(language: DocumentLanguage, invoiceType: string, contactName: string, title: string) {
  const isClientFunds = invoiceType === 'client_funds'
  const project = title || FALLBACK_PROJECT[language]
  const subject: Record<DocumentLanguage, string> = {
    en: isClientFunds ? `Client Funds Receipt - ${title || FALLBACK_TITLE.en} - Nextudio` : `Invoice - ${title || FALLBACK_TITLE.en} - Nextudio`,
    fr: isClientFunds ? `Reçu de Fonds Client - ${title || FALLBACK_TITLE.fr} - Nextudio` : `Facture - ${title || FALLBACK_TITLE.fr} - Nextudio`,
    ar: isClientFunds ? `إيصال أموال العميل - ${title || FALLBACK_TITLE.ar} - Nextudio` : `فاتورة - ${title || FALLBACK_TITLE.ar} - Nextudio`,
  }
  const body: Record<DocumentLanguage, string> = {
    en: isClientFunds
      ? `Please find attached the document confirming funds received for ${project}'s expenses.`
      : `Please find attached our invoice for ${project}.`,
    fr: isClientFunds
      ? `Veuillez trouver ci-joint le document confirmant les fonds reçus pour les dépenses de ${project}.`
      : `Veuillez trouver ci-joint notre facture pour ${project}.`,
    ar: isClientFunds
      ? `تجدون طيه الوثيقة التي تؤكد استلام الأموال الخاصة بمصاريف ${project}.`
      : `تجدون طيه الفاتورة الخاصة بـ${project}.`,
  }
  return { subject: subject[language], message: `${GREETING[language](contactName)}\n\n${body[language]}\n\n${CLOSING[language]}` }
}
