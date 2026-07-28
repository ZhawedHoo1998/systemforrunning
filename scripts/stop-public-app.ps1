[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pidFile = Join-Path $repoRoot "runtime\public-app-processes.json"

if (-not (Test-Path $pidFile)) {
    Write-Host "No managed Ruby Rain processes were found."
    exit 0
}

$managedProcesses = Get-Content -Raw -Encoding UTF8 $pidFile | ConvertFrom-Json
foreach ($serviceName in @("frontend", "backend")) {
    $record = $managedProcesses.$serviceName
    $process = Get-Process -Id $record.id -ErrorAction SilentlyContinue
    if (-not $process) {
        continue
    }

    $actualStart = $process.StartTime.ToUniversalTime().ToString("o")
    if ($actualStart -ne $record.started_at) {
        Write-Warning "Skipped PID $($record.id): it has been reused by another process."
        continue
    }

    Stop-Process -Id $process.Id
    Write-Host "Stopped $serviceName (PID $($process.Id))."
}

Remove-Item -LiteralPath $pidFile
