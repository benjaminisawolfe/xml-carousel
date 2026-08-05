[CmdletBinding()]
param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$cacheRoot = Join-Path $repositoryRoot 'tools\xerces-wasm-spike\.cache\w3c-xsd-2007-06-20'
$archivePath = Join-Path $cacheRoot 'xsts-2007-06-20.tar.gz'
$suiteRoot = Join-Path $cacheRoot 'xmlschema2006-11-06'
$suiteMetadata = Join-Path $suiteRoot 'suite.xml'
$officialUrl = 'https://www.w3.org/XML/2004/xml-schema-test-suite/xmlschema2006-11-06/xsts-2007-06-20.tar.gz'
$expectedBytes = 4367182
$expectedSha256 = '902176b25e4111cf96b08663107521a4992e8ea67aad6b815592a6a5b4b9ea06'

New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
if (-not (Test-Path -LiteralPath $archivePath)) {
    if ($Offline) {
        throw "Offline W3C XSD bootstrap requires $archivePath"
    }
    Invoke-WebRequest -Uri $officialUrl -OutFile $archivePath
}

$archive = Get-Item -LiteralPath $archivePath
$actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($archive.Length -ne $expectedBytes -or $actualSha256 -ne $expectedSha256) {
    throw "W3C XSD archive identity mismatch. Expected $expectedBytes bytes / $expectedSha256, found $($archive.Length) bytes / $actualSha256."
}

if (-not (Test-Path -LiteralPath $suiteMetadata)) {
    & tar -xzf $archivePath -C $cacheRoot
    if ($LASTEXITCODE -ne 0) { throw 'W3C XSD archive extraction failed.' }
}
if (-not (Test-Path -LiteralPath $suiteMetadata)) {
    throw "W3C XSD suite metadata was not extracted at $suiteMetadata"
}

Write-Output "Verified W3C XML Schema Test Suite 2007-06-20: $expectedBytes bytes; $actualSha256"
Write-Output "Suite metadata: $suiteMetadata"
