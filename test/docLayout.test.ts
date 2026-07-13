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
  GRANT_DOCID_DELIM,
  GRANT_EXPIRY_MS,
  grantDocId,
  granteeId,
  grantKey,
  grantKeyWithPrincipal,
  parseGrantDocId,
  parseGrantKey,
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

  // R3-98 S5 — the principal-qualified doc-id (design 05a §3.1 step 2).
  it('appSpacePath qualifies the doc-id for a named principal, stays bare without one', () => {
    // No principal (stage/legacy/backend) → byte-identical to the pre-S5 path.
    expect(appSpacePath('u1', 'app', 's1')).toEqual([
      'user-app-spaces', 'u1', 'apps', 'app', 'spaces', 's1',
    ]);
    // A qualifying named principal → `${principal}~${spaceId}` last segment.
    expect(appSpacePath('u1', 'app', 's1', 'editor.file-explorer')).toEqual([
      'user-app-spaces', 'u1', 'apps', 'app', 'spaces', 'editor.file-explorer~s1',
    ]);
  });
});

describe('docLayout — principal-qualified grant doc-id (R3-98 S5)', () => {
  it('grantDocId qualifies iff a principal is given (grammar only)', () => {
    expect(grantDocId('s1')).toBe('s1'); // stage/legacy → bare
    expect(grantDocId('s1', undefined)).toBe('s1');
    expect(grantDocId('s1', '')).toBe('s1'); // falsy ⇒ treated as un-qualified
    expect(grantDocId('s1', 'editor.commander')).toBe('editor.commander~s1');
    expect(GRANT_DOCID_DELIM).toBe('~');
  });

  it('parseGrantDocId round-trips a qualified doc-id', () => {
    expect(parseGrantDocId('editor.file-explorer~7f3a')).toEqual({
      principal: 'editor.file-explorer',
      spaceId: '7f3a',
    });
    // grantDocId ∘ parseGrantDocId is the identity on a qualified id.
    const id = grantDocId('7f3a', 'editor.file-explorer');
    expect(grantDocId(parseGrantDocId(id).spaceId, parseGrantDocId(id).principal)).toBe(id);
  });

  it('parseGrantDocId leaves a bare (stage/legacy) doc-id un-parsed', () => {
    expect(parseGrantDocId('7f3a')).toEqual({ spaceId: '7f3a' });
    expect(parseGrantDocId('7f3a').principal).toBeUndefined();
  });

  it('parseGrantDocId splits on the FIRST delimiter (principal never contains ~)', () => {
    // A named principal is dotted/hyphenated — no `~` — so the first split is the
    // only split. (A spaceId is alphanumeric, so this is defensive.)
    expect(parseGrantDocId('editor.spaces~abc123')).toEqual({
      principal: 'editor.spaces',
      spaceId: 'abc123',
    });
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

  // R3-98 S4 — the principal-aware grant key + arity-detecting parse (design 05a §3.1).
  it('grantKeyWithPrincipal joins appKey::principal::spaceId', () => {
    expect(grantKeyWithPrincipal('github__acme__app', 'editor.file-explorer', 's1')).toBe(
      'github__acme__app::editor.file-explorer::s1',
    );
  });
  it('parseGrantKey round-trips a 3-field (keyed) grant key', () => {
    const k = grantKeyWithPrincipal('github__acme__app', 'editor.file-explorer', 's1');
    expect(parseGrantKey(k)).toEqual({
      appKey: 'github__acme__app',
      principal: 'editor.file-explorer',
      spaceId: 's1',
    });
  });
  it('parseGrantKey round-trips a legacy 2-field grant key (principal undefined)', () => {
    expect(parseGrantKey(grantKey('github__acme__app', 's1'))).toEqual({
      appKey: 'github__acme__app',
      spaceId: 's1',
    });
  });
  it('parseGrantKey never mis-assigns a legacy spaceId to principal (MEDIUM-6 regression)', () => {
    // A positional 3-way split of a 2-field key would put the spaceId in `principal`.
    expect(parseGrantKey('github__acme__app::my-space-42').principal).toBeUndefined();
    expect(parseGrantKey('github__acme__app::my-space-42').spaceId).toBe('my-space-42');
  });
  it('appSpaceGrantFields writes the principal field when given, omits it when absent', () => {
    expect(appSpaceGrantFields({ mode: 'rw', principal: 'editor.commander' }, sentinels).principal).toBe(
      'editor.commander',
    );
    expect(
      Object.prototype.hasOwnProperty.call(appSpaceGrantFields({ mode: 'rw' }, sentinels), 'principal'),
    ).toBe(false); // legacy mint ⇒ no field ⇒ grandfathered
  });

  it('GRANT_EXPIRY_MS is 90 days', () => {
    expect(GRANT_EXPIRY_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
  it('defined() drops only undefined (keeps null/0/empty-string)', () => {
    expect(defined({ a: 1, b: undefined, c: 0, d: '', e: null })).toEqual({ a: 1, c: 0, d: '', e: null });
  });
});
