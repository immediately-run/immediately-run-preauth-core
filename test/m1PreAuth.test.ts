// R3-51 / M1 — the pure §8.9 target check + the policy-provenance write path
// (UI_AS_APPS_SPEC §8.15 M1, §8.9). Ported VERBATIM (modulo import paths) from
// site-main's `src/filesystem/m1PreAuth.test.ts`: extracting the gate must not
// change a single branch of its behavior.
import {
  planPreAuthCapabilities,
  isPreAuthClean,
  applyPreAuth,
  type PreAuthRefusal,
} from '../src/m1PreAuth';
import type { ConsentSelection } from '../src/bootConsent';
import type { MintStore, NetFetchHost } from '../src/port';

const host = (origin: string): NetFetchHost => ({ origin });

describe('planPreAuthCapabilities (§8.9 target check)', () => {
  it('app-scoped elevated caps are grantable (net:fetch, task:invoke, contribute:self)', () => {
    const p = planPreAuthCapabilities(['net:fetch', 'task:invoke', 'contribute:self']);
    expect(p.grantable.sort()).toEqual(['contribute:self', 'net:fetch', 'task:invoke']);
    expect(p.refused).toEqual([]);
  });

  it('baseline caps need no grant — dropped as no-ops', () => {
    const p = planPreAuthCapabilities(['theme:read', 'mounts:read', 'auth:status']);
    expect(p.baseline.sort()).toEqual(['auth:status', 'mounts:read', 'theme:read']);
    expect(p.grantable).toEqual([]);
    expect(p.refused).toEqual([]);
  });

  it('broad-elevated (non-app-scoped elevated) caps are REFUSED — region-binding-only', () => {
    const broad = ['spaces:user', 'spaces:admin', 'editor:write', 'editor:open', 'contribute:direct', 'contribute:any'];
    const p = planPreAuthCapabilities(broad);
    expect(p.grantable).toEqual([]);
    expect(p.refused.map((r) => r.capability).sort()).toEqual([...broad].sort());
    expect(p.refused.every((r) => r.reason === 'broad-elevated')).toBe(true);
  });

  it('unknown caps are refused fail-closed', () => {
    const p = planPreAuthCapabilities(['definitely:not-a-cap']);
    expect(p.refused).toEqual<PreAuthRefusal[]>([{ capability: 'definitely:not-a-cap', reason: 'unknown' }]);
  });

  it('a mixed request keeps the grantable AND surfaces every refusal (all visible)', () => {
    const p = planPreAuthCapabilities(['net:fetch', 'spaces:user', 'theme:read', 'bogus:x']);
    expect(p.grantable).toEqual(['net:fetch']);
    expect(p.baseline).toEqual(['theme:read']);
    expect(p.refused).toEqual([
      { capability: 'spaces:user', reason: 'broad-elevated' },
      { capability: 'bogus:x', reason: 'unknown' },
    ]);
    expect(isPreAuthClean(p)).toBe(false);
  });

  it('isPreAuthClean is true exactly when nothing was refused', () => {
    expect(isPreAuthClean(planPreAuthCapabilities(['net:fetch', 'theme:read']))).toBe(true);
    expect(isPreAuthClean(planPreAuthCapabilities([]))).toBe(true);
    expect(isPreAuthClean(planPreAuthCapabilities(['editor:write']))).toBe(false);
  });
});

describe('applyPreAuth (M1 write path)', () => {
  const calls: { method: string; args: unknown }[] = [];
  const fakeStore = (): MintStore => {
    calls.length = 0;
    const record =
      (method: string, result?: unknown) =>
      async (args: unknown): Promise<unknown> => {
        calls.push({ method, args });
        return result;
      };
    return {
      grantNetFetchHosts: record('grantNetFetchHosts'),
      createSpace: record('createSpace', 'space-new'),
      grantSpaceToApp: record('grantSpaceToApp'),
    } as unknown as MintStore;
  };
  const create: ConsentSelection = { uri: 'cache', mode: 'ro', kind: 'create', name: 'New' };

  it('a clean pre-auth mints mounts + hosts with POLICY provenance', async () => {
    const store = fakeStore();
    const res = await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['net:fetch', 'theme:read'],
      mounts: [create],
      netFetchHosts: [host('https://api.example.com')],
    });
    expect(res.ok).toBe(true);
    expect(res.refused).toEqual([]);
    expect(calls.map((c) => c.method)).toEqual(['grantNetFetchHosts', 'createSpace', 'grantSpaceToApp']);
    // Provenance is `policy`, not `interactive` — the §8.11 audit shows "by policy".
    const grant = calls.find((c) => c.method === 'grantSpaceToApp')!;
    expect((grant.args as { mintPath: string }).mintPath).toBe('policy');
  });

  it('a request naming a broad-elevated cap mints NOTHING (fail-closed, all-or-nothing)', async () => {
    const store = fakeStore();
    const res = await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['net:fetch', 'editor:write'], // one grantable, one broad-elevated
      mounts: [create],
      netFetchHosts: [host('https://api.example.com')],
    });
    expect(res.ok).toBe(false);
    expect(res.refused).toEqual([{ capability: 'editor:write', reason: 'broad-elevated' }]);
    expect(res.mint).toBeUndefined();
    // The store was never touched — not even for the legitimately-grantable host.
    expect(calls).toEqual([]);
  });
});
