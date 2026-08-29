// M1 — programmatic / policy pre-authorization (UI_AS_APPS_SPEC §8.15 "M1 —
// Pre-authorization / policy", clamped by the §8.9 target check).
//
// M1 lets a policy (operator-tier) or settings (user-tier) write path record the
// SAME durable consent-grant M3 writes — ahead of time, instead of at a modal —
// so a headless/CI/cron/`immediately-run dev` run finds the grant already present
// and boots with NO prompt. It is not a region-repointing registry layer (§3.3):
// it only writes the §8.6/§8.7 grant set the gate already reads, so M1 minting
//
// ("region-binding-only" below = the UI half of a Slot (core_concepts §3): the
// Slot's principal confers such a capability as part of being bound, NOT via a
// consent path (slot occupancy is not a capability, core_concepts §3/§5) — which
// is exactly why a URL-loaded appKey, which CANNOT pick its slot, can never EARN a
// broad-elevated cap, only the app-scoped consent-path caps below.)
// flows through the ONE existing mint path (`mintConsentedGrants`, stamped
// `mintPath:'policy'`) and cannot drift from M3.
//
// THE SECURITY INVARIANT — the §8.9 target check. A pre-auth for a URL-loaded
// `appKey` may only cover **app-scoped** elevated capabilities — the set an ordinary
// previewed/forked app can EARN per §8.9/§8.15 — plus mounts (app-scoped by
// construction). A **broad-elevated** capability — any non-app-scoped elevated cap
// (`spaces:user`/`spaces:admin`, `editor:write`, `contribute:direct`/`contribute:any`,
// `editor:open`, …) — is REFUSED: M1 cannot mint it for a URL-loaded appKey. Unknown
// capabilities are refused (fail-closed), as are capabilities the CONSUMING host's
// registry version is too old to enforce. Baseline capabilities need no grant and are
// dropped.
//
// WHAT THAT SET ACTUALLY CONTAINS, stated in full because this is the boundary M1
// pre-grants across WITHOUT A PROMPT. The check reads `isAppScoped`, so the list is
// derived from the capability table and cannot drift from it; as of registry 1.12.0
// the eleven app-scoped rows are:
//
//   `auth:identity` (R3-407) · `contribute:self` · `task:invoke` · `net:fetch` ·
//   `feed:fetch` (R3-227) · `diagnostics:read` · `llm:chat` · `analytics:emit`
//   (R3-350) · `device:geolocation` (R3-424) · `device:camera` and
//   `device:microphone` (R3-425).
//
// So M1 can pre-grant, with no consent modal at boot, not only the original egress and
// delegation caps but the user's IDENTITY, their LOCATION, and their CAMERA and
// MICROPHONE. That is the shipped invariant and it is deliberate — a policy/settings
// write path is an operator- or user-tier decision recorded ahead of time, and the
// same §8.15 grant, expiry and revocation apply as if the modal had drawn it. It is
// stated here so the boundary is read rather than inferred from a stale example list.
//
// Not overstating it, in three directions:
//   - `net:fetch` and `feed:fetch` are HOST-PARAMETERIZED, so a pre-auth conveys their
//     parameter set (hosts / compiled templates), never a bare "may fetch". The other
//     nine are plain on/off grants. `applyPreAuth` filters the parameterized ones out
//     of the plain-cap mint below.
//   - M1 clamps WHO may hold a capability, not what the capability then does. A
//     pre-granted `device:camera` still opens the device through the host's own capture
//     surface, under the host-chrome indicator the app cannot cover (G-DEV-5); it does
//     not hand the app a device handle.
//   - Pre-auth is not the M3 stance. A stranger's app under M3 is refused these with no
//     prompt at all (G-DEV-2); M1 is the path where an operator or the user has already
//     decided, not a way around that refusal.
//
// The check is **all-or-nothing**: if a policy names ANY refused capability the
// whole pre-auth is rejected and NOTHING is minted — a partial apply would
// silently drop the scary capability and look like it had been honored.
//
// Pure decision (`planPreAuthCapabilities`/`isPreAuthClean`) + a thin store-glue
// write path (`applyPreAuth`) that reuses `mintConsentedGrants`. No React, no UI.

import {
  REGISTRY_VERSION,
  isAppScoped,
  isBaseline,
  isHostParameterized,
  isKnownCapability,
  isSupportedCapability,
  type Capability,
} from './capabilities';
import { mintConsentedGrants, type ConsentSelection, type MintErrorSink, type MintResult } from './bootConsent';
import type { MintStore, NetFetchHost } from './port';

export type PreAuthRefusalReason =
  /** A non-app-scoped elevated cap — region-binding-only authority (§8.9). */
  | 'broad-elevated'
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
export function planPreAuthCapabilities(
  requested: readonly string[],
  hostVersion: string = REGISTRY_VERSION,
): PreAuthPlan {
  const grantable: Capability[] = [];
  const baseline: Capability[] = [];
  const refused: PreAuthRefusal[] = [];
  for (const cap of requested) {
    if (!isKnownCapability(cap)) {
      refused.push({ capability: cap, reason: 'unknown' });
      continue;
    }
    // Known to THIS registry but not to the consuming host's (§5.11/T26). Refuse
    // rather than mint a grant that host will silently discard.
    if (!isSupportedCapability(cap, hostVersion)) {
      refused.push({ capability: cap, reason: 'unsupported' });
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
export async function applyPreAuth(
  store: MintStore,
  uid: string,
  appKey: string,
  request: PreAuthRequest,
  onError?: MintErrorSink,
  hostVersion?: string,
): Promise<PreAuthResult> {
  const plan = planPreAuthCapabilities(request.capabilities, hostVersion);
  if (!isPreAuthClean(plan)) {
    return { ok: false, refused: plan.refused };
  }
  // The plain on/off caps to mint: every grantable cap EXCEPT the host-parameterized
  // ones (net:fetch), which are minted as their host set via `netFetchHosts`.
  const plainCaps = plan.grantable.filter((c) => !isHostParameterized(c));
  const mint = await mintConsentedGrants(
    store,
    uid,
    appKey,
    request.mounts,
    request.netFetchHosts,
    'policy',
    onError,
    plainCaps,
  );
  return { ok: mint.ok, refused: [], mint };
}
