// R3-692 — `mintConsentedGrants` keys consent by (user, appKey, principal). The
// principal is threaded into ALL THREE mints (net:fetch hosts, plain capabilities,
// space grants — the last fixes boot-consent space grants from a named-principal
// frame minting bare), and is spread ONLY when given, so a call without one hands
// the store exactly the 0.2.0 parameter objects.
import { mintConsentedGrants, type ConsentSelection } from '../src/bootConsent';
import type { NetFetchHost } from '../src/port';
import { InMemoryMintStore } from './inMemoryMintStore';

const UID = 'u1';
const APP = 'gh__acme__notes';
const host = (origin: string): NetFetchHost => ({ origin });
const pick: ConsentSelection = { uri: 'notes', mode: 'rw', kind: 'pick', spaceId: 'sp1', name: 'Notes' };
const create: ConsentSelection = { uri: 'cache', mode: 'ro', kind: 'create', name: 'Cache' };

describe('mintConsentedGrants — the consent principal (R3-692)', () => {
  it('mintConsentedGrants threads the principal into the net:fetch, capability and space mints', async () => {
    const store = new InMemoryMintStore();
    const res = await mintConsentedGrants(
      store, UID, APP, [pick, create], [host('https://api.example.com')],
      'interactive', undefined, ['task:invoke'], 'editor.tools',
    );
    expect(res).toMatchObject({ ok: true, netFetchOk: true, capabilitiesOk: true });

    const byMethod = (m: string) => store.calls.filter((c) => c.method === m).map((c) => c.args);
    expect(byMethod('grantNetFetchHosts')).toEqual([
      { uid: UID, appKey: APP, hosts: [host('https://api.example.com')], principal: 'editor.tools' },
    ]);
    expect(byMethod('grantAppCapabilities')).toEqual([
      { uid: UID, appKey: APP, capabilities: ['task:invoke'], mintPath: 'interactive', principal: 'editor.tools' },
    ]);
    const spaceGrants = byMethod('grantSpaceToApp') as { principal?: string }[];
    expect(spaceGrants).toHaveLength(2);
    for (const g of spaceGrants) expect(g.principal).toBe('editor.tools');
    // createSpace is not a consent record — it carries no principal.
    expect(Object.keys(byMethod('createSpace')[0] as object)).not.toContain('principal');

    // The records live under the principal, not under the stage key.
    expect(store.getNetFetchHosts(UID, APP, 'editor.tools')).toEqual([host('https://api.example.com')]);
    expect(store.getAppCapabilities(UID, APP, 'editor.tools')).toEqual(['task:invoke']);
    expect(store.getNetFetchHosts(UID, APP)).toEqual([]);
    expect(store.getAppCapabilities(UID, APP)).toEqual([]);
    expect(store.listGrants(UID).map((g) => g.principal)).toEqual(['editor.tools', 'editor.tools']);
  });

  it('without a principal the store params carry no principal key (0.2.0 call shape)', async () => {
    const store = new InMemoryMintStore();
    const res = await mintConsentedGrants(
      store, UID, APP, [pick], [host('https://api.example.com')], 'interactive', undefined, ['llm:chat'],
    );
    expect(res.ok).toBe(true);
    // Exact objects: toStrictEqual fails on a `principal: undefined` key.
    const args = (m: string) => store.calls.filter((c) => c.method === m).map((c) => c.args);
    expect(args('grantNetFetchHosts')).toStrictEqual([
      { uid: UID, appKey: APP, hosts: [host('https://api.example.com')] },
    ]);
    expect(args('grantAppCapabilities')).toStrictEqual([
      { uid: UID, appKey: APP, capabilities: ['llm:chat'], mintPath: 'interactive' },
    ]);
    expect(args('grantSpaceToApp')).toStrictEqual([
      { uid: UID, appKey: APP, spaceId: 'sp1', name: 'Notes', mode: 'rw', declaredUri: 'notes', mintPath: 'interactive' },
    ]);
    for (const c of store.calls) expect(Object.keys(c.args as object)).not.toContain('principal');
    // An explicit `undefined` is the same call as omitting it.
    const store2 = new InMemoryMintStore();
    await mintConsentedGrants(
      store2, UID, APP, [pick], [host('https://api.example.com')], 'interactive', undefined, ['llm:chat'], undefined,
    );
    expect(store2.calls).toStrictEqual(store.calls);
    // The stage key holds the records.
    expect(store.getNetFetchHosts(UID, APP)).toEqual([host('https://api.example.com')]);
    expect(store.getAppCapabilities(UID, APP)).toEqual(['llm:chat']);
  });
});
