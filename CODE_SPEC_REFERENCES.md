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
