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
//
// HONESTY NOTE (R3-285): that guarantee holds TODAY for the FIELD builders only.
// The browser `FirestoreSpaceStore` builds its refs with the Web SDK's variadic
// `doc(db, 'user-app-spaces', uid, 'apps', appKey, …)` and does NOT call the
// `*Path` builders below — they are backend-only. The two constructions are
// equivalent (`doc()` joins with `/` and re-parses exactly as the backend's
// `segments.join('/')` does), but "one source for the paths" is an aspiration
// here, not a fact, and a bug fixed in a `*Path` builder does not reach the
// browser. What both sides DO share is `assertAppKeySegment` — the one property
// a wrong path would violate. Unifying the ref construction is tracked debt.
Object.defineProperty(exports, "__esModule", { value: true });
exports.appCapabilitiesGrantFields = exports.mergeCapabilities = exports.netFetchGrantFields = exports.mergeNetFetchHosts = exports.appSpaceGrantFields = exports.appKeyTouchFields = exports.appCountFields = exports.userCountFields = exports.ownerUserSpaceFields = exports.ownerMemberFields = exports.spaceDocFields = exports.appCountPath = exports.userCountPath = exports.appSpacePath = exports.appKeyPath = exports.userSpacePath = exports.memberPath = exports.spacePath = exports.assertAppKeySegment = exports.isAppKeySegment = exports.InvalidAppKeyError = exports.defined = exports.granteeId = exports.GRANT_EXPIRY_MS = exports.parseGrantDocId = exports.grantDocId = exports.GRANT_DOCID_DELIM = exports.parseGrantKey = exports.grantKeyWithPrincipal = exports.grantKey = void 0;
/** Stable per-user identifier for a grant `(appKey, spaceId)`, used as the value
 *  of a delegated grant's `parentGrantId`. `::` is delimiter-safe: `appKey` uses
 *  `__` separators and a Firestore `spaceId` is alphanumeric. */
const grantKey = (appKey, spaceId) => `${appKey}::${spaceId}`;
exports.grantKey = grantKey;
/** R3-98 S4 — the principal-aware grant key `(appKey, principal, spaceId)` (design
 *  05a §3.1/§3.2). Additive: {@link grantKey} is retained for the legacy 2-field
 *  form. `::` stays delimiter-safe — `appKey` uses `__`, a `spaceId` is alphanumeric,
 *  and a named principal is lowercase-dotted/hyphenated (CA-3), none containing `::`. */
const grantKeyWithPrincipal = (appKey, principal, spaceId) => `${appKey}::${principal}::${spaceId}`;
exports.grantKeyWithPrincipal = grantKeyWithPrincipal;
/** R3-98 S4 — ARITY-DETECTING parse of a grant key (design 05a §3.1 step 3 /
 *  MEDIUM-6). A 3-field key is `appKey::principal::spaceId`; a legacy 2-field key is
 *  `appKey::spaceId` (principal undefined). This lets the revoke cascade keep
 *  resolving BOTH legacy and keyed `parentGrantId`s after the re-key — a positional
 *  `split('::')` would mis-assign a legacy key's `spaceId` to `principal`. A
 *  malformed key (≠2/≠3 segments) degrades to best-effort `appKey::…::spaceId`
 *  (first + last), so the cascade fails safe (child self-revokes) rather than
 *  crashing. */
const parseGrantKey = (key) => {
    const parts = key.split('::');
    if (parts.length === 3) {
        return { appKey: parts[0], principal: parts[1], spaceId: parts[2] };
    }
    // Legacy 2-field, or malformed → first segment is the appKey, last the spaceId.
    return { appKey: parts[0], spaceId: parts[parts.length - 1] };
};
exports.parseGrantKey = parseGrantKey;
// --- R3-98 S5 — the principal-qualified space-grant doc-id (design 05a §3.1/§3.5) --
//
// A space grant's Firestore doc-id encodes the named principal it was minted
// under, so two principals granting the SAME space live at DIFFERENT docs and are
// invisible to each other (structural disjointness). The rule (design 05a §3.1
// step 2): a **qualifying** (real, named) principal → `${principal}~${spaceId}`;
// the **stage** principal, a **legacy** (no-principal) grant, or none → the bare
// `spaceId`, so no existing/stage doc ever moves. This module is GRAMMAR ONLY: the
// caller decides which principals qualify (site-main owns the stage/legacy
// sentinels — a principal it treats as non-qualifying is passed as `undefined`).
/** The doc-id delimiter between a qualifying principal and the spaceId. Safe: a
 *  named principal is lowercase-dotted/hyphenated (CA-3 reserves `~`) and a
 *  Firestore spaceId is alphanumeric, so `~` appears in NEITHER — a single,
 *  unambiguous split point. */
