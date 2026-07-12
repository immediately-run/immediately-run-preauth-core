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
export const grantKey = (appKey: string, spaceId: string): string =>
  `${appKey}::${spaceId}`;

/** R3-98 S4 — the principal-aware grant key `(appKey, principal, spaceId)` (design
 *  05a §3.1/§3.2). Additive: {@link grantKey} is retained for the legacy 2-field
 *  form. `::` stays delimiter-safe — `appKey` uses `__`, a `spaceId` is alphanumeric,
 *  and a named principal is lowercase-dotted/hyphenated (CA-3), none containing `::`. */
export const grantKeyWithPrincipal = (
  appKey: string,
  principal: string,
  spaceId: string,
): string => `${appKey}::${principal}::${spaceId}`;

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
export const parseGrantKey = (key: string): ParsedGrantKey => {
  const parts = key.split('::');
  if (parts.length === 3) {
    return { appKey: parts[0], principal: parts[1], spaceId: parts[2] };
  }
  // Legacy 2-field, or malformed → first segment is the appKey, last the spaceId.
  return { appKey: parts[0], spaceId: parts[parts.length - 1] };
};

/** Durable elevated/app-scoped grants expire after 90 days WITHOUT USE; first
 *  use after expiry re-prompts. Baseline needs no grant record, so this never
 *  touches it. */
export const GRANT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

/** The member doc-ID for a user who can be granted access to a space: `user:<uid>`.
 *  This is a **grantee** (a space member — the `uid`/`gid` of `setSpaceRole`), NOT the
 *  authority-context Principal (core_concepts §4 reserved-word; SPEC_CODE_DEBT §7.1
 *  RENAME-1). The stored Firestore path segment is a doc-ID, not a field literally
 *  named `principal`, so this rename is code-symbol-only — no data migration. */
export const granteeId = (uid: string): string => `user:${uid}`;

/** Drop undefined values — Firestore rejects them. The two adapters historically
 *  each had their own copy of this; sharing it keeps the "omit absent optionals"
 *  rule identical on both sides. */
export const defined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

// --- document paths (pure, sentinel-free) -----------------------------------

export const spacePath = (spaceId: string): DocPath => ['spaces', spaceId];
export const memberPath = (spaceId: string, grantee: string): DocPath => [
  'spaces',
  spaceId,
  'members',
  grantee,
];
export const userSpacePath = (uid: string, spaceId: string): DocPath => [
  'user-spaces',
  uid,
  'spaces',
  spaceId,
];
export const appKeyPath = (uid: string, appKey: string): DocPath => [
  'user-app-spaces',
  uid,
  'apps',
  appKey,
];
export const appSpacePath = (uid: string, appKey: string, spaceId: string): DocPath => [
  'user-app-spaces',
  uid,
  'apps',
  appKey,
  'spaces',
  spaceId,
];
export const userCountPath = (uid: string): DocPath => ['space-counts', uid];
export const appCountPath = (uid: string, appKey: string): DocPath => [
  'space-counts',
  uid,
  'apps',
  appKey,
];

// --- field objects (inject the timestamp/increment sentinels) ---------------

/** `spaces/{spaceId}` — the root doc (written WITHOUT merge). */
export const spaceDocFields = (
  params: Pick<CreateSpaceParams, 'owner' | 'name' | 'createdInNamespace' | 'createdInRepository'>,
  s: MintSentinels,
): Record<string, unknown> =>
  defined({
    owner: params.owner,
    createdAt: s.serverTimestamp(),
    name: params.name,
    createdInNamespace: params.createdInNamespace,
    createdInRepository: params.createdInRepository,
  });

/** `spaces/{spaceId}/members/{user:owner}` — the owner membership (no merge). */
export const ownerMemberFields = (s: MintSentinels): Record<string, unknown> => ({
  role: 'owner',
  addedAt: s.serverTimestamp(),
});

/** `user-spaces/{owner}/spaces/{spaceId}` — EFFECTIVE access (no merge). */
export const ownerUserSpaceFields = (
  params: Pick<CreateSpaceParams, 'owner' | 'name'>,
): Record<string, unknown> =>
  defined({ role: 'owner', name: params.name, owner: params.owner });

