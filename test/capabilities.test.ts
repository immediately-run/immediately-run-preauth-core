import {
  CAPABILITIES,
  REGISTRY_VERSION,
  BASELINE_CAPABILITIES,
  HOST_PARAMETERIZED_CAPABILITIES,
  isKnownCapability,
  isBaseline,
  isAppScoped,
  isHostParameterized,
  tierOf,
  isSupportedCapability,
} from '../src/capabilities';

// R3-233 — the plain-vs-host-parameterized split that decides which grantable
// app-scoped caps are minted as bare on/off grants vs via their host set.
describe('host-parameterized capabilities (R3-233 plain-cap mint exclusion)', () => {
  it('net:fetch is host-parameterized (granted via host set, never a bare cap)', () => {
    expect(isHostParameterized('net:fetch')).toBe(true);
    expect(HOST_PARAMETERIZED_CAPABILITIES).toContain('net:fetch');
  });
  it('task:invoke / llm:chat / contribute:self are NOT host-parameterized (plain grants)', () => {
    // These are app-scoped AND minted as bare on/off caps; task:invoke is
    // `parameterized` but bounded by the manifest, not a durable grant param.
    expect(isHostParameterized('task:invoke')).toBe(false);
    expect(isHostParameterized('llm:chat')).toBe(false);
    expect(isHostParameterized('contribute:self')).toBe(false);
    expect(isAppScoped('llm:chat')).toBe(true);
  });
});

