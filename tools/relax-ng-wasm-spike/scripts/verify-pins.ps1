[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$toolchain = Get-Content (Join-Path $spikeRoot 'manifests\toolchain.json') -Raw | ConvertFrom-Json
$comparators = Get-Content (Join-Path $spikeRoot 'manifests\comparator.json') -Raw | ConvertFrom-Json
$checks = @(
    @{ Path=(Join-Path $spikeRoot ".cache\libxml2\libxml2-$($toolchain.libxml2.version).tar.xz"); Hash=$toolchain.libxml2.sha256 },
    @{ Path=(Join-Path $spikeRoot '.cache\comparators\jing-20241231.zip'); Hash=$comparators.jingTrang.jingSha256 },
    @{ Path=(Join-Path $spikeRoot '.cache\comparators\jing-20241231.zip.sha1'); Hash=$comparators.jingTrang.jingSha1FileSha256 },
    @{ Path=(Join-Path $spikeRoot '.cache\comparators\trang-20241231.zip'); Hash=$comparators.jingTrang.trangSha256 },
    @{ Path=(Join-Path $spikeRoot '.cache\comparators\trang-20241231.zip.sha1'); Hash=$comparators.jingTrang.trangSha1FileSha256 },
    @{ Path=(Join-Path $spikeRoot '.cache\comparators\jing-trang-spectest.xml'); Hash=$comparators.jamesClarkSuite.selectedAuthoritySha256 },
    @{ Path=(Join-Path $spikeRoot '.cache\comparators\james-clark-testSuite.zip'); Hash=$comparators.jamesClarkSuite.archiveSha256 },
    @{ Path=(Join-Path $spikeRoot '.cache\browser\geckodriver-v0.37.1-win64.zip'); Hash=$toolchain.firefoxDriver.sha256 }
)
foreach ($check in $checks) {
    if (-not (Test-Path -LiteralPath $check.Path)) { throw "Missing pinned input: $($check.Path)" }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $check.Path).Hash.ToLowerInvariant()
    if ($actual -ne $check.Hash) { throw "Checksum mismatch: $($check.Path)" }
}
if ((Get-FileHash -Algorithm SHA1 (Join-Path $spikeRoot '.cache\comparators\jing-20241231.zip')).Hash.ToLowerInvariant() -ne $comparators.jingTrang.jingSha1) { throw 'Jing SHA-1 mismatch.' }
if ((Get-FileHash -Algorithm SHA1 (Join-Path $spikeRoot '.cache\comparators\trang-20241231.zip')).Hash.ToLowerInvariant() -ne $comparators.jingTrang.trangSha1) { throw 'Trang SHA-1 mismatch.' }
$rnvRoot = Join-Path $spikeRoot '.tools\rnv'
if ((git -C $rnvRoot rev-parse HEAD).Trim() -ne $comparators.rnv.commit) { throw 'RNV commit mismatch.' }
if ((git -C $rnvRoot rev-parse 'HEAD^{tree}').Trim() -ne $comparators.rnv.tree) { throw 'RNV tree mismatch.' }
Write-Output "PASS: $($checks.Count) archives/files and the pinned RNV commit/tree verified."
