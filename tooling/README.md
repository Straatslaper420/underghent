# tooling/

Refactor orchestration helpers. Not part of the runtime pipeline.

## Files

- **`build-audit-bundle.ps1`** — concatenates all source into `audit-bundle.txt` for one-shot LLM review
- **`audit-prompt.md`** — prompt to paste into qwen3-coder:free along with the bundle
- **`pipeline-timing.mjs`** — runs every `npm run` step, captures wall time + RSS + record counts → `timing-baseline.json`
- **`frontend-timing.html`** — browser harness, loads `frontline/index.html` in an iframe, dumps Performance API JSON

## Step 1 — full-codebase audit (free, ~1 minute)

```powershell
pwsh tooling/build-audit-bundle.ps1
# Open https://openrouter.ai/chat — select qwen/qwen3-coder:free
# Paste contents of audit-prompt.md, then paste audit-bundle.txt below "=== BUNDLE START ==="
# Save the response as tooling/audit-results.md
```

If the bundle is too big for one message, split by directory (scrapers first, then enrichers, then frontend) — but at ~300KB it should fit.

## Step 2 — baseline timing

```powershell
# Pipeline (will run the full pipeline once — can take a while if scrapers are slow)
node tooling/pipeline-timing.mjs

# Frontend (open in any browser, click "Run measurement", download JSON)
start tooling/frontend-timing.html
```

Outputs:
- `tooling/timing-baseline.json` — per-step duration, peak RSS, record counts
- `tooling/frontend-baseline.json` — page load metrics

## Step 3 onward

Once you have `audit-results.md` + `timing-baseline.json`, bring them back to Claude Code to triage and pick the top 3–5 fixes.
