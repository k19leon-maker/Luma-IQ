export const LEGAL_DOCUMENT_VERSION = 'v1';

export const legalDocuments = [
  {
    title: 'Политика конфиденциальности',
    path: '/legal/privacy-policy',
    version: LEGAL_DOCUMENT_VERSION,
  },
  {
    title: 'Согласие на обработку персональных данных',
    path: '/legal/personal-data',
    version: LEGAL_DOCUMENT_VERSION,
  },
  {
    title: 'Публичная оферта',
    path: '/legal/offer',
    version: LEGAL_DOCUMENT_VERSION,
  },
  {
    title: 'Политика cookies',
    path: '/legal/cookies',
    version: LEGAL_DOCUMENT_VERSION,
  },
];

export type LegalConsentState = {
  privacyAccepted: boolean;
  personalDataAccepted: boolean;
  offerAccepted: boolean;
};

export const initialLegalConsentState: LegalConsentState = {
  privacyAccepted: false,
  personalDataAccepted: false,
  offerAccepted: false,
};

export function areLegalConsentsAccepted(consents: LegalConsentState) {
  return consents.privacyAccepted && consents.personalDataAccepted && consents.offerAccepted;
}

export function legalConsentPayload(consents: LegalConsentState) {
  return {
    ...consents,
    documentVersion: LEGAL_DOCUMENT_VERSION,
  };
}
