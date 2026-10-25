[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('Cronologico','B2')][string]$Stage,
 [Parameter(Mandatory=$true)][string]$ExtractFile,
 [Parameter(Mandatory=$true)][string]$CompleteFile,
 [string]$PreviewUrl='http://127.0.0.1:4313/'
)
$ErrorActionPreference='Stop'
$qaRepo=Split-Path -Parent $PSScriptRoot
$qaOutput=Join-Path $env:LOCALAPPDATA "CASUR\QA\work\$Stage\current"
foreach($qaFile in @($ExtractFile,$CompleteFile)){if(-not(Test-Path -LiteralPath $qaFile -PathType Leaf)){throw "Excel no disponible: $qaFile"}}
if((Invoke-WebRequest -Uri $PreviewUrl -TimeoutSec 10).StatusCode -ne 200){throw 'Preview HTTP no disponible; no se inició QA.'}
if(Test-Path -LiteralPath $qaOutput){throw "Evidencia pendiente en $qaOutput. No se sobrescribe, promueve ni elimina."}
New-Item -ItemType Directory -Path $qaOutput | Out-Null
$qaHashes=@($ExtractFile,$CompleteFile)|ForEach-Object{(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash}
@{stage=$Stage;startedUtc=[DateTime]::UtcNow.ToString('o');head=(& git -C $qaRepo rev-parse HEAD);gitStatus=@(& git -C $qaRepo status --short);sourceSha256=$qaHashes} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaOutput 'run-metadata.json') -Encoding utf8
$qaPrevious=@($env:CASUR_QA_OUT,$env:CASUR_PREVIEW_URL,$env:CASUR_QA_STAGE)
$env:CASUR_QA_OUT=$qaOutput;$env:CASUR_PREVIEW_URL=$PreviewUrl;$env:CASUR_QA_STAGE=$Stage
$qaExit=1;$qaError=$null
try{& node (Join-Path $PSScriptRoot 'qa-operational-import.cjs') $ExtractFile $CompleteFile 2>&1 | Tee-Object -FilePath (Join-Path $qaOutput 'run.log');$qaExit=$LASTEXITCODE}
catch{$qaError=$_.Exception.Message}
finally{
 $env:CASUR_QA_OUT=$qaPrevious[0];$env:CASUR_PREVIEW_URL=$qaPrevious[1];$env:CASUR_QA_STAGE=$qaPrevious[2]
 $qaAfter=@($ExtractFile,$CompleteFile)|ForEach-Object{(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash}
 $qaIntact=($qaHashes -join ',') -eq ($qaAfter -join ',')
 @{exitCode=$qaExit;error=$qaError;sourcesIntact=$qaIntact;reviewRequired=$true;automaticallyPromoted=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qaOutput 'run-status.json') -Encoding utf8
}
if($qaExit -ne 0 -or $qaError -or -not $qaIntact){throw "QA no aprobado. Diagnóstico conservado en $qaOutput"}
Write-Output "QA aprobado, pendiente de revisión: $qaOutput"
