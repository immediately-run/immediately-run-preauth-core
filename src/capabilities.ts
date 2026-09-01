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
  | 'chrome:read'
  | 'mounts:read'
  | 'mounts:registry'
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
  | 'editor:reveal'
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
  | 'feed:fetch'
  | 'secrets:add'
  | 'secrets:list'
  | 'secrets:revoke'
  | 'agent:session'
  | 'diagnostics:read'
  | 'llm:chat'
  | 'authoring:run'
  | 'analytics:emit'
  | 'device:geolocation'
  | 'device:camera'
  | 'device:microphone'
  // R3-485 (OSO §4.3 R-OSO-20): the ONE capability the out-of-session spec adds —
  // the elevated, app-scoped read of the host-owned recent-projects record.
  | 'recents:read'
  // R3-491 (UI_AS_APPS_SPEC §5.15 R-UAA-15): the baseline read of WHICH PROJECT the
  // editing session is on — the transport half of a fact `route:read` already
  // discloses, for panels that never receive `urlchange`.
  | 'workspace:read'
  // R3-500 (HOST_THEMING_SPEC §9.3): the elevated registry verbs — add-source /
  // remove-source on `protocol-theme`. Separated from `theme:set` because their
  // blast radius is "read repositories and spaces you pick in the theme picker",
  // NOT "change the site's appearance" — the §9.3 split keeps each grant's
  // consent copy honest.
  | 'theme:sources';

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
   *  is above the stage ceiling (granted only by a slot's elevated principal). The
   *  durable grant participates in the §8.15 90-day expiry like any app-scoped grant.
   *
   *  **The app-scoped set, in full** — this is a security boundary, so it is stated
   *  completely rather than by example. The authoritative form is DERIVED, never
   *  hand-maintained: `APP_SCOPED_CAPABILITIES` below filters this table on the flag,
   *  and `isAppScoped` is what every consumer branches on. As of registry 1.13.0 the
   *  twelve rows carrying it are:
   *
   *    `auth:identity` (R3-407) · `contribute:self` (decision #1 — its
   *    baseline→elevated reclassification landed in R3-33d) · `task:invoke` ·
   *    `net:fetch` · `feed:fetch` (R3-227) · `diagnostics:read` (R3-74 / P3-72, D4) ·
   *    `llm:chat` (D5) · `analytics:emit` (R3-350) · `device:geolocation` (R3-424) ·
   *    `device:camera` and `device:microphone` (R3-425) · `recents:read` (R3-485).
   *
   *  Two of those — `net:fetch` and `feed:fetch` — are additionally HOST-PARAMETERIZED
   *  (see `HOST_PARAMETERIZED_CAPABILITIES`), so they are never earned as a bare on/off
   *  capability: the durable authority IS their parameter set. The remaining nine are
   *  plain on/off grants. That distinction bounds what a grant CONVEYS; it does not
   *  narrow who may earn one, which is what `appScoped` decides. */
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
  // R3-500 (HOST_THEMING_SPEC §9.3): `protocol-theme {add-source, remove-source}`.
  // Elevated ACTION (not baseline — adopting a theme READS a picked repo/space);
  // NOT app-scoped — the theme switcher is a region-bound system app, and the
  // §9.3 picker-provenance rule (only a location the host journal saw a recent
  // open-bundle invocation of THAT app return) is the consent mechanism, so a
  // lazy first-use grant would defeat the machine-checked "the pick is the
  // consent" property.
  'theme:sources': { kind: 'action', tier: 'elevated', since: '1.15.0' },
  'auth:status': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  // R3-407: elevated read, app-scoped — a stage app EARNS the user's login/avatar
  // through the ordinary declared-capability consent path ('See your account'),
  // recorded per (app, principal) like every durable grant. Never baseline:
  // identity is asked for, not taken (an identity-by-default stage would be a
  // tracking/attribution leak to arbitrary third-party code).
  //
  // **`since` is 1.12.0, not 1.0.0 — a RECLASSIFICATION takes a registry version,
  // exactly as a new name does.** The row is old: an elevated, region-binding-only
  // identity read has existed since 1.0.0. What R3-407 changed is `appScoped`, and
  // that flag is not decoration — it IS the admission rule. `planPreAuthCapabilities`
  // below and site-main's `resolveGrantedFrameCaps` both branch on `isAppScoped`, so
  // one capability NAME means "mintable for a URL-loaded appKey" on one side of this
  // change and "region-binding-only, drop it" on the other.
  //
  // Left at 1.0.0 the change was invisible to the §5.11/T26 version gate, and what
  // that produced was a SILENT failure — the R3-233 validate-then-drop class, across
  // a version boundary instead of a code boundary. A minter holding the new registry
  // classifies `auth:identity` as app-scoped, mints a durable grant and answers
  // `ok: true`; a consumer holding the old registry reads that grant back, finds
  // `appScoped` falsy in ITS copy of this table, and drops the capability from the
  // frame — while `planMissingPlainCaps` skips it on the same predicate, so it is not
  // offered on the consent screen either. The user cannot grant it and nothing
  // anywhere reports a problem.
  //
  // The `device:*` rows do NOT have this problem, and the difference is the whole
  // point: they are new NAMES. An old host does not know the name, `isKnownCapability`
  // is false, and every path refuses by name — loudly (T26, "update immediately.run").
  // A known name whose FLAGS moved is refused nowhere, because no path compares flags
  // across versions; only `since` is comparable across versions at all. Moving it is
  // what puts the change back where the gate can see it.
  //
  // This takes nothing away from an older host: `since` is read out of the reader's
  // OWN table, so a consumer pinned below 1.12.0 keeps exactly the row it always had,
  // and no binding it can serve today starts being refused. What changes is that from
  // 1.12.0 on the version NUMBER identifies which of the two meanings is in play —
  // the same rule `feed:fetch` and `device:geolocation` each wrote down for a new
  // name, applied to a change of meaning.
  //
  // `since` alone is necessary but not sufficient, because two of the three consumers
  // of this flag never read `since`: `resolveGrantedFrameCaps` (site-main) and, until
  // R3-407's follow-up, `planPreAuthCapabilities`. The M1 gate is now version-aware
  // (see `m1PreAuth.ts`) so the mint path — the one that produces the orphan grant —
  // refuses rather than mints. The frame read-back stays a defence-in-depth filter.
  'auth:identity': { kind: 'read', tier: 'elevated', since: '1.12.0', appScoped: true },
  'route:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'formFactor:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  'mounts:read': { kind: 'read', tier: 'baseline', since: '1.0.0' },
  // Enumerate the session's mounts BEYOND the app's own — the Session-lens
  // "App | Session" superset (PRINCIPALS_SPEC §9 B2 / §8.9.1 / D-PRIN-4). Where
  // `mounts:read` is a per-app filter (own mounts only, baseline), this is the
  // cross-scope registry oracle: it reveals mounts the previewed app was never
  // granted (the editor/agent session's own), so it is an activity oracle exactly
  // like `settings:all`. **Permanently first-party-only:** a URL-loaded/previewed
  // fork of the File Explorer may hold the App lens (`mounts:read`) but NEVER the
  // Session lens — `buildConsent` refuses a first-party-only cap to a non-first-
  // party binding regardless of consent, `overridePolicy` strips it on a repoint
  // (D-PRIN-4 rejected both a forkable Session lens and a separate "session lens"
  // capability: this IS the settled `mounts:registry`, a view selector over the
  // mount registry, not a new power). Read kind — it gates the first-party
  // `session-mounts` push channel (§8.3 view() projection).
  'mounts:registry': { kind: 'read', tier: 'first-party-only', since: '1.5.0' },
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
  // Bring the user TO the editor across an activity boundary (R3-389,
  // TOOLS_ACTIVITY_SPEC §5.2). Strictly more than `editor:open`, which opens a file
  // in whatever column the editor already occupies: an activity that owns the main
  // pane UNMOUNTS the editor, so a surface there must be able to switch the active
  // activity for its click to be visible at all.
  //
  // That is an attention move, so it is the parameterized ESCALATION of `open`
  // (§8.4): `open({ reveal: true })` requires THIS instead of `editor:open`, and a
  // frame holding only `editor:open` is refused rather than silently downgraded to a
  // no-op reveal (T11).
  //
  // Elevated, and it buys no new REACH — the caller names a path, never an activity;
  // the host resolves which activity owns the editor from its own state, reads its
  // OWN `navigator.userActivation` (an app cannot forge it, and the gate fails closed
  // without it), and rate-limits. The authority is "may ask", not "may decide where
  // the user goes".
  'editor:reveal': { kind: 'action', tier: 'elevated', since: '1.9.0' },
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
  // Fire a host-constructed request TEMPLATE derived from trusted feed config
  // (`CONNECTOR_EGRESS_FIXING_SPEC` §2, D2). Deliberately a DISTINCT capability from
  // `net:fetch` rather than a narrower grant of it, because the two differ in what the
  // app supplies, not in how much: `net:fetch` takes a URL and checks it against an
  // allowlist, so within the allowed host set the app still picks the host, the path and
  // the body on every call. `feed:fetch` takes a feed-instance id and a typed param
  // object — there is no URL surface at all, so a connector steered by the bytes it
  // fetched (the metacircular-interpreter threat, `REPORTING_SPREADSHEET §3.2` RB-1) has
  // nothing to steer WITH.
  //
  // Holding both would erase that: a realm granted `feed:fetch` must NOT be granted
  // `net:fetch`, which is a property of what the connector's manifest declares, and is
  // why this is its own row rather than a flag on that one.
  //
  // Parameterized and host-parameterized: its durable authority IS the compiled template
  // set (origin + path + method + typed slots), so a bare on/off grant would be unbounded
  // in exactly the way a bare `net:fetch` grant would.
  'feed:fetch': { kind: 'action', tier: 'elevated', since: '1.8.0', parameterized: true, appScoped: true },
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
  // APP_ANALYTICS_SPEC §2 (R3-350): emit an app's OWN usage analytics through the
  // platform's pipeline, against a vocabulary the app declares in its manifest.
  //
  // **ELEVATED + appScoped, and NOT baseline.** The earlier spec draft wrote
  // "baseline, consented", which is not a tier and not a thing: `baseline` IS the
  // floor — `buildConsent` short-circuits `tier === 'baseline'` before generating any
  // consent line, and a previewed frame is seeded with the baseline set directly. At
  // baseline this would hand EVERY app on the platform an unconsented, unrevocable,
  // un-journalled egress capability. CAPABILITY_REFERENCE had already closed the
  // question: "'App-scoped' is NOT a fourth tier. It is a consent-path annotation on
  // the elevated tier."
  //
  // **Parameterized**, because the grant is not "may emit" but "may emit THIS
  // vocabulary": §2.1 hashes the manifest-declared vocabulary into the grant, and a
  // changed hash invalidates it. `appKey` carries no ref, so without that binding a
  // publisher could observe their aggregates and then ship an alphabet tuned to encode
  // what they now want to read, under a grant the user gave for a different one.
  'analytics:emit': { kind: 'action', tier: 'elevated', since: '1.6.0', parameterized: true, appScoped: true },
  // PRESENT_MODE_CHROME_SPEC §6 (R-PMC-17, R3-191): read the host's own present-mode
  // chrome state — whether the platform menu/sheet is open over the app, and which
  // edge the reveal tab sits on — so a platform-aware app MAY pause an animation
  // while it is dimmed, or keep its corner clear of the tab.
  //
  // **BASELINE, alongside `formFactor:read`.** Both are reads of the HOST's own UI
  // state, not of anything app-foreign: the app already knows it is being displayed,
  // and "chrome is currently over you" discloses nothing about the user, other apps,
  // the filesystem, or the network. There is no `chrome:set` counterpart — an app
  // cannot operate platform chrome, only observe it, so this cannot become an
  // authority-escalation path.
  //
  // R-PMC-18 is the reason it can be baseline without a consent line at all: no
  // platform behavior may depend on an app consuming this channel, so an app that
  // never reads it is indistinguishable from one that does.
  'chrome:read': { kind: 'read', tier: 'baseline', since: '1.7.0' },
  // UI_AS_APPS_SPEC §5.15 (R-UAA-15, R3-491) — which project the editing session is
  // on: `{ provider, namespace, repository, ref, label }`, or `null` when there is no
  // session (a standalone full-tab route, a task overlay).
  //
  // **BASELINE, and this is a transport fix rather than a disclosure decision.** The
  // very same coordinates already reach the previewed, UNTRUSTED stage app on the
  // baseline `route:read` channel: `urlchange` carries the session URL, from which
  // provider/namespace/repository/ref are read off directly. The host says so
  // outright — the elevated `editor:read` channel is scoped to what `urlchange` does
  // NOT already expose, expressly rather than re-classifying the route as
  // confidential. So this capability discloses nothing new; it exists because a
  // SELF-ROUTED panel (`drivesHostRoute = false`) keeps its own route and never
  // receives `urlchange`, and therefore cannot read a fact it is already entitled to.
  //
  // It is NOT app-scoped: there is no per-app dimension to "which project is loaded"
  // — it is one fact about the session, identical for every frame in it. And there is
  // no `workspace:set` counterpart (navigation stays a host action under the ordinary
  // consent), so observing it cannot become an authority-escalation path.
  //
  // Consumers MUST NOT assume `namespace` is a GitHub owner: a `local` session is
  // well-formed but not GitHub-shaped (`/edit/local/<project>-<hash8>/<project>/live`
  // reads back as `my-app-3fa9c2d1/my-app`).
  'workspace:read': { kind: 'read', tier: 'baseline', since: '1.14.0' },
  // BROWSER_CAPABILITIES_SPEC §2–§4 (R3-424) — the first `device:*` row: the HOST
  // calls `navigator.geolocation` at ITS OWN origin and hands the app coordinates.
  // It exists because the blocker is the ORIGIN, not policy: an app frame is
  // opaque-origin, browsers key permission grants on an origin, and
  // `getCurrentPosition` inside the frame never prompts — it just times out
  // (`code=3`). Widening the sandbox with `allow-same-origin` is off the table
  // (UI_AS_APPS G1/T1), so this follows the `net:fetch` shape: the app never gets
  // the browser handle, the host performs the privileged call and returns a
  // serialized result.
  //
  // **kind: 'action', not 'read'** — deliberately, and the same call the
  // `diagnostics:read` row made. `kind` names the ENFORCEMENT POINT, not the
  // English verb (see this file's header): a `read` is gated by a `view()`
  // projection on a channel the host is already maintaining (§8.3), an `action` is
  // gated before a handler runs (§8.4). There is no standing "position" state to
  // project — the value does not exist until the app asks the host to acquire it,
  // which turns on a sensor and (on first use per device) raises the browser's own
  // prompt. That is a host operation invoked on request, so §8.4 is the chokepoint
  // and `action` is what routes it there.
  //
  // **Elevated + appScoped**: above the stage floor and within the stage ceiling —
  // first use shows the powerbox consent naming the app and the device, the grant
  // persists on `(app, principal)` and is revocable from the same surfaces as a
  // space grant. Above the M3 ceiling: the M3 stance delegates nothing, so a
  // stranger's app is refused with no prompt at all (G-DEV-2). NOT parameterized:
  // the grant is a plain on/off, so it mints through the plain-cap path. A
  // coarse/precise split would make it parameterized; that stays an open question
  // in the spec rather than a shape guessed at here.
  'device:geolocation': { kind: 'action', tier: 'elevated', since: '1.10.0', appScoped: true },
  // BROWSER_CAPABILITIES_SPEC §2/§3 (R3-425) — the two CAPTURE devices. They take
  // `device:geolocation`'s shape exactly (`action` / `elevated` / `appScoped`, plain
  // on/off), for the same reasons written out on that row, so only what is DIFFERENT
  // about them is recorded here.
  //
  // The origin blocker is harsher than geolocation's, not softer: inside the app
  // frame `getUserMedia({video})`/`({audio})` does not merely fail to prompt, it
  // throws `SecurityError: Invalid security origin` outright (§1, measured). And the
  // richer result cannot be handed over either — a `MediaStreamTrack` is not
  // transferable between windows (`DataCloneError`), while `ImageBitmap`,
  // `ArrayBuffer`, `MessagePort` and `ReadableStream` all are. So the host opens the
  // device at its own origin and hands the app BYTES or FRAMES, never a handle.
  //
  // TWO THINGS FOLLOW FROM "capture", and they are the whole reason these are not
  // just more geolocation rows:
  //
  //  1. A capture has a LIVE SESSION with a duration a bystander can be caught in.
  //     While one is open the host shows a persistent indicator in its own chrome
  //     that the stage app cannot cover or remove (G-DEV-5) — the same rule that
  //     keeps sign-in in host chrome. A position read has no such session and needs
  //     no such indicator.
  //  2. The DEFAULT delivery is a one-shot capture task drawn by the HOST
  //     (`capture-photo@1` / `capture-audio@1`): the user frames the shot, taps Done,
  //     and the app receives bytes. The app is never in the loop while the device is
  //     live, so "nothing is recorded when the user cancels" is a property of the
  //     mechanism rather than a promise the app keeps.
  //
  // ONE capability per device, NOT one per delivery grade. The grade (one-shot bytes
  // vs. a live frame stream) is a property of the durable grant and the consent line
  // the user reads — never a per-call knob the app picks — which is the same rule
  // R3-424 wrote down for accuracy. Splitting the vocabulary by grade would mint a
  // name per grade and force a re-consent to add one; keeping the grade off the row
  // leaves the frame-stream grade additive.
  //
  // `device:clipboard` is deliberately NOT here — see the note under the table.
  'device:camera': { kind: 'action', tier: 'elevated', since: '1.11.0', appScoped: true },
  'device:microphone': { kind: 'action', tier: 'elevated', since: '1.11.0', appScoped: true },
  // R3-485 (OSO §4.3, R-OSO-20/21/22): the recents record is HOST-owned (the
  // dominant arrival path is a direct URL only the host observes), and page.home
  // reads it through this one elevated, app-scoped capability. It confers no
  // authority: an entry is a location, and opening it runs the ordinary load path
  // with the ordinary consent. Coordinates only — never in-repo paths.
  'recents:read': { kind: 'read', tier: 'elevated', since: '1.13.0', appScoped: true },
};

