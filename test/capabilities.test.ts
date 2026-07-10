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
    expect(REGISTRY_VERSION).toBe('1.5.0');
    expect(CAPABILITIES['mounts:registry'].since).toBe('1.5.0');
    // A host too old to know it must refuse rather than half-enforce.
    expect(isSupportedCapability('mounts:registry', '1.4.0')).toBe(false);
    expect(isSupportedCapability('mounts:registry', '1.5.0')).toBe(true);
  });
});
