[CmdletBinding()]
param(
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$metadata = Get-Content (Join-Path $spikeRoot 'versions.json') -Raw | ConvertFrom-Json
$cacheRoot = Join-Path $spikeRoot '.cache'
$archivePath = Join-Path $cacheRoot $metadata.xerces.archive
$sourceRoot = Join-Path $cacheRoot 'source'
$sourcePath = Join-Path $sourceRoot "xerces-c-$($metadata.xerces.version)"

New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

if (-not (Test-Path -LiteralPath $archivePath)) {
    if ($Offline) {
        throw "Offline source bootstrap requires the verified archive at $archivePath"
    }
    Invoke-WebRequest -Uri $metadata.xerces.url -OutFile $archivePath
}

$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedHash = $metadata.xerces.sha256.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "Xerces archive SHA-256 mismatch. Expected $expectedHash but found $actualHash."
}

if (-not (Test-Path -LiteralPath $sourcePath)) {
    New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $sourceRoot -Force
}

if (-not (Test-Path -LiteralPath (Join-Path $sourcePath 'CMakeLists.txt'))) {
    throw "Verified archive did not produce the expected Xerces source tree at $sourcePath"
}

Write-Output "Verified Xerces-C++ $($metadata.xerces.version): $actualHash"
Write-Output "Source: $sourcePath"
