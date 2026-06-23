// The capability-definition registry — the Host-core source of truth
// (UI_AS_APPS_SPEC §5.11 / §8.2). "Host-core capabilities are a closed,
// kernel-defined vocabulary an app cannot extend" (core_concepts §5): apps
// cannot mint one, only be granted one. This module mirrors docs/capabilities.json
// (the machine-readable companion); the host build is authoritative.
//
// Two enforcement points consume this (later slices): reads are gated per-grant
// with a view() projection on a channel (§8.3); actions are gated before the
// handler (§8.4). Parameterized capabilities additionally bound an argument set.

export type CapabilityKind = 'read' | 'action';
export type CapabilityTier = 'baseline' | 'elevated' | 'first-party-only';

export type Capability =
  | 'theme:read'
  | 'theme:set'
  | 'auth:status'
  | 'auth:identity'
  | 'route:read'
  | 'formFactor:read'
  | 'mounts:read'
  | 'spaces:app'
  | 'spaces:user'
  | 'spaces:admin'
  | 'settings:app'
  | 'settings:fork'
  | 'settings:all'
  | 'contribute:self'
  | 'contribute:any'
  | 'contribute:direct'
  | 'editor:read'
  | 'editor:open'
  | 'editor:write'
  | 'editor:document'
  | 'editor:requestEdit'
  | 'vcs:read'
  | 'vcs:reset'
  | 'dnd:source'
  | 'catalog:read'
  | 'commands:read'
  | 'commands:run'
  | 'ipc'
  | 'task:invoke'
  | 'net:fetch'
  | 'secrets:add'
  | 'secrets:list'
  | 'secrets:revoke'
  | 'agent:session'
  | 'diagnostics:read'
  | 'llm:chat'
  | 'authoring:run';

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
   *  is above the stage ceiling (granted only by a slot's elevated principal). The app-scoped set is `net:fetch`, `task:invoke`,
   *  `contribute:self` (decision #1 — its baseline→elevated reclassification landed
   *  in R3-33d), and `diagnostics:read` (R3-74 / P3-72, D4); the durable grant
   *  participates in the §8.15 90-day expiry like any app-scoped grant. */
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

export const CAPABILITIES: Record<Capability, CapabilityDef> = {
  'theme:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'theme:set': { kind: 'action', tier: 'elevated', since: '1.0.0' },
  'auth:status': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'auth:identity': { kind: 'read', tier: 'elevated', since: '1.0.0' },
  'route:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'formFactor:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'mounts:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'spaces:app': { kind: 'action', tier: 'baseline', since: '1.0.0', parameterized: true },
  'spaces:user': { kind: 'action', tier: 'elevated', since: '1.0.0' },
  'spaces:admin': { kind: 'action', tier: 'elevated', since: '1.0.0' },
  // Per-user settings space (UI_AS_APPS_SPEC §3.3/§3.5/§8.2; settings-space plan).
  // The app's OWN `~/.config`-style subdir, auto-provisioned + chroot'd by appKey.
  // Baseline: every app may open its own config with no consent (the host derives
  // the appKey from the caller, so a different `settings:` locator can't be named).
  'settings:app': { kind: 'action', tier: 'baseline', since: '1.2.0' },
  // One-time SEED of the declared `forkOf` parent's settings into the app's own
  // subdir (§3.4 lineage). Baseline action — the target is locked to the manifest
  // `forkOf`, so it can never name another app — but the HANDLER gates each call on
  // a user confirm (full explicit consent when cross-owner, a light confirm when
  // the same owner published both apps). The consent is a per-action prompt, not a
  // durable §8.15 grant (the copy lands in the app's own dir; nothing to revoke).
  'settings:fork': { kind: 'action', tier: 'baseline', since: '1.2.0' },
  // Mount ANY app's settings subdir / enumerate the whole `settings-store/{uid}`
  // tree — the filesystem-manager ("file commander") surface. Permanently
  // first-party-only: cross-app config is an activity oracle (like a future
  // `mounts:registry`), so a fork/preview can never hold it.
  'settings:all': { kind: 'action', tier: 'first-party-only', since: '1.2.0' },
  'contribute:self': { kind: 'action', tier: 'elevated', since: '1.0.0', appScoped: true },
  'contribute:any': { kind: 'action', tier: 'elevated', since: '1.0.0', parameterized: true },
  // Decision #2 (R3-33d, landed): contribute:direct is the platform's scariest
  // write, rendered maximally-explicit. The tier is now **elevated/consentable**
  // (no longer first-party-only) so source-control panels stay forkable (value 4) —
  // a fork CAN hold it, but only behind the distinct scary consent line, never
  // bundled. `maximallyExplicit` (not the tier) is what keeps the line scary.
  'contribute:direct': { kind: 'action', tier: 'elevated', since: '1.0.0', parameterized: true, maximallyExplicit: true },
  'editor:read': { kind: 'read', tier: 'elevated', since: '1.0.0' },
  // Ask the host to open a working-tree file in the CodeMirror editor (§4 — the
  // file explorer's click-to-open). An INTENT, not editor ownership (§2): the host
  // validates the path and drives Sandpack. Elevated — it moves the host's focus,
  // so a previewed app must not hold it; only a consented/build-default binding.
  'editor:open': { kind: 'action', tier: 'elevated', since: '1.0.0' },
  // Mutate the editor session's working tree — create/delete/rename/upload a file
  // (migrate-sidebars Phase 04, EDITOR_AS_APP_SPEC §5.2). A NARROW, per-path gated
  // action: the file explorer NAMES a path and the HOST performs the COW write
  // (and notifies Sandpack) — the COW/journal stays in the Host (§2/§4). The
  // explorer holds no working-tree write PORT (that broad authority is the
  // editor app's `editor:document`); it must ask. **Elevated, not first-party-only**
  // (EDITOR_AS_APP_SPEC §5.1 forkability rule): mutating the user's OWN working copy
  // does not escape the user's session (no push, no host token, no cross-user reach —
  // saves stay separately gated, the diff is host-computed), so it is a consentable
  // grant a user may extend to a fork of the file explorer. `first-party-only` is
  // reserved for session-ESCAPING authority (e.g. `contribute:direct`).
  // Decision #2: editor:write is consentable (elevated, forkable — mutating the
  // user's OWN working copy doesn't escape their session), but behind the
  // maximally-explicit scary line.
  'editor:write': { kind: 'action', tier: 'elevated', since: '1.0.0', maximallyExplicit: true },
  // The editor APP's own session-management capability (EDITOR_AS_APP_SPEC §5.1;
  // editor-as-app plan Phase 03). Gates the `protocol-editor close`/`setActive`
  // intents — mutating the editor's OWN open-tab set + active file, which only the
  // bound editor should drive (NOT the file explorer, which holds `editor:open` to
  // *ask* the host to open a file, a distinct cross-app intent). Elevated and
  // forkable via consent: managing the user's own editor view does not escape their
  // session (no push, no token, no cross-user reach), so a user may extend it to a
  // forked editor. It will additionally gate the editor app's session/diagnostics
  // channels as those land (plan Phase 02). NOT the rw working-tree port — that is
  // the region property `exposesWorkingTree:'rw'`, not this capability.
  'editor:document': { kind: 'action', tier: 'elevated', since: '1.1.0' },
  // Enter the EDIT EXPERIENCE for the running app — the present→edit transition
  // (`/present/...` → `/edit/...`) an app cannot make itself (EDITOR_FIRST_EDITING_SPEC
  // §6 Delta A). An INTENT (§2): the host performs the visible, user-observable
  // navigation and draws all editor chrome; the app never navigates or paints chrome.
  //
  // Tier — BASELINE, deliberately, and only safe because the transition is STRICTLY
  // self-scoped: the HANDLER reads only a same-repo, traversal-free `path` and
  // navigates within the CURRENT route (it cannot be pointed at another repo — the
  // gate validates the `path` shape, T4). Unlike `editor:open` (elevated — it can
  // yank focus to an ARBITRARY file from a hostile preview), entering edit on the
  // repo the user is ALREADY viewing is no escalation: edit mode adds host-drawn
  // chrome around the same sandboxed app, granting it NO new capability, and "view
  // your own source" is already the §0 promise. Baseline is also the ONLY tier that
  // lets a standalone present-mode app (which holds only baseline) offer an "edit
  // this" affordance instead of shipping a bespoke editor — the whole point of the
  // delta. **PROPOSED tier, pending capability-owner sign-off (EDITOR_FIRST_EDITING_
  // SPEC §8 open question #1):** flipping to elevated is a one-token change here.
  'editor:requestEdit': { kind: 'action', tier: 'baseline', since: '1.1.0' },
  // Source-control state read surface (migrate-sidebars Phase 05) — the diff
  // summary + branch info + open-PR list the `panel.contribute` app needs to reach
  // parity with the native `SourceControlPanel`. Elevated: it exposes the repo's
  // branch/PR/diff state (no token ever crosses — derived host-side), so a
  // baseline/previewed frame gets an empty `VcsState`, never a leak.
  'vcs:read': { kind: 'read', tier: 'elevated', since: '1.1.0' },
  // Discard the working tree — `resetWorkingTree()` wipes the COW writable layer +
  // clears the journal, destroying the user's UNSAVED work irreversibly and
  // UNREVIEWABLY. **First-party-only** (the first cap to re-enter this tier after
  // R3-33d emptied it): only a pinned build-default `panel.contribute` binding may
  // hold it — a fork/preview/third-party binding can NEVER discard the user's work,
  // enforced by tier (`buildConsent` refuses it to a non-first-party binding,
  // `overridePolicy` strips it on a repoint). Marked maximally-explicit so the one
  // first-party line that does carry it renders with the scariest styling.
  'vcs:reset': { kind: 'action', tier: 'first-party-only', since: '1.1.0', maximallyExplicit: true },
  // Initiate a host-mediated cross-app DRAG-OUT into the previewed app
  // (FILE_EXPLORER_SPEC §7, R3-83). The source app calls `startItemDrag(item)`;
  // the host draws the trusted drag ghost, tracks the pointer across the
  // cross-origin iframe boundary (which native HTML5 DnD cannot cross), and on a
  // drop over the preview delivers `{ item, from, position }` to a SUBSCRIBED
  // receiver. Synthesizing a drag INTO a sibling app is an injection / clickjacking
  // primitive (FE-DND-1), so this is **first-party-only**: only a pinned
  // build-default chrome binding (the file explorer) may hold it — a fork / preview
  // / third-party binding can NEVER initiate a cross-app drag, enforced by tier
  // (`buildConsent` refuses it to a non-first-party binding, never offering a
  // consent line, exactly like `vcs:reset`). Marked maximally-explicit so the one
  // first-party line that carries it renders with the scariest styling. (Tier is
  // `first-party-only`, the SAME tier as `vcs:reset` — NOT `editor:write`, which is
  // elevated/consentable: S4 in spec-review-3.5 corrected the FILE_EXPLORER prose
  // that wrongly equated this tier with `editor:write`. CAPABILITY_REFERENCE records
  // `dnd:source` as first-party-only, which this dict matches.) Receiving a drop
  // needs NO new grant — the previewed app opts in by subscribing (`onItemDrop`).
  'dnd:source': { kind: 'action', tier: 'first-party-only', since: '1.2.0', maximallyExplicit: true },
  // The §5.5 method catalog (the app's own filtered RPC surface) — baseline:
  // every app may discover what IT can call; the list is grant-filtered so it
  // reveals nothing the app couldn't already invoke.
  'catalog:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'commands:read': { kind: 'read', tier: 'elevated', since: '1.0.0' },
  'commands:run': { kind: 'action', tier: 'elevated', since: '1.0.0' },
  ipc: { kind: 'action', tier: 'elevated', since: '1.0.0', parameterized: true },
  // Invoke another app via a task contract (§5.7). Elevated: summoning overlays +
  // delegating file caps is real authority. Parameterized — the task set is bounded
  // by the app's manifest `invokes` declaration (§5.8), enforced in the handler.
  'task:invoke': { kind: 'action', tier: 'elevated', since: '1.0.0', parameterized: true, appScoped: true },
  'net:fetch': { kind: 'action', tier: 'elevated', since: '1.0.0', parameterized: true, appScoped: true },
  // Host-owned secret store (SECRETS_SPEC §4). All elevated; the value is never
  // readable by any app (`secrets:list` exposes metadata only). `secrets:add`
  // opens a host-drawn modal; `secrets:revoke` deletes + cascades use-grants. The
  // per-(app,secret) USE grant is NOT a capability row — it is minted via the
  // `requestSecret` powerbox (gated by `net:fetch`, since a secret is only usable
  // through §6 injection).
  'secrets:add': { kind: 'action', tier: 'elevated', since: '1.1.0' },
  'secrets:list': { kind: 'read', tier: 'elevated', since: '1.1.0' },
  'secrets:revoke': { kind: 'action', tier: 'elevated', since: '1.1.0' },
  // R3-76 (P3-74, LLM_AND_AGENTS_SPEC §3.4/§4; LOCAL_DEV_AUTHED_SERVER_SPEC):
  // open and drive a user-local Claude Code via the bridge — the in-browser Host
  // connects OUT to the CLI's authenticated localhost server and runs each
  // tool call through its §8.4-gated invoke(). Promoted from proposed/since:null
  // to a defined, gated, elevated capability landing in the current 1.2.0
  // registry — gated host-side by `protocol-agent` (site-main actionGate) and held
  // by the Agent-panel system app. Elevated and NOT app-scoped: a URL-loaded app
  // cannot earn it via lazy/manifest consent (region binding only) — driving the
  // user's local machine is first-party-grade authority, never silently earnable.
  'agent:session': { kind: 'action', tier: 'elevated', since: '1.2.0' },
  // R3-74 (P3-72, LLM_AND_AGENTS_SPEC §3.3/§4, D4): a sibling agent app reading the
  // PREVIEWED app's own build/transpile errors + captured console — the in-browser
  // analogue of a local agent reading compiler output. App-scoped elevated so a
  // URL-loaded agent can EARN it via lazy/manifest consent (a clean, withholdable
  // consent line, D4); read-only and scoped to the paired previewed app's own
  // diagnostics (no cross-app bleed — enforced host-side by the channel projection).
  'diagnostics:read': { kind: 'action', tier: 'elevated', since: '1.2.0', appScoped: true },
  // SERVICE_PROVIDERS_SPEC `llm.chat@1` / LLM_AND_AGENTS_SPEC D5: invoke the shared,
  // provider-agnostic chat slot. ("provider" here = the Service-provider sense —
  // an App that provides a Service, core_concepts §6 — and "slot" here = a Service
  // interface, not the UI Slot of core_concepts §3; the names mirror the
  // SERVICE_PROVIDERS surface and are kept.) The app calls ONE slot; the host resolves which
  // vendor answers from the key the user holds (`SecretView.boundOrigin`) + their
  // `preferredImplementation` choice, injects the key host-side (§6, look-at-nothing
  // proxy), and streams normalized deltas back. The app never names a vendor, never
  // sees the key, and needs NO `net:fetch`/`secrets` grant of its own — only this.
  // Elevated + app-scoped: a fork/previewed app EARNS it via lazy/manifest consent
  // (the fork-needs-more-caps story), recorded as a per-(user,appKey) §8.15 grant.
  'llm:chat': { kind: 'action', tier: 'elevated', since: '1.3.0', appScoped: true },
  // Authoring services (CLIENT_SERVICES_SPEC §6, R3-107): typecheck/lint/format
  // source via a kernel-owned same-origin worker (the in-browser coding agent's
  // quality tools, LLM_AND_AGENTS §3.3). Baseline action — the worker only
  // transforms data the app already holds and returns diagnostics, runs under host
  // authority with nothing to confine (§3a), and is bounded per call (timeout +
  // input-size). Not app-scoped: it confers no authority over other apps/mounts.
  'authoring:run': { kind: 'action', tier: 'baseline', since: '1.4.0' },
};

/** The current registry/vocabulary version (§5.11). Bumped to 1.4.0 with the
 *  `authoring:run` capability (the kernel authoring services — CLIENT_SERVICES §6,
 *  R3-107), mirroring capabilities.json. (1.3.0 added the provider-agnostic
 *  `llm:chat` slot; 1.2.0 added the per-user settings-space capabilities.) */
export const REGISTRY_VERSION = '1.4.0';

/** Is `cap` a known host-core capability? (Closed vocabulary — §5.12.) */
export function isKnownCapability(cap: string): cap is Capability {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, cap);
}

