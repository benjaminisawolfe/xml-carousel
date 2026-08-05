[CmdletBinding()]
param(
    [string]$XercesJRoot = 'C:\Utilities\xerces-2_12_2',
    [string]$HermeticPath = 'E:\Work\Hermetic Foundry\xml-schemas.zip',
    [string]$Output = (Join-Path ([IO.Path]::GetTempPath()) 'xml-carousel-xerces-j-comparison.json')
)

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Resolve-Path (Join-Path $spikeRoot '..\..')
$classes = Join-Path $spikeRoot 'build\comparator'
$jar = Join-Path $XercesJRoot 'xercesImpl.jar'
if (-not (Test-Path -LiteralPath $jar)) {
    throw "The pinned Xerces-J comparator was not found at $jar"
}
New-Item -ItemType Directory -Force -Path $classes | Out-Null
& javac -cp $jar -d $classes (Join-Path $spikeRoot 'comparator\XercesJSchemaComparator.java')
if ($LASTEXITCODE -ne 0) { throw 'Xerces-J comparator compilation failed.' }
$version = (& java -cp $jar org.apache.xerces.impl.Version).Trim()
if ($version -ne 'Xerces-J 2.12.2') { throw "Unexpected comparator version: $version" }

$comparisons = [Collections.Generic.List[object]]::new()
function Add-Comparison([string]$Mode, [string]$Root, [string]$Path, [string]$Id, [string]$Family, [string[]]$Expected, [string]$Boundary = '') {
    $comparisons.Add([pscustomobject]@{
        mode = $Mode
        root = $Root
        path = $Path
        id = $Id
        family = $Family
        expected = $Expected
        boundary = $Boundary
    })
}

