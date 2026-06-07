# Build a single text bundle of every source file in the repo for one-shot LLM audit.
# Output: tooling/audit-bundle.txt — paste into qwen3-coder:free (1M context) with audit-prompt.md
#
# Run from repo root:  pwsh tooling/build-audit-bundle.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $PSScriptRoot 'audit-bundle.txt'

# Files / patterns to include
$includes = @(
    @{ Path = 'pipeline/package.json';   Glob = $null },
    @{ Path = 'pipeline/tsconfig.json';  Glob = $null },
    @{ Path = 'pipeline/src';            Glob = '*.ts' },
    @{ Path = 'pipeline/config';         Glob = '*.json' },
    @{ Path = 'frontline/index.html';    Glob = $null },
    @{ Path = 'underghent_agent.py';     Glob = $null }
)

# Files to skip (credentials, build artefacts, etc.)
$blocklist = @('credentials.json', '.env')

if (Test-Path $out) { Remove-Item $out }

$totalChars = 0
$fileCount  = 0

Add-Content -Path $out -Value "# Underghent v2 — full source bundle for audit"
Add-Content -Path $out -Value "# Generated: $(Get-Date -Format o)"
Add-Content -Path $out -Value ""

foreach ($inc in $includes) {
    $full = Join-Path $root $inc.Path
    if (-not (Test-Path $full)) { continue }

    $files = if ($inc.Glob) {
        Get-ChildItem -Path $full -Filter $inc.Glob -Recurse -File
    } else {
        Get-Item $full
    }

    foreach ($f in $files) {
        if ($blocklist -contains $f.Name) { continue }
        $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
        $body = Get-Content -Path $f.FullName -Raw

        Add-Content -Path $out -Value ""
        Add-Content -Path $out -Value "================================================================"
        Add-Content -Path $out -Value "FILE: $rel"
        Add-Content -Path $out -Value "================================================================"
        Add-Content -Path $out -Value $body

        $totalChars += $body.Length
        $fileCount++
    }
}

Write-Host "Bundle written: $out"
Write-Host "Files included: $fileCount"
Write-Host "Total chars:    $totalChars  (~$([math]::Round($totalChars/4)) tokens)"
Write-Host ""
Write-Host "Next: paste audit-prompt.md + audit-bundle.txt into qwen3-coder:free on openrouter"
