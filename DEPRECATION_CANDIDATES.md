# DEPRECATION_CANDIDATES — `@immediately-run/preauth-core`

Recorded by the code-verification pass (`docs/plans/code-verification/07-preauth-core.md`,
R3-124). **Nothing here is removed** — dim-4 is *flag only*.

## Result: no dead surface found

- **Not a fork.** This repo is a **native R3-51 extraction** from site-main's editor layer
  (the adversarial test header records the port). It carries **no** Sandpack/CodeSandbox
  lineage, so there is no inherited-but-unused upstream surface to list (unlike `sandbox` /
  `immediately-run-sandpack`).
- **Every export has a live consumer.** All five modules are re-exported through the barrel
  (`src/index.ts`) and consumed via the `file:` sibling pattern by:
  - **site-main** — the Web-SDK `MintStore` adapter (`FirestoreSpaceStore`), the M3 consent
    screen, the M1 settings pre-auth, and the re-exported capability registry.
  - **backend** — `AdminMintStore` (admin-SDK adapter) + the `POST /preauth` executor.
  - **CLI** — the `immediately-run preauth` command.
  The capability dict, `planPreAuthCapabilities`/`applyPreAuth`, `mintConsentedGrants`, the
  `docLayout` builders, and the `MintStore` port + domain types are each on at least one of
  those paths. No exported symbol is orphaned.
- **Every capability maps to a spec.** Each entry in `CAPABILITIES` traces to a
  CAPABILITY_REFERENCE row or a sibling spec (UI_AS_APPS, EDITOR_AS_APP, EDITOR_FIRST,
  FILE_EXPLORER, LLM_AND_AGENTS, SERVICE_PROVIDERS, SECRETS, LOCAL_DEV_AUTHED_SERVER). No
  capability is defined here but referenced by no live spec. `llm:chat` (the most recent,
  `since: 1.3.0`) maps to SERVICE_PROVIDERS `llm.chat@1` / LLM_AND_AGENTS D5.

**No `// DEAD-CANDIDATE` markers were added** — nothing is genuinely dead. Recorded
explicitly so a later pass does not re-scan.
