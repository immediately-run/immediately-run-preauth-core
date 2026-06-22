"use strict";
// The byte-faithful document layout (UI_AS_APPS_SPEC §8.6/§8.7/§8.15) — the
// SINGLE source of the Firestore paths and field objects every grant-mint write
// produces. The browser `FirestoreSpaceStore` (Web SDK) and the backend
// `AdminMintStore` (admin SDK) write against two different Firestore client APIs
// and therefore cannot share *call* code — but they MUST write byte-identical
// documents (same collection paths, same field names, same `grantKey` /
// `mintPath` / expiry stamping). If they drift, grants minted by the
// CLI/backend would not be the grants site-main's boot gate reads — a silent,
// security-relevant failure.
//
// The guarantee: both adapters compute their paths and assemble their field
// objects HERE, injecting only the environment-specific timestamp/increment
// SENTINELS (Web `serverTimestamp()`/`increment()` vs admin
// `FieldValue.serverTimestamp()`/`FieldValue.increment()`). The raw
// `.set()`/`.update()` is the only thing each adapter does itself. Drift is then
// impossible without editing a helper both consume.
Object.defineProperty(exports, "__esModule", { value: true });
exports.netFetchGrantFields = exports.mergeNetFetchHosts = exports.appSpaceGrantFields = exports.appKeyTouchFields = exports.appCountFields = exports.userCountFields = exports.ownerUserSpaceFields = exports.ownerMemberFields = exports.spaceDocFields = exports.appCountPath = exports.userCountPath = exports.appSpacePath = exports.appKeyPath = exports.userSpacePath = exports.memberPath = exports.spacePath = exports.defined = exports.userPrincipal = exports.GRANT_EXPIRY_MS = exports.grantKey = void 0;
/** Stable per-user identifier for a grant `(appKey, spaceId)`, used as the value
 *  of a delegated grant's `parentGrantId`. `::` is delimiter-safe: `appKey` uses
 *  `__` separators and a Firestore `spaceId` is alphanumeric. */
const grantKey = (appKey, spaceId) => `${appKey}::${spaceId}`;
exports.grantKey = grantKey;
/** Durable elevated/app-scoped grants expire after 90 days WITHOUT USE; first
 *  use after expiry re-prompts. Baseline needs no grant record, so this never
 *  touches it. */
exports.GRANT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;
/** The member doc-ID for a user who can be granted access to a space:
 *  `user:<uid>`. VOCAB NOTE (core_concepts §4 reserved-word): this is a **grantee**
 *  (a space member — the `uid`/`gid` of `setSpaceRole`), NOT the authority-context
 *  Principal. The name `userPrincipal` and the `memberPath(…, principal)` param
 *  predate the §4 rename; renaming the TS symbols to `grantee` is the cross-repo
 *  RENAME-1 track (see REFACTOR_CANDIDATES.md / 07-preauth-core.md Phase 2). The
 *  stored Firestore path segment (`spaces/{id}/members/{user:<uid>}`) is a doc-ID,
 *  not a field literally named `principal`, so the rename is code-symbol-only — no
 *  data migration — and is deferred until coordinated with SDK + site-main + backend. */
