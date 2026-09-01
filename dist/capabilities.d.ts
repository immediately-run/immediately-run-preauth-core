export type CapabilityKind = 'read' | 'action';
export type CapabilityTier = 'baseline' | 'elevated' | 'first-party-only';
export type Capability = 'theme:read' | 'theme:set' | 'auth:status' | 'auth:identity' | 'route:read' | 'formFactor:read' | 'chrome:read' | 'mounts:read' | 'mounts:registry' | 'spaces:app' | 'spaces:user' | 'spaces:admin' | 'settings:app' | 'settings:fork' | 'settings:all' | 'contribute:self' | 'contribute:any' | 'contribute:direct' | 'editor:read' | 'editor:open' | 'editor:reveal' | 'editor:write' | 'editor:document' | 'editor:requestEdit' | 'vcs:read' | 'vcs:reset' | 'dnd:source' | 'catalog:read' | 'commands:read' | 'commands:run' | 'ipc' | 'task:invoke' | 'net:fetch' | 'feed:fetch' | 'secrets:add' | 'secrets:list' | 'secrets:revoke' | 'agent:session' | 'diagnostics:read' | 'llm:chat' | 'authoring:run' | 'analytics:emit' | 'device:geolocation' | 'device:camera' | 'device:microphone' | 'recents:read' | 'workspace:read' | 'theme:sources';
export interface CapabilityDef {
    kind: CapabilityKind;
    tier: CapabilityTier;
    /** Lowest platform/registry version that knows this capability (§5.11). */
    since: string;
    /** Carries a bounded argument set (host gate checks verb AND argument). */
    parameterized?: boolean;
    /** **App-scoped** consent-path annotation on the ELEVATED tier (NOT a fourth
     *  tier — CAPABILITY_REFERENCE §"How to read this", §6a CR-1). An app-scoped
     *  elevated capability can be EARNED by a URL-loaded/previewed app via lazy
     *  first-use or manifest-`requests` consent and recorded as a per-`(user,
     *  appKey)` grant; non-app-scoped elevated caps are never earnable that way
     *  (region binding only). In core_concepts §5 terms the consent-path is the
     *  "above-the-floor, up-to-the-ceiling → first-use consent" band: an app-scoped
     *  elevated cap sits in that band for the stage principal, a non-app-scoped one
     *  is above the stage ceiling (granted only by a slot's elevated principal). The
     *  durable grant participates in the §8.15 90-day expiry like any app-scoped grant.
     *
     *  **The app-scoped set, in full** — this is a security boundary, so it is stated
     *  completely rather than by example. The authoritative form is DERIVED, never
     *  hand-maintained: `APP_SCOPED_CAPABILITIES` below filters this table on the flag,
     *  and `isAppScoped` is what every consumer branches on. As of registry 1.13.0 the
     *  twelve rows carrying it are:
     *
     *    `auth:identity` (R3-407) · `contribute:self` (decision #1 — its
     *    baseline→elevated reclassification landed in R3-33d) · `task:invoke` ·
     *    `net:fetch` · `feed:fetch` (R3-227) · `diagnostics:read` (R3-74 / P3-72, D4) ·
     *    `llm:chat` (D5) · `analytics:emit` (R3-350) · `device:geolocation` (R3-424) ·
     *    `device:camera` and `device:microphone` (R3-425) · `recents:read` (R3-485).
     *
     *  Two of those — `net:fetch` and `feed:fetch` — are additionally HOST-PARAMETERIZED
     *  (see `HOST_PARAMETERIZED_CAPABILITIES`), so they are never earned as a bare on/off
     *  capability: the durable authority IS their parameter set. The remaining nine are
     *  plain on/off grants. That distinction bounds what a grant CONVEYS; it does not
     *  narrow who may earn one, which is what `appScoped` decides. */
    appScoped?: boolean;
    /** Render this capability's consent line with the platform's **maximally-
     *  explicit** (scariest) styling, never bundled into a combined prompt
     *  (decision #2). The most dangerous writes carry it: `contribute:direct`
     *  (commit without review) and `editor:write` (mutate the working tree).
     *  Independent of tier — it governs HOW the first-use consent line (core_concepts
     *  §5: the above-floor consent band) is shown, not WHO may hold the capability
     *  (a first-party-only cap is still refused to a fork regardless of styling). */
    maximallyExplicit?: boolean;
}
export declare const CAPABILITIES: Record<Capability, CapabilityDef>;
/** The current registry/vocabulary version (§5.11). Bumped to 1.12.0 for a change that
 *  adds no NAME: `auth:identity`'s reclassification to `appScoped` (R3-407). A version
 *  is spent here for the same reason it is spent on a new row — the gate can only
 *  compare versions, so a change of MEANING that does not move `since` is a change the
 *  gate cannot see, and the resulting mismatch fails silently rather than loudly. The
 *  full reasoning is on the `auth:identity` row.
 *
 *  Note that R3-407 originally landed the reclassification INSIDE 1.9.0, which was
 *  already published (0.1.14) with the pre-reclassification meaning — so 1.9.0 briefly
 *  named two different vocabularies, the exact thing the `feed:fetch` and
 *  `device:geolocation` notes below each refused to allow. 1.12.0 is that mistake
 *  undone, not a second one: 1.10.0 and 1.11.0 keep the vocabularies the docs already
 *  record for them.
 *
 *  Prior notes — bumped to 1.11.0 with the elevated,
 *  app-scoped `device:camera` and `device:microphone` — the two CAPTURE devices
 *  (`BROWSER_CAPABILITIES_SPEC` §2/§3, R3-425). They share one version because they
 *  ship together and a host either has the capture broker + the host-chrome indicator
 *  or it has neither; a host on 1.10.0 refuses a binding that requests either (T26)
 *  rather than mounting with a camera that can never open. `device:clipboard` is NOT
 *  in this version — see the note above the table.
 *
 *  Prior notes — bumped to 1.15.0 with the ELEVATED `theme:sources`
 *  (`HOST_THEMING_SPEC` §9.3 — R3-500): the `protocol-theme {add-source,
 *  remove-source}` registry verbs, split out of `theme:set` so the consent copy of
 *  each stays honest. It takes its own version for the settled reason: 1.14.0 is
 *  already published (**0.1.19**, with `workspace:read`), and a registry version that
 *  does not identify a vocabulary is not much of a version gate. The T26 refusal is
 *  the RIGHT outcome here too — a host older than 1.15.0 cannot enforce the §9.3
 *  picker-provenance rule on `add-source`, so a binding that requests it would mount
 *  with the registry verbs silently inert.
 *
 *  Prior notes — bumped to 1.14.0 with the BASELINE `workspace:read`
 *  (`UI_AS_APPS_SPEC` §5.15 — R3-491). It takes its own version for the settled reason:
 *  1.13.0 is already published (**0.1.18**, with `recents:read`), and a registry version
 *  that does not identify a vocabulary is not much of a version gate. The T26 refusal is
 *  the RIGHT outcome here too — a host older than 1.14.0 publishes no workspace channel,
 *  so a binding that requests the capability would mount with the read permanently
 *  silent, and a panel cannot tell a silent host from one reporting "no session".
 *
 *  Prior notes — bumped to 1.10.0 with the elevated,
 *  app-scoped `device:geolocation` — the first host-brokered `device:*` row
 *  (`BROWSER_CAPABILITIES_SPEC` §2–§4, R3-424). It takes its own version for the same
 *  reason `feed:fetch` did: 1.9.0 is already published (**0.1.14**, with
 *  `editor:reveal` — commit `8f7ac42`, which is the release that bumped the package to
 *  0.1.14; 0.1.15 is this branch's own unpublished commit, NOT a release), and a
 *  registry version that does not identify a vocabulary is not much of a version
 *  gate. A host older than 1.10.0 refuses a binding that requests `device:geolocation`
 *  (T26) rather than mounting with the sensor silently inert.
 *
 *  Prior notes — bumped to 1.8.0 with the elevated,
 *  app-scoped, host-parameterized `feed:fetch` (`CONNECTOR_EGRESS_FIXING_SPEC` §2 —
 *  R3-227), mirroring capabilities.json. (1.7.0 added the baseline state read
 *  `chrome:read`; 1.6.0 added `analytics:emit`; 1.5.0 added the first-party-only
 *  `mounts:registry`; 1.4.0 added `authoring:run`; 1.3.0 added the provider-agnostic
 *  `llm:chat` slot; 1.2.0 added the per-user settings-space capabilities.)
 *
 *  `feed:fetch` takes its OWN version rather than joining 1.7.0, even though both land
 *  close together: 1.7.0 is already published (0.1.12, with `chrome:read`), so reusing it
 *  would mean two different published vocabularies both answering "1.7.0" — and a
 *  registry version that does not identify a vocabulary is not much of a version gate.
 *  A host older than 1.8.0 therefore refuses a binding that requests `feed:fetch` (T26)
 *  rather than mounting half-working, which is the right outcome: a host that cannot
 *  enforce target-fixing must not run a connector that assumes it. */