/** `space-counts/{uid}` — per-user owned counter (merge). */
export const userCountFields = (s: MintSentinels): Record<string, unknown> => ({
  owned: s.increment(1),
});

/** `space-counts/{uid}/apps/{appKey}` — per-app created counter (merge). */
export const appCountFields = (s: MintSentinels): Record<string, unknown> => ({
  created: s.increment(1),
});

/** `user-app-spaces/{uid}/apps/{appKey}` — the enumerable app-key marker doc
 *  touched when a grant is written (merge). */
export const appKeyTouchFields = (s: MintSentinels): Record<string, unknown> => ({
  touchedAt: s.serverTimestamp(),
});

/** `user-app-spaces/{uid}/apps/{appKey}/spaces/{spaceId}` — the durable §8.7
 *  grant doc (merge). `mintPath` defaults to `interactive`; `grantedAt`/`lastUsedAt`
 *  drive the §8.15 90-day-unused expiry. */
export const appSpaceGrantFields = (
  params: Pick<GrantSpaceParams, 'name' | 'subtree' | 'mode' | 'rules' | 'declaredUri' | 'mintPath' | 'parentGrantId' | 'principal'>,
  s: MintSentinels,
): Record<string, unknown> =>
  defined({
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
    rules:
      params.rules && params.rules.length > 0
        ? params.rules
        : [{ subtree: params.subtree ?? '/', mode: params.mode ?? 'rw' }],
    declaredUri: params.declaredUri,
    mintPath: params.mintPath ?? 'interactive',
    parentGrantId: params.parentGrantId,
  });

/** Union net:fetch host rules by origin (incoming wins) — the "consent
 *  accumulates" merge both adapters apply before writing the host set. */
export const mergeNetFetchHosts = (
  existing: readonly NetFetchHost[],
  incoming: readonly NetFetchHost[],
): NetFetchHost[] => {
  const byOrigin = new Map<string, NetFetchHost>();
  for (const h of existing) byOrigin.set(h.origin, h);
  for (const h of incoming) byOrigin.set(h.origin, h);
  return [...byOrigin.values()];
};

/** `user-app-spaces/{uid}/apps/{appKey}` — the net:fetch host grant (merge).
 *  `hadGrantedAt` is whether the doc already carried a `netFetchGrantedAt` (so the
 *  grant time is stamped ONCE, on first mint, and `netFetchLastUsedAt` refreshes
 *  on every (re-)consent). */
export const netFetchGrantFields = (
  mergedHosts: readonly NetFetchHost[],
  hadGrantedAt: boolean,
  s: MintSentinels,
): Record<string, unknown> =>
  defined({
    netFetch: [...mergedHosts],
    netFetchGrantedAt: hadGrantedAt ? undefined : s.serverTimestamp(),
    netFetchLastUsedAt: s.serverTimestamp(),
  });

/** Union granted PLAIN app-scoped capability names (set semantics; sorted for a
 *  stable, byte-faithful document) — the "consent accumulates" merge for the
 *  R3-233 capability grant, mirroring {@link mergeNetFetchHosts}. */
export const mergeCapabilities = (
  existing: readonly string[],
  incoming: readonly string[],
): string[] => [...new Set([...existing, ...incoming])].sort();

/** `user-app-spaces/{uid}/apps/{appKey}` — the durable granted PLAIN app-scoped
 *  capability set (merge), R3-233. Lives on the SAME appKey doc as the net:fetch
 *  grant so one read (`getAppGrantDoc`) yields both. `capabilitiesGrantedAt` is
 *  stamped ONCE (first mint); `capabilitiesLastUsedAt` refreshes on every
 *  (re-)consent — the §8.15 90-day-unused expiry clock, identical to net:fetch. */
export const appCapabilitiesGrantFields = (
  mergedCaps: readonly string[],
  hadGrantedAt: boolean,
  s: MintSentinels,
): Record<string, unknown> =>
  defined({
    grantedCapabilities: [...mergedCaps],
    capabilitiesGrantedAt: hadGrantedAt ? undefined : s.serverTimestamp(),
    capabilitiesLastUsedAt: s.serverTimestamp(),
  });
