"use strict";
// The ONE grant-mint path (UI_AS_APPS_SPEC §8.15). `mintConsentedGrants` turns a
// consent choice into durable §8.7/§8.15 grants. It is shared by EVERY surface
// that records a grant so they cannot drift:
//   - site-main's before-boot gate + the post-boot fallback (SandboxListener) at
//     `interactive` (M3) provenance,
//   - the M1 pre-auth write path (`applyPreAuth`) at `policy` provenance, in both
//     the browser (settings UI) and the backend `POST /preauth` executor.
//
// `mintPath` only stamps the §8.7 grant's PROVENANCE (the §8.11 audit label +
// revoke-cascade key); it does not change WHAT is minted — the §8.9 target check
// that bounds M1 lives in its caller (`m1PreAuth.ts`).
//
// Pure orchestration over the narrow `MintStore` port (3 methods). No React, no
// Firebase, no environment-specific logging: a caller passes `onError` to observe
// per-item failures (site-main wraps it with its `[Main-iframe]` logger; the
// backend logs with its own prefix), so this module never masquerades as a
// particular runtime.
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintConsentedGrants = mintConsentedGrants;
/**
 * Turn an Allow choice into durable grants: net:fetch hosts (all-or-nothing —
 * the screen showed exactly these), then per mount selection create-or-bind the
 * space to its slot and record the §8.7 grant. Never throws; per-item failures
 * are surfaced through `ok`/`netFetchOk` (and `onError`, if provided).
 *
 * The durable §8.7 grant IS the binding now (no separate slot): `declaredUri`
 * records which §11.4 declared mount it satisfies, so a later boot re-provisions
 * it without re-consent.
 */
async function mintConsentedGrants(store, uid, appKey, selections, netFetchHosts, mintPath = 'interactive', onError, 
/** PLAIN app-scoped on/off capabilities to grant (R3-233) — `task:invoke`,
 *  `llm:chat`, `contribute:self`, `diagnostics:read`. NOT `net:fetch` (host-
 *  parameterized — granted via `netFetchHosts` above); the caller (`applyPreAuth`)
 *  filters host-parameterized caps out. Defaults to none, so existing callers that
 *  only mint mounts + hosts are unaffected. */
capabilities = []) {
    let ok = true;
    let netFetchOk = true;
    if (netFetchHosts.length > 0) {
        try {
            await store.grantNetFetchHosts({ uid, appKey, hosts: netFetchHosts });
        }
        catch (err) {
            onError?.('net:fetch grant failed', err);
            ok = false;
            netFetchOk = false;
        }
    }
    // Plain app-scoped capability grants (R3-233). Fail LOUD if asked to mint caps but
    // the adapter has no `grantAppCapabilities` — a silent skip would resurrect the
    // exact validate-then-drop bug this fixes.
    let capabilitiesOk = true;
    if (capabilities.length > 0) {
        if (!store.grantAppCapabilities) {
            onError?.('capability grant unsupported by this store', new Error('grantAppCapabilities not implemented'));
            ok = false;
            capabilitiesOk = false;
        }
        else {
            try {
                await store.grantAppCapabilities({ uid, appKey, capabilities, mintPath });
            }
            catch (err) {
                onError?.('capability grant failed', err);
                ok = false;
                capabilitiesOk = false;
            }
        }
    }
    const minted = [];
    for (const sel of selections) {
        try {
            const spaceId = sel.kind === 'create'
                ? await store.createSpace({ owner: uid, name: sel.name, appKey })
                : sel.spaceId;
            await store.grantSpaceToApp({
                uid,
                appKey,
                spaceId,
                name: sel.name,
                mode: sel.mode,
                declaredUri: sel.uri,
                mintPath,
            });
            minted.push({ selection: sel, spaceId });
        }
        catch (err) {
            onError?.('consent grant minting failed', err);
            ok = false;
        }
    }
    return { ok, netFetchOk, capabilitiesOk, minted };
}
