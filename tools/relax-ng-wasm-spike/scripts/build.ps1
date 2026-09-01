[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$started = Get-Date
$spikeRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $spikeRoot '..\..')
$metadata = Get-Content (Join-Path $spikeRoot 'manifests\toolchain.json') -Raw | ConvertFrom-Json
$xercesRoot = Join-Path $repositoryRoot 'tools\xerces-wasm-spike\.tools'
$emsdkRoot = Join-Path $xercesRoot 'emsdk'
$cmakeRoot = Join-Path $xercesRoot "cmake-$($metadata.cmake.version)-windows-x86_64"
$ninjaRoot = Join-Path $xercesRoot "ninja-$($metadata.ninja.version)"
$cmakeExe = Join-Path $cmakeRoot 'bin\cmake.exe'
$ninjaExe = Join-Path $ninjaRoot 'ninja.exe'
$sourceRoot = Join-Path $spikeRoot ".tools\libxml2\libxml2-$($metadata.libxml2.version)"
$buildRoot = Join-Path $spikeRoot 'build\libxml2'
$distRoot = Join-Path $spikeRoot 'dist'

foreach ($required in @(
    (Join-Path $sourceRoot 'CMakeLists.txt'),
    (Join-Path $emsdkRoot 'emsdk_env.ps1'),
    $cmakeExe,
    $ninjaExe
)) { if (-not (Test-Path -LiteralPath $required)) { throw "Missing bootstrap prerequisite: $required" } }

$env:EMSDK_QUIET = '1'
. (Join-Path $emsdkRoot 'emsdk_env.ps1')
$env:PATH = "$(Join-Path $cmakeRoot 'bin');$ninjaRoot;$env:PATH"
New-Item -ItemType Directory -Force -Path $buildRoot,$distRoot | Out-Null

$configure = @(
    $cmakeExe, '-S', $sourceRoot, '-B', $buildRoot, '-G', 'Ninja',
    "-DCMAKE_MAKE_PROGRAM=$ninjaExe",
    '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF',
    '-DLIBXML2_WITH_RELAXNG=ON', '-DLIBXML2_WITH_SCHEMAS=ON',
    '-DLIBXML2_WITH_REGEXPS=ON', '-DLIBXML2_WITH_OUTPUT=ON',
    '-DLIBXML2_WITH_HTTP=OFF', '-DLIBXML2_WITH_ICONV=OFF',
    '-DLIBXML2_WITH_ICU=OFF',
    '-DLIBXML2_WITH_ZLIB=OFF', '-DLIBXML2_WITH_PYTHON=OFF',
    '-DLIBXML2_WITH_THREADS=OFF', '-DLIBXML2_WITH_MODULES=OFF',
    '-DLIBXML2_WITH_CATALOG=OFF', '-DLIBXML2_WITH_PROGRAMS=OFF',
    '-DLIBXML2_WITH_TESTS=OFF', '-DLIBXML2_WITH_DOCS=OFF',
    '-DLIBXML2_WITH_HTML=OFF', '-DLIBXML2_WITH_XINCLUDE=OFF',
    '-DLIBXML2_WITH_XPATH=OFF', '-DLIBXML2_WITH_VALID=OFF',
    '-DLIBXML2_WITH_LEGACY=OFF', '-DLIBXML2_WITH_DEBUG=OFF'
)
& emcmake @configure
if ($LASTEXITCODE -ne 0) { throw 'libxml2 CMake configuration failed.' }
& $cmakeExe --build $buildRoot --target LibXml2
if ($LASTEXITCODE -ne 0) { throw 'libxml2 static-library build failed.' }

$library = Join-Path $buildRoot 'libxml2.a'
if (-not (Test-Path -LiteralPath $library)) { throw "Missing libxml2 static library: $library" }
$output = Join-Path $distRoot 'libxml2-relaxng.mjs'
$link = @(
    (Join-Path $spikeRoot 'native\adapter.c'), $library,
    '-I', (Join-Path $sourceRoot 'include'), '-I', $buildRoot,
    '-O2', '-o', $output, '-sMODULARIZE=1', '-sEXPORT_ES6=1',
    '-sEXPORT_NAME=createRelaxNgSpikeModule', '-sENVIRONMENT=web,worker,node',
    '-sALLOW_MEMORY_GROWTH=1', '-sFILESYSTEM=0',
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_rng_reset','_rng_add_file','_rng_compile','_rng_engine_version','_rng_result_json']",
    "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToUTF8','lengthBytesUTF8','writeArrayToMemory','cwrap','HEAPU8']"
)
& emcc @link
if ($LASTEXITCODE -ne 0) { throw 'libxml2 adapter link failed.' }

Copy-Item (Join-Path $sourceRoot 'Copyright') (Join-Path $distRoot 'LICENSE.libxml2.txt') -Force
$artifacts = foreach ($name in @('libxml2-relaxng.mjs','libxml2-relaxng.wasm')) {
    $path = Join-Path $distRoot $name
    $bytes = [IO.File]::ReadAllBytes($path)
    $memory = [IO.MemoryStream]::new()
    $gzip = [IO.Compression.GZipStream]::new($memory,[IO.Compression.CompressionLevel]::SmallestSize,$true)
    $gzip.Write($bytes,0,$bytes.Length); $gzip.Dispose()
    [ordered]@{ file=$name; rawBytes=$bytes.Length; gzipBytes=$memory.Length; sha256=(Get-FileHash -Algorithm SHA256 $path).Hash.ToLowerInvariant() }
    $memory.Dispose()
}
[ordered]@{
    createdUtc=(Get-Date).ToUniversalTime().ToString('o')
    elapsedMs=[math]::Round(((Get-Date)-$started).TotalMilliseconds,3)
    libxml2Version=$metadata.libxml2.version
    configureFlags=$configure[7..($configure.Count-1)]
    linkFlags=$link[7..($link.Count-1)]
    artifacts=$artifacts
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $distRoot 'build-manifest.json') -Encoding utf8
$artifacts | Format-Table
