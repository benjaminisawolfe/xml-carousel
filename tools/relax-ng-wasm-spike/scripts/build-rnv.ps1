[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $spikeRoot '..\..')
$source = Join-Path $spikeRoot '.tools\rnv'
$emsdk = Join-Path $repositoryRoot 'tools\xerces-wasm-spike\.tools\emsdk'
$dist = Join-Path $spikeRoot 'dist'
if (-not (Test-Path (Join-Path $source 'rnc.c'))) { throw 'Run bootstrap.ps1 to provision pinned RNV source.' }
$env:EMSDK_QUIET = '1'
. (Join-Path $emsdk 'emsdk_env.ps1')
New-Item -ItemType Directory -Force $dist | Out-Null

$names = @('ary','drv','er','ht','m','rn','rnc','rnd','rnl','rnx','rx','s','sc','u','xmlc','xsd','xsd_tm')
$sources = $names | ForEach-Object { Join-Path $source "$_.c" }
$arguments = @(
    (Join-Path $spikeRoot 'native\rnv-adapter.c')
) + $sources + @(
    '-I', $source, '-O2', '-DUNISTD_H=<unistd.h>',
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createRnvSpikeModule',
    '-sENVIRONMENT=web,worker,node', '-sFILESYSTEM=0', '-sALLOW_MEMORY_GROWTH=1',
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_rnv_spike_version','_rnv_spike_parse']",
    "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','writeArrayToMemory','cwrap','HEAPU8']",
    '-o', (Join-Path $dist 'rnv-spike.mjs')
)
& emcc @arguments
if ($LASTEXITCODE -ne 0) { throw 'Pinned RNV Emscripten build failed.' }
Get-Item (Join-Path $dist 'rnv-spike.mjs'),(Join-Path $dist 'rnv-spike.wasm') | Select-Object Name,Length,@{n='SHA256';e={(Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant()}}
