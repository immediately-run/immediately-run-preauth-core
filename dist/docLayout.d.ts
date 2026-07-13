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
export declare const spacePath: (spaceId: string) => DocPath;
export declare const memberPath: (spaceId: string, grantee: string) => DocPath;
export declare const userSpacePath: (uid: string, spaceId: string) => DocPath;
export declare const appKeyPath: (uid: string, appKey: string) => DocPath;
/** `user-app-spaces/{uid}/apps/{appKey}/spaces/{docId}` — the durable §8.7 grant
 *  doc. R3-98 S5: the doc-id is principal-qualified — pass the QUALIFYING named
 *  principal for `${principal}~${spaceId}`, or omit it (stage / legacy) for the
 *  bare `spaceId`. Backward-compatible: a 3-arg call (no principal) yields exactly
 *  the pre-S5 path, so the backend/CLI stage mint is byte-identical. */
export declare const appSpacePath: (uid: string, appKey: string, spaceId: string, qualifyingPrincipal?: string) => DocPath;
export declare const userCountPath: (uid: string) => DocPath;
export declare const appCountPath: (uid: string, appKey: string) => DocPath;
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
