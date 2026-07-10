// The byte-faithful wire layout (§0.1) — these assertions pin the EXACT paths and
// field objects every grant-mint write produces. Both `FirestoreSpaceStore` (Web
// SDK) and the backend `AdminMintStore` (admin SDK) build their writes from these
// helpers, so a change that would make the two adapters disagree must change a
// value asserted here first. The sentinels are stubbed with stable markers so the
// shape (not a live Firestore value) is what's compared.

import {
  appCountFields,
  appCountPath,
  appKeyPath,
  appKeyTouchFields,
  appSpaceGrantFields,
  appSpacePath,
  appCapabilitiesGrantFields,
  defined,
  GRANT_EXPIRY_MS,
  granteeId,
  grantKey,
  memberPath,
  mergeCapabilities,
  mergeNetFetchHosts,
  netFetchGrantFields,
  ownerMemberFields,
  ownerUserSpaceFields,
  spaceDocFields,
  spacePath,
  userCountFields,
  userCountPath,
  userSpacePath,
  type MintSentinels,
} from '../src/docLayout';

const TS = '<<server-timestamp>>';
const sentinels: MintSentinels = {
  serverTimestamp: () => TS,
  increment: (n: number) => ({ __increment: n }),
};

describe('docLayout — paths', () => {
  it('lays out the documented collection/doc paths', () => {
    expect(spacePath('s1')).toEqual(['spaces', 's1']);
    expect(memberPath('s1', granteeId('u1'))).toEqual(['spaces', 's1', 'members', 'user:u1']);
    expect(userSpacePath('u1', 's1')).toEqual(['user-spaces', 'u1', 'spaces', 's1']);
    expect(appKeyPath('u1', 'app')).toEqual(['user-app-spaces', 'u1', 'apps', 'app']);
    expect(appSpacePath('u1', 'app', 's1')).toEqual([
      'user-app-spaces', 'u1', 'apps', 'app', 'spaces', 's1',
    ]);
    expect(userCountPath('u1')).toEqual(['space-counts', 'u1']);
    expect(appCountPath('u1', 'app')).toEqual(['space-counts', 'u1', 'apps', 'app']);
  });
});

describe('docLayout — field objects', () => {
  it('spaceDocFields omits absent optionals (defined())', () => {
    expect(spaceDocFields({ owner: 'u1' }, sentinels)).toEqual({ owner: 'u1', createdAt: TS });
    expect(spaceDocFields({ owner: 'u1', name: 'n', createdInNamespace: 'ns' }, sentinels)).toEqual({
      owner: 'u1',
      createdAt: TS,
      name: 'n',
      createdInNamespace: 'ns',
    });
  });

  it('owner member + user-space docs', () => {
    expect(ownerMemberFields(sentinels)).toEqual({ role: 'owner', addedAt: TS });
    expect(ownerUserSpaceFields({ owner: 'u1', name: 'n' })).toEqual({ role: 'owner', owner: 'u1', name: 'n' });
    expect(ownerUserSpaceFields({ owner: 'u1' })).toEqual({ role: 'owner', owner: 'u1' });
  });

  it('counters use the increment sentinel', () => {
    expect(userCountFields(sentinels)).toEqual({ owned: { __increment: 1 } });
    expect(appCountFields(sentinels)).toEqual({ created: { __increment: 1 } });
  });

  it('appSpaceGrantFields stamps the three timestamps + mintPath default + derived rules', () => {
    expect(appKeyTouchFields(sentinels)).toEqual({ touchedAt: TS });
    // No `rules` given → derive a single-rule set from the legacy subtree/mode
    // (UI_AS_APPS_SPEC §8.7), so the backend single-scope mint path still emits `rules`.
    expect(appSpaceGrantFields({ mode: 'rw', declaredUri: 'cache' }, sentinels)).toEqual({
      boundAt: TS,
      grantedAt: TS,
      lastUsedAt: TS,
      mode: 'rw',
      rules: [{ subtree: '/', mode: 'rw' }],
      declaredUri: 'cache',
      mintPath: 'interactive',
    });
    // A subtree-scoped legacy grant derives the matching single rule.
    expect(appSpaceGrantFields({ subtree: '/docs', mode: 'ro' }, sentinels).rules).toEqual([
      { subtree: '/docs', mode: 'ro' },
    ]);
    // An explicit rule-SET is authoritative (site-main's merged append passes it).
    expect(
      appSpaceGrantFields(
        { rules: [{ subtree: '/a', mode: 'rw' }, { subtree: '/b/c.mdx', mode: 'ro' }] },
        sentinels,
      ).rules,
    ).toEqual([{ subtree: '/a', mode: 'rw' }, { subtree: '/b/c.mdx', mode: 'ro' }]);
    // explicit policy provenance is preserved
    expect(appSpaceGrantFields({ mode: 'ro', mintPath: 'policy' }, sentinels).mintPath).toBe('policy');
  });

  it('net:fetch grant stamps grantedAt only on first mint', () => {
    const hosts = [{ origin: 'https://a.example' }];
    expect(netFetchGrantFields(hosts, false, sentinels)).toEqual({
      netFetch: hosts,
      netFetchGrantedAt: TS,
      netFetchLastUsedAt: TS,
    });
    // re-grant: grantedAt is NOT re-stamped (omitted by defined())
    expect(netFetchGrantFields(hosts, true, sentinels)).toEqual({
      netFetch: hosts,
      netFetchLastUsedAt: TS,
    });
  });

  it('mergeNetFetchHosts unions by origin, incoming wins', () => {
    const existing = [{ origin: 'https://a.example' }, { origin: 'https://b.example', methods: ['GET'] }];
    const incoming = [{ origin: 'https://b.example', methods: ['POST'] }, { origin: 'https://c.example' }];
    expect(mergeNetFetchHosts(existing, incoming)).toEqual([
      { origin: 'https://a.example' },
      { origin: 'https://b.example', methods: ['POST'] },
      { origin: 'https://c.example' },
    ]);
  });
});

describe('docLayout — plain capability grant (R3-233)', () => {
  it('mergeCapabilities unions + sorts (set semantics; byte-stable)', () => {
    expect(mergeCapabilities(['llm:chat'], ['task:invoke', 'llm:chat'])).toEqual(['llm:chat', 'task:invoke']);
    expect(mergeCapabilities([], [])).toEqual([]);
  });
  it('appCapabilitiesGrantFields stamps grantedAt once, lastUsedAt always', () => {
    // First mint (no prior grantedAt): both stamps present.
    expect(appCapabilitiesGrantFields(['llm:chat', 'task:invoke'], false, sentinels)).toEqual({
      grantedCapabilities: ['llm:chat', 'task:invoke'],
      capabilitiesGrantedAt: TS,
      capabilitiesLastUsedAt: TS,
    });
    // Re-consent (already had grantedAt): only lastUsedAt refreshes (grantedAt omitted).
    expect(appCapabilitiesGrantFields(['llm:chat'], true, sentinels)).toEqual({
      grantedCapabilities: ['llm:chat'],
      capabilitiesLastUsedAt: TS,
    });
  });
});

describe('docLayout — keys + constants', () => {
  it('grantKey joins appKey::spaceId', () => {
    expect(grantKey('github:acme/app', 's1')).toBe('github:acme/app::s1');
  });
  it('GRANT_EXPIRY_MS is 90 days', () => {
    expect(GRANT_EXPIRY_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
  it('defined() drops only undefined (keeps null/0/empty-string)', () => {
    expect(defined({ a: 1, b: undefined, c: 0, d: '', e: null })).toEqual({ a: 1, c: 0, d: '', e: null });
  });
});