// R3-95 (PRINCIPALS_SPEC §9 B2 / §8.9.1 / D-PRIN-4): the Session-lens mount oracle.
// These assertions lock the security-critical classification — a regression here
// would let a URL-loaded File Explorer fork receive the Session signal.
describe('mounts:registry — the first-party-only Session-lens oracle', () => {
  it('is a known capability', () => {
    expect(isKnownCapability('mounts:registry')).toBe(true);
  });

  it('is first-party-only (a fork can NEVER hold it)', () => {
    expect(tierOf('mounts:registry')).toBe('first-party-only');
    expect(isBaseline('mounts:registry')).toBe(false);
    expect(BASELINE_CAPABILITIES).not.toContain('mounts:registry');
  });

  it('is NOT app-scoped (never earnable via lazy/manifest consent)', () => {
    expect(isAppScoped('mounts:registry')).toBe(false);
  });

  it('is a read capability (gates the session-mounts channel projection)', () => {
    expect(CAPABILITIES['mounts:registry'].kind).toBe('read');
  });

  it('sits in the same tier as the other cross-app oracles', () => {
    // settings:all is the sibling "enumerate every app's X" oracle.
    expect(tierOf('mounts:registry')).toBe(tierOf('settings:all'));
    // ...and strictly above the per-app own-mounts filter it supersets.
    expect(tierOf('mounts:read')).toBe('baseline');
  });

  it('is gated behind registry version 1.5.0 (§5.11 version gate)', () => {
    // The gate's property is the capability's OWN `since`, not the current registry
    // version — those were the same number only until the next capability landed, and
    // pinning the current version here made every later addition fail a test about
    // `mounts:registry`. (R3-350 was the first to hit it.)
    expect(CAPABILITIES['mounts:registry'].since).toBe('1.5.0');
    // A host too old to know it must refuse rather than half-enforce.
    expect(isSupportedCapability('mounts:registry', '1.4.0')).toBe(false);
    expect(isSupportedCapability('mounts:registry', '1.5.0')).toBe(true);
    // …and the registry has not gone BACKWARDS past it.
    expect(isSupportedCapability('mounts:registry', REGISTRY_VERSION)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('analytics:emit — the app-analytics capability (APP_ANALYTICS_SPEC §2)', () => {
  it('is ELEVATED, not baseline — the distinction the earlier draft got wrong', () => {
    // "baseline, consented" is not a tier and not a thing. `baseline` IS the floor:
    // `buildConsent` short-circuits `tier === 'baseline'` before generating any consent
    // line, and a previewed frame is seeded with the baseline set directly. At baseline
    // this would hand every app on the platform an unconsented, unrevocable,
    // un-journalled egress capability.
    expect(tierOf('analytics:emit')).toBe('elevated');
    expect(isBaseline('analytics:emit')).toBe(false);
    expect(BASELINE_CAPABILITIES).not.toContain('analytics:emit');
  });

  it('is app-scoped — a consent-path annotation on the elevated tier, not a fourth tier', () => {
    expect(isAppScoped('analytics:emit')).toBe(true);
    // It joins the consentable set alongside the other app-earnable elevated caps.
    expect(isAppScoped('net:fetch')).toBe(true);
    expect(isAppScoped('llm:chat')).toBe(true);
  });

  it('is PARAMETERIZED, because the grant is not "may emit" but "may emit THIS vocabulary"', () => {
    // §2.1: the manifest-declared vocabulary is hashed into the grant and a changed
    // hash invalidates it. `appKey` carries no ref, so without that binding a publisher
    // could observe their aggregates and then ship an alphabet tuned to encode what
    // they now want to read, under a grant given for a different one.
    expect(CAPABILITIES['analytics:emit'].parameterized).toBe(true);
  });

  it('is gated behind registry version 1.6.0', () => {
    expect(CAPABILITIES['analytics:emit'].since).toBe('1.6.0');
    expect(isSupportedCapability('analytics:emit', '1.5.0')).toBe(false);
    expect(isSupportedCapability('analytics:emit', '1.6.0')).toBe(true);
    expect(isSupportedCapability('analytics:emit', REGISTRY_VERSION)).toBe(true);
  });

  it('is an ACTION — it writes, and there is no read counterpart at any tier', () => {
    // T-AN-6: the SDK surface is write-only. No `analytics:read` exists to be granted.
    expect(CAPABILITIES['analytics:emit'].kind).toBe('action');
    expect(Object.keys(CAPABILITIES).filter((c) => c.startsWith('analytics:'))).toEqual(['analytics:emit']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('chrome:read — the present-mode chrome state read (PRESENT_MODE_CHROME_SPEC §6)', () => {
  it('is BASELINE, alongside `formFactor:read`', () => {
    // Both are reads of the HOST's own UI state, not of anything app-foreign: the app
    // already knows it is being displayed, and "chrome is currently over you" discloses
    // nothing about the user, other apps, the filesystem, or the network.
    expect(tierOf('chrome:read')).toBe('baseline');
    expect(isBaseline('chrome:read')).toBe(true);
    expect(BASELINE_CAPABILITIES).toContain('chrome:read');
    expect(tierOf('formFactor:read')).toBe('baseline');
  });

  it('is a READ, and confers no ability to OPERATE platform chrome', () => {
    // There is no `chrome:set` counterpart at any tier — an app can observe the
    // platform surface, never drive it — so this cannot become an escalation path.
    expect(CAPABILITIES['chrome:read'].kind).toBe('read');
    expect(isKnownCapability('chrome:set')).toBe(false);
    expect(isKnownCapability('chrome:write')).toBe(false);
  });

  it('is not app-scoped and not parameterized — a baseline read is neither', () => {
    expect(isAppScoped('chrome:read')).toBe(false);
    expect(CAPABILITIES['chrome:read'].parameterized).toBeUndefined();
  });

  it('is gated behind registry version 1.7.0 (§5.11 version gate)', () => {
    expect(CAPABILITIES['chrome:read'].since).toBe('1.7.0');
    // A host too old to know it must refuse rather than half-enforce.
    expect(isSupportedCapability('chrome:read', '1.6.0')).toBe(false);
    expect(isSupportedCapability('chrome:read', '1.7.0')).toBe(true);
    // …and the registry has not gone BACKWARDS past it.
    expect(isSupportedCapability('chrome:read', REGISTRY_VERSION)).toBe(true);
  });
});
