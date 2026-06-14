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

/** Durable elevated/app-scoped grants expire after 90 days WITHOUT USE; first
 *  use after expiry re-prompts. Baseline needs no grant record, so this never
 *  touches it. */
export const GRANT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

/** A principal that can be granted access to a space. */
export const userPrincipal = (uid: string): string => `user:${uid}`;

/** Drop undefined values — Firestore rejects them. The two adapters historically
 *  each had their own copy of this; sharing it keeps the "omit absent optionals"
 *  rule identical on both sides. */
export const defined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

// --- document paths (pure, sentinel-free) -----------------------------------

export const spacePath = (spaceId: string): DocPath => ['spaces', spaceId];
export const memberPath = (spaceId: string, principal: string): DocPath => [
  'spaces',
  spaceId,
  'members',
  principal,
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
  params: Pick<GrantSpaceParams, 'name' | 'subtree' | 'mode' | 'rules' | 'declaredUri' | 'mintPath' | 'parentGrantId'>,
  s: MintSentinels,
): Record<string, unknown> =>
  defined({
    boundAt: s.serverTimestamp(),
    grantedAt: s.serverTimestamp(),
    lastUsedAt: s.serverTimestamp(),
    name: params.name,
    // Plan 12 §8.7: `rules` is authoritative; `subtree`/`mode` are kept as the
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
