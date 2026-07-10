import type { GrantMode, MintPath, MintStore, NetFetchHost } from './port';
/** A consent-screen selection (structurally `MountConsentSelection` from
 *  site-main's editor layer; redefined here so this layer stays UI-free). */
export type ConsentSelection = {
    uri: string;
    mode: GrantMode;
    kind: 'pick';
    spaceId: string;
    name?: string;
} | {
    uri: string;
    mode: GrantMode;
    kind: 'create';
    name?: string;
};
export interface MintResult {
    /** False if ANY grant failed to mint — the caller treats the start as failed. */
    ok: boolean;
    /** Whether the net:fetch host grant succeeded (vacuously true when none was
     *  requested) — the post-boot caller lifts the frame cap on this alone, even
     *  if a mount selection failed (matching its historical behavior). */
    netFetchOk: boolean;
    /** Whether the plain app-scoped capability grant succeeded (vacuously true when
     *  none was requested), R3-233. False when caps were requested but the store has
     *  no `grantAppCapabilities` (fail-loud, never validate-then-drop) or the write
     *  threw — the caller lifts those frame caps only on `true`. */
    capabilitiesOk: boolean;
    /** Successfully minted per-selection space ids (for post-boot provisioning). */
    minted: {
        selection: ConsentSelection;
        spaceId: string;
    }[];
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
export declare function mintConsentedGrants(store: MintStore, uid: string, appKey: string, selections: readonly ConsentSelection[], netFetchHosts: readonly NetFetchHost[], mintPath?: MintPath, onError?: MintErrorSink, 
/** PLAIN app-scoped on/off capabilities to grant (R3-233) — `task:invoke`,
 *  `llm:chat`, `contribute:self`, `diagnostics:read`. NOT `net:fetch` (host-
 *  parameterized — granted via `netFetchHosts` above); the caller (`applyPreAuth`)
 *  filters host-parameterized caps out. Defaults to none, so existing callers that
 *  only mint mounts + hosts are unaffected. */
capabilities?: readonly string[]): Promise<MintResult>;