export declare const REGISTRY_VERSION = "1.15.0";
/** Is `cap` a known host-core capability? (Closed vocabulary — §5.12.) */
export declare function isKnownCapability(cap: string): cap is Capability;
export declare function tierOf(cap: Capability): CapabilityTier;
/** Baseline = what the previewed app and any unconsented binding may hold. */
export declare const BASELINE_CAPABILITIES: readonly Capability[];
export declare function isBaseline(cap: Capability): boolean;
/** App-scoped consentables — the elevated caps a previewed/forked app may EARN
 *  via lazy first-use or manifest-`requests` consent (§8.9/§8.15), as opposed to
 *  region-binding-only elevated caps. (`contribute:self` joined this set in R3-33d
 *  per decision #1.) */
export declare const APP_SCOPED_CAPABILITIES: readonly Capability[];
export declare function isAppScoped(cap: Capability): boolean;
/** App-scoped caps whose durable authority is a PARAMETER SET minted on its own
 *  path: `net:fetch` (its granted host set, §5.11) and `feed:fetch` (its compiled
 *  request templates, `CONNECTOR_EGRESS_FIXING_SPEC` §2). These are granted by that
 *  path, never as a bare on/off capability: a bare `net:fetch` grant would be
 *  UNBOUNDED (every origin), and a bare `feed:fetch` grant would be unbounded the
 *  same way (no template, hence no fixed target), so the plain-capability mint
 *  (R3-233) MUST exclude them. `task:invoke` is `parameterized` too but its bound is
 *  the app's manifest `invokes` (§5.8), not a durable grant param, so it IS a plain
 *  on/off grant. */
export declare const HOST_PARAMETERIZED_CAPABILITIES: readonly Capability[];
export declare function isHostParameterized(cap: Capability): boolean;
/** Compare dotted numeric versions: <0 if a<b, 0 if equal, >0 if a>b. Missing
 *  segments are treated as 0 ("1.2" === "1.2.0"); non-numeric segments as 0. */
export declare function compareVersions(a: string, b: string): number;
/** A capability is supported iff it is known AND its `since` ≤ the host version. */
export declare function isSupportedCapability(cap: string, hostVersion?: string): boolean;
/**
 * The subset of `caps` this host cannot enforce — unknown to its vocabulary, or
 * declared at a `since` newer than `hostVersion`. A non-empty result means the
 * region must refuse to mount with "update immediately.run (missing: …)" (T26).
 * `hostVersion` is injectable so an older host can be simulated in tests.
 */
export declare function unsupportedCapabilities(caps: readonly string[], hostVersion?: string): string[];
