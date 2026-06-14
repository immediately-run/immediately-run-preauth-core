// M1 — programmatic / policy pre-authorization, hostile-policy property harness
// (UI_AS_APPS_SPEC §8.15 "M1", §8.9 target check; R3-51). Ported from site-main's
// `src/editor/adversarial/m1PreAuth.adversarial.test.ts` so the security PROPERTY
// an over-broad policy cannot break travels WITH the extracted gate: a pre-auth
// that names a BROAD-ELEVATED capability for a URL-loaded `appKey` is REFUSED and
// NOT ONE durable grant is minted — the §8.9 clamp is the chokepoint, the store
// is never touched on rejection.

import { InMemoryMintStore } from './inMemoryMintStore';
import { applyPreAuth } from '../src/m1PreAuth';
import type { NetFetchHost } from '../src/port';

const UID = 'u-policy';
// A URL-loaded (previewed) app — NOT a pinned first-party region. The §8.9 target
// check is exactly what bounds what a policy may pre-authorize for such an appKey.
const APP_KEY = 'github:acme/headless-runner';
const host = (origin: string): NetFetchHost => ({ origin });

const MINT_METHODS = ['grantSpaceToApp', 'grantNetFetchHosts', 'createSpace'];
const mintCalls = (store: InMemoryMintStore) =>
  store.calls.filter((c) => MINT_METHODS.includes(c.method));

describe('M1 §8.9 target check — hostile policy', () => {
  it('REFUSES a broad-elevated cap for a URL-loaded appKey and mints nothing', async () => {
    const store = new InMemoryMintStore();
    const res = await applyPreAuth(store, UID, APP_KEY, {
      capabilities: ['spaces:user'], // broad-elevated — region-binding-only
      mounts: [],
      netFetchHosts: [],
    });
    expect(res.ok).toBe(false);
    expect(res.refused).toEqual([{ capability: 'spaces:user', reason: 'broad-elevated' }]);
    // Gate-is-the-chokepoint: not one mint touched the store.
    expect(mintCalls(store)).toEqual([]);
    expect(store.listGrants(UID)).toEqual([]);
    expect(store.getNetFetchHosts(UID, APP_KEY)).toEqual([]);
  });

  it('all-or-nothing: a broad-elevated cap bundled with a legit net:fetch host drops BOTH', async () => {
    const store = new InMemoryMintStore();
    const res = await applyPreAuth(store, UID, APP_KEY, {
      capabilities: ['net:fetch', 'contribute:direct'], // grantable + broad-elevated
      mounts: [],
      netFetchHosts: [host('https://api.example.com')],
    });
    expect(res.ok).toBe(false);
    expect(res.refused).toEqual([{ capability: 'contribute:direct', reason: 'broad-elevated' }]);
    // The legitimately-grantable host is NOT minted — the policy is rejected whole.
    expect(mintCalls(store)).toEqual([]);
    expect(store.getNetFetchHosts(UID, APP_KEY)).toEqual([]);
  });

  it('REFUSES an unknown capability fail-closed (no oracle, no mint)', async () => {
    const store = new InMemoryMintStore();
    const res = await applyPreAuth(store, UID, APP_KEY, {
      capabilities: ['totally:made-up'],
      mounts: [],
      netFetchHosts: [host('https://api.example.com')],
    });
    expect(res.ok).toBe(false);
    expect(res.refused).toEqual([{ capability: 'totally:made-up', reason: 'unknown' }]);
    expect(mintCalls(store)).toEqual([]);
  });
});

describe('M1 — a clean app-scoped pre-auth lands durable grants with policy provenance', () => {
  it('mints exactly the requested host + mount, stamped policy', async () => {
    const store = new InMemoryMintStore();
    const res = await applyPreAuth(store, UID, APP_KEY, {
      capabilities: ['net:fetch'],
      mounts: [{ uri: 'cache', mode: 'rw', kind: 'create', name: 'cache' }],
      netFetchHosts: [host('https://api.example.com')],
    });
    expect(res.ok).toBe(true);
    expect(res.refused).toEqual([]);
    expect(store.getNetFetchHosts(UID, APP_KEY)).toEqual([host('https://api.example.com')]);
    const grants = store.listGrants(UID);
    expect(grants).toHaveLength(1);
    expect(grants[0].mintPath).toBe('policy');
    expect(grants[0].declaredUri).toBe('cache');
  });
});
