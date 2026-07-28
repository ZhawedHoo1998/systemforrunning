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
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit 0
}

$ruleName = "Ruby Rain - Block direct service ports"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Remove-NetFirewallRule -DisplayName $ruleName
}

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Description "Allow Ruby Rain only through its local HTTPS tunnel." `
    -Direction Inbound `
    -Action Block `
    -Protocol TCP `
    -LocalPort 3000, 8000, 5432, 9200 `
    -Profile Any | Out-Null

Write-Host "Blocked direct inbound access to TCP ports 3000, 8000, 5432, and 9200."
