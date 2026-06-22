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
/** @deprecated use {@link granteeId}. Kept as an alias for the `userPrincipal →
 *  granteeId` migration (the SDK + site-main + backend RENAME-1 track); removed once
 *  consumers migrate. */
export declare const userPrincipal: (uid: string) => string;
/** Drop undefined values — Firestore rejects them. The two adapters historically
 *  each had their own copy of this; sharing it keeps the "omit absent optionals"
 *  rule identical on both sides. */
export declare const defined: <T extends Record<string, unknown>>(obj: T) => T;
export declare const spacePath: (spaceId: string) => DocPath;
export declare const memberPath: (spaceId: string, grantee: string) => DocPath;
export declare const userSpacePath: (uid: string, spaceId: string) => DocPath;
export declare const appKeyPath: (uid: string, appKey: string) => DocPath;
export declare const appSpacePath: (uid: string, appKey: string, spaceId: string) => DocPath;
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
export declare const appSpaceGrantFields: (params: Pick<GrantSpaceParams, "name" | "subtree" | "mode" | "rules" | "declaredUri" | "mintPath" | "parentGrantId">, s: MintSentinels) => Record<string, unknown>;
/** Union net:fetch host rules by origin (incoming wins) — the "consent
 *  accumulates" merge both adapters apply before writing the host set. */
export declare const mergeNetFetchHosts: (existing: readonly NetFetchHost[], incoming: readonly NetFetchHost[]) => NetFetchHost[];
/** `user-app-spaces/{uid}/apps/{appKey}` — the net:fetch host grant (merge).
 *  `hadGrantedAt` is whether the doc already carried a `netFetchGrantedAt` (so the
 *  grant time is stamped ONCE, on first mint, and `netFetchLastUsedAt` refreshes
 *  on every (re-)consent). */
export declare const netFetchGrantFields: (mergedHosts: readonly NetFetchHost[], hadGrantedAt: boolean, s: MintSentinels) => Record<string, unknown>;
