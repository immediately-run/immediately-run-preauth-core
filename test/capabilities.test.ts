import {
  CAPABILITIES,
  REGISTRY_VERSION,
  BASELINE_CAPABILITIES,
  APP_SCOPED_CAPABILITIES,
  HOST_PARAMETERIZED_CAPABILITIES,
  isKnownCapability,
  isBaseline,
  isAppScoped,
  isHostParameterized,
  tierOf,
  isSupportedCapability,
  unsupportedCapabilities,
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

// ── `feed:fetch` (CONNECTOR_EGRESS_FIXING_SPEC §2, R3-227) ───────────────────
//
// The connector's egress capability. Its whole reason for existing separately from
// `net:fetch` is the difference between an ALLOWLIST and a FIXED TARGET: `net:fetch`
// takes a URL per call, so an app steered by fetched content still chooses the host,
// the path and the body within the allowed set; `feed:fetch` takes a feed-instance id
// and typed params, so there is no URL surface to steer.
describe('feed:fetch — the template-bound connector egress capability', () => {
  it('is a known, elevated, app-scoped ACTION', () => {
    expect(isKnownCapability('feed:fetch')).toBe(true);
    expect(CAPABILITIES['feed:fetch'].kind).toBe('action');
    expect(tierOf('feed:fetch')).toBe('elevated');
    expect(isAppScoped('feed:fetch')).toBe(true);
  });

  it('is HOST-parameterized — a bare on/off grant would be unbounded', () => {
    // The durable authority is the compiled template set (origin + path + method +
    // typed slots). Minting it as a plain capability would grant "may fetch feeds"
    // with no feeds named, i.e. no fixed target — the exact unboundedness that keeps
    // `net:fetch` off the plain-capability mint path.
    expect(CAPABILITIES['feed:fetch'].parameterized).toBe(true);
    expect(isHostParameterized('feed:fetch')).toBe(true);
    expect(HOST_PARAMETERIZED_CAPABILITIES).toEqual(expect.arrayContaining(['net:fetch', 'feed:fetch']));
  });

  it('is DISTINCT from net:fetch — it narrows nothing, it replaces the surface', () => {
    // Two rows, not one row with a flag: a realm may hold one or the other, and a
    // connector holding `net:fetch` has the URL surface back regardless of any
    // template it was also given.
    expect('feed:fetch' in CAPABILITIES).toBe(true);
    expect(CAPABILITIES['feed:fetch']).not.toBe(CAPABILITIES['net:fetch']);
  });

  it('takes its OWN registry version rather than joining the published 1.7.0', () => {
    // 1.7.0 already shipped (0.1.12, `chrome:read`). Reusing it would leave two
    // different published vocabularies both answering "1.7.0", and a version that does
    // not identify a vocabulary is not much of a version gate.
    //
    // The global REGISTRY_VERSION assertion does NOT live here — pinning it here
    // coupled this case to every future addition, so adding an unrelated capability
    // failed a test about `feed:fetch`. It sits on the NEWEST vocabulary's test, which
    // is `auth:identity`'s reclassification (1.12.0). It has moved twice since this
    // comment first named `editor:reveal`, which is the argument for not naming a
    // moving target in three places: assert what THIS row owns, and nothing else.
    expect(CAPABILITIES['feed:fetch'].since).toBe('1.8.0');
    expect(CAPABILITIES['chrome:read'].since).toBe('1.7.0');
  });

  it('an older host REFUSES a binding that requests it, rather than half-enforcing', () => {
    expect(isSupportedCapability('feed:fetch', '1.7.0')).toBe(false);
    expect(isSupportedCapability('feed:fetch', '1.8.0')).toBe(true);
    // T26: a host that cannot enforce target-fixing must not run a connector that
    // assumes it — so the binding fails the version gate, loudly.
    expect(unsupportedCapabilities(['feed:fetch'], '1.7.0')).toEqual(['feed:fetch']);
    expect(unsupportedCapabilities(['feed:fetch'], REGISTRY_VERSION)).toEqual([]);
  });
});

// ── auth:identity — app-scoped-consentable identity read (R3-407) ────────────
describe('auth:identity — earnable identity, never baseline', () => {
  it('is an elevated READ, and NOT baseline — identity is asked for, not taken', () => {
    // Baseline would hand the user's login/avatar to EVERY stage frame, including
    // strangers' apps — a tracking/attribution leak. The floor stays `auth:status`.
    expect(tierOf('auth:identity')).toBe('elevated');
    expect(CAPABILITIES['auth:identity'].kind).toBe('read');
    expect(isBaseline('auth:identity')).toBe(false);
    expect(BASELINE_CAPABILITIES).not.toContain('auth:identity');
  });

  it('is app-scoped — a stage app EARNS it via declared-capability consent (R3-407)', () => {
    expect(isAppScoped('auth:identity')).toBe(true);
    // It joins the consentable set alongside the other app-earnable elevated caps.
    expect(isAppScoped('llm:chat')).toBe(true);
    expect(isAppScoped('diagnostics:read')).toBe(true);
  });

  it('is a PLAIN on/off grant — not host-parameterized (no parameter set to mint)', () => {
    expect(isHostParameterized('auth:identity')).toBe(false);
    expect(HOST_PARAMETERIZED_CAPABILITIES).not.toContain('auth:identity');
  });

  it('the sibling baseline read stays baseline — status without identity', () => {
    expect(tierOf('auth:status')).toBe('baseline');
    expect(isAppScoped('auth:status')).toBe(false);
  });
});

// ── the R3-407 RECLASSIFICATION is itself versioned (registry 1.12.0) ─────────
//
// `auth:identity` is an OLD name whose MEANING moved: `appScoped` flipped, and that
// flag is the admission rule two different consumers branch on. A reclassification
// left at the original `since` is invisible to the §5.11/T26 gate, and the mismatch
// it produces is SILENT — a minter on the new vocabulary mints a grant a consumer on
// the old one drops from the frame and omits from the consent screen, with nothing
// reported. New NAMES (`device:*`) never do this: an old host does not know the name,
// so every path refuses by name, loudly. `since` is the only field comparable across
// versions, so it is the only place a change of meaning can be recorded.
describe('auth:identity — the reclassification takes a registry version (R3-407)', () => {
  it('`since` names the vocabulary that RECLASSIFIED the row, not the one that named it', () => {
    // 1.0.0 described the pre-R3-407 row: elevated, region-binding-only. The row a
    // host must be at 1.12.0 to serve is the app-scoped, consent-earnable one.
    expect(CAPABILITIES['auth:identity'].since).toBe('1.12.0');
    expect(isAppScoped('auth:identity')).toBe(true);
    // (The global REGISTRY_VERSION assertion lives on the NEWEST vocabulary's
    // test — now the recents:read case below — per this test's own comment.)
  });

  it('a host on the PRE-reclassification vocabulary is REFUSED, not silently drained', () => {
    // This is the version boundary the whole fix is about. 1.11.0 is the last
    // vocabulary in which `auth:identity` was region-binding-only. A consumer there
    // cannot honour an app-scoped `auth:identity` grant: its own `isAppScoped` answers
    // false, so the frame read-back drops the capability AND the consent screen never
    // offers it. T26 turns that into a refusal the user can act on ("update
    // immediately.run") instead of a capability that quietly never arrives.
    expect(isSupportedCapability('auth:identity', '1.11.0')).toBe(false);
    expect(unsupportedCapabilities(['auth:identity'], '1.11.0')).toEqual(['auth:identity']);
    // ...and it is supported from the reclassifying vocabulary onward.
    expect(isSupportedCapability('auth:identity', '1.12.0')).toBe(true);
    expect(unsupportedCapabilities(['auth:identity'], REGISTRY_VERSION)).toEqual([]);
  });

  it('no OTHER row moves — only the row whose meaning changed', () => {
    // Sliding an unrelated `since` forward would make every prior host refuse bindings
    // it can in fact serve. `auth:status` never changed meaning, so it never moves.
    expect(CAPABILITIES['auth:status'].since).toBe('1.0.0');
    expect(isSupportedCapability('auth:status', '1.0.0')).toBe(true);
    expect(CAPABILITIES['device:camera'].since).toBe('1.11.0');
    expect(isSupportedCapability('device:camera', '1.11.0')).toBe(true);
  });
});

// ── editor:reveal — the cross-activity attention move (R3-389) ───────────────
describe('editor:reveal', () => {
  it('is an elevated action, and is NOT the same row as editor:open', () => {
    expect(CAPABILITIES['editor:reveal']).toEqual({ kind: 'action', tier: 'elevated', since: '1.9.0' });
    // Two rows, not one with a flag: opening a file in the column the editor already
    // occupies and MOVING the user to a different activity are different authorities,
    // and the second is the parameterized escalation of the first (§8.4 / T11).
    expect(CAPABILITIES['editor:reveal']).not.toBe(CAPABILITIES['editor:open']);
    expect(CAPABILITIES['editor:open'].since).toBe('1.0.0');
  });

  it('takes its own registry version — 1.9.0 identifies THAT vocabulary', () => {
    // The global REGISTRY_VERSION assertion lives on the NEWEST vocabulary's test —
    // currently `auth:identity`'s reclassification (1.12.0) — never here: pinning it
    // on this row would couple the case to every future addition.
    expect(CAPABILITIES['editor:reveal'].since).toBe('1.9.0');
  });

  it('an older host REFUSES a binding that requests it rather than half-enforcing', () => {
    // A host on 1.8.0 has no cross-activity gate at all, so a binding asking for this
    // must fail the version check loudly instead of running with the reveal silently
    // inert — a workbench surface whose clicks do nothing is the worse outcome.
    expect(isSupportedCapability('editor:reveal', '1.8.0')).toBe(false);
    expect(isSupportedCapability('editor:reveal', '1.9.0')).toBe(true);
    expect(unsupportedCapabilities(['editor:reveal'], '1.8.0')).toEqual(['editor:reveal']);
    expect(unsupportedCapabilities(['editor:reveal'], REGISTRY_VERSION)).toEqual([]);
  });
});

// ── device:geolocation — the first host-brokered device capability (R3-424) ──
// BROWSER_CAPABILITIES_SPEC §2–§4. The host calls `navigator.geolocation` at its own
// origin and returns coordinates; the app never touches the browser handle.
describe('device:geolocation — host-brokered position, earned by consent', () => {
  it('is an ELEVATED action, and is NOT baseline', () => {
    // Baseline would hand every stage frame — including a stranger's app — the
    // user's physical location with no consent line and nothing to revoke.
    expect(tierOf('device:geolocation')).toBe('elevated');
    expect(isBaseline('device:geolocation')).toBe(false);
    expect(BASELINE_CAPABILITIES).not.toContain('device:geolocation');
  });

  it("kind is 'action' — the §8.4 gate, not an §8.3 channel projection", () => {
    // `kind` names the enforcement point, not the English verb (the same call
    // `diagnostics:read` made). There is no standing position state to project:
    // the value does not exist until the app asks the host to acquire it, which
    // turns on a sensor and can raise the browser's own prompt.
    expect(CAPABILITIES['device:geolocation'].kind).toBe('action');
    expect(CAPABILITIES['diagnostics:read'].kind).toBe('action');
  });

  it('is app-scoped — a stage app EARNS it via the powerbox consent', () => {
    expect(isAppScoped('device:geolocation')).toBe(true);
    // It joins the consentable set alongside the other app-earnable elevated caps.
    expect(isAppScoped('llm:chat')).toBe(true);
    expect(isAppScoped('auth:identity')).toBe(true);
  });

  it('is a PLAIN on/off grant — not host-parameterized', () => {
    // A coarse/precise split would make the grant a parameter set (like net:fetch's
    // host list) and exclude it from the plain-cap mint. The spec leaves that an
    // open question, so the shape stays plain until it is decided.
    expect(isHostParameterized('device:geolocation')).toBe(false);
    expect(HOST_PARAMETERIZED_CAPABILITIES).not.toContain('device:geolocation');
    expect(CAPABILITIES['device:geolocation'].parameterized).toBeUndefined();
  });

  it('is known, and takes its own registry version — 1.10.0 identifies THAT vocabulary', () => {
    // The global REGISTRY_VERSION assertion lives on the NEWEST vocabulary's test —
    // currently `auth:identity`'s reclassification (1.12.0) — never here: pinning it
    // on this row would couple the case to every future addition.
    expect(isKnownCapability('device:geolocation')).toBe(true);
    expect(CAPABILITIES['device:geolocation'].since).toBe('1.10.0');
  });

  it('an older host REFUSES a binding that requests it rather than half-enforcing', () => {
    // A host on 1.9.0 has no device broker at all. Mounting a region that asked for
    // position and silently never delivering one is the worse outcome (T26).
    expect(isSupportedCapability('device:geolocation', '1.9.0')).toBe(false);
    expect(isSupportedCapability('device:geolocation', '1.10.0')).toBe(true);
    expect(unsupportedCapabilities(['device:geolocation'], '1.9.0')).toEqual(['device:geolocation']);
    expect(unsupportedCapabilities(['device:geolocation'], REGISTRY_VERSION)).toEqual([]);
  });

  it('is unaffected by the R3-425 additions — its `since` does not move', () => {
    // A row's `since` is the version a host must be at to enforce it. Sliding an
    // existing row's `since` forward with each addition would make every prior host
    // refuse bindings it can in fact serve.
    expect(CAPABILITIES['device:geolocation'].since).toBe('1.10.0');
    expect(isSupportedCapability('device:geolocation', '1.10.0')).toBe(true);
  });
});

// ── device:camera / device:microphone — the CAPTURE devices (R3-425) ──
// BROWSER_CAPABILITIES_SPEC §2/§3. Inside the app frame `getUserMedia` throws
// `SecurityError: Invalid security origin`, and a `MediaStreamTrack` is not
// transferable between windows — so the host opens the device at its own origin and
// hands the app BYTES (the one-shot capture task) or FRAMES, never a handle.
describe('device:camera / device:microphone — host-brokered capture, earned by consent', () => {
  const CAPTURE = ['device:camera', 'device:microphone'] as const;

  it.each(CAPTURE)('%s is an ELEVATED action, and is NOT baseline', (cap) => {
    // Baseline would let a stranger's app open the camera with no consent line and
    // nothing to revoke — strictly worse than the location case, because a capture
    // catches bystanders who never chose anything.
    expect(tierOf(cap)).toBe('elevated');
    expect(isBaseline(cap)).toBe(false);
    expect(BASELINE_CAPABILITIES).not.toContain(cap);
  });

  it.each(CAPTURE)("%s kind is 'action' — the §8.4 gate, not an §8.3 projection", (cap) => {
    // Same reasoning as `device:geolocation`: there is no standing "camera" state to
    // project. The value does not exist until the app asks the host to acquire it,
    // which turns on a device. That is a host operation invoked on request.
    expect(CAPABILITIES[cap].kind).toBe('action');
  });

  it.each(CAPTURE)('%s is app-scoped — a stage app EARNS it via the powerbox consent', (cap) => {
    expect(isAppScoped(cap)).toBe(true);
  });

  it.each(CAPTURE)('%s is a PLAIN on/off grant — the delivery GRADE is not in the row', (cap) => {
    // One capability per DEVICE, not one per grade. Which grade an app may have is a
    // property of the durable grant and the consent line the user reads; splitting
    // the vocabulary by grade would mint a name per grade and force a re-consent to
    // add one. Keeping the grade off the row leaves the frame-stream grade additive.
    expect(isHostParameterized(cap)).toBe(false);
    expect(HOST_PARAMETERIZED_CAPABILITIES).not.toContain(cap);
    expect(CAPABILITIES[cap].parameterized).toBeUndefined();
  });

  it.each(CAPTURE)('%s takes the same shape as device:geolocation, field for field', (cap) => {
    // The point of the assertion: the capture rows are not a new KIND of thing. If a
    // future change moves one of these four fields on the geolocation row, this fails
    // and the divergence has to be argued rather than drifted into.
    const geo = CAPABILITIES['device:geolocation'];
    const def = CAPABILITIES[cap];
    expect(def.kind).toBe(geo.kind);
    expect(def.tier).toBe(geo.tier);
    expect(def.appScoped).toBe(geo.appScoped);
    expect(def.maximallyExplicit).toBe(geo.maximallyExplicit);
  });

  it('both are known, and share ONE registry version — 1.11.0 identifies THIS vocabulary', () => {
    // They ship together because a host either has the capture broker AND the
    // host-chrome indicator or it has neither; two versions would imply a host that
    // can serve a microphone but not a camera, which no host will ever be.
    //
    // The global REGISTRY_VERSION assertion has moved on to the newest vocabulary's
    // test (`auth:identity`'s reclassification, 1.12.0) — keeping it here would couple
    // this case to every future addition.
    for (const cap of CAPTURE) {
      expect(isKnownCapability(cap)).toBe(true);
      expect(CAPABILITIES[cap].since).toBe('1.11.0');
    }
  });

  it('an older host REFUSES a binding that requests either rather than half-enforcing', () => {
    // A host on 1.10.0 has the geolocation broker but no capture surface and no
    // host-chrome indicator. Mounting a region that asked for the camera and
    // silently never opening it — or worse, opening it with no indicator — is the
    // outcome T26 exists to prevent.
    for (const cap of CAPTURE) {
      expect(isSupportedCapability(cap, '1.10.0')).toBe(false);
      expect(isSupportedCapability(cap, '1.11.0')).toBe(true);
      expect(unsupportedCapabilities([cap], '1.10.0')).toEqual([cap]);
      expect(unsupportedCapabilities([cap], REGISTRY_VERSION)).toEqual([]);
    }
  });

  it('there are exactly THREE device rows — `device:clipboard` is deliberately NOT shipped', () => {
    // §2 proposes four. Clipboard is left out on purpose: the spec's own open
    // question is whether WRITES belong at the stage floor while READS stay
    // consented, and one row cannot hold two tiers. Shipping `device:clipboard` now
    // would answer that by accident, and the name would have to be deprecated if the
    // answer is a read/write split — expensive in a closed, versioned vocabulary.
    const deviceCaps = Object.keys(CAPABILITIES).filter((c) => c.startsWith('device:')).sort();
    expect(deviceCaps).toEqual(['device:camera', 'device:geolocation', 'device:microphone']);
    expect(isKnownCapability('device:clipboard')).toBe(false);
  });
});

// R3-485 (OSO §4.3 R-OSO-20): the one capability the out-of-session spec adds.
describe('recents:read — the elevated, app-scoped recents read (R3-485)', () => {
  it('is an elevated, APP-SCOPED read named by this registry version', () => {
    // The read is granted per (app, principal) like every durable grant — a fork
    // of Home does not inherit it, and no other app may declare it meaningfully
    // (the host gate additionally binds the read to the page.home binding).
    expect(CAPABILITIES['recents:read']).toEqual({
      kind: 'read',
      tier: 'elevated',
      since: '1.13.0',
      appScoped: true,
    });
    expect(isAppScoped('recents:read')).toBe(true);
    expect(isKnownCapability('recents:read')).toBe(true);
  });

  it('a host on a PRE-recents vocabulary is refused, not silently drained (the version gate)', () => {
    // The same boundary discipline as every addition: an older host that has
    // never heard of the name must say so, not grant or drain it.
    expect(isSupportedCapability('recents:read', '1.12.0')).toBe(false);
    expect(isSupportedCapability('recents:read', '1.13.0')).toBe(true);
  });
});

// R3-491 (UI_AS_APPS_SPEC §5.15, R-UAA-15): which project the editing session is on.
describe('workspace:read — the baseline workspace-identity read (R3-491)', () => {
  it('is a BASELINE read, alongside the other host-state reads', () => {
    expect(CAPABILITIES['workspace:read']).toEqual({
      kind: 'read',
      tier: 'baseline',
      since: '1.14.0',
    });
    expect(tierOf('workspace:read')).toBe('baseline');
    expect(isBaseline('workspace:read')).toBe(true);
    expect(BASELINE_CAPABILITIES).toContain('workspace:read');
    // The global pin moved on to the NEWEST row (theme:sources, 1.15.0) — the
    // workspace row's own `since` is unchanged.
    expect(REGISTRY_VERSION).toBe('1.15.0');
  });

  it('is baseline because the SAME coordinates already ride `route:read`', () => {
    // This is the whole argument, pinned so a later reader cannot mistake it for a
    // disclosure decision: `urlchange` carries the session URL to the previewed,
    // UNTRUSTED stage app under baseline `route:read`, and provider/namespace/
    // repository/ref are read straight off it. A self-routed panel never receives
    // that message — a transport gap, not an authority question. If `route:read`
    // ever stops being baseline, this row's rationale goes with it.
    expect(tierOf('route:read')).toBe('baseline');
    expect(isBaseline('route:read')).toBe(true);
  });

  it('confers no ability to NAVIGATE — there is no set counterpart at any tier', () => {
    // Observing which project is loaded must not become a way to change it:
    // navigation stays a host action under the ordinary consent.
    expect(CAPABILITIES['workspace:read'].kind).toBe('read');
    expect(isKnownCapability('workspace:set')).toBe(false);
    expect(isKnownCapability('workspace:write')).toBe(false);
    expect(isKnownCapability('workspace:open')).toBe(false);
  });

  it('is NOT app-scoped and not parameterized — one fact about the session', () => {
    // There is no per-app dimension to "which project is loaded": it is identical
    // for every frame in the session, so a per-(app, principal) grant would be a
    // lie about what is being scoped.
    expect(isAppScoped('workspace:read')).toBe(false);
    expect(APP_SCOPED_CAPABILITIES).not.toContain('workspace:read');
    expect(CAPABILITIES['workspace:read'].parameterized).toBeUndefined();
  });

  it('a host on a PRE-workspace vocabulary is refused, not silently drained', () => {
    // T26: the refusal is the RIGHT outcome — an older host publishes no workspace
    // channel, and a panel cannot tell a silent host from one reporting "no session".
    expect(isSupportedCapability('workspace:read', '1.13.0')).toBe(false);
    expect(isSupportedCapability('workspace:read', '1.14.0')).toBe(true);
  });
});

// R3-500 (HOST_THEMING_SPEC §9.3): the registry verbs, split from `theme:set`.
describe('theme:sources — the elevated theme-registry verbs (R3-500)', () => {
  it('is an ELEVATED action, separate from `theme:set`', () => {
    expect(CAPABILITIES['theme:sources']).toEqual({
      kind: 'action',
      tier: 'elevated',
      since: '1.15.0',
    });
    expect(tierOf('theme:sources')).toBe('elevated');
    expect(isBaseline('theme:sources')).toBe(false);
    expect(BASELINE_CAPABILITIES).not.toContain('theme:sources');
    // The global pin lives with the NEWEST row (this one).
    expect(REGISTRY_VERSION).toBe('1.15.0');
  });

  it('is NOT app-scoped — the picker-provenance rule is the consent mechanism', () => {
    // §9.3: add-source accepts only a location the host journal saw a recent
    // open-bundle invocation of THAT app return. A lazy first-use grant would let
    // the consent copy launder an arbitrary-fetch surface, so the capability is
    // region-binding-only and the machine-checked pick-is-the-consent property is
    // preserved.
    expect(isAppScoped('theme:sources')).toBe(false);
    expect(APP_SCOPED_CAPABILITIES).not.toContain('theme:sources');
    expect(CAPABILITIES['theme:sources'].parameterized).toBeUndefined();
  });

  it('keeps `theme:set` selection-only honest — the split is the point', () => {
    // The §9.3 split: `theme:set` stays "change the site's appearance" (blast
    // radius of one bit), `theme:sources` names the real power ("read repositories
    // and spaces you pick in the theme picker"). Two names, two grants.
    expect(CAPABILITIES['theme:set'].kind).toBe('action');
    expect(tierOf('theme:set')).toBe('elevated');
    expect(isKnownCapability('theme:sources')).toBe(true);
    expect('theme:sources' in CAPABILITIES).toBe(true);
  });

  it('a host on a PRE-theme:sources vocabulary is refused, not silently drained', () => {
    // T26: an older host cannot enforce the §9.3 provenance rule on add-source,
    // so a binding that requests it must not mount with the verbs silently inert.
    expect(isSupportedCapability('theme:sources', '1.14.0')).toBe(false);
    expect(isSupportedCapability('theme:sources', '1.15.0')).toBe(true);
  });
});
