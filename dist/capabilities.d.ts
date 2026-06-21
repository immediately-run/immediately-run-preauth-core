export type CapabilityKind = 'read' | 'action';
export type CapabilityTier = 'baseline' | 'elevated' | 'first-party-only';
export type Capability = 'theme:read' | 'theme:set' | 'auth:status' | 'auth:identity' | 'route:read' | 'formFactor:read' | 'mounts:read' | 'spaces:app' | 'spaces:user' | 'spaces:admin' | 'settings:app' | 'settings:fork' | 'settings:all' | 'contribute:self' | 'contribute:any' | 'contribute:direct' | 'editor:read' | 'editor:open' | 'editor:write' | 'editor:document' | 'editor:requestEdit' | 'vcs:read' | 'vcs:reset' | 'dnd:source' | 'catalog:read' | 'commands:read' | 'commands:run' | 'ipc' | 'task:invoke' | 'net:fetch' | 'secrets:add' | 'secrets:list' | 'secrets:revoke' | 'agent:session' | 'diagnostics:read' | 'llm:chat';
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
     *  (region binding only). The app-scoped set is `net:fetch`, `task:invoke`,
     *  `contribute:self` (decision #1 — its baseline→elevated reclassification landed
     *  in R3-33d), and `diagnostics:read` (R3-74 / P3-72, D4); the durable grant
     *  participates in the §8.15 90-day expiry like any app-scoped grant. */
    appScoped?: boolean;
    /** Render this capability's consent line with the platform's **maximally-
     *  explicit** (scariest) styling, never bundled into a combined prompt
     *  (decision #2). The most dangerous writes carry it: `contribute:direct`
     *  (commit without review) and `editor:write` (mutate the working tree).
     *  Independent of tier — it governs HOW the line is shown, not WHO may hold the
     *  capability (a first-party-only cap is still refused to a fork regardless). */
    maximallyExplicit?: boolean;
}
export declare const CAPABILITIES: Record<Capability, CapabilityDef>;
/** The current registry/vocabulary version (§5.11). Bumped to 1.3.0 with the
 *  provider-agnostic `llm:chat` capability (the `llm.chat@1` slot), mirroring
 *  capabilities.json. (1.2.0 added the per-user settings-space capabilities.) */
export declare const REGISTRY_VERSION = "1.3.0";
/** Is `cap` a known kernel capability? (Closed vocabulary — §5.12.) */
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
