[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$started = Get-Date
$spikeRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $spikeRoot '..\..')
$metadata = Get-Content (Join-Path $spikeRoot 'versions.json') -Raw | ConvertFrom-Json
$sourceRoot = Join-Path $spikeRoot ".cache\source\xerces-c-$($metadata.xerces.version)"
$emsdkRoot = Join-Path $spikeRoot '.tools\emsdk'
$cmakeRoot = Join-Path $spikeRoot ".tools\cmake-$($metadata.cmake.version)-windows-x86_64"
$ninjaRoot = Join-Path $spikeRoot ".tools\ninja-$($metadata.ninja.version)"
$xercesBuild = Join-Path $spikeRoot 'build\xerces-js-exceptions'
$distRoot = Join-Path $spikeRoot 'dist'

foreach ($required in @(
    (Join-Path $sourceRoot 'CMakeLists.txt'),
    (Join-Path $emsdkRoot 'emsdk_env.ps1'),
    (Join-Path $cmakeRoot 'bin\cmake.exe'),
    (Join-Path $ninjaRoot 'ninja.exe')
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing bootstrap prerequisite: $required" }
}

$env:EMSDK_QUIET = '1'
. (Join-Path $emsdkRoot 'emsdk_env.ps1')
$env:PATH = "$(Join-Path $cmakeRoot 'bin');$ninjaRoot;$env:PATH"

$emccVersion = (& emcc --version | Select-Object -First 1)
if ($emccVersion -notmatch [regex]::Escape($metadata.emscripten.version)) {
    throw "Expected Emscripten $($metadata.emscripten.version), found $emccVersion"
}

New-Item -ItemType Directory -Force -Path $xercesBuild,$distRoot | Out-Null
$configureArguments = @(
    'cmake', '-S', $sourceRoot, '-B', $xercesBuild, '-G', 'Ninja',
    '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-Dnetwork=OFF',
    '-Dtranscoder=iconv', '-Dmessage-loader=inmemory', '-Dthreads=OFF', '-Dsse2=OFF',
    '-Dfile-manager=POSIX', '-DCMAKE_CXX_FLAGS=-fexceptions'
)
& emcmake @configureArguments
if ($LASTEXITCODE -ne 0) { throw 'Xerces CMake configuration failed.' }

& cmake --build $xercesBuild --target xerces-c
if ($LASTEXITCODE -ne 0) { throw 'Xerces static-library build failed.' }

$library = Join-Path $xercesBuild 'src\libxerces-c.a'
if (-not (Test-Path -LiteralPath $library)) { throw "Missing Xerces static library: $library" }

$adapterStarted = Get-Date
$adapterSource = Join-Path $spikeRoot 'native\adapter.cpp'
$gluePath = Join-Path $distRoot 'xerces-spike.mjs'
$linkArguments = @(
    $adapterSource, $library,
    '-I', (Join-Path $sourceRoot 'src'), '-I', (Join-Path $xercesBuild 'src'),
    '-O2', '-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-o', $gluePath,
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createXercesSpikeModule',
    '-sENVIRONMENT=web,worker,node', '-sALLOW_MEMORY_GROWTH=1', '-sFILESYSTEM=0',
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_xerces_spike_version','_xerces_spike_reset_project','_xerces_spike_add_file','_xerces_spike_run']",
    "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToUTF8','lengthBytesUTF8','writeArrayToMemory']"
)
& 'em++' @linkArguments
if ($LASTEXITCODE -ne 0) { throw 'Xerces spike adapter link failed.' }

Copy-Item (Join-Path $sourceRoot 'LICENSE') (Join-Path $distRoot 'LICENSE.xerces.txt') -Force
Copy-Item (Join-Path $sourceRoot 'NOTICE') (Join-Path $distRoot 'NOTICE.xerces.txt') -Force
Copy-Item (Join-Path $emsdkRoot 'LICENSE') (Join-Path $distRoot 'LICENSE.emscripten.txt') -Force

function Get-GzipSize([string]$Path) {
    $inputBytes = [IO.File]::ReadAllBytes($Path)
    $memory = [IO.MemoryStream]::new()
    $gzip = [IO.Compression.GZipStream]::new($memory, [IO.Compression.CompressionLevel]::SmallestSize, $true)
    $gzip.Write($inputBytes, 0, $inputBytes.Length)
    $gzip.Dispose()
    $size = $memory.Length
    $memory.Dispose()
    return $size
}

$artifactNames = @('xerces-spike.mjs', 'xerces-spike.wasm')
$artifacts = foreach ($name in $artifactNames) {
    $path = Join-Path $distRoot $name
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing generated artifact: $path" }
    $item = Get-Item -LiteralPath $path
    [ordered]@{ file = $name; rawBytes = $item.Length; gzipBytes = Get-GzipSize $path }
}
$manifest = [ordered]@{
    xercesVersion = $metadata.xerces.version
    xercesSourceSha256 = $metadata.xerces.sha256
    emscriptenVersion = $metadata.emscripten.version
    cmakeVersion = $metadata.cmake.version
    ninjaVersion = $metadata.ninja.version
    buildMode = 'Release'
    compilerFlags = @('-O2', '-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node', '-sALLOW_MEMORY_GROWTH=1', '-sFILESYSTEM=0')
    xercesOptions = @('BUILD_SHARED_LIBS=OFF', 'network=OFF', 'transcoder=iconv', 'message-loader=inmemory', 'threads=OFF', 'sse2=OFF', 'file-manager=POSIX')
    artifacts = $artifacts
    buildTimestampUtc = (Get-Date).ToUniversalTime().ToString('o')
    buildElapsedMs = [math]::Round(((Get-Date) - $started).TotalMilliseconds, 3)
    adapterElapsedMs = [math]::Round(((Get-Date) - $adapterStarted).TotalMilliseconds, 3)
    git = [ordered]@{
        branch = (git -C $repositoryRoot branch --show-current).Trim()
        commit = (git -C $repositoryRoot rev-parse HEAD).Trim()
    }
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $distRoot 'build-manifest.json') -Encoding utf8
Write-Output "Built Xerces-C++ WebAssembly spike in $([math]::Round(((Get-Date) - $started).TotalSeconds, 3)) seconds."
$artifacts | Format-Table
