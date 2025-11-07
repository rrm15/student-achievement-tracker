## Context for feeding this repository to an agentic AI

This document captures recommended methodology, best practices, and concrete templates for packaging and providing the project context to an agentic AI. It is based on the repository structure (frontend + server) and aims to make agent runs safe, efficient, auditable and reproducible.

---

## Contract (short)

- Inputs: repository files + manifest metadata + explicit task prompt (system + user).
- Outputs: verifiable artifacts (code diffs/patches, files to add/remove, tests), a verification plan, and a PR-ready summary.
- Error modes: missing dependencies, ambiguous requirements, PII/secrets exposure — agent must stop and ask.
- Success criteria: code builds, lints, and tests pass (or failing tests are documented and reproducible) and changes match the user's acceptance criteria.

## Top-level principles

- Minimal, relevant context wins — prioritize the smallest set of files required.
- Make the contract explicit (inputs/outputs/constraints/success criteria) in every prompt.
- Supply structured metadata for every included file so the agent can reason about provenance and importance.
- Enforce "green-before-done": require agent to run build/lint/tests locally (or in a sandbox) and provide results before merging changes.
- Never send secrets or environment files to any external model. Treat secrets as out-of-band resources.

## What to include (priority order for this repo)

1. Project root metadata
   - `package.json` (frontend and server): dependencies, scripts.
   - `README.md` (frontend).
2. Entry points / runtime
   - `server/server.js`
   - `frontend/src/main.jsx`, `frontend/index.html`
3. Configuration & DB
   - `server/config/db.js` (do not include `.env` values; list variable names instead)
4. Business logic
   - `server/controllers/*.js`
   - `server/routes/*.js`
   - `server/middleware/*.js`
5. Tests, linters and build configs
   - `eslint.config.js`, `vite.config.js`, `postcss.config.js`, `tailwind.config.js`
6. Minimal supporting files
   - `frontend/src/App.jsx`, `App.css`; include assets only if directly relevant.
7. Exclude by default
   - `node_modules/`, build artifacts, generated binaries/large files, `.git` internals, and actual `.env` files.

## Recommended manifest format (packaging context)

Each bundle to the agent should be accompanied by a small JSON manifest with these fields per file:
- path: relative path (e.g., `server/controllers/authController.js`)
- language: `javascript` / `jsx` etc.
- role: `controller|route|config|entry|test|asset`
- size: bytes or line count
- digest: short hash for cache/dedup
- lastModified: ISO timestamp
- excerpt: first 20–50 lines (string)
- includeFull: boolean (only true if necessary)
- testsCovering: list of test file paths (if known)

Why: the manifest lets the agent quickly rank and decide what to load fully vs by excerpt.

## Chunking and retrieval strategy

- Max chunk size: ~1–2k tokens per chunk; prefer 500–1500 tokens for reliability.
- Chunking strategy:
  - Use semantic boundaries: functions, classes, route handlers and small modules.
  - Group related files (controller + route + middleware) together.
  - Include a context header per chunk: file path, role, function/class name, start/end lines.
- Retrieval strategy:
  - Two-stage: (1) lexical filter by manifest priority, (2) semantic retrieval with embeddings over excerpts.
  - Start with top-5 chunks; increase K if agent requests more context.
- Streaming loads: start minimal; let the agent request more via an explicit "more-context" action to save tokens.

## Prompt design & templates

Always send a short system message with constraints (security, tests, build).

System template (example):
"You are a code assistant that must produce verifiable, testable code changes. You must not reveal secrets or change unrelated files. Always produce a short plan, then a patch/diff. Run build/lint/tests and include results. If ambiguous, ask a clarifying question before making changes."

User template should include:
- Task brief (imperative): "Fix X bug / Add Y feature / Refactor Z"
- Acceptance criteria (explicit)
- Files & manifest metadata (bundle)
- Token budget limit and which tests to run
- Permission: whether to apply changes directly or only return a PR-ready diff

Assistant expected output (explicit):
1. Short plan (2–5 steps)
2. Files to change (list)
3. Patch/diff (unified diff or apply_patch format)
4. Commands run and their results (build/lint/tests)
5. Verification steps and follow-ups

Example concise user prompt:
- Task: "Add validation to achievements POST endpoint so 'score' is integer 0..100; unit tests must be added; server should still start. Return a patch and run tests."
- Manifest: include `server/controllers/achievementsController.js`, `server/routes/achievements.js`, `server/package.json`.
- Constraints: "Do not change unrelated files; do not expose DB credentials."

