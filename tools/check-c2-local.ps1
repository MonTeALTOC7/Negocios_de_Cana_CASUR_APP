[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
$qaRoot=Split-Path -Parent $PSScriptRoot
$qaEvidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if($qaEvidence.StartsWith($qaRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'QA evidence must remain outside repository'}
New-Item -ItemType Directory -Path $qaEvidence -Force | Out-Null
$qaResults=@()
function Invoke-C2Check([string]$Name,[string]$Executable,[string[]]$Arguments){
 & $Executable @Arguments *> (Join-Path $qaEvidence "$Name.log")
 $qaCode=$LASTEXITCODE
 $script:qaResults+=@{name=$Name;exitCode=$qaCode;status=$(if($qaCode -eq 0){'PASS'}else{'FAIL'})}
 $script:qaResults|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qaEvidence 'checks.json') -Encoding utf8
 if($qaCode -ne 0){throw "C2 check failed: $Name"}
}
Push-Location -LiteralPath $qaRoot
try{
 Invoke-C2Check 'versions' 'node' @('tools/sync-versions.mjs')
 Invoke-C2Check 'runtime' 'node' @('tools/runtime-assets.mjs')
 Invoke-C2Check 'data-integrity' 'node' @('tools/production-integrity.mjs')
 Invoke-C2Check 'policy-main' 'node' @('tools/check-release-policy.mjs','74231a1e4cbc7ff4e0207017e104d036d9c8f02e')
 Invoke-C2Check 'policy-approved45' 'node' @('tools/check-release-policy.mjs','6d6c790fec35d53f75da6cca9ff483cd535575cb')
 Invoke-C2Check 'shell-geo' 'node' @('--test','tests/*.test.mjs')
 Invoke-C2Check 'produccion' 'npm.cmd' @('test','--prefix','modules/produccion')
 Invoke-C2Check 'tch' 'npm.cmd' @('run','validate','--prefix','modules/tch')
 Invoke-C2Check 'whitespace' 'git' @('diff','--check')
}finally{Pop-Location}
Write-Output 'C2 LOCAL GATE PASS (no remote CI dispatch or deployment)'
