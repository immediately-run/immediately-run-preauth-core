# CODE_SPEC_REFERENCES — `@immediately-run/preauth-core`

The shared **source of truth** for the capability vocabulary + the §8.9 pre-auth
target check + the single grant-mint path. Consumed by `immediately-run-site-main`
(browser Firestore) and `immediately-run-backend` (admin Firestore) so there is ONE
gate, ONE mint path, ONE wire layout (UI_AS_APPS §8.9/§8.15, CAPABILITY_REFERENCE).
Seeded by the code-verification pass (`docs/plans/code-verification/07-preauth-core.md`,
roadmap R3-124 / R3-123).

## Findings log

| Area | Finding | Disposition |
|---|---|---|
| CAPABILITY_REFERENCE / vocabulary publish lag | **The published `@immediately-run/preauth-core@0.1.1` dist lagged its source.** `src/capabilities.ts` (and the committed `dist/`) carry `llm:chat` (`REGISTRY_VERSION = '1.3.0'`), but the npm-published `0.1.1` artifact predates it and the package version was never bumped — so consumers' `^0.1.0` resolved to a dist **without `llm:chat`**, reddening site-main's `capabilitiesManifest`/`catalog` suites + `tsc` (`actionGate.ts` `"llm:chat" not assignable to Capability`). The committed dist is current with source (rebuild is a no-op). | **FIXED 2026-06-22:** bumped `0.1.1 → 0.1.2` (mirrors "Release 0.1.1: publish the diagnostics:read vocabulary addition"). On merge to `main`, `.github/workflows/ci.yml` trusted-publishing auto-publishes `0.1.2` (it skips only already-published versions), then site-main's `npm ci` (`^0.1.0`) resolves `llm:chat` and the mirror suites go green. **Remaining manual step:** none for publish (CI), but site-main's lockfile updates on its next `npm install`/CI run. |
| CAPABILITY_REFERENCE / `contribute:self` (C6) | `contribute:self` = `{ kind:'action', tier:'elevated', appScoped:true }` (`src/capabilities.ts`, joined the consentables in R3-33d / decision #1). This is the **source of truth** behind site-main's committed mirror — C6 ("ships baseline") is on the safe side here, not in site-main. | Verified (see site-main `CODE_SPEC_REFERENCES.md` C6 row). |
| CAPABILITY_REFERENCE / `dnd:source` (S4) | `dnd:source` = `{ kind:'action', tier:'first-party-only', maximallyExplicit:true }` (`src/capabilities.ts`). The dict TIER matches the spec-review-3.5 S4 resolution (CAPABILITY_REFERENCE records `dnd:source` first-party-only). The only defect was stale **prose**: a comment equated this tier with `editor:open`/`editor:write` (which are *elevated*, not first-party-only — the exact internal contradiction S4 flagged in FILE_EXPLORER §7.2). | **FIXED 2026-06-22 (comment-only):** corrected the `dnd:source` comment to state the tier is first-party-only (same as `vcs:reset`, NOT `editor:write`), citing S4. No tier/code change — the dict was already correct. |
| Spec-ref currency (dim 1) | All inline spec refs verified current against `/home/user/docs/specs/`: UI_AS_APPS_SPEC §8.7 (Permissions as file access / scoped mounts), §8.9 (Trust & consent), §8.15 (Manifest-declared consent) all exist and say what the comments claim. The opaque `plan 12 §8.7` refs (`docLayout.ts`, `port.ts`, `docLayout.test.ts`) traced to `docs/plans/ui-as-apps/12-stage2-kickoff.md`, which folds into **UI_AS_APPS_SPEC §8.7**. | **FIXED 2026-06-22 (comment-only):** replaced `plan 12 §8.7` → `UI_AS_APPS_SPEC §8.7` (3 src/test sites). |
| §8.9 gate + mint-path behavior (dim 1) | Verified `planPreAuthCapabilities` partitions correctly (app-scoped-elevated + baseline grantable; broad-elevated + unknown refused) and `applyPreAuth` is all-or-nothing (any refusal ⇒ zero mints, store untouched). `mintConsentedGrants` never throws (per-item `ok`/`onError`). | Verified — `m1PreAuth.adversarial.test.ts` (the hostile-policy property) green; 22/22 tests pass. |
| `principal`→`grantee` rename (RENAME-1, cross-repo) | `src/docLayout.ts` `userPrincipal(uid)→"user:<uid>"` and `memberPath(spaceId, principal)` name a **grantee** (core_concepts §4 reserved-word), NOT the authority-context Principal. **This repo is the SOURCE of the `members/{principal}` path.** Crucially, the Firestore stored thing is a **doc-ID segment** (`members/user:<uid>`), **not a field literally named `principal`** — so the rename is **code-symbol-only, no data migration** if the wire segment is kept. | **FILED (deferred), not executed:** see `REFACTOR_CANDIDATES.md` RENAME-1 + inline VOCAB NOTE on `userPrincipal`. Coordinated cross-repo track (preauth-core docLayout + SDK `Member.principal` + site-main FirestoreFS + backend `AdminMintStore`). Recommendation: rename TS symbols only, keep the wire segment. |
| Missing status doc (dim 5) | No `docs/status/*` doc owns this library (R3-51 extraction shared by several areas). | **DOCS DELTA filed (for parent to apply):** recommend `docs/status/PREAUTH_CORE_STATUS.md` — the four consuming surfaces + the byte-identical-Firestore-layout invariant. |
| Scope mis-assignment (dim 5 / process) | The umbrella task assigned this repo the load-path specs (REPO_LIFECYCLE/ZIP_CACHE_AUTOMATION/PRETRANSPILED_ARTIFACTS/DESIGN_TO). This repo implements **none** of them — "preauth-core" = M1 **pre-authorization**, not the **pre-auth load path**. | **DOCS DELTA filed (for parent):** correct `00-overview.md §6` repo list; route load-path verification to `01-site-main.md` (consumers) + `06-cli.md` (producer). |

## Non-trivial code↔spec mappings (seed)

- **`src/capabilities.ts`** — THE capability dictionary (tiers, `appScoped`, `since`)
  + `REGISTRY_VERSION` (the §5.11 vocabulary version, distinct from the npm package
  version). site-main re-exports this (`src/registry/capabilities.ts`) and mirrors it
  into `src/generated/capabilities.json` via `scripts/generate-capabilities.mts`. A
  capability tier change starts HERE, then bumps the package version to republish.
- **`src/m1PreAuth.ts`** — the pure §8.9 target check (`planPreAuthCapabilities`):
  a URL-loaded appKey may pre-authorize only **app-scoped elevated** caps (`net:fetch`,
  `task:invoke`, `contribute:self`, `diagnostics:read`) + mounts; broad-elevated caps
  are refused (`broad-elevated`), unknown caps fail closed. All-or-nothing.
- **`src/bootConsent.ts` `mintConsentedGrants`** — the ONE mint path M1/M3 both flow
  through (stamped `mintPath`), so policy pre-auth can't drift from modal consent.
- **`src/docLayout.ts` + `src/port.ts` — the byte-identical-Firestore-layout invariant
  (THE most important cross-repo invariant).** The browser `FirestoreSpaceStore` (Web
  SDK) and the backend `AdminMintStore` (admin SDK, `05-backend.md`) write against two
  different Firestore client APIs and so cannot share *call* code — but both compute
  their paths/field objects from the helpers HERE, injecting only env-specific
  timestamp/increment SENTINELS (`MintSentinels`). Drift is structurally impossible
  without editing a shared helper; `test/docLayout.test.ts` pins the exact wire shape.
  This is why `dist/` is committed and consumed via `file:` — a CLI/backend-minted grant
  is byte-identical to one site-main mints. **Rebuild `dist/` after any `src/` edit.**
- **Capability-registry-as-source-of-truth (generation direction).** `src/capabilities.ts`
  `CAPABILITIES` + `REGISTRY_VERSION` is the authoritative side; site-main re-exports it
  (`src/registry/capabilities.ts`) and *generates* `src/generated/capabilities.json` from
  it via `scripts/generate-capabilities.mts`, with `SPEC_CODE_DEBT §5.1` R3-32 fail-on-drift
  CI. Generation flows FROM here. A tier change starts here, then bumps the package version
  to republish the `dist/`.
