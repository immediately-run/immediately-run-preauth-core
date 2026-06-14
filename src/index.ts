// @immediately-run/preauth-core — the shared pre-auth core.
//
// ONE §8.9 gate (`planPreAuthCapabilities`), ONE mint path (`mintConsentedGrants`,
// `applyPreAuth`), ONE capability vocabulary (`./capabilities`), ONE wire layout
// (`./docLayout`). site-main (browser Firestore) and the backend (admin Firestore)
// both consume this so a CLI/backend-minted grant is byte-identical to one
// site-main mints, and no surface can mint a capability the in-browser gate would
// have refused.

export * from './capabilities';
export * from './port';
export * from './docLayout';
export * from './bootConsent';
export * from './m1PreAuth';
