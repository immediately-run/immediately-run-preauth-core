/** The filesystem scope a grant confers (UI_AS_APPS_SPEC §8.7). Absent fields
 *  mean whole-space, read-write. */
export type GrantMode = 'ro' | 'rw';
/** How a durable grant was minted (UI_AS_APPS_SPEC §8.15 provenance). `interactive`
 *  = the M3 consent screen; `policy` = M1 pre-authorization; `delegated` = M2
 *  attenuated delegation from a parent grant. Drives the §8.11 audit view and, for
 *  `delegated`, the revoke cascade (see `parentGrantId`). */
export type MintPath = 'interactive' | 'policy' | 'delegated';
/** A consented `net:fetch` host rule (§5.11) — structurally the registry's
 *  `FetchRule`, redefined here so this backend-agnostic port stays import-free. */
export interface NetFetchHost {
    origin: string;
    paths?: string[];
    methods?: string[];
    /** §8.15 provenance — how this host was granted (default `interactive`). For an
     *  M2-`delegated` host this is the attenuated subset of a caller's net:fetch grant. */
    mintPath?: MintPath;
    /** §8.15 — for an M2 `delegated` host, the `netFetchGrantKey` of the caller's
     *  net:fetch grant it was attenuated from; revoking that parent cascades here. */
    parentGrantId?: string;
}
/** Parameters for `MintStore.createSpace` (named, `db`-free — the adapter holds
 *  the connection). */
export interface CreateSpaceParams {
    owner: string;
    name?: string;
    /** Informational breadcrumbs only — never used for identity or access. */
    createdInNamespace?: string;
    createdInRepository?: string;
    /** Record the new space in this app's binding list for the owner (the durable
     *  app↔space link the grant scopes). No longer a slot pointer. */
    appKey?: string;
}
/** Parameters for `MintStore.grantSpaceToApp` — the durable §8.7 grant for one
 *  (app, mount): what the app may mount and how. */
export interface GrantSpaceParams {
    uid: string;
    appKey: string;
    spaceId: string;
    subtree?: string;
    mode?: GrantMode;
    name?: string;
    /** §11.4 — the declared required-mount uri this grant satisfies, so a later
     *  boot re-provisions it without re-consent (the durable slot replacement). */
    declaredUri?: string;
    /** §8.15 provenance; defaults to `interactive` when omitted. */
    mintPath?: MintPath;
    /** §8.15 — parent `grantKey` for an M2 `delegated` grant. */
    parentGrantId?: string;
}
/** Parameters for `MintStore.grantNetFetchHosts` — the per-(user, app) granted
 *  host set, the grant half of the `manifest ∩ grant` net:fetch allowlist. */
export interface GrantNetFetchParams {
    uid: string;
    appKey: string;
    hosts: readonly NetFetchHost[];
}
/**
 * The mint port: exactly the methods `mintConsentedGrants` calls. Every backend
 * (browser Firestore, admin Firestore, the in-memory test double) implements
 * these three the SAME way — serializing through the shared `docLayout` builders
 * so the documents are byte-identical regardless of which SDK wrote them.
 */
export interface MintStore {
    /** Create a new space owned by `owner`, returning its opaque generated id. */
    createSpace(params: CreateSpaceParams): Promise<string>;
    /** Record the durable §8.7 grant binding `spaceId` to `appKey` for `uid`. */
    grantSpaceToApp(params: GrantSpaceParams): Promise<void>;
    /** Union the given net:fetch hosts into the app's consented host set. */
    grantNetFetchHosts(params: GrantNetFetchParams): Promise<void>;
}
