"use strict";
// The mint PORT — the narrow persistence interface the ONE grant-mint path
// (`mintConsentedGrants`) depends on, plus the shared domain types its params
// carry. Both site-main's `FirestoreSpaceStore` (Firebase Web SDK) and the
// backend's `AdminMintStore` (firebase-admin) structurally satisfy `MintStore`,
// so the same orchestration drives both environments.
//
// This is a deliberate 3-method SUBSET of site-main's ~30-method `SpaceStore`:
// `mintConsentedGrants` only ever calls `grantNetFetchHosts`, `createSpace`, and
// `grantSpaceToApp` (the binding/grant doc IS the binding now — there is no
// separate `bindSpaceToApp` slot write). The broad `SpaceStore` (subscriptions,
// sharing, soft-delete, audit reads, …) stays in site-main and is NOT extracted.
Object.defineProperty(exports, "__esModule", { value: true });
