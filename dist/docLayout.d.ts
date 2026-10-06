import type { CreateSpaceParams, GrantSpaceParams, NetFetchHost } from './port';
/** A Firestore document path as alternating collection/doc segments, e.g.
 *  `['user-app-spaces', uid, 'apps', appKey, 'spaces', spaceId]`. */
export type DocPath = string[];
/** The environment-specific Firestore sentinels the field builders inject. The
 *  Web SDK passes `{ serverTimestamp, increment }` from `firebase/firestore`; the
 *  admin SDK passes the `FieldValue.*` equivalents. */
export interface MintSentinels {
    serverTimestamp(): unknown;
    increment(n: number): unknown;
}
/** Stable per-user identifier for a grant `(appKey, spaceId)`, used as the value
 *  of a delegated grant's `parentGrantId`. `::` is delimiter-safe: `appKey` uses
 *  `__` separators and a Firestore `spaceId` is alphanumeric. */
export declare const grantKey: (appKey: string, spaceId: string) => string;
/** R3-98 S4 — the principal-aware grant key `(appKey, principal, spaceId)` (design
 *  05a §3.1/§3.2). Additive: {@link grantKey} is retained for the legacy 2-field
 *  form. `::` stays delimiter-safe — `appKey` uses `__`, a `spaceId` is alphanumeric,
 *  and a named principal is lowercase-dotted/hyphenated (CA-3), none containing `::`. */
export declare const grantKeyWithPrincipal: (appKey: string, principal: string, spaceId: string) => string;
/** A parsed `parentGrantId` — the pieces the §8.15 revoke cascade reconstructs a
 *  grant doc path from. `principal` is present only for a 3-field (S4+) key. */
export interface ParsedGrantKey {
    appKey: string;
    spaceId: string;
    /** The named principal for a 3-field {@link grantKeyWithPrincipal} key; undefined
     *  for a legacy 2-field {@link grantKey} (the caller defaults to its grandfather
     *  sentinel). */
    principal?: string;
}
/** R3-98 S4 — ARITY-DETECTING parse of a grant key (design 05a §3.1 step 3 /
 *  MEDIUM-6). A 3-field key is `appKey::principal::spaceId`; a legacy 2-field key is
 *  `appKey::spaceId` (principal undefined). This lets the revoke cascade keep
 *  resolving BOTH legacy and keyed `parentGrantId`s after the re-key — a positional
 *  `split('::')` would mis-assign a legacy key's `spaceId` to `principal`. A
 *  malformed key (≠2/≠3 segments) degrades to best-effort `appKey::…::spaceId`
 *  (first + last), so the cascade fails safe (child self-revokes) rather than
 *  crashing. */
export declare const parseGrantKey: (key: string) => ParsedGrantKey;
/** The doc-id delimiter between a qualifying principal and the spaceId. Safe: a
 *  named principal is lowercase-dotted/hyphenated (CA-3 reserves `~`) and a
 *  Firestore spaceId is alphanumeric, so `~` appears in NEITHER — a single,
 *  unambiguous split point. */
export declare const GRANT_DOCID_DELIM = "~";
/** Build a space-grant doc-id (design 05a §3.1 step 2). Pass the QUALIFYING named
 *  principal to get `${principal}~${spaceId}`; pass `undefined` (stage / legacy /
 *  no principal) for the bare `spaceId`. The caller resolves "does this principal
 *  qualify" (site-main maps stage/legacy → undefined) so this stays a pure string
 *  builder with no sentinel knowledge. */
export declare const grantDocId: (spaceId: string, qualifyingPrincipal?: string) => string;
/** A parsed grant doc-id — the §3.5 reader-parse discipline. `principal` is set
 *  only for a QUALIFIED (`${principal}~${spaceId}`) id; a bare id (a stage/legacy
 *  grant) yields `{ spaceId }` with `principal` undefined. */
export interface ParsedGrantDocId {
    /** The qualifying principal, or undefined for a bare (stage/legacy) doc-id. */
    principal?: string;
    spaceId: string;
}
/** Parse a space-grant doc-id back into `{ principal?, spaceId }` — the §3.5
 *  reader-parse discipline every app-space-grant collection reader routes `d.id`
 *  through so it never mistakes `${principal}~${spaceId}` for a bare spaceId (which
 *  would corrupt the derived `mountId` and leak grants across principals). Splits
 *  on the FIRST delimiter; a named principal never contains `~`, so this recovers
 *  the exact principal + spaceId. A bare id (no delimiter) ⇒ `{ spaceId }`. */
