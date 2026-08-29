# @immediately-run/preauth-core

The shared **pre-authorization core** for immediately.run. It exists to make one
sentence a structural fact:

> Every surface that pre-authorizes or mints a durable capability grant —
> site-main's M3 consent screen, its M1 settings pre-auth, the backend
> `POST /preauth` executor, and the `immediately-run preauth` CLI — drives the
> **same** §8.9 target check and the **same** mint path, writing **byte-identical**
> Firestore documents. Not a second copy of any of them.

Spec: `UI_AS_APPS_SPEC.md` §8.9 (target check), §8.15 (M1 pre-authorization),
§8.6/§8.7 (the durable grant set). Plan: `docs/plans/cli-preauth-shared-core.md`.

## What's in here (pure TS, zero runtime deps, no React, no Firebase)

| Module | Surface |
|---|---|
| `capabilities` | The capability vocabulary — the **single source of truth** (`CAPABILITIES`, `isAppScoped` / `isBaseline` / `isKnownCapability`, the version gate). site-main re-exports it; the backend imports the same predicates. The §8.9 gate's correctness IS this classification, so there is exactly one. |
| `port` | `MintStore` — the 3-method persistence port `mintConsentedGrants` calls (`createSpace`, `grantSpaceToApp`, `grantNetFetchHosts`) + its param/domain types (`GrantMode`, `MintPath`, `NetFetchHost`, …). |
| `docLayout` | The byte-faithful Firestore **paths + field builders** (`grantKey`, `GRANT_EXPIRY_MS`, the grant/space/net-fetch document builders). Each store adapter injects only its SDK's timestamp/increment sentinels and does the raw `.set()`; drift is impossible without editing a helper both consume. |
| `bootConsent` | `mintConsentedGrants` — the ONE mint path. Environment-neutral: a caller passes `onError` instead of the core logging with a host-specific prefix. |
| `m1PreAuth` | `planPreAuthCapabilities` / `isPreAuthClean` (the pure §8.9 target check) + `applyPreAuth` (validate-then-mint, all-or-nothing). |

## Published versions

`ci.yml` publishes the **head-of-main** version on each push to `main` — one push, one
`npm publish` of whatever `package.json` reads at that commit. A branch that bumps the
version more than once publishes only its **last** bump; the intermediate numbers are
commits, not releases.

**0.1.15 and 0.1.16 were never published.** They are intermediate states of the
`roadmap-items-r3-407-426` branch — 0.1.15 (`auth:identity` becomes app-scoped) and
0.1.16 (`device:geolocation`) — and npm goes straight from 0.1.14 to **0.1.17**, which
carries all of that work. Cite 0.1.17 as the release for anything on that branch:
pinning 0.1.15 or 0.1.16 fails `npm ci` with `ETARGET`, and site-main pins this package
EXACTLY.

## Consuming it

Via the **`file:` sibling pattern** site-main already uses for the sandpack fork:

```jsonc
// consumer package.json
"@immediately-run/preauth-core": "file:../immediately-run-preauth-core"
```

The built `dist/` is committed so consumers resolve the package without a separate
build step. After editing `src/`, rebuild:

```bash
npm run build   # tsc -> dist/ (JS + .d.ts)
npm test        # jest — the §8.9 gate, the hostile-policy property, the wire layout
npm run lint
```