exports.GRANT_DOCID_DELIM = '~';
/** Build a space-grant doc-id (design 05a §3.1 step 2). Pass the QUALIFYING named
 *  principal to get `${principal}~${spaceId}`; pass `undefined` (stage / legacy /
 *  no principal) for the bare `spaceId`. The caller resolves "does this principal
 *  qualify" (site-main maps stage/legacy → undefined) so this stays a pure string
 *  builder with no sentinel knowledge. */
const grantDocId = (spaceId, qualifyingPrincipal) => qualifyingPrincipal ? `${qualifyingPrincipal}${exports.GRANT_DOCID_DELIM}${spaceId}` : spaceId;
exports.grantDocId = grantDocId;
/** Parse a space-grant doc-id back into `{ principal?, spaceId }` — the §3.5
 *  reader-parse discipline every app-space-grant collection reader routes `d.id`
 *  through so it never mistakes `${principal}~${spaceId}` for a bare spaceId (which
 *  would corrupt the derived `mountId` and leak grants across principals). Splits
 *  on the FIRST delimiter; a named principal never contains `~`, so this recovers
 *  the exact principal + spaceId. A bare id (no delimiter) ⇒ `{ spaceId }`. */
const parseGrantDocId = (docId) => {
    const i = docId.indexOf(exports.GRANT_DOCID_DELIM);
    return i === -1
        ? { spaceId: docId }
        : { principal: docId.slice(0, i), spaceId: docId.slice(i + 1) };
};
exports.parseGrantDocId = parseGrantDocId;
/** Durable elevated/app-scoped grants expire after 90 days WITHOUT USE; first
 *  use after expiry re-prompts. Baseline needs no grant record, so this never
 *  touches it. */
exports.GRANT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;
/** The member doc-ID for a user who can be granted access to a space: `user:<uid>`.
 *  This is a **grantee** (a space member — the `uid`/`gid` of `setSpaceRole`), NOT the
 *  authority-context Principal (core_concepts §4 reserved-word; SPEC_CODE_DEBT §7.1
 *  RENAME-1). The stored Firestore path segment is a doc-ID, not a field literally
 *  named `principal`, so this rename is code-symbol-only — no data migration. */
const granteeId = (uid) => `user:${uid}`;
exports.granteeId = granteeId;
/** Drop undefined values — Firestore rejects them. The two adapters historically
 *  each had their own copy of this; sharing it keeps the "omit absent optionals"
 *  rule identical on both sides. */
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
exports.defined = defined;
// --- the appKey grammar guard (R3-285) --------------------------------------
//
// An `appKey` is ONE Firestore path segment. The canonical grammar is
// site-main's `spaceId.appKey()` — `enc(provider)__enc(namespace)__enc(repository)`
// — which is punctuation-free by construction. The DANGER is the neighbouring
// grammar: a *binding id* (`provider:namespace/repository`) is a different
// identifier that also names a repo, and feeding one to the grant store is a
// silent catastrophe rather than a loud one:
//
//   • one slash  (`github:acme/notes`)      → the joined path has an ODD segment
//     count, so `doc()` throws `invalid-argument` — noisy, fails closed;
//   • two slashes (`gitlab:g/sub/notes`, a nested namespace) → the path is EVEN
//     and perfectly valid, so the grant is WRITTEN — to a document no reader
//     looks at, that the §8.11 audit view does not enumerate, and that the
//     §8.15 revoke cascade cannot reach. A durable, invisible, unrevokable grant.
//
// So the fix is NOT to encode: encoding would make the second case succeed
// quietly at the wrong key. It is to refuse a key that is not one segment, at
// the one place both adapters can share, and let the caller be corrected.
//
// This asserts the SEGMENT property (what Firestore requires), not the `__`
// grammar (which lives in site-main and may still gain components) — the widest
// check that still catches every wrong-grammar key we have seen.
/** Thrown when an `appKey` is not a single Firestore path segment. Carries a
 *  machine `code` so a caller can map it to its own error vocabulary. */
