"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPreAuthClean = void 0;
exports.planPreAuthCapabilities = planPreAuthCapabilities;
exports.applyPreAuth = applyPreAuth;
const capabilities_1 = require("./capabilities");
const bootConsent_1 = require("./bootConsent");
/**
 * The pure §8.9 target check: partition requested capability names into
 * {grantable app-scoped, baseline no-op, refused}. Order-independent; total.
 */
function planPreAuthCapabilities(requested) {
    const grantable = [];
    const baseline = [];
    const refused = [];
    for (const cap of requested) {
        if (!(0, capabilities_1.isKnownCapability)(cap)) {
            refused.push({ capability: cap, reason: 'unknown' });
            continue;
        }
        if ((0, capabilities_1.isBaseline)(cap)) {
            baseline.push(cap);
            continue;
        }
        if ((0, capabilities_1.isAppScoped)(cap)) {
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
const isPreAuthClean = (plan) => plan.refused.length === 0;
exports.isPreAuthClean = isPreAuthClean;
/**
 * The M1 write path: validate the requested capabilities against the §8.9 target
 * check, then — only if clean — mint the mounts + net:fetch hosts as durable
 * grants with `policy` provenance, through the same `mintConsentedGrants` M3 uses.
 *
 * Refusal is terminal and silent of side effects: when any requested capability
 * is broad-elevated or unknown, the function mints NOTHING and returns the
 * refusals — the caller surfaces them (the policy is malformed/over-broad).
 */
async function applyPreAuth(store, uid, appKey, request, onError) {
    const plan = planPreAuthCapabilities(request.capabilities);
    if (!(0, exports.isPreAuthClean)(plan)) {
        return { ok: false, refused: plan.refused };
    }
    const mint = await (0, bootConsent_1.mintConsentedGrants)(store, uid, appKey, request.mounts, request.netFetchHosts, 'policy', onError);
    return { ok: mint.ok, refused: [], mint };
}
