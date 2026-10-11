# Starts the complete local Gate stack from PowerShell.
param(
    [switch]$Smoke,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
$gateRoot = $PSScriptRoot
$supervisor = Join-Path $gateRoot 'scripts\run-gate.mjs'

$nodeCommand = if ($env:GATE_NODE) { $env:GATE_NODE } else {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found) { $found.Source } else { $null }
}
if (-not $nodeCommand -or -not (Test-Path -LiteralPath $nodeCommand -PathType Leaf)) {
    Write-Error 'Gate requires Node.js 22.12 or newer. Install Node.js or set GATE_NODE to node.exe.'
    exit 1
}

$nodeVersion = (& $nodeCommand --version | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.(\d+)\.') {
    Write-Error 'Could not read the Node.js version.'
    exit 1
}
$major = [int]$Matches[1]
$minor = [int]$Matches[2]
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 12)) {
    Write-Error 'Gate requires Node.js 22.12 or newer. Install a supported version or set GATE_NODE to node.exe.'
    exit 1
}

$launcherArgs = @()
if ($Smoke) { $launcherArgs += '--smoke' }
if ($Help) { $launcherArgs += '--help' }
& $nodeCommand $supervisor @launcherArgs
exit $LASTEXITCODE