export function tierOf(cap: Capability): CapabilityTier {
  return CAPABILITIES[cap].tier;
}

/** Baseline = what the previewed app and any unconsented binding may hold. */
export const BASELINE_CAPABILITIES: readonly Capability[] = (
  Object.keys(CAPABILITIES) as Capability[]
).filter((c) => CAPABILITIES[c].tier === 'baseline');

export function isBaseline(cap: Capability): boolean {
  return CAPABILITIES[cap].tier === 'baseline';
}

/** App-scoped consentables — the elevated caps a previewed/forked app may EARN
 *  via lazy first-use or manifest-`requests` consent (§8.9/§8.15), as opposed to
 *  region-binding-only elevated caps. (`contribute:self` joined this set in R3-33d
 *  per decision #1.) */
export const APP_SCOPED_CAPABILITIES: readonly Capability[] = (
  Object.keys(CAPABILITIES) as Capability[]
).filter((c) => CAPABILITIES[c].appScoped === true);

export function isAppScoped(cap: Capability): boolean {
  return CAPABILITIES[cap].appScoped === true;
}

// ── §5.11 capability version gate (threat T26) ──────────────────────────────
//
// Each capability declares the lowest registry version that knows it (`since`).
// A binding may reference a capability this host is too old to enforce (an
// override / synced binding authored against a newer immediately.run). Mounting
// it would mount-then-break, so the loader must refuse with an actionable
// "update immediately.run" message (§6.3) — never a half-working region.

/** Compare dotted numeric versions: <0 if a<b, 0 if equal, >0 if a>b. Missing
 *  segments are treated as 0 ("1.2" === "1.2.0"); non-numeric segments as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = Number.parseInt(pa[i] ?? '0', 10) || 0;
    const y = Number.parseInt(pb[i] ?? '0', 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** A capability is supported iff it is known AND its `since` ≤ the host version. */
export function isSupportedCapability(
  cap: string,
  hostVersion: string = REGISTRY_VERSION,
): boolean {
  if (!isKnownCapability(cap)) return false;
  return compareVersions(CAPABILITIES[cap].since, hostVersion) <= 0;
}

/**
 * The subset of `caps` this host cannot enforce — unknown to its vocabulary, or
 * declared at a `since` newer than `hostVersion`. A non-empty result means the
 * region must refuse to mount with "update immediately.run (missing: …)" (T26).
 * `hostVersion` is injectable so an older host can be simulated in tests.
 */
export function unsupportedCapabilities(
  caps: readonly string[],
  hostVersion: string = REGISTRY_VERSION,
): string[] {
  return caps.filter((c) => !isSupportedCapability(c, hostVersion));
}