// `device:clipboard` — proposed in BROWSER_CAPABILITIES_SPEC §2, DELIBERATELY LEFT
// OUT of the vocabulary by R3-425.
//
// Not an oversight and not "no time": the spec's own open question is *"writes may be
// safe at the stage floor (the sandbox already allows copy via `execCommand`); reads
// should stay consented."* That question is about the row's TIER, and a single
// `device:clipboard` row cannot hold two tiers. Shipping one now would answer the
// question by accident — the exact failure R3-424 avoided by keeping the
// coarse/precise location split out of the call params.
//
// The vocabulary is CLOSED and VERSIONED, which makes a name expensive: if the
// answer turns out to be "write is baseline, read is elevated", the shape is two
// rows (`device:clipboard-read` / `device:clipboard-write`) and the single name
// shipped today would have to be deprecated — a published name that no longer means
// anything, in a registry whose whole value is that a version identifies a
// vocabulary. Nothing is lost by waiting: no capability is required to decide, and
// adding a row is additive.
//
// It is also outside this item. R3-425 is camera and microphone; clipboard has no
// capture session, no host-drawn capture surface and nothing for the G-DEV-5
// indicator to indicate, so it would arrive with none of the machinery that makes
// the two rows above enforceable.

// WHICH PACKAGE VERSIONS ACTUALLY EXIST. `ci.yml` publishes the HEAD-OF-MAIN version
// only — one push to main, one `npm publish` of whatever `package.json` says at that
// commit. A branch that bumps the version several times therefore publishes exactly its
// LAST bump, and the intermediate numbers never reach npm.
//
// On this branch that makes **0.1.15 and 0.1.16 intermediate branch states that are
// never published**: 0.1.15 (`72c4217`, `auth:identity` app-scoped) and 0.1.16
// (`edd6c16`, `device:geolocation`) exist only as commits. npm goes 0.1.14 -> 0.1.17,
// and **0.1.17 is the release that carries all three changes**. Cite 0.1.17 as the
// version anything on this branch ships in — a consumer that pins 0.1.15 or 0.1.16
// fails `npm ci` with `ETARGET`, and this repo's own consumer (site-main) pins
// EXACTLY, so it would be the one to hit it. The bumps are left in history rather than
// collapsed; this note is what stops the next reader hunting for a release that is not
// there.