const userPrincipal = (uid) => `user:${uid}`;
exports.userPrincipal = userPrincipal;
/** Drop undefined values — Firestore rejects them. The two adapters historically
 *  each had their own copy of this; sharing it keeps the "omit absent optionals"
 *  rule identical on both sides. */
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
exports.defined = defined;
// --- document paths (pure, sentinel-free) -----------------------------------
const spacePath = (spaceId) => ['spaces', spaceId];
exports.spacePath = spacePath;
const memberPath = (spaceId, principal) => [
    'spaces',
    spaceId,
    'members',
    principal,
];
exports.memberPath = memberPath;
const userSpacePath = (uid, spaceId) => [
    'user-spaces',
    uid,
    'spaces',
    spaceId,
];
exports.userSpacePath = userSpacePath;
const appKeyPath = (uid, appKey) => [
    'user-app-spaces',
    uid,
    'apps',
    appKey,
];
exports.appKeyPath = appKeyPath;
const appSpacePath = (uid, appKey, spaceId) => [
    'user-app-spaces',
    uid,
    'apps',
    appKey,
    'spaces',
    spaceId,
];
exports.appSpacePath = appSpacePath;
const userCountPath = (uid) => ['space-counts', uid];
exports.userCountPath = userCountPath;
const appCountPath = (uid, appKey) => [
    'space-counts',
    uid,
    'apps',
    appKey,
];
exports.appCountPath = appCountPath;
// --- field objects (inject the timestamp/increment sentinels) ---------------
/** `spaces/{spaceId}` — the root doc (written WITHOUT merge). */
const spaceDocFields = (params, s) => (0, exports.defined)({
    owner: params.owner,
    createdAt: s.serverTimestamp(),
    name: params.name,
    createdInNamespace: params.createdInNamespace,
    createdInRepository: params.createdInRepository,
});
exports.spaceDocFields = spaceDocFields;
/** `spaces/{spaceId}/members/{user:owner}` — the owner membership (no merge). */
const ownerMemberFields = (s) => ({
    role: 'owner',
    addedAt: s.serverTimestamp(),
});
exports.ownerMemberFields = ownerMemberFields;
/** `user-spaces/{owner}/spaces/{spaceId}` — EFFECTIVE access (no merge). */
const ownerUserSpaceFields = (params) => (0, exports.defined)({ role: 'owner', name: params.name, owner: params.owner });
exports.ownerUserSpaceFields = ownerUserSpaceFields;
/** `space-counts/{uid}` — per-user owned counter (merge). */
const userCountFields = (s) => ({
    owned: s.increment(1),
});
exports.userCountFields = userCountFields;
/** `space-counts/{uid}/apps/{appKey}` — per-app created counter (merge). */
const appCountFields = (s) => ({
    created: s.increment(1),
});
exports.appCountFields = appCountFields;
/** `user-app-spaces/{uid}/apps/{appKey}` — the enumerable app-key marker doc
 *  touched when a grant is written (merge). */
const appKeyTouchFields = (s) => ({
    touchedAt: s.serverTimestamp(),
});
exports.appKeyTouchFields = appKeyTouchFields;
/** `user-app-spaces/{uid}/apps/{appKey}/spaces/{spaceId}` — the durable §8.7
 *  grant doc (merge). `mintPath` defaults to `interactive`; `grantedAt`/`lastUsedAt`
 *  drive the §8.15 90-day-unused expiry. */
const appSpaceGrantFields = (params, s) => (0, exports.defined)({
    boundAt: s.serverTimestamp(),
    grantedAt: s.serverTimestamp(),
    lastUsedAt: s.serverTimestamp(),
    name: params.name,
    // UI_AS_APPS_SPEC §8.7: `rules` is authoritative; `subtree`/`mode` are kept as the
    // deprecated `rules[0]` mirror for not-yet-migrated readers. When no rule-set
    // is given, derive a single-rule set from the legacy scope so the backend
    // single-scope mint path still emits `rules` (byte-identical with site-main).
    subtree: params.subtree,
    mode: params.mode,
    rules: params.rules && params.rules.length > 0
        ? params.rules
        : [{ subtree: params.subtree ?? '/', mode: params.mode ?? 'rw' }],
    declaredUri: params.declaredUri,
    mintPath: params.mintPath ?? 'interactive',
    parentGrantId: params.parentGrantId,
});
exports.appSpaceGrantFields = appSpaceGrantFields;
/** Union net:fetch host rules by origin (incoming wins) — the "consent
 *  accumulates" merge both adapters apply before writing the host set. */
const mergeNetFetchHosts = (existing, incoming) => {
    const byOrigin = new Map();
    for (const h of existing)
        byOrigin.set(h.origin, h);
    for (const h of incoming)
        byOrigin.set(h.origin, h);
    return [...byOrigin.values()];
};
exports.mergeNetFetchHosts = mergeNetFetchHosts;
/** `user-app-spaces/{uid}/apps/{appKey}` — the net:fetch host grant (merge).
 *  `hadGrantedAt` is whether the doc already carried a `netFetchGrantedAt` (so the
 *  grant time is stamped ONCE, on first mint, and `netFetchLastUsedAt` refreshes
 *  on every (re-)consent). */
const netFetchGrantFields = (mergedHosts, hadGrantedAt, s) => (0, exports.defined)({
    netFetch: [...mergedHosts],
    netFetchGrantedAt: hadGrantedAt ? undefined : s.serverTimestamp(),
    netFetchLastUsedAt: s.serverTimestamp(),
});
exports.netFetchGrantFields = netFetchGrantFields;
