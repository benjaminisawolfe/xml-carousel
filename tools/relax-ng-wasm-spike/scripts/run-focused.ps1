[CmdletBinding()]
param([switch]$Firefox)

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'verify-pins.ps1')
& (Join-Path $PSScriptRoot 'build.ps1')
& (Join-Path $PSScriptRoot 'build-rnv.ps1')
node (Join-Path $spikeRoot 'node\run-synthetic.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Synthetic RNG evidence failed.' }
node (Join-Path $spikeRoot 'node\run-selected-suite.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Selected external-suite evidence failed.' }
node (Join-Path $spikeRoot 'node\run-comparison.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Comparator evidence failed.' }
if ($Firefox) {
    node (Join-Path $spikeRoot 'node\run-firefox.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Firefox evidence failed.' }
}
Write-Output 'PASS: focused RELAX NG feasibility evidence.'
