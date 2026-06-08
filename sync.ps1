# sync.ps1 — stage, commit, and push the WHOLE underghent_v2 folder to GitHub.
# Secrets and caches (credentials.json, .env, node_modules, .aider*, .claude/, …)
# are protected by .gitignore and will NOT be committed.
#
# Usage (from the underghent_v2 folder):
#   .\sync.ps1                  # auto timestamp commit message
#   .\sync.ps1 "what I changed" # custom commit message

param([string]$Message)

$ErrorActionPreference = "Stop"
$repo = $PSScriptRoot

# Stage everything (new, modified, deleted) — gitignore still excludes secrets.
git -C $repo add -A

$staged = git -C $repo diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing new to commit." -ForegroundColor Yellow
    # Push anyway in case earlier commits (e.g. Aider's) aren't on GitHub yet.
    git -C $repo push
    Write-Host "Done — GitHub is up to date." -ForegroundColor Green
    return
}

Write-Host "Committing these files:" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "  $_" }

if (-not $Message) {
    $Message = "Sync: " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

git -C $repo commit -m $Message
git -C $repo push
Write-Host "Pushed to GitHub. ✓" -ForegroundColor Green
