[CmdletBinding()]
param([int]$Port = 4178)

$spikeRoot = Split-Path -Parent $PSScriptRoot
$env:XML_CAROUSEL_RELAX_NG_PORT = "$Port"
node (Join-Path $spikeRoot 'node\static-server.mjs')
