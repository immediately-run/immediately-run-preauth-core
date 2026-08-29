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
import { CAPABILITIES } from '../src/capabilities';
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

  it('auth:identity is grantable — app-scoped since R3-407, earnable by consent', () => {
    const p = planPreAuthCapabilities(['auth:identity']);
    expect(p.grantable).toEqual(['auth:identity']);
    expect(p.refused).toEqual([]);
    expect(isPreAuthClean(p)).toBe(true);
  });

  // The version boundary. The minter and the consumer are routinely on DIFFERENT
  // vocabularies — the backend floats its `preauth-core` range while site-main pins
  // one — so the minter can hold a table in which `auth:identity` is app-scoped while
  // the consumer holds one in which it is region-binding-only.
  it('auth:identity is REFUSED for a host below the reclassification, not minted-then-dropped', () => {
    // Without the version check this returned `grantable: ['auth:identity']` and the
    // caller minted a durable grant the 1.11.0 consumer then discarded: dropped from
    // the frame by `resolveGrantedFrameCaps` (its `isAppScoped` is false there) and
    // omitted from the consent screen by `planMissingPlainCaps` on the same predicate.
    // The mint reported success, the app never got the capability, and no surface said
    // so — R3-233's validate-then-drop, reached across a version boundary.
    const p = planPreAuthCapabilities(['auth:identity'], '1.11.0');
    expect(p.grantable).toEqual([]);
    expect(p.refused).toEqual<PreAuthRefusal[]>([{ capability: 'auth:identity', reason: 'unsupported' }]);
    expect(isPreAuthClean(p)).toBe(false);
  });

  it('the same request is clean on a host that HAS the reclassification', () => {
    const p = planPreAuthCapabilities(['auth:identity'], '1.12.0');
    expect(p.grantable).toEqual(['auth:identity']);
    expect(p.refused).toEqual([]);
    expect(isPreAuthClean(p)).toBe(true);
  });

  it('the version check applies to every tier, matching the registry merge', () => {
    // `unsupportedCapabilities` is run over a region's whole effective set regardless
    // of tier, because "this host cannot enforce it" is prior to what tier it is. A
    // baseline cap the host is too old for would otherwise be dropped as a silent
    // no-op — the same shape of silence, one tier down.
    expect(planPreAuthCapabilities(['chrome:read'], '1.6.0').refused).toEqual<PreAuthRefusal[]>([
      { capability: 'chrome:read', reason: 'unsupported' },
    ]);
    expect(planPreAuthCapabilities(['chrome:read'], '1.7.0').baseline).toEqual(['chrome:read']);
  });

  it('omitting hostVersion means THIS build — every existing caller is unaffected', () => {
    // At the default every known capability is supported by construction, so the new
    // branch can never fire for a caller that does not opt in: the only refusals left
    // are the two §8.9 has always issued. (`broad-elevated` rows still refuse — that
    // is the target check doing its original job, not the version gate.)
    for (const cap of Object.keys(CAPABILITIES)) {
      const reasons = planPreAuthCapabilities([cap]).refused.map((r) => r.reason);
      expect(reasons).not.toContain('unsupported');
    }
  });

  it('device:geolocation is grantable — app-scoped since R3-424, earnable by consent', () => {
    // §8.9 accepts it on the ordinary app-scoped path: no special case, no second
    // gate. The BROWSER_CAPABILITIES design's "powerbox consent, persisted on
    // (app, principal)" IS this path.
    const p = planPreAuthCapabilities(['device:geolocation']);
    expect(p.grantable).toEqual(['device:geolocation']);
    expect(p.refused).toEqual([]);
    expect(isPreAuthClean(p)).toBe(true);
  });

  it('device:camera / device:microphone are grantable — app-scoped since R3-425', () => {
    // §8.9 accepts them on the ordinary app-scoped path, together, with no special
    // case for "this one turns on a sensor". The powerbox consent IS this path; the
    // extra machinery capture needs (the host-drawn surface, the chrome indicator)
    // hangs off the HOST, not off a second admission rule here.
    const p = planPreAuthCapabilities(['device:camera', 'device:microphone']);
    expect(p.grantable).toEqual(['device:camera', 'device:microphone']);
    expect(p.refused).toEqual([]);
    expect(isPreAuthClean(p)).toBe(true);
  });

  it('device:clipboard is refused as UNKNOWN — it is not in the vocabulary', () => {
    // The fail-closed half of leaving it out: a binding that asks for the proposed
    // capability is refused by name rather than mounting with a clipboard that
    // nothing enforces.
    const p = planPreAuthCapabilities(['device:clipboard']);
    expect(p.grantable).toEqual([]);
    expect(p.refused).toEqual<PreAuthRefusal[]>([{ capability: 'device:clipboard', reason: 'unknown' }]);
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
      grantAppCapabilities: record('grantAppCapabilities'),
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

  // R3-233: the plain app-scoped caps that used to be validated-then-DROPPED.
  it('MINTS plain app-scoped caps (task:invoke, llm:chat) — no longer validated-and-dropped', async () => {
    const store = fakeStore();
    const res = await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['task:invoke', 'llm:chat'],
      mounts: [],
      netFetchHosts: [],
    });
    expect(res.ok).toBe(true);
    expect(res.mint?.capabilitiesOk).toBe(true);
    const capCall = calls.find((c) => c.method === 'grantAppCapabilities');
    expect(capCall).toBeDefined();
    expect((capCall!.args as { capabilities: string[] }).capabilities.sort()).toEqual(['llm:chat', 'task:invoke']);
    // Minted at POLICY provenance (the §8.11 audit shows "by policy").
    expect((capCall!.args as { mintPath: string }).mintPath).toBe('policy');
  });

  // R3-407: identity joins the plain app-scoped mint like any other consentable.
  it('MINTS auth:identity as a plain on/off grant through the one mint path', async () => {
    const store = fakeStore();
    const res = await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['auth:identity'],
      mounts: [],
      netFetchHosts: [],
    });
    expect(res.ok).toBe(true);
    expect(res.refused).toEqual([]);
    expect(res.mint?.capabilitiesOk).toBe(true);
    const capCall = calls.find((c) => c.method === 'grantAppCapabilities')!;
    expect((capCall.args as { capabilities: string[] }).capabilities).toEqual(['auth:identity']);
  });

  // R3-424: the device capability mints through the SAME plain path — a durable
  // on/off grant on (app, principal), revocable from the same surfaces.
  it('MINTS device:geolocation as a plain on/off grant through the one mint path', async () => {
    const store = fakeStore();
    const res = await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['device:geolocation'],
      mounts: [],
      netFetchHosts: [],
    });
    expect(res.ok).toBe(true);
    expect(res.refused).toEqual([]);
    expect(res.mint?.capabilitiesOk).toBe(true);
    const capCall = calls.find((c) => c.method === 'grantAppCapabilities')!;
    expect((capCall.args as { capabilities: string[] }).capabilities).toEqual(['device:geolocation']);
  });

  // R3-425: the capture devices mint through the SAME plain path — durable on/off
  // grants on (app, principal), revocable from the same surfaces. No grade is minted
  // with them, because the grade is not in the capability.
  it('MINTS device:camera and device:microphone as plain on/off grants', async () => {
    const store = fakeStore();
    const res = await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['device:camera', 'device:microphone'],
      mounts: [],
      netFetchHosts: [],
    });
    expect(res.ok).toBe(true);
    expect(res.refused).toEqual([]);
    expect(res.mint?.capabilitiesOk).toBe(true);
    const capCall = calls.find((c) => c.method === 'grantAppCapabilities')!;
    expect((capCall.args as { capabilities: string[] }).capabilities).toEqual(['device:camera', 'device:microphone']);
  });

  it('EXCLUDES net:fetch from the plain-cap mint (host-parameterized → hosts only, never a bare grant)', async () => {
    const store = fakeStore();
    await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['net:fetch', 'llm:chat'],
      mounts: [],
      netFetchHosts: [host('https://api.example.com')],
    });
    // net:fetch is granted as its host set…
    expect(calls.some((c) => c.method === 'grantNetFetchHosts')).toBe(true);
    // …and NEVER as a bare on/off capability (that would be unbounded).
    const capCall = calls.find((c) => c.method === 'grantAppCapabilities')!;
    const mintedCaps = (capCall.args as { capabilities: string[] }).capabilities;
    expect(mintedCaps).toEqual(['llm:chat']);
    expect(mintedCaps).not.toContain('net:fetch');
  });

  it('a clean pre-auth of ONLY net:fetch mints no plain caps (grantAppCapabilities untouched)', async () => {
    const store = fakeStore();
    await applyPreAuth(store, 'u1', 'app', {
      capabilities: ['net:fetch'],
      mounts: [],
      netFetchHosts: [host('https://api.example.com')],
    });
    expect(calls.some((c) => c.method === 'grantAppCapabilities')).toBe(false);
  });
});
