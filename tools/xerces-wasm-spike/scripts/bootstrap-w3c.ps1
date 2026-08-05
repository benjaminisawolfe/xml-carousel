[CmdletBinding()]
param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$manifestPath = Join-Path $repositoryRoot 'tests\fixtures\xerces-wasm-spike\w3c-selected-cases.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$cacheRoot = Join-Path $repositoryRoot $manifest.cacheDirectory
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

foreach ($case in $manifest.cases) {
    $destination = Join-Path $cacheRoot $case.cacheFile
    if (-not (Test-Path -LiteralPath $destination)) {
        if ($Offline) { throw "Offline W3C bootstrap requires $destination" }
        $rawUrl = $case.source.Replace('/blob/', '/raw/')
        Invoke-WebRequest -Uri $rawUrl -OutFile $destination
    }
    $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $case.checksum.ToLowerInvariant()) {
        throw "W3C case hash mismatch for $($case.id). Expected $($case.checksum), found $actual."
    }
    Write-Output "Verified $($case.id): $actual"
}
