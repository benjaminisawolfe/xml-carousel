[CmdletBinding()]
param(
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$metadata = Get-Content (Join-Path $spikeRoot 'versions.json') -Raw | ConvertFrom-Json
$cacheRoot = Join-Path $spikeRoot '.cache\build-tools'
$toolsRoot = Join-Path $spikeRoot '.tools'
$cmakeArchive = Join-Path $cacheRoot $metadata.cmake.archive
$ninjaArchive = Join-Path $cacheRoot $metadata.ninja.archive
$cmakeRoot = Join-Path $toolsRoot "cmake-$($metadata.cmake.version)-windows-x86_64"
$ninjaRoot = Join-Path $toolsRoot "ninja-$($metadata.ninja.version)"

New-Item -ItemType Directory -Force -Path $cacheRoot,$toolsRoot | Out-Null

function Install-VerifiedArchive {
    param(
        [string]$Url,
        [string]$ArchivePath,
        [string]$ExpectedHash,
        [string]$Destination,
        [string]$ExtractionRoot
    )
    if (-not (Test-Path -LiteralPath $ArchivePath)) {
        if ($Offline) { throw "Offline bootstrap requires $ArchivePath" }
        Invoke-WebRequest -Uri $Url -OutFile $ArchivePath
    }
    $actualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedHash.ToLowerInvariant()) {
        throw "Build-tool archive SHA-256 mismatch for $ArchivePath. Expected $ExpectedHash but found $actualHash."
    }
    if (-not (Test-Path -LiteralPath $Destination)) {
        New-Item -ItemType Directory -Force -Path $ExtractionRoot | Out-Null
        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractionRoot -Force
    }
    Write-Output "Verified ${ArchivePath}: $actualHash"
}

Install-VerifiedArchive $metadata.cmake.url $cmakeArchive $metadata.cmake.sha256 $cmakeRoot $toolsRoot
Install-VerifiedArchive $metadata.ninja.url $ninjaArchive $metadata.ninja.sha256 $ninjaRoot $ninjaRoot

$cmake = Join-Path $cmakeRoot 'bin\cmake.exe'
$ninja = Join-Path $ninjaRoot 'ninja.exe'
if (-not (Test-Path -LiteralPath $cmake)) { throw "Missing CMake executable: $cmake" }
if (-not (Test-Path -LiteralPath $ninja)) { throw "Missing Ninja executable: $ninja" }

& $cmake --version | Select-Object -First 1
& $ninja --version
Write-Output "CMake: $cmake"
Write-Output "Ninja: $ninja"