## Example agent contract (explicit)
- Inputs: manifest.json + listed file excerpts + full files when includeFull=true + tests (if present)
- Outputs: patch files, new/updated tests, test output (stdout), local build/lint result, PR summary with risk assessment
- Failure policy: if build/test fails, stop, produce error log, propose fix; do not continue making unrelated changes without confirmation.

## Quality gates and verification (green-before-done)

Require the agent to provide:
- Build step: e.g., `npm run build` (frontend) or `npm run start`/`node server.js` sanity check (server)
- Lint step: `npm run lint` (if present)
- Test step: `npm test` or `npm run test`
- For each step: provide exact command, environment (node version), and full output (truncated if huge)
- If tests fail: agent must document failing tests and provide a plan to fix them.

## Security & privacy rules

- Never include secrets or `.env` values.
- Scrub/mask tokens, API keys, DB connection strings before sending externally.
- Enforce an allowlist of file types/paths that may be sent; default deny everything else.
- For local/sandbox runs, restrict network access unless explicitly authorized.

## Edge cases & handling

- Missing tests: agent must add tests for changed behavior or provide manual reproducible test steps.
- Large binaries: exclude; provide metadata only.
- Ambiguous requirements: agent must ask clarifying questions before changing behavior.
- DB migrations: include migration scripts and a rollback plan.

## Tooling & orchestration suggestions

- Create a "context packager" script that reads manifest rules, produces excerpts and optional full files, computes digests and sizes, and emits a JSON bundle.
- Use an embedded retrieval system (embeddings + vector DB) for large repos; smaller repos can rely on manifest + dynamic fetch.
- Provide a bounded tool API for the agent (listFiles, readFile(path,lines), runCommand(cmd) sandboxed, createPatch(diff)) rather than raw shell access.

## Developer workflow / checklist (for running an agent)

1. Create `manifest.json` for the current task (small, prioritized).
2. Run packager to bundle excerpts and manifest.
3. Run agent with system prompt + user prompt + bundle.
4. Agent returns plan + patch + test output.
5. Run agent-suggested build/test locally in a sandbox (or CI).
6. If green, create a PR with agent’s patch and include the agent-produced summary and test outputs.
7. Human review + merge.

## Mapping to this repository (practical)

Based on the provided tree, always include:
- `server/package.json`, `server/server.js`, `server/controllers/*.js`, `server/routes/*.js`, `server/config/db.js`
- `frontend/package.json`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/index.html`

Mark `db.js` as config and `authController.js`/`authMiddleware.js` as security-critical in the manifest.

## Prompt snippets / examples

- Bugfix short:
  - System: "You may not use secrets."
  - User: "Fix bug where POST /achievements accepts non-integer 'score'. Manifest: [paths]. Return a patch and run server tests. Success: tests pass and server starts."

- Refactor larger:
  - User: "Refactor `achievementsController` to extract validation into a `validators` module, update routes to use it, and add unit tests. Keep behavior identical. Provide plan + patch + tests + test output."

## Testing & CI integration

- Add `ci-check` npm script that runs build+lint+tests. Agents should execute `ci-check` and return raw output.
- Attach the same CI pipeline (GitHub Actions / Azure Pipelines) to PRs so `green-before-merge` is enforced.

## Reproducibility & environment

- Provide Node engine in `package.json` or `.nvmrc`.
- Include lockfiles (`package-lock.json`/`yarn.lock`) for deterministic installs.
- Tell the agent the node/npm version to assume.

## Low-risk guardrails to implement now

- Create the packager script to build manifests and excerpts.
- Add `ci-check` scripts to `server/package.json` and `frontend/package.json` if missing.
- Add an "agent README" describing packaging, allowed actions, and forbidden items.

## Final checklist (what to implement next)
- [ ] Create packager script to build manifests and excerpts.
- [ ] Add `ci-check` npm script(s).
- [ ] Create an "agent contract" template to include in every prompt.
- [ ] Add a simple example test that the agent can run (one passing test).
- [ ] Document secrets policy and add a pre-send scrubber.

---

## Next steps
I created `context.md` at the repository root and updated the todo list to mark the planning step done. I can implement any of the low-risk guardrails next (packager script, `ci-check` scripts, or an `agent README`). Tell me which you'd like me to add and I'll implement it.
