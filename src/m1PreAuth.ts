// M1 — programmatic / policy pre-authorization (UI_AS_APPS_SPEC §8.15 "M1 —
// Pre-authorization / policy", clamped by the §8.9 target check).
//
// M1 lets a policy (operator-tier) or settings (user-tier) write path record the
// SAME durable consent-grant M3 writes — ahead of time, instead of at a modal —
// so a headless/CI/cron/`immediately-run dev` run finds the grant already present
// and boots with NO prompt. It is not a region-repointing registry layer (§3.3):
// it only writes the §8.6/§8.7 grant set the gate already reads, so M1 minting
// flows through the ONE existing mint path (`mintConsentedGrants`, stamped
// `mintPath:'policy'`) and cannot drift from M3.
//
// THE SECURITY INVARIANT — the §8.9 target check. A pre-auth for a URL-loaded
// `appKey` may only cover **app-scoped** elevated capabilities (`net:fetch`,
// `task:invoke`, `contribute:self` — the set an ordinary previewed/forked app can
// EARN per §8.9/§8.15) plus mounts (app-scoped by construction). A **broad-elevated**
// capability — any non-app-scoped elevated cap (`spaces:user`/`spaces:admin`,
// `editor:write`, `contribute:direct`/`contribute:any`, `editor:open`, …) — is
// REFUSED: M1 cannot mint it for a URL-loaded appKey. Unknown capabilities are
// refused (fail-closed). Baseline capabilities need no grant and are dropped.
//
// The check is **all-or-nothing**: if a policy names ANY refused capability the
// whole pre-auth is rejected and NOTHING is minted — a partial apply would
// silently drop the scary capability and look like it had been honored.
//
// Pure decision (`planPreAuthCapabilities`/`isPreAuthClean`) + a thin store-glue
// write path (`applyPreAuth`) that reuses `mintConsentedGrants`. No React, no UI.

import { isAppScoped, isBaseline, isKnownCapability, type Capability } from './capabilities';
import { mintConsentedGrants, type ConsentSelection, type MintErrorSink, type MintResult } from './bootConsent';
import type { MintStore, NetFetchHost } from './port';

export type PreAuthRefusalReason =
  /** A non-app-scoped elevated cap — region-binding-only authority (§8.9). */
  | 'broad-elevated'
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
export function planPreAuthCapabilities(requested: readonly string[]): PreAuthPlan {
  const grantable: Capability[] = [];
  const baseline: Capability[] = [];
  const refused: PreAuthRefusal[] = [];
  for (const cap of requested) {
    if (!isKnownCapability(cap)) {
      refused.push({ capability: cap, reason: 'unknown' });
      continue;
    }
    if (isBaseline(cap)) {
      baseline.push(cap);
      continue;
    }
    if (isAppScoped(cap)) {
      grantable.push(cap);
      continue;
    }
    // Known + elevated + NOT app-scoped ⇒ broad-elevated: region-binding-only,
    // never minted for a URL-loaded appKey (the §8.9 clamp).
    refused.push({ capability: cap, reason: 'broad-elevated' });
  }
  return { grantable, baseline, refused };
}

/** Safe to apply iff the §8.9 check refused nothing (fail-closed, all-or-nothing). */
export const isPreAuthClean = (plan: PreAuthPlan): boolean => plan.refused.length === 0;

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
export async function applyPreAuth(
  store: MintStore,
  uid: string,
  appKey: string,
  request: PreAuthRequest,
  onError?: MintErrorSink,
): Promise<PreAuthResult> {
  const plan = planPreAuthCapabilities(request.capabilities);
  if (!isPreAuthClean(plan)) {
    return { ok: false, refused: plan.refused };
  }
  const mint = await mintConsentedGrants(
    store,
    uid,
    appKey,
    request.mounts,
    request.netFetchHosts,
    'policy',
    onError,
  );
  return { ok: mint.ok, refused: [], mint };
}