export declare const parseGrantDocId: (docId: string) => ParsedGrantDocId;
/** Durable elevated/app-scoped grants expire after 90 days WITHOUT USE; first
 *  use after expiry re-prompts. Baseline needs no grant record, so this never
 *  touches it. */
export declare const GRANT_EXPIRY_MS: number;
/** The member doc-ID for a user who can be granted access to a space: `user:<uid>`.
 *  This is a **grantee** (a space member — the `uid`/`gid` of `setSpaceRole`), NOT the
 *  authority-context Principal (core_concepts §4 reserved-word; SPEC_CODE_DEBT §7.1
 *  RENAME-1). The stored Firestore path segment is a doc-ID, not a field literally
 *  named `principal`, so this rename is code-symbol-only — no data migration. */
export declare const granteeId: (uid: string) => string;
/** Drop undefined values — Firestore rejects them. The two adapters historically
 *  each had their own copy of this; sharing it keeps the "omit absent optionals"
 *  rule identical on both sides. */
export declare const defined: <T extends Record<string, unknown>>(obj: T) => T;
/** Thrown when an `appKey` is not a single Firestore path segment. Carries a
 *  machine `code` so a caller can map it to its own error vocabulary. */
export declare class InvalidAppKeyError extends Error {
    readonly code = "invalid-app-key";
    constructor(appKey: string, why: string);
}
/** Is `appKey` usable as exactly one Firestore path segment? */
export declare const isAppKeySegment: (appKey: string) => boolean;
/** Refuse an `appKey` that is not one path segment — the shared chokepoint every
 *  grant-store path builder runs first (R3-285). Returns the key so it can wrap a
 *  segment in place. */
export declare const assertAppKeySegment: (appKey: string) => string;
/** @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path. Use
 *  {@link tenantSpacePath} — the same path under `tenants/{tenantId}/`. Removed at the Phase 4 cutover. */
export declare const spacePath: (spaceId: string) => DocPath;
/** @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path. Use
 *  {@link tenantMemberPath} — the same path under `tenants/{tenantId}/`. Removed at the Phase 4 cutover. */
export declare const memberPath: (spaceId: string, grantee: string) => DocPath;
/** @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path. Use
 *  {@link tenantUserSpacePath} — the same path under `tenants/{tenantId}/`. Removed at the Phase 4 cutover. */
export declare const userSpacePath: (uid: string, spaceId: string) => DocPath;
/** @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path. Use
 *  {@link tenantAppKeyPath} — the same path under `tenants/{tenantId}/`. Removed at the Phase 4 cutover. */
export declare const appKeyPath: (uid: string, appKey: string) => DocPath;
/** `user-app-spaces/{uid}/apps/{appKey}/spaces/{docId}` — the durable §8.7 grant
 *  doc. R3-98 S5: the doc-id is principal-qualified — pass the QUALIFYING named
 *  principal for `${principal}~${spaceId}`, or omit it (stage / legacy) for the
 *  bare `spaceId`. Backward-compatible: a 3-arg call (no principal) yields exactly
 *  the pre-S5 path, so the backend/CLI stage mint is byte-identical.
 *  @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path.
 *  Use {@link tenantAppSpacePath}. Removed at the Phase 4 cutover. */
export declare const appSpacePath: (uid: string, appKey: string, spaceId: string, qualifyingPrincipal?: string) => DocPath;
/** The sub-collection under `apps/{appKey}` that holds one consent doc per qualifying
 *  named principal (R3-692). */
export declare const CONSENTS_COLLECTION = "consents";
/** Thrown when a consent principal is not one Firestore path segment. Carries a
 *  machine `code` so a caller can map it to its own error vocabulary. */
export declare class InvalidPrincipalSegmentError extends Error {
    readonly code = "invalid-principal";
    constructor(principal: unknown, why: string);
}
/** Refuse a principal that is not exactly one path segment — the chokepoint every
 *  consent path builder runs on its principal (R3-692), and what the backend runs on
 *  a `principal` taken from a request body. Returns the principal so it can wrap a
 *  segment in place. */
export declare const assertPrincipalSegment: (principal: string) => string;
/** The doc that holds one (user, appKey, principal)'s net:fetch + plain-capability
 *  consent (R3-692). Pass the QUALIFYING named principal for
 *  `user-app-spaces/{uid}/apps/{appKey}/consents/{P}`; omit it (stage / legacy / none)
 *  for exactly {@link appKeyPath}. The appKey is asserted before the principal.
 *  @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path.
 *  Use {@link tenantAppConsentPath}. Removed at the Phase 4 cutover. */
