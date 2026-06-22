# REFACTOR_CANDIDATES — `@immediately-run/preauth-core`

Recorded by the code-verification pass (`docs/plans/code-verification/07-preauth-core.md`,
R3-124). **Nothing here is executed in this pass** — dim-3 (complexity) is *record only*.

## RENAME-1 — `userPrincipal` / `memberPath(…, principal)` → grantee (CROSS-REPO TRACK HEAD)

**Status:** FILED, deliberately NOT executed (coordinated cross-repo track) ·
**Owner:** the shared `principal`→`grantee` rename track (00-overview §6) · **This repo is
the SOURCE.**

- **What:** `src/docLayout.ts` exports `userPrincipal(uid) → "user:<uid>"` and
  `memberPath(spaceId, principal)`; both name a **grantee** (a space member — the `uid`/`gid`
  of `setSpaceRole(spaceId, grantee, role)`), NOT the authority-context **Principal**
  (core_concepts §4 reserved-word). This is the canonical instance of the shipped
  `principal`→`grantee` field rename, and this library builds the
  `spaces/{id}/members/{principal}` Firestore path that site-main and the backend both write
  byte-identically — so it is the **anchor** of the rename track.
- **Why it matters:** the reserved-word collision is the headline core_concepts §4
  vocabulary debt (SPEC_CODE_DEBT §7.1). "Principal" must name only the closed,
  trust-ordered authority context; using it for a space member misreads as authority.
- **Blast radius (cross-repo — coordinate, do NOT do piecemeal):**
  - `preauth-core/src/docLayout.ts` — `userPrincipal`, `memberPath` param (+ `dist/` rebuild).
  - SDK `Member.principal` field (`02-sdk.md` RENAME-1).
  - site-main FirestoreFS (the Web-SDK `MintStore` adapter / `members/{…}` reads/writes).
  - backend `AdminMintStore` (the admin-SDK adapter).
- **The migration question (RESOLVED as recommendation):** the Firestore stored thing is a
  **doc-ID path segment** (`members/user:<uid>`), **NOT a field literally named `principal`**.
  So renaming the *code symbols* without changing the *stored segment* is **code-only, no
  data migration**. Renaming the stored segment `members/{principal}` itself WOULD be a
  high-risk Firestore migration of low value.
  - **Recommendation:** rename only the TS identifiers (`userPrincipal` → e.g. `granteeId`,
    the `memberPath` param `principal` → `grantee`); **keep the wire segment** as-is and
    document that it stays deliberately (same posture as the retained `tinkerable` infra
    identifiers). Confirm with the rename-track owner before executing.
- **Gate (when executed):** `npm run build && npm test && npm run lint` here, PLUS the
  cross-repo byte-identical-layout tests in site-main + backend must stay green; rebuild
  `dist/`.

## Complexity / code-smell (dim 3) — honest assessment

**Near-zero yield.** This is a tight, well-factored, single-purpose library (~849 LoC, 6
modules, zero runtime deps). Spec anchors are dense and (after this pass) current; the
narrow `MintStore` port (3 methods), the pure `planPreAuthCapabilities` decision, and the
sentinel-injection `docLayout` builders are each minimal and well-separated. No genuine
refactor candidate was found while reading. Recorded honestly rather than manufacturing
candidates.