$dtdManifest = Get-Content (Join-Path $repositoryRoot 'tests\fixtures\w3c-xmlconf-20130923\dtd-selected-tests.json') -Raw | ConvertFrom-Json
$dtdRoot = Join-Path $spikeRoot '.cache\w3c-xmlconf-20130923\extracted\xmlconf'
if (-not (Test-Path -LiteralPath (Join-Path $dtdRoot 'xmlconf.xml'))) {
    throw 'The W3C XML corpus is absent. Run the XML 20130923 bootstrap command before the comparator.'
}
$selectedDtd = @($dtdManifest.tests | Where-Object selected)
$chosenDtdIds = [Collections.Generic.HashSet[string]]::new()
foreach ($family in ($selectedDtd | Group-Object testFamily | Sort-Object Name)) {
    foreach ($expected in ($family.Group | Group-Object expected | Sort-Object Name)) {
        [void]$chosenDtdIds.Add(($expected.Group | Sort-Object id | Select-Object -First 1).id)
    }
}
foreach ($test in ($selectedDtd | Where-Object knownBoundaryClassification)) {
    [void]$chosenDtdIds.Add($test.id)
}
foreach ($test in ($selectedDtd | Where-Object { $chosenDtdIds.Contains($_.id) } | Sort-Object id)) {
    $expected = if ($test.expected -eq 'valid') { @('valid') } elseif ($test.expected -eq 'error') { @('valid', 'invalid') } else { @('invalid') }
    Add-Comparison 'xml' $dtdRoot (Join-Path $dtdRoot ($test.entry -replace '/', '\')) $test.id $test.testFamily $expected ($test.knownBoundaryClassification ?? '')
}

$xsdManifest = Get-Content (Join-Path $repositoryRoot 'tests\fixtures\w3c-xsd-1.0\2007-06-20\selected-tests.json') -Raw | ConvertFrom-Json
$xsdRoot = Join-Path $spikeRoot '.cache\w3c-xsd-2007-06-20\xmlschema2006-11-06'
if (-not (Test-Path -LiteralPath (Join-Path $xsdRoot 'suite.xml'))) {
    throw 'The W3C XSD corpus is absent. Run npm run spike:xerces:bootstrap-w3c-xsd before the comparator.'
}
$selectedXsd = @($xsdManifest.cases | Where-Object selected)
$chosenXsdIds = [Collections.Generic.HashSet[string]]::new()
foreach ($family in ($selectedXsd | Group-Object family | Sort-Object Name)) {
    foreach ($expected in @('valid', 'invalid')) {
        $candidate = $family.Group | Where-Object { $_.expectedSchemaValidity -contains $expected } | Sort-Object id | Select-Object -First 1
        if ($candidate) { [void]$chosenXsdIds.Add($candidate.id) }
    }
}
foreach ($test in ($selectedXsd | Where-Object knownClassification)) {
    [void]$chosenXsdIds.Add($test.id)
}
foreach ($test in ($selectedXsd | Where-Object { $chosenXsdIds.Contains($_.id) } | Sort-Object id)) {
    if ($test.schemaDocuments.Count -eq 0) { continue }
    foreach ($schemaPath in $test.schemaDocuments) {
        Add-Comparison 'xsd' $xsdRoot (Join-Path $xsdRoot ($schemaPath -replace '/', '\')) $test.id $test.family @($test.expectedSchemaValidity) ($test.knownClassification ?? '')
    }
}

$temporaryRoot = $null
if (Test-Path -LiteralPath $HermeticPath) {
    $artifact = Get-Item -LiteralPath $HermeticPath
    $artifactHash = (Get-FileHash -LiteralPath $HermeticPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($artifact.Length -ne 134821 -or $artifactHash -ne 'c17ce1c44cd5aa309bcc652bb43f64e30bc993aef52a0347cfbc799a32886a8f') {
        throw "Hermetic archive identity mismatch: $($artifact.Length) bytes, $artifactHash"
    }
    $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("xml-carousel-xerces-j-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
    [IO.Compression.ZipFile]::ExtractToDirectory($HermeticPath, $temporaryRoot)
    $hermeticRoot = Join-Path $temporaryRoot 'xml-schemas'
    Add-Comparison 'xsd' $hermeticRoot (Join-Path $hermeticRoot 'foundry-entity.xsd') 'hermetic:package:foundry-entity' 'hermetic-package' @('valid')
    Add-Comparison 'xsd' $hermeticRoot (Join-Path $hermeticRoot 'entities\characters.xsd') 'hermetic:package:characters' 'hermetic-package' @('valid')
    $standaloneRoot = Join-Path $temporaryRoot 'standalone'
    New-Item -ItemType Directory -Path $standaloneRoot | Out-Null
    Copy-Item -LiteralPath (Join-Path $hermeticRoot 'foundry-common.xsd') -Destination $standaloneRoot
    Add-Comparison 'xsd' $standaloneRoot (Join-Path $standaloneRoot 'foundry-common.xsd') 'hermetic:standalone:missing-dependency' 'hermetic-standalone' @('invalid') 'blocked-dependency'
}

function Invoke-ComparatorGroup([object[]]$Items) {
    $mode = $Items[0].mode
    $root = $Items[0].root
    $paths = @($Items.path | Sort-Object -Unique)
    $lines = @(& java -cp "$classes;$jar" XercesJSchemaComparator --mode $mode --root $root @paths 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Xerces-J $mode comparison process failed." }
    $statuses = @{}
    foreach ($line in $lines) {
        Write-Host $line
        $parts = "$line" -split "`t", 4
        if ($parts[0] -eq 'result') { $statuses[$parts[3]] = $parts[2] }
    }
    foreach ($item in $Items) {
        $actual = $statuses[$item.path]
        if (-not $actual) { throw "Comparator emitted no result for $($item.path)" }
        $agrees = $item.expected -contains $actual
        [pscustomobject]@{
            id = $item.id
            family = $item.family
            mode = $item.mode
            expected = $item.expected
            actual = $actual
            boundary = $item.boundary
            disposition = if ($agrees) { 'agreement' } elseif ($item.boundary) { 'accepted-boundary-difference' } else { 'unexpected-disagreement' }
        }
    }
}

try {
    $results = @()
    foreach ($group in ($comparisons | Group-Object { "$($_.mode)`0$($_.root)" })) {
        $results += @(Invoke-ComparatorGroup @($group.Group))
    }
    $unexpected = @($results | Where-Object disposition -eq 'unexpected-disagreement')
    $report = [ordered]@{
        schemaVersion = 1
        validator = $version
        validatorJarSha256 = (Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash.ToLowerInvariant()
        comparisonSetSize = $results.Count
        familyCoverage = @($results.family | Sort-Object -Unique)
        agreementCount = @($results | Where-Object disposition -eq 'agreement').Count
        acceptedBoundaryDifferenceCount = @($results | Where-Object disposition -eq 'accepted-boundary-difference').Count
        unexpectedDisagreementCount = $unexpected.Count
        results = $results
    }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Output -Encoding utf8NoBOM
    Write-Output "Xerces-J comparison: $($results.Count) cases; $($report.familyCoverage.Count) families; $($unexpected.Count) unexpected disagreements."
    Write-Output "Machine-readable report: $Output"
    if ($unexpected.Count -gt 0) { exit 2 }
} finally {
    if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
        $resolvedTemp = [IO.Path]::GetFullPath($temporaryRoot)
        $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if (-not $resolvedTemp.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove comparator directory outside the system temporary root: $resolvedTemp"
        }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