/** The current registry/vocabulary version (§5.11). Bumped to 1.12.0 for a change that
 *  adds no NAME: `auth:identity`'s reclassification to `appScoped` (R3-407). A version
 *  is spent here for the same reason it is spent on a new row — the gate can only
 *  compare versions, so a change of MEANING that does not move `since` is a change the
 *  gate cannot see, and the resulting mismatch fails silently rather than loudly. The
 *  full reasoning is on the `auth:identity` row.
 *
 *  Note that R3-407 originally landed the reclassification INSIDE 1.9.0, which was
 *  already published (0.1.14) with the pre-reclassification meaning — so 1.9.0 briefly
 *  named two different vocabularies, the exact thing the `feed:fetch` and
 *  `device:geolocation` notes below each refused to allow. 1.12.0 is that mistake
 *  undone, not a second one: 1.10.0 and 1.11.0 keep the vocabularies the docs already
 *  record for them.
 *
 *  Prior notes — bumped to 1.11.0 with the elevated,
 *  app-scoped `device:camera` and `device:microphone` — the two CAPTURE devices
 *  (`BROWSER_CAPABILITIES_SPEC` §2/§3, R3-425). They share one version because they
 *  ship together and a host either has the capture broker + the host-chrome indicator
 *  or it has neither; a host on 1.10.0 refuses a binding that requests either (T26)
 *  rather than mounting with a camera that can never open. `device:clipboard` is NOT
 *  in this version — see the note above the table.
 *
 *  Prior notes — bumped to 1.15.0 with the ELEVATED `theme:sources`
 *  (`HOST_THEMING_SPEC` §9.3 — R3-500): the `protocol-theme {add-source,
 *  remove-source}` registry verbs, split out of `theme:set` so the consent copy of
 *  each stays honest. It takes its own version for the settled reason: 1.14.0 is
 *  already published (**0.1.19**, with `workspace:read`), and a registry version that
 *  does not identify a vocabulary is not much of a version gate. The T26 refusal is
 *  the RIGHT outcome here too — a host older than 1.15.0 cannot enforce the §9.3
 *  picker-provenance rule on `add-source`, so a binding that requests it would mount
 *  with the registry verbs silently inert.
 *
 *  Prior notes — bumped to 1.14.0 with the BASELINE `workspace:read`
 *  (`UI_AS_APPS_SPEC` §5.15 — R3-491). It takes its own version for the settled reason:
 *  1.13.0 is already published (**0.1.18**, with `recents:read`), and a registry version
 *  that does not identify a vocabulary is not much of a version gate. The T26 refusal is
 *  the RIGHT outcome here too — a host older than 1.14.0 publishes no workspace channel,
 *  so a binding that requests the capability would mount with the read permanently
 *  silent, and a panel cannot tell a silent host from one reporting "no session".
 *
 *  Prior notes — bumped to 1.10.0 with the elevated,
 *  app-scoped `device:geolocation` — the first host-brokered `device:*` row
 *  (`BROWSER_CAPABILITIES_SPEC` §2–§4, R3-424). It takes its own version for the same
 *  reason `feed:fetch` did: 1.9.0 is already published (**0.1.14**, with
 *  `editor:reveal` — commit `8f7ac42`, which is the release that bumped the package to
 *  0.1.14; 0.1.15 is this branch's own unpublished commit, NOT a release), and a
 *  registry version that does not identify a vocabulary is not much of a version
 *  gate. A host older than 1.10.0 refuses a binding that requests `device:geolocation`
 *  (T26) rather than mounting with the sensor silently inert.
 *
 *  Prior notes — bumped to 1.8.0 with the elevated,
 *  app-scoped, host-parameterized `feed:fetch` (`CONNECTOR_EGRESS_FIXING_SPEC` §2 —
 *  R3-227), mirroring capabilities.json. (1.7.0 added the baseline state read
 *  `chrome:read`; 1.6.0 added `analytics:emit`; 1.5.0 added the first-party-only
 *  `mounts:registry`; 1.4.0 added `authoring:run`; 1.3.0 added the provider-agnostic
 *  `llm:chat` slot; 1.2.0 added the per-user settings-space capabilities.)
 *
 *  `feed:fetch` takes its OWN version rather than joining 1.7.0, even though both land
 *  close together: 1.7.0 is already published (0.1.12, with `chrome:read`), so reusing it
 *  would mean two different published vocabularies both answering "1.7.0" — and a
 *  registry version that does not identify a vocabulary is not much of a version gate.
 *  A host older than 1.8.0 therefore refuses a binding that requests `feed:fetch` (T26)
 *  rather than mounting half-working, which is the right outcome: a host that cannot
 *  enforce target-fixing must not run a connector that assumes it. */
export const REGISTRY_VERSION = '1.15.0';

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

/** App-scoped caps whose durable authority is a PARAMETER SET minted on its own
 *  path: `net:fetch` (its granted host set, §5.11) and `feed:fetch` (its compiled
 *  request templates, `CONNECTOR_EGRESS_FIXING_SPEC` §2). These are granted by that
 *  path, never as a bare on/off capability: a bare `net:fetch` grant would be
 *  UNBOUNDED (every origin), and a bare `feed:fetch` grant would be unbounded the
 *  same way (no template, hence no fixed target), so the plain-capability mint
 *  (R3-233) MUST exclude them. `task:invoke` is `parameterized` too but its bound is
 *  the app's manifest `invokes` (§5.8), not a durable grant param, so it IS a plain
 *  on/off grant. */
export const HOST_PARAMETERIZED_CAPABILITIES: readonly Capability[] = ['net:fetch', 'feed:fetch'];

export function isHostParameterized(cap: Capability): boolean {
  return HOST_PARAMETERIZED_CAPABILITIES.includes(cap);
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
