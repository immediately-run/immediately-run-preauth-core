// A minimal in-memory `MintStore` double for the core's own gate/mint tests —
// the package-local analogue of site-main's adversarial-harness `InMemorySpaceStore`.
// Records every mint call (so a refusal can be proven to touch the store ZERO
// times) and keeps just enough state to read back what was minted.
//
// R3-692: every record is keyed by (uid, appKey, principal) — a consent minted
// under one principal is invisible to a read under another. The STAGE principal
// is the one exception, and it is production's rule, not a shortcut: a real
// adapter qualifies 'stage' to the bare record (site-main
// `qualifyingSpacePrincipal('stage') === undefined`), so a stage-stamped mint and
// a 0.2.0 principal-less mint live at the SAME key. R3-1019: policy mints are
// stamped 'stage', so a test that wants the stage's records passes STAGE_PRINCIPAL
// — or nothing, the same key — and what it asserts beyond the key is the RECORD's
// `principal` field ('stage' vs absent).

import {
  STAGE_PRINCIPAL,
  type CreateSpaceParams,
  type GrantAppCapabilitiesParams,
  type GrantNetFetchParams,
  type GrantSpaceParams,
  type MintStore,
  type NetFetchHost,
} from '../src/port';
import { mergeCapabilities, mergeNetFetchHosts } from '../src/docLayout';

/** The (uid, appKey, principal) record key. JSON keeps an absent principal distinct
 *  from every NAMED principal without inventing a sentinel; 'stage' qualifies to
 *  absent, exactly as the real adapters' qualifyingPrincipal rule does. */
const consentKey = (uid: string, appKey: string, principal?: string): string =>
  JSON.stringify([uid, appKey, principal === STAGE_PRINCIPAL ? null : (principal ?? null)]);

export interface MintedGrant {
  uid: string;
  appKey: string;
  spaceId: string;
  mode?: string;
  mintPath?: string;
  declaredUri?: string;
  principal?: string;
}

export class InMemoryMintStore implements MintStore {
  /** Keys every record by (uid, appKey, principal) — so it declares the marker. */
  readonly principalKeyedConsent = true as const;
  calls: { method: string; args: unknown }[] = [];
  private seq = 0;
  private grants = new Map<string, MintedGrant>();
  private netFetch = new Map<string, NetFetchHost[]>();
  private capabilities = new Map<string, string[]>();

  async createSpace(params: CreateSpaceParams): Promise<string> {
    this.calls.push({ method: 'createSpace', args: params });
    return `space-${++this.seq}`;
  }

  async grantSpaceToApp(params: GrantSpaceParams): Promise<void> {
    this.calls.push({ method: 'grantSpaceToApp', args: params });
    this.grants.set(`${consentKey(params.uid, params.appKey, params.principal)}#${params.spaceId}`, {
      uid: params.uid,
      appKey: params.appKey,
      spaceId: params.spaceId,
      mode: params.mode,
      mintPath: params.mintPath ?? 'interactive',
      declaredUri: params.declaredUri,
      principal: params.principal,
    });
  }

  async grantNetFetchHosts(params: GrantNetFetchParams): Promise<void> {
    this.calls.push({ method: 'grantNetFetchHosts', args: params });
    const key = consentKey(params.uid, params.appKey, params.principal);
    this.netFetch.set(key, mergeNetFetchHosts(this.netFetch.get(key) ?? [], params.hosts));
  }

  async grantAppCapabilities(params: GrantAppCapabilitiesParams): Promise<void> {
    this.calls.push({ method: 'grantAppCapabilities', args: params });
    const key = consentKey(params.uid, params.appKey, params.principal);
    this.capabilities.set(key, mergeCapabilities(this.capabilities.get(key) ?? [], params.capabilities));
  }

  // --- read helpers (test assertions only) ---------------------------------
  listGrants(uid: string): MintedGrant[] {
    return [...this.grants.values()].filter((g) => g.uid === uid);
  }

  getNetFetchHosts(uid: string, appKey: string, principal?: string): NetFetchHost[] {
    return this.netFetch.get(consentKey(uid, appKey, principal)) ?? [];
  }

  getAppCapabilities(uid: string, appKey: string, principal?: string): string[] {
    return this.capabilities.get(consentKey(uid, appKey, principal)) ?? [];
  }
}