export declare const appConsentPath: (uid: string, appKey: string, qualifyingPrincipal?: string) => DocPath;
/** @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path. Use
 *  {@link tenantUserCountPath} — the same path under `tenants/{tenantId}/`. Removed at the Phase 4 cutover. */
export declare const userCountPath: (uid: string) => DocPath;
/** @deprecated TENANCY_SPEC §10 transition window (R3-677): the bare, un-prefixed path. Use
 *  {@link tenantAppCountPath} — the same path under `tenants/{tenantId}/`. Removed at the Phase 4 cutover. */
export declare const appCountPath: (uid: string, appKey: string) => DocPath;
/** `spaces/{spaceId}/memberKeys/{uid}/published` — the collection holding one
 *  member's published public-key entries (odd segment count ⇒ collection).
 *  @deprecated TENANCY_SPEC §10 transition window (R3-677): use {@link tenantMemberKeysCollection}. */
export declare const memberKeysCollection: (spaceId: string, uid: string) => DocPath;
/** `spaces/{spaceId}/memberKeys/{uid}/published/{kid}` — one member's one
 *  published public key (even segment count ⇒ document). Write-once per `kid`
 *  (append-only, §6.1); readable by every space member.
 *  @deprecated TENANCY_SPEC §10 transition window (R3-677): use {@link tenantMemberKeysDoc}. */
export declare const memberKeysDoc: (spaceId: string, uid: string, kid: string) => DocPath;
/** The top-level collection every tenant-layout path begins with (R-TN-1). */
export declare const TENANTS_COLLECTION = "tenants";
/** The public site's tenant: the project's default identity pool, whose tokens carry no
 *  tenant claim (R-TN-3). */
export declare const PUBLIC_TENANT = "public";
/** The reserved tenant the IP-keyed pre-auth limiter buckets live under — no user, no
 *  pool, default-deny to clients (R-TN-13). A named constant, never a default. */
export declare const PLATFORM_TENANT = "_platform";
/** Thrown when a tenant id is not one Firestore path segment. */
export declare class InvalidTenantIdError extends Error {
    readonly code = "invalid-tenant-id";
    constructor(tenantId: unknown, why: string);
}
/** Refuse a tenant id that is absent or not exactly one path segment — the chokepoint
 *  every tenant builder runs first. A missing tenant is an error, never `public`. */
export declare const assertTenantId: (tenantId: string) => string;
/** The tenant a verified token belongs to: its `firebase.tenant` claim, else
 *  {@link PUBLIC_TENANT} (R-TN-3, R-TN-8 — the claim IS the tenant id). Pass the decoded
 *  ID token's claims (backend) or the signed-in user's token claims (host); one mapping
 *  here so the two cannot disagree about what absence means. */
export declare const tenantOf: (claims: {
    firebase?: object;
} | null | undefined) => string;
/** `tenants/{tenantId}` — the tenant record (§5; backend-written only, no client read). */
export declare const tenantPath: (tenantId: string) => DocPath;
/** `tenants/{tenantId}/meta/display` — what chrome needs, readable by the tenant's own
 *  signed-in users (R-TN-10). */
