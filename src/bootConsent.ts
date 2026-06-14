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

import type { GrantMode, MintPath, MintStore, NetFetchHost } from './port';

/** A consent-screen selection (structurally `MountConsentSelection` from
 *  site-main's editor layer; redefined here so this layer stays UI-free). */
export type ConsentSelection =
  | { uri: string; mode: GrantMode; kind: 'pick'; spaceId: string; name?: string }
  | { uri: string; mode: GrantMode; kind: 'create'; name?: string };

export interface MintResult {
  /** False if ANY grant failed to mint — the caller treats the start as failed. */
  ok: boolean;
  /** Whether the net:fetch host grant succeeded (vacuously true when none was
   *  requested) — the post-boot caller lifts the frame cap on this alone, even
   *  if a mount selection failed (matching its historical behavior). */
  netFetchOk: boolean;
  /** Successfully minted per-selection space ids (for post-boot provisioning). */
  minted: { selection: ConsentSelection; spaceId: string }[];
}

/** Observe a per-item mint failure (logging only — authority is unaffected). The
 *  `ctx` is a stable English phrase; the host decides how/whether to log it. */
export type MintErrorSink = (ctx: string, err: unknown) => void;

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
export async function mintConsentedGrants(
  store: MintStore,
  uid: string,
  appKey: string,
  selections: readonly ConsentSelection[],
  netFetchHosts: readonly NetFetchHost[],
  mintPath: MintPath = 'interactive',
  onError?: MintErrorSink,
): Promise<MintResult> {
  let ok = true;
  let netFetchOk = true;
  if (netFetchHosts.length > 0) {
    try {
      await store.grantNetFetchHosts({ uid, appKey, hosts: netFetchHosts });
    } catch (err) {
      onError?.('net:fetch grant failed', err);
      ok = false;
      netFetchOk = false;
    }
  }
  const minted: MintResult['minted'] = [];
  for (const sel of selections) {
    try {
      const spaceId =
        sel.kind === 'create'
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
    } catch (err) {
      onError?.('consent grant minting failed', err);
      ok = false;
    }
  }
  return { ok, netFetchOk, minted };
}
