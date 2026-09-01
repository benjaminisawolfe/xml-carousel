[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $spikeRoot '..\..')
$manifest = Get-Content (Join-Path $spikeRoot 'manifests\toolchain.json') -Raw | ConvertFrom-Json
$comparators = Get-Content (Join-Path $spikeRoot 'manifests\comparator.json') -Raw | ConvertFrom-Json
$xercesScripts = Join-Path $repositoryRoot 'tools\xerces-wasm-spike\scripts'

& (Join-Path $xercesScripts 'bootstrap-emsdk.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Shared pinned Emscripten bootstrap failed.' }
& (Join-Path $xercesScripts 'bootstrap-build-tools.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Shared pinned CMake/Ninja bootstrap failed.' }

$cache = Join-Path $spikeRoot '.cache\libxml2'
$tools = Join-Path $spikeRoot '.tools\libxml2'
$archive = Join-Path $cache "libxml2-$($manifest.libxml2.version).tar.xz"
$checksumFile = Join-Path $cache "libxml2-$($manifest.libxml2.version).sha256sum"
$source = Join-Path $tools "libxml2-$($manifest.libxml2.version)"
New-Item -ItemType Directory -Force -Path $cache,$tools | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri $manifest.libxml2.url -OutFile $archive
}
if (-not (Test-Path -LiteralPath $checksumFile)) {
    Invoke-WebRequest -Uri $manifest.libxml2.sha256Url -OutFile $checksumFile
}
if ((Get-Content -Raw $checksumFile) -notmatch [regex]::Escape($manifest.libxml2.sha256)) {
    throw 'Official libxml2 checksum file does not contain the pinned SHA-256.'
}
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
if ($actual -ne $manifest.libxml2.sha256) { throw "libxml2 checksum mismatch: $actual" }
if ((Get-Item -LiteralPath $archive).Length -ne $manifest.libxml2.archiveBytes) {
    throw 'libxml2 archive size mismatch.'
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'CMakeLists.txt'))) {
    tar -xf $archive -C $tools
    if ($LASTEXITCODE -ne 0) { throw 'libxml2 extraction failed.' }
}

$comparatorCache = Join-Path $spikeRoot '.cache\comparators'
New-Item -ItemType Directory -Force $comparatorCache | Out-Null
function Get-PinnedFile([string]$Url,[string]$Path,[string]$Sha256) {
    if (-not (Test-Path -LiteralPath $Path)) { Invoke-WebRequest -Uri $Url -OutFile $Path }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actualHash -ne $Sha256) { throw "Checksum mismatch for $Path`: $actualHash" }
}
$jingArchive = Join-Path $comparatorCache 'jing-20241231.zip'
$jingSha1File = Join-Path $comparatorCache 'jing-20241231.zip.sha1'
$trangArchive = Join-Path $comparatorCache 'trang-20241231.zip'
$trangSha1File = Join-Path $comparatorCache 'trang-20241231.zip.sha1'
$suitePath = Join-Path $comparatorCache 'jing-trang-spectest.xml'
$suiteArchive = Join-Path $comparatorCache 'james-clark-testSuite.zip'
Get-PinnedFile $comparators.jingTrang.jingUrl $jingArchive $comparators.jingTrang.jingSha256
Get-PinnedFile $comparators.jingTrang.jingSha1Url $jingSha1File $comparators.jingTrang.jingSha1FileSha256
Get-PinnedFile $comparators.jingTrang.trangUrl $trangArchive $comparators.jingTrang.trangSha256
Get-PinnedFile $comparators.jingTrang.trangSha1Url $trangSha1File $comparators.jingTrang.trangSha1FileSha256
Get-PinnedFile $comparators.jamesClarkSuite.selectedAuthorityUrl $suitePath $comparators.jamesClarkSuite.selectedAuthoritySha256
Get-PinnedFile $comparators.jamesClarkSuite.archiveUrl $suiteArchive $comparators.jamesClarkSuite.archiveSha256
if ((Get-FileHash -Algorithm SHA1 $jingArchive).Hash.ToLowerInvariant() -ne $comparators.jingTrang.jingSha1) { throw 'Jing SHA-1 mismatch.' }
if ((Get-Content -Raw $jingSha1File).Trim().ToLowerInvariant() -ne $comparators.jingTrang.jingSha1) { throw 'Jing official SHA-1 sidecar mismatch.' }
if ((Get-FileHash -Algorithm SHA1 $trangArchive).Hash.ToLowerInvariant() -ne $comparators.jingTrang.trangSha1) { throw 'Trang SHA-1 mismatch.' }
if ((Get-Content -Raw $trangSha1File).Trim().ToLowerInvariant() -ne $comparators.jingTrang.trangSha1) { throw 'Trang official SHA-1 sidecar mismatch.' }
$jingRoot = Join-Path $spikeRoot '.tools\jing'
$trangRoot = Join-Path $spikeRoot '.tools\trang'
if (-not (Test-Path (Join-Path $jingRoot 'jing-20241231\bin\jing.jar'))) {
    Expand-Archive -LiteralPath $jingArchive -DestinationPath $jingRoot -Force
}
if (-not (Test-Path (Join-Path $trangRoot 'trang-20241231\trang.jar'))) {
    Expand-Archive -LiteralPath $trangArchive -DestinationPath $trangRoot -Force
}

$rnvRoot = Join-Path $spikeRoot '.tools\rnv'
if (-not (Test-Path (Join-Path $rnvRoot '.git'))) {
    git clone $comparators.rnv.repository $rnvRoot
    if ($LASTEXITCODE -ne 0) { throw 'RNV clone failed.' }
}
git -C $rnvRoot checkout --detach $comparators.rnv.commit
if ($LASTEXITCODE -ne 0) { throw 'RNV checkout failed.' }
if ((git -C $rnvRoot rev-parse HEAD).Trim() -ne $comparators.rnv.commit) { throw 'RNV commit mismatch.' }
if ((git -C $rnvRoot rev-parse 'HEAD^{tree}').Trim() -ne $comparators.rnv.tree) { throw 'RNV tree mismatch.' }

$geckoCache = Join-Path $spikeRoot '.cache\browser\geckodriver-v0.37.1-win64.zip'
$geckoRoot = Join-Path $spikeRoot '.tools\geckodriver'
New-Item -ItemType Directory -Force (Split-Path -Parent $geckoCache),$geckoRoot | Out-Null
Get-PinnedFile $manifest.firefoxDriver.url $geckoCache $manifest.firefoxDriver.sha256
if (-not (Test-Path (Join-Path $geckoRoot 'geckodriver.exe'))) {
    Expand-Archive -LiteralPath $geckoCache -DestinationPath $geckoRoot -Force
}

$javaVersion = (& java -version 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: JING/TRANG COMPARATOR REQUIRES JAVA' }
Write-Output "Pinned prerequisites ready: libxml2 $($manifest.libxml2.version), emsdk $($manifest.emsdk.version), CMake $($manifest.cmake.version), Ninja $($manifest.ninja.version)."
Write-Output $javaVersion
