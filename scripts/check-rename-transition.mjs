#!/usr/bin/env node
// COPIED from docs/scripts/check-rename-transition.mjs (R3-677). docs is private, so a
// repo's CI cannot run it from there; the dependency-pins check sets the precedent for a
// small rule being copied rather than shared. Change the mechanism in docs first, then here.
// check-rename-transition.mjs — nudge a cross-repo rename that shipped WITHOUT a
// transition window (R3-106; ways_of_working §6).
//
// A backward-compatible rename declares its in-flight transitions in a repo-root
// `migration-transitions.json`, then lands as independent per-repo PRs. This check
// reads that manifest and the repo's source, and flags the lockstep failure mode the
// `.tinkerable/`→`.immediately.run/` rename hit: the OLD name vanished while the
// window was still declared open (a "must-land-together" cutover that degrades
// anything persisted/cached under the old name). It also flags a stalled cutover
// (old name still present after the window was declared closed).
//
// Manifest shape (repo root, `migration-transitions.json`):
//   {
//     "transitions": [
//       { "old": ".principal", "new": ".grantee", "status": "dual-read",
//         "note": "RENAME-1; cutover after all consumers off .principal" }
//     ]
//   }
//   status: "dual-read" — window open: BOTH names must appear (read old AND new).
//           "cutover"   — dedicated final step: the new name appears, the old is gone.
// Pick `old`/`new` tokens specific enough to discriminate (`.principal` not `principal`).
//
// Usage:
//   node scripts/check-rename-transition.mjs [dir]     scan <dir> (default cwd) → exit 1 on a finding
//   node scripts/check-rename-transition.mjs --self-test
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const MANIFEST = "migration-transitions.json";
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"]);
const SKIP_DIR = new Set(["node_modules", "dist", ".git", "build", ".parcel-cache", "coverage"]);

/** Analyse declared transitions against a source `corpus` (the concatenated tracked
 *  text). Returns a finding per problem: `kind` is `premature-cutover` (old name gone
 *  while window open), `missing-new` (new name absent though declared), or
 *  `stalled-cutover` (old name lingers after cutover). Pure — the unit under test. */
export function analyzeTransitions(transitions, corpus) {
  const findings = [];
  for (const t of transitions ?? []) {
    const hasOld = corpus.includes(t.old);
    const hasNew = corpus.includes(t.new);
    const status = t.status ?? "dual-read";
    if (status === "dual-read") {
      if (!hasOld) {
        findings.push({ ...t, kind: "premature-cutover",
          problem: `old name "${t.old}" not found while the window is open — looks like a lockstep cutover (no dual-read). Keep reading the old name until every repo is migrated, then cut over in its own PR.` });
      } else if (!hasNew) {
        findings.push({ ...t, kind: "missing-new",
          problem: `new name "${t.new}" not found though the transition is declared — the rename hasn't been applied here yet.` });
      }
    } else if (status === "cutover") {
      if (hasOld) {
        findings.push({ ...t, kind: "stalled-cutover",
          problem: `old name "${t.old}" still present though status is "cutover" — finish removing it (the cutover is its own final step).` });
      }
    } else {
      findings.push({ ...t, kind: "bad-status",
        problem: `unknown status "${status}" (expected "dual-read" or "cutover").` });
    }
  }
  return findings;
}

function readCorpus(dir) {
  let corpus = "";
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (SKIP_DIR.has(name)) continue;
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (SCAN_EXT.has(extname(name)) && name !== MANIFEST) corpus += readFileSync(p, "utf8") + "\n";
    }
  };
  walk(dir);
  return corpus;
}

function scan(dir) {
  const manifestPath = join(dir, MANIFEST);
  if (!existsSync(manifestPath)) {
    console.log(`OK: no ${MANIFEST} in ${dir} — no open rename transitions to check.`);
    return;
  }
  const { transitions } = JSON.parse(readFileSync(manifestPath, "utf8"));
  const findings = analyzeTransitions(transitions, readCorpus(dir));
  for (const f of findings) console.error(`${MANIFEST}: ${f.old} → ${f.new} [${f.kind}] — ${f.problem}`);
  if (findings.length > 0) {
    console.error(`\n${findings.length} rename-transition issue(s). A cross-repo rename ships dual-read ` +
      `(read old AND new, write new) and lands as independent PRs — see CROSS_REPO_MIGRATION.md (ways_of_working §6).`);
    process.exit(1);
  }
  console.log(`OK: ${transitions?.length ?? 0} declared transition(s) conform (dual-read open / cutover complete).`);
}

function selfTest() {
  const T = (old, nw, status) => ({ old, new: nw, status });
  const cases = [
    ["open window, both present → clean",
      analyzeTransitions([T(".principal", ".grantee", "dual-read")], "uses .principal and .grantee").length === 0],
    ["open window, old gone → premature-cutover caught",
      analyzeTransitions([T(".principal", ".grantee", "dual-read")], "uses only .grantee")
        .some((f) => f.kind === "premature-cutover")],
    ["open window, new absent → missing-new caught",
      analyzeTransitions([T(".principal", ".grantee", "dual-read")], "uses only .principal")
        .some((f) => f.kind === "missing-new")],
    ["cutover done, old gone → clean",
      analyzeTransitions([T(".principal", ".grantee", "cutover")], "uses only .grantee").length === 0],
    ["cutover stalled, old lingers → stalled-cutover caught",
      analyzeTransitions([T(".principal", ".grantee", "cutover")], "still uses .principal and .grantee")
        .some((f) => f.kind === "stalled-cutover")],
    ["empty manifest → clean", analyzeTransitions([], "anything").length === 0],
  ];
  const failed = cases.filter(([, c]) => !c);
  if (failed.length === 0) {
    console.log(`self-test OK: ${cases.length} rename-transition scenarios passed.`);
    process.exit(0);
  }
  for (const [name] of failed) console.error(`self-test FAILED: ${name}`);
  process.exit(1);
}

const arg = process.argv[2];
if (arg === "--self-test") selfTest();
else scan(arg ?? ".");
