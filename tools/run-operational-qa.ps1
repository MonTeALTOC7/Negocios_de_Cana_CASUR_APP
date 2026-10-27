[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidateSet('Cronologico','B2','Aforo')][string]$Stage,
 [Parameter(Mandatory=$true)][string]$ExtractFile,
 [string]$CompleteFile,
 [string]$PreviewUrl='http://127.0.0.1:4313/'
)
$ErrorActionPreference='Stop'
function Get-QASourceHash([string]$Path){
 # Use the same read-only reader as Chromium QA; Excel may hold a shared handle.
 $qaDigest=& node -e "const fs=require('fs'),c=require('crypto');console.log(c.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" $Path
 if($LASTEXITCODE -ne 0){throw "No se pudo leer la fuente: $Path"}
 return $qaDigest
}
$qaRepo=Split-Path -Parent $PSScriptRoot
$qaOutput=Join-Path $env:LOCALAPPDATA "CASUR\QA\work\$Stage\current"
if($Stage -eq 'Cronologico' -and -not $CompleteFile){throw 'Cronologico requiere ambos originales para su regresión de importación.'}
[string[]]$qaInputs=if($Stage -eq 'Cronologico'){@($ExtractFile,$CompleteFile)}else{@($ExtractFile)}
foreach($qaFile in $qaInputs){if(-not(Test-Path -LiteralPath $qaFile -PathType Leaf)){throw "Excel no disponible: $qaFile"}}
if((Invoke-WebRequest -Uri $PreviewUrl -TimeoutSec 10).StatusCode -ne 200){throw 'Preview HTTP no disponible; no se inició QA.'}
if((Test-Path -LiteralPath $qaOutput) -and (@(Get-ChildItem -LiteralPath $qaOutput -Force).Count -gt 0)){throw "Evidencia pendiente en $qaOutput. No se sobrescribe, promueve ni elimina."}
$qaHashes=$qaInputs|ForEach-Object{Get-QASourceHash $_}
New-Item -ItemType Directory -Path $qaOutput -Force | Out-Null
@{stage=$Stage;startedUtc=[DateTime]::UtcNow.ToString('o');head=(& git -C $qaRepo rev-parse HEAD);gitStatus=@(& git -C $qaRepo status --short);sourceSha256=$qaHashes} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaOutput 'run-metadata.json') -Encoding utf8
$qaPrevious=@($env:CASUR_QA_OUT,$env:CASUR_PREVIEW_URL,$env:CASUR_QA_STAGE)
$env:CASUR_QA_OUT=$qaOutput;$env:CASUR_PREVIEW_URL=$PreviewUrl;$env:CASUR_QA_STAGE=$Stage
$qaExit=1;$qaError=$null
try{
 $qaScript=if($Stage -eq 'Cronologico'){'qa-operational-import.cjs'}else{'qa-crono-aforo.cjs'}
 & node (Join-Path $PSScriptRoot $qaScript) @qaInputs 2>&1 | Tee-Object -FilePath (Join-Path $qaOutput 'run.log');$qaExit=$LASTEXITCODE
}
catch{$qaError=$_.Exception.Message}
finally{
 $env:CASUR_QA_OUT=$qaPrevious[0];$env:CASUR_PREVIEW_URL=$qaPrevious[1];$env:CASUR_QA_STAGE=$qaPrevious[2]
 $qaAfter=$qaInputs|ForEach-Object{Get-QASourceHash $_}
 $qaIntact=($qaHashes -join ',') -eq ($qaAfter -join ',')
 @{exitCode=$qaExit;error=$qaError;sourcesIntact=$qaIntact;reviewRequired=$true;automaticallyPromoted=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qaOutput 'run-status.json') -Encoding utf8
}
if($qaExit -ne 0 -or $qaError -or -not $qaIntact){throw "QA no aprobado. Diagnóstico conservado en $qaOutput"}
Write-Output "QA aprobado, pendiente de revisión: $qaOutput"
