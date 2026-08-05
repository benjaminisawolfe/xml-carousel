[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $spikeRoot '..\..')
$source = Join-Path $spikeRoot 'dist'
$destination = Join-Path $repositoryRoot 'src\standards\xerces\runtime'
$metadata = Get-Content (Join-Path $spikeRoot 'versions.json') -Raw | ConvertFrom-Json

if ($metadata.xerces.version -ne '3.3.0' -or
    $metadata.xerces.sha256 -ne 'c35a6f04e853bde456c65ec38a4496c7ccf60b27c6989ff4e2149db9ea40648c' -or
    $metadata.emscripten.version -ne '6.0.5') {
    throw 'Pinned Xerces or Emscripten metadata differs from the reviewed production runtime.'
}

foreach ($required in @(
    'xerces-spike.mjs',
    'xerces-spike.wasm',
    'LICENSE.xerces.txt',
    'NOTICE.xerces.txt',
    'LICENSE.emscripten.txt'
)) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $required))) {
        throw "Missing reviewed spike output: $required"
    }
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
$staleModule = Join-Path $destination 'xerces-runtime.mjs'
if (Test-Path -LiteralPath $staleModule) {
    Remove-Item -LiteralPath $staleModule -Force
}
Copy-Item (Join-Path $source 'xerces-spike.mjs') (Join-Path $destination 'xerces-runtime.js') -Force
Copy-Item (Join-Path $source 'xerces-spike.wasm') (Join-Path $destination 'xerces-runtime.wasm') -Force
Copy-Item (Join-Path $source 'LICENSE.xerces.txt') $destination -Force
Copy-Item (Join-Path $source 'NOTICE.xerces.txt') $destination -Force
Copy-Item (Join-Path $source 'LICENSE.emscripten.txt') $destination -Force

node (Join-Path $repositoryRoot 'scripts\verify-xerces-runtime.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Published runtime did not match the reviewed manifest.' }

Write-Output 'Published and verified the reviewed Xerces production runtime.'
