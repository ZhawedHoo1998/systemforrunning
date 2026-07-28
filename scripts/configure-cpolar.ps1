[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdministrator = $principal.IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdministrator) {
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", ('"{0}"' -f $PSCommandPath)
    )
    $elevated = Start-Process `
        -FilePath powershell.exe `
        -Verb RunAs `
        -ArgumentList $arguments `
        -Wait `
        -PassThru
    exit $elevated.ExitCode
}

$configPath = Join-Path $env:USERPROFILE ".cpolar\cpolar.yml"
$logPath = Join-Path $env:USERPROFILE ".cpolar\logs\cpolar_service.log"
$authLines = @(
    Get-Content -Encoding UTF8 $configPath |
        Where-Object { $_ -match '^authtoken:\s*\S+' }
)
if ($authLines.Count -ne 1) {
    throw "Expected exactly one configured authtoken in $configPath."
}

Stop-Service -Name cpolar -Force

@(
    $authLines[0]
    "log_level: info"
    "log_format: logfmt"
    "client_dashboard_addr: 127.0.0.1:9200"
    ""
    "tunnels:"
    "  ruby-rain:"
    "    proto: http"
    "    addr: `"127.0.0.1:3000`""
    "    region: cn"
    "    redirect_https: true"
) | Set-Content -Encoding UTF8 $configPath

$cpolarExecutable = "C:\Program Files\cpolar\cpolar.exe"
$serviceImagePath = (
    '"{0}" start-all -daemon=on -dashboard=on -log=false -config="{1}"' -f
    $cpolarExecutable,
    $configPath
)
Set-ItemProperty `
    -Path "HKLM:\SYSTEM\CurrentControlSet\Services\cpolar" `
    -Name ImagePath `
    -Value $serviceImagePath

if (Test-Path $logPath) {
    Clear-Content -LiteralPath $logPath
}

& (Join-Path $PSScriptRoot "secure-public-firewall.ps1")

Start-Service -Name cpolar
$service = Get-Service -Name cpolar
$service.WaitForStatus(
    [System.ServiceProcess.ServiceControllerStatus]::Running,
    [TimeSpan]::FromSeconds(30)
)

Write-Host "Cpolar now exposes only the Ruby Rain application."