export declare const tenantDisplayPath: (tenantId: string) => DocPath;
/** `tenants/{tenantId}/spaces/{spaceId}` */
export declare const tenantSpacePath: (tenantId: string, spaceId: string) => DocPath;
/** `tenants/{tenantId}/spaces/{spaceId}/members/{grantee}` */
export declare const tenantMemberPath: (tenantId: string, spaceId: string, grantee: string) => DocPath;
/** `tenants/{tenantId}/user-spaces/{uid}/spaces/{spaceId}` */
export declare const tenantUserSpacePath: (tenantId: string, uid: string, spaceId: string) => DocPath;
/** `tenants/{tenantId}/user-app-spaces/{uid}/apps/{appKey}` */
export declare const tenantAppKeyPath: (tenantId: string, uid: string, appKey: string) => DocPath;
/** `tenants/{tenantId}/user-app-spaces/{uid}/apps/{appKey}/spaces/{docId}` */
export declare const tenantAppSpacePath: (tenantId: string, uid: string, appKey: string, spaceId: string, qualifyingPrincipal?: string) => DocPath;
/** `tenants/{tenantId}/user-app-spaces/{uid}/apps/{appKey}[/consents/{P}]` (R3-692) */
export declare const tenantAppConsentPath: (tenantId: string, uid: string, appKey: string, qualifyingPrincipal?: string) => DocPath;
/** `tenants/{tenantId}/space-counts/{uid}` */
export declare const tenantUserCountPath: (tenantId: string, uid: string) => DocPath;
/** `tenants/{tenantId}/space-counts/{uid}/apps/{appKey}` */
export declare const tenantAppCountPath: (tenantId: string, uid: string, appKey: string) => DocPath;
/** `tenants/{tenantId}/spaces/{spaceId}/memberKeys/{uid}/published` */
export declare const tenantMemberKeysCollection: (tenantId: string, spaceId: string, uid: string) => DocPath;
/** `tenants/{tenantId}/spaces/{spaceId}/memberKeys/{uid}/published/{kid}` */
export declare const tenantMemberKeysDoc: (tenantId: string, spaceId: string, uid: string, kid: string) => DocPath;
/** `spaces/{spaceId}` — the root doc (written WITHOUT merge). */
export declare const spaceDocFields: (params: Pick<CreateSpaceParams, "owner" | "name" | "createdInNamespace" | "createdInRepository">, s: MintSentinels) => Record<string, unknown>;
/** `spaces/{spaceId}/members/{user:owner}` — the owner membership (no merge). */
export declare const ownerMemberFields: (s: MintSentinels) => Record<string, unknown>;
/** `user-spaces/{owner}/spaces/{spaceId}` — EFFECTIVE access (no merge). */
export declare const ownerUserSpaceFields: (params: Pick<CreateSpaceParams, "owner" | "name">) => Record<string, unknown>;
/** `space-counts/{uid}` — per-user owned counter (merge). */
export declare const userCountFields: (s: MintSentinels) => Record<string, unknown>;
/** `space-counts/{uid}/apps/{appKey}` — per-app created counter (merge). */
export declare const appCountFields: (s: MintSentinels) => Record<string, unknown>;
/** `user-app-spaces/{uid}/apps/{appKey}` — the enumerable app-key marker doc
 *  touched when a grant is written (merge). */
export declare const appKeyTouchFields: (s: MintSentinels) => Record<string, unknown>;
/** `user-app-spaces/{uid}/apps/{appKey}/spaces/{spaceId}` — the durable §8.7
 *  grant doc (merge). `mintPath` defaults to `interactive`; `grantedAt`/`lastUsedAt`
 *  drive the §8.15 90-day-unused expiry. */
export declare const appSpaceGrantFields: (params: Pick<GrantSpaceParams, "name" | "subtree" | "mode" | "rules" | "declaredUri" | "mintPath" | "parentGrantId" | "principal">, s: MintSentinels) => Record<string, unknown>;
/** Union net:fetch host rules by origin (incoming wins) — the "consent
 *  accumulates" merge both adapters apply before writing the host set. */
export declare const mergeNetFetchHosts: (existing: readonly NetFetchHost[], incoming: readonly NetFetchHost[]) => NetFetchHost[];
/** `user-app-spaces/{uid}/apps/{appKey}` — the net:fetch host grant (merge).
 *  `hadGrantedAt` is whether the doc already carried a `netFetchGrantedAt` (so the
 *  grant time is stamped ONCE, on first mint, and `netFetchLastUsedAt` refreshes
 *  on every (re-)consent). */
export declare const netFetchGrantFields: (mergedHosts: readonly NetFetchHost[], hadGrantedAt: boolean, s: MintSentinels) => Record<string, unknown>;
/** Union granted PLAIN app-scoped capability names (set semantics; sorted for a
 *  stable, byte-faithful document) — the "consent accumulates" merge for the
 *  R3-233 capability grant, mirroring {@link mergeNetFetchHosts}. */
export declare const mergeCapabilities: (existing: readonly string[], incoming: readonly string[]) => string[];
/** `user-app-spaces/{uid}/apps/{appKey}` — the durable granted PLAIN app-scoped
 *  capability set (merge), R3-233. Lives on the SAME appKey doc as the net:fetch
 *  grant so one read (`getAppGrantDoc`) yields both. `capabilitiesGrantedAt` is
 *  stamped ONCE (first mint); `capabilitiesLastUsedAt` refreshes on every
 *  (re-)consent — the §8.15 90-day-unused expiry clock, identical to net:fetch. */
export declare const appCapabilitiesGrantFields: (mergedCaps: readonly string[], hadGrantedAt: boolean, s: MintSentinels) => Record<string, unknown>;
