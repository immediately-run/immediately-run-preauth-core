import { type Capability } from './capabilities';
import { type ConsentSelection, type MintErrorSink, type MintResult } from './bootConsent';
import type { MintStore, NetFetchHost } from './port';
export type PreAuthRefusalReason = 
/** A non-app-scoped elevated cap — region-binding-only authority (§8.9). */
'broad-elevated'
/** Not in the closed capability vocabulary (§5.12) — fail-closed. */
 | 'unknown'
/** Known here, but declared at a `since` NEWER than the host that will consume the
 *  grant, so that host cannot enforce it (§5.11 / T26). Minting it anyway is a
 *  validate-then-drop: the mint answers `ok` and the consumer silently discards the
 *  capability. Refusing is the loud alternative. */
 | 'unsupported';
export interface PreAuthRefusal {
    capability: string;
    reason: PreAuthRefusalReason;
}
export interface PreAuthPlan {
    /** App-scoped elevated caps a policy MAY pre-authorize for a URL-loaded appKey. */
    grantable: Capability[];
    /** Baseline caps requested — auto-held, no grant needed (dropped silently). */
    baseline: Capability[];
    /** Refused by the §8.9 target check — these block the whole pre-auth. */
    refused: PreAuthRefusal[];
}
/**
 * The pure §8.9 target check: partition requested capability names into
 * {grantable app-scoped, baseline no-op, refused}. Order-independent; total.
 *
 * `hostVersion` is the registry version of the host that will CONSUME the grant, and
 * it defaults to this build's own `REGISTRY_VERSION` — so every existing caller keeps
 * its exact behaviour (at that default, every known capability is supported). Pass it
 * when the minter and the consumer can be on different vocabularies, which is the
 * normal case: the backend floats its `preauth-core` range while site-main PINS one,
 * so the minter routinely holds a newer table than the host that reads the grant back.
 *
 * Why the check belongs here and not only on `since`: a capability's `since` is read
 * out of the reader's OWN table, so advancing it makes a reclassification VISIBLE to
 * the gate but does not make the gate CONSULTED on this path — this function decided
 * grantability from `isAppScoped` alone, with no version anywhere in it. That is how a
 * reclassified capability (`auth:identity`, R3-407) could be minted for a host whose
 * vocabulary still calls it region-binding-only, which then drops it from the frame and
 * omits it from the consent screen with nothing reported: the R3-233 validate-then-drop
 * failure, reached across a version boundary. The version check is placed before the
 * tier branches, and so applies to baseline caps too, matching the registry merge —
 * which likewise runs `unsupportedCapabilities` over a region's whole effective set
 * regardless of tier, because "this host cannot enforce it" is prior to what tier it is.
 */
export declare function planPreAuthCapabilities(requested: readonly string[], hostVersion?: string): PreAuthPlan;
/** Safe to apply iff the §8.9 check refused nothing (fail-closed, all-or-nothing). */
export declare const isPreAuthClean: (plan: PreAuthPlan) => boolean;
/** What a policy/settings surface asks M1 to pre-authorize for `(uid, appKey)` —
 *  structurally the same shape M3's consent screen produces (the declared
 *  `requests`), so the two paths mint identical grants. */
export interface PreAuthRequest {
    /** Capability names being pre-authorized — validated by the §8.9 target check. */
    capabilities: readonly string[];
    /** Mount selections (create/bind a space per slot), mirroring the M3 screen. */
    mounts: readonly ConsentSelection[];
    /** net:fetch hosts to pre-grant (the headless/BYOK case). */
    netFetchHosts: readonly NetFetchHost[];
}
export interface PreAuthResult {
    /** True iff the pre-auth passed the §8.9 check AND every grant minted. */
    ok: boolean;
    /** §8.9 refusals — non-empty ⇒ NOTHING was minted (all-or-nothing). */
    refused: PreAuthRefusal[];
    /** The mint outcome, when the §8.9 check passed (absent on refusal). */
    mint?: MintResult;
}
/**
 * The M1 write path: validate the requested capabilities against the §8.9 target
 * check, then — only if clean — mint the mounts, net:fetch hosts, AND the plain
 * app-scoped on/off capabilities (`task:invoke`, `llm:chat`, `contribute:self`,
 * `diagnostics:read`) as durable grants with `policy` provenance, through the same
 * `mintConsentedGrants` M3 uses.
 *
 * R3-233: the `grantable` app-scoped caps used to be VALIDATED and then silently
 * DROPPED (only mounts + hosts were minted), so pre-authorizing `task:invoke` /
 * `llm:chat` reported success but granted nothing and the gate kept refusing. They
 * are now actually minted. `net:fetch` is excluded from the plain-cap mint — it is
 * host-parameterized and granted via `netFetchHosts` (a bare grant would be
 * unbounded).
 *
 * Refusal is terminal and silent of side effects: when any requested capability
 * is broad-elevated, unknown, or unsupported by the consuming host, the function
 * mints NOTHING and returns the refusals — the caller surfaces them (the policy is
 * malformed, over-broad, or aimed at a host too old to enforce what it asks for).
 *
 * `hostVersion` is forwarded to the target check: pass the registry version of the
 * host that will consume these grants when it may differ from this build's. It
 * defaults to this build's own, which preserves every existing caller's behaviour.
 */
export declare function applyPreAuth(store: MintStore, uid: string, appKey: string, request: PreAuthRequest, onError?: MintErrorSink, hostVersion?: string): Promise<PreAuthResult>;
