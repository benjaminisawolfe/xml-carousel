[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $spikeRoot '..\..')
$source = Join-Path $spikeRoot 'dist\production'
$destination = Join-Path $repositoryRoot 'src\standards\relaxng\runtime'
$metadata = Get-Content (Join-Path $spikeRoot 'manifests\toolchain.json') -Raw | ConvertFrom-Json

function Copy-LfTextAsset {
    param(
        [Parameter(Mandatory)]
        [string]$SourcePath,
        [Parameter(Mandatory)]
        [string]$DestinationPath
    )

    $content = [System.IO.File]::ReadAllText($SourcePath)
    $content = $content.Replace("`r`n", "`n").Replace("`r", "`n")
    [System.IO.File]::WriteAllText(
        $DestinationPath,
        $content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

if ($metadata.libxml2.version -ne '2.15.3' -or
    $metadata.libxml2.sha256 -ne '78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07' -or
    $metadata.emsdk.version -ne '6.0.5' -or
    $metadata.emsdk.commit -ne 'dfb9d1a46c3bb8f52e1e6324be23123b9d73c190') {
    throw 'Pinned libxml2 or Emscripten metadata differs from the reviewed production runtime.'
}

$expected = @(
    'build-manifest.json',
    'libxml2-relaxng-production.mjs',
    'libxml2-relaxng-production.wasm',
    'LICENSE.libxml2.txt'
)
$found = @(Get-ChildItem -LiteralPath $source -File | ForEach-Object { $_.Name } | Sort-Object)
$difference = @(Compare-Object ($expected | Sort-Object) $found)
if ($difference.Count -ne 0) {
    throw 'Production build contains missing or unexpected files; refusing publication.'
}

$buildManifest = Get-Content (Join-Path $source 'build-manifest.json') -Raw | ConvertFrom-Json
if ($buildManifest.mode -ne 'production' -or $buildManifest.libxml2Version -ne '2.15.3') {
    throw 'The generated build is not the reviewed production configuration.'
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
$existing = @(Get-ChildItem -LiteralPath $destination -File -ErrorAction SilentlyContinue)
foreach ($file in $existing) {
    if ($file.Name -notin @(
        'libxml2-relaxng-runtime.js',
        'libxml2-relaxng-runtime.wasm',
        'runtime-manifest.json',
        'LICENSE.libxml2.txt',
        'LICENSE.emscripten.txt'
    )) {
        throw "Runtime destination contains an unexpected file: $($file.Name)"
    }
}

Copy-LfTextAsset (Join-Path $source 'libxml2-relaxng-production.mjs') (Join-Path $destination 'libxml2-relaxng-runtime.js')
Copy-Item (Join-Path $source 'libxml2-relaxng-production.wasm') (Join-Path $destination 'libxml2-relaxng-runtime.wasm') -Force
Copy-LfTextAsset (Join-Path $source 'LICENSE.libxml2.txt') (Join-Path $destination 'LICENSE.libxml2.txt')
Copy-LfTextAsset (Join-Path $repositoryRoot 'src\standards\xerces\runtime\LICENSE.emscripten.txt') (Join-Path $destination 'LICENSE.emscripten.txt')

node (Join-Path $repositoryRoot 'scripts\verify-relaxng-runtime.mjs') --write-manifest
if ($LASTEXITCODE -ne 0) { throw 'RELAX NG runtime manifest generation failed.' }
node (Join-Path $repositoryRoot 'scripts\verify-relaxng-runtime.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Published RELAX NG runtime did not match the reviewed manifest.' }

Write-Output 'Published and verified the reviewed libxml2 RELAX NG production runtime.'
