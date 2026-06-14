// A minimal in-memory `MintStore` double for the core's own gate/mint tests —
// the package-local analogue of site-main's adversarial-harness `InMemorySpaceStore`.
// Records every mint call (so a refusal can be proven to touch the store ZERO
// times) and keeps just enough state to read back what was minted.

import type {
  CreateSpaceParams,
  GrantNetFetchParams,
  GrantSpaceParams,
  MintStore,
  NetFetchHost,
} from '../src/port';
import { grantKey, mergeNetFetchHosts } from '../src/docLayout';

export interface MintedGrant {
  uid: string;
  appKey: string;
  spaceId: string;
  mode?: string;
  mintPath?: string;
  declaredUri?: string;
}

export class InMemoryMintStore implements MintStore {
  calls: { method: string; args: unknown }[] = [];
  private seq = 0;
  private grants = new Map<string, MintedGrant>();
  private netFetch = new Map<string, NetFetchHost[]>();

  async createSpace(params: CreateSpaceParams): Promise<string> {
    this.calls.push({ method: 'createSpace', args: params });
    return `space-${++this.seq}`;
  }

  async grantSpaceToApp(params: GrantSpaceParams): Promise<void> {
    this.calls.push({ method: 'grantSpaceToApp', args: params });
    this.grants.set(grantKey(params.appKey, params.spaceId), {
      uid: params.uid,
      appKey: params.appKey,
      spaceId: params.spaceId,
      mode: params.mode,
      mintPath: params.mintPath ?? 'interactive',
      declaredUri: params.declaredUri,
    });
  }

  async grantNetFetchHosts(params: GrantNetFetchParams): Promise<void> {
    this.calls.push({ method: 'grantNetFetchHosts', args: params });
    const key = grantKey(params.appKey, params.uid);
    this.netFetch.set(key, mergeNetFetchHosts(this.netFetch.get(key) ?? [], params.hosts));
  }

  // --- read helpers (test assertions only) ---------------------------------
  listGrants(uid: string): MintedGrant[] {
    return [...this.grants.values()].filter((g) => g.uid === uid);
  }

  getNetFetchHosts(uid: string, appKey: string): NetFetchHost[] {
    return this.netFetch.get(grantKey(appKey, uid)) ?? [];
  }
}
