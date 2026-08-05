[CmdletBinding()]
param(
    [string]$ExistingEmsdk = '',
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$metadata = Get-Content (Join-Path $spikeRoot 'versions.json') -Raw | ConvertFrom-Json
$toolsRoot = Join-Path $spikeRoot '.tools'
$emsdkRoot = if ($ExistingEmsdk) { Resolve-Path -LiteralPath $ExistingEmsdk } else { Join-Path $toolsRoot 'emsdk' }

if (-not (Test-Path -LiteralPath $emsdkRoot)) {
    if ($ExistingEmsdk) {
        throw "The supplied emsdk path does not exist: $ExistingEmsdk"
    }
    if ($Offline) {
        throw "Offline toolchain bootstrap requires emsdk at $emsdkRoot"
    }
    New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
    git clone --branch $metadata.emscripten.tag --depth 1 $metadata.emscripten.repository $emsdkRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to clone the official emsdk repository.' }
}

$actualCommit = (git -C $emsdkRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $metadata.emscripten.commit) {
    throw "emsdk revision mismatch. Expected $($metadata.emscripten.commit) but found $actualCommit."
}

$emsdkCommand = Join-Path $emsdkRoot 'emsdk.bat'
if (-not (Test-Path -LiteralPath $emsdkCommand)) {
    throw "Missing official emsdk command: $emsdkCommand"
}

if (-not $Offline) {
    & $emsdkCommand install $metadata.emscripten.version
    if ($LASTEXITCODE -ne 0) { throw "emsdk could not install $($metadata.emscripten.version)." }
}

& $emsdkCommand activate $metadata.emscripten.version
if ($LASTEXITCODE -ne 0) { throw "emsdk could not activate $($metadata.emscripten.version) for its local configuration." }

. (Join-Path $emsdkRoot 'emsdk_env.ps1')
$emccVersion = (& emcc --version | Select-Object -First 1)
$emxxVersion = (& 'em++' --version | Select-Object -First 1)
if ($emccVersion -notmatch [regex]::Escape($metadata.emscripten.version) -or $emxxVersion -notmatch [regex]::Escape($metadata.emscripten.version)) {
    throw "Expected Emscripten $($metadata.emscripten.version). emcc='$emccVersion'; em++='$emxxVersion'."
}

Write-Output "Verified repository-local Emscripten: $emccVersion"
Write-Output "Verified repository-local em++: $emxxVersion"
Write-Output "SDK: $emsdkRoot"
Write-Output 'Activation was process-local; --permanent was not used.'
