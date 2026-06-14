import { type Capability } from './capabilities';
import { type ConsentSelection, type MintErrorSink, type MintResult } from './bootConsent';
import type { MintStore, NetFetchHost } from './port';
export type PreAuthRefusalReason = 
/** A non-app-scoped elevated cap — region-binding-only authority (§8.9). */
'broad-elevated'
/** Not in the closed capability vocabulary (§5.12) — fail-closed. */
 | 'unknown';
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
 */
export declare function planPreAuthCapabilities(requested: readonly string[]): PreAuthPlan;
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
 * check, then — only if clean — mint the mounts + net:fetch hosts as durable
 * grants with `policy` provenance, through the same `mintConsentedGrants` M3 uses.
 *
 * Refusal is terminal and silent of side effects: when any requested capability
 * is broad-elevated or unknown, the function mints NOTHING and returns the
 * refusals — the caller surfaces them (the policy is malformed/over-broad).
 */
export declare function applyPreAuth(store: MintStore, uid: string, appKey: string, request: PreAuthRequest, onError?: MintErrorSink): Promise<PreAuthResult>;
