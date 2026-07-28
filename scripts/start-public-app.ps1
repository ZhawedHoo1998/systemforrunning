[CmdletBinding()]
param(
    [switch]$Build
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "frontend"
$runtimeDir = Join-Path $repoRoot "runtime"
$pidFile = Join-Path $runtimeDir "public-app-processes.json"

function Assert-PortAvailable {
    param([int]$Port)

    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($listener) {
        throw "Port $Port is already in use by process $($listener.OwningProcess). Stop the existing development server first."
    }
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$Attempts = 30
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    throw "Service did not become ready: $Url"
}

Assert-PortAvailable -Port 8000
Assert-PortAvailable -Port 3000

$pythonCommand = Get-Command python -ErrorAction Stop
$nodeCommand = Get-Command node -ErrorAction Stop
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$nextCli = Join-Path $frontendDir "node_modules\next\dist\bin\next"
$buildId = Join-Path $frontendDir ".next\BUILD_ID"

if ($Build -or -not (Test-Path $buildId)) {
    Push-Location $frontendDir
    try {
        $env:NEXT_PUBLIC_API_URL = ""
        & $npmCommand.Source run build
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend build failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$env:API_DOCS_ENABLED = "false"
$env:SESSION_COOKIE_SECURE = "auto"
$env:NEXT_PUBLIC_API_URL = ""

$backend = $null
$frontend = $null
try {
    $backend = Start-Process `
        -FilePath $pythonCommand.Source `
        -ArgumentList @(
            "-m", "uvicorn", "backend.main:app",
            "--host", "127.0.0.1",
            "--port", "8000",
            "--proxy-headers",
            "--forwarded-allow-ips", "127.0.0.1"
        ) `
        -WorkingDirectory $repoRoot `
        -RedirectStandardOutput (Join-Path $runtimeDir "backend.log") `
        -RedirectStandardError (Join-Path $runtimeDir "backend-error.log") `
        -WindowStyle Hidden `
        -PassThru

    Wait-ForUrl -Url "http://127.0.0.1:8000/api/health"

    $frontend = Start-Process `
        -FilePath $nodeCommand.Source `
        -ArgumentList @($nextCli, "start", "-H", "127.0.0.1", "-p", "3000") `
        -WorkingDirectory $frontendDir `
        -RedirectStandardOutput (Join-Path $runtimeDir "frontend.log") `
        -RedirectStandardError (Join-Path $runtimeDir "frontend-error.log") `
        -WindowStyle Hidden `
        -PassThru

    Wait-ForUrl -Url "http://127.0.0.1:3000/login"

    @{
        backend = @{
            id = $backend.Id
            started_at = $backend.StartTime.ToUniversalTime().ToString("o")
        }
        frontend = @{
            id = $frontend.Id
            started_at = $frontend.StartTime.ToUniversalTime().ToString("o")
        }
    } | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $pidFile

    Write-Host "Ruby Rain is running at http://127.0.0.1:3000"
    Write-Host "Only port 3000 should be connected to the HTTPS tunnel."
} catch {
    if ($frontend -and -not $frontend.HasExited) {
        Stop-Process -Id $frontend.Id -Force
    }
    if ($backend -and -not $backend.HasExited) {
        Stop-Process -Id $backend.Id -Force
    }
    throw
}