class InvalidAppKeyError extends Error {
    code = 'invalid-app-key';
    constructor(appKey, why) {
        super(`appKey ${JSON.stringify(appKey)} is not one Firestore path segment (${why}). ` +
            'Expected the grant-store key grammar (`provider__namespace__repository`), ' +
            'not a binding id (`provider:namespace/repository`).');
        this.name = 'InvalidAppKeyError';
    }
}
exports.InvalidAppKeyError = InvalidAppKeyError;
/** Is `appKey` usable as exactly one Firestore path segment? Empty, `/`-bearing,
 *  and the two relative-path doc-ids Firestore reserves are all refused. */
const isAppKeySegment = (appKey) => typeof appKey === 'string' &&
    appKey.length > 0 &&
    !appKey.includes('/') &&
    appKey !== '.' &&
    appKey !== '..';
exports.isAppKeySegment = isAppKeySegment;
/** Refuse an `appKey` that is not one path segment — the shared chokepoint every
 *  grant-store path builder runs first (R3-285). Returns the key so it can wrap a
 *  segment in place. */
const assertAppKeySegment = (appKey) => {
    if (typeof appKey !== 'string' || appKey.length === 0) {
        throw new InvalidAppKeyError(String(appKey), 'empty');
    }
    if (appKey.includes('/'))
        throw new InvalidAppKeyError(appKey, 'contains "/"');
    if (appKey === '.' || appKey === '..') {
        throw new InvalidAppKeyError(appKey, 'is a reserved relative path');
    }
    return appKey;
};
exports.assertAppKeySegment = assertAppKeySegment;
// --- document paths (pure, sentinel-free) -----------------------------------
const spacePath = (spaceId) => ['spaces', spaceId];
exports.spacePath = spacePath;
const memberPath = (spaceId, grantee) => [
    'spaces',
    spaceId,
    'members',
    grantee,
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
    (0, exports.assertAppKeySegment)(appKey),
];
exports.appKeyPath = appKeyPath;
/** `user-app-spaces/{uid}/apps/{appKey}/spaces/{docId}` — the durable §8.7 grant
 *  doc. R3-98 S5: the doc-id is principal-qualified — pass the QUALIFYING named
 *  principal for `${principal}~${spaceId}`, or omit it (stage / legacy) for the
 *  bare `spaceId`. Backward-compatible: a 3-arg call (no principal) yields exactly
 *  the pre-S5 path, so the backend/CLI stage mint is byte-identical. */
const appSpacePath = (uid, appKey, spaceId, qualifyingPrincipal) => [
    'user-app-spaces',
    uid,
    'apps',
    (0, exports.assertAppKeySegment)(appKey),
    'spaces',
    (0, exports.grantDocId)(spaceId, qualifyingPrincipal),
];
exports.appSpacePath = appSpacePath;
const userCountPath = (uid) => ['space-counts', uid];
exports.userCountPath = userCountPath;
const appCountPath = (uid, appKey) => [
    'space-counts',
    uid,
    'apps',
    (0, exports.assertAppKeySegment)(appKey),
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
    // R3-98 S3/S4 — the named principal this grant was minted under (design 05a
    // §3.1). `defined()` omits it when absent, so a legacy/unkeyed mint writes no
    // `principal` field and is grandfathered at the gate (both adapters stamp it
    // identically, keeping the byte-identical-doc guarantee).
    principal: params.principal,
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
/** Union granted PLAIN app-scoped capability names (set semantics; sorted for a
 *  stable, byte-faithful document) — the "consent accumulates" merge for the
 *  R3-233 capability grant, mirroring {@link mergeNetFetchHosts}. */
const mergeCapabilities = (existing, incoming) => [...new Set([...existing, ...incoming])].sort();
exports.mergeCapabilities = mergeCapabilities;
/** `user-app-spaces/{uid}/apps/{appKey}` — the durable granted PLAIN app-scoped
 *  capability set (merge), R3-233. Lives on the SAME appKey doc as the net:fetch
 *  grant so one read (`getAppGrantDoc`) yields both. `capabilitiesGrantedAt` is
 *  stamped ONCE (first mint); `capabilitiesLastUsedAt` refreshes on every
 *  (re-)consent — the §8.15 90-day-unused expiry clock, identical to net:fetch. */
const appCapabilitiesGrantFields = (mergedCaps, hadGrantedAt, s) => (0, exports.defined)({
    grantedCapabilities: [...mergedCaps],
    capabilitiesGrantedAt: hadGrantedAt ? undefined : s.serverTimestamp(),
    capabilitiesLastUsedAt: s.serverTimestamp(),
});
exports.appCapabilitiesGrantFields = appCapabilitiesGrantFields;
