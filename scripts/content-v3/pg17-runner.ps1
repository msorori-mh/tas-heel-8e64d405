param(
  [string]$DatabaseUrl = $env:TAMKEEN_PG17_LOCAL_URL,
  [string[]]$PrerequisiteSql = @(),
  [string]$FixtureSql = (Join-Path $PSScriptRoot 'pg17-21h-canonical-fixture.sql'),
  [switch]$SkipFixture,
  [string]$R5MigrationSql = (Join-Path $PSScriptRoot '..\..\supabase\migrations-pending\20260819130000_content_v3_legacy_20c_reconciliation_r5.sql'),
  [string]$MigrationSql = (Join-Path $PSScriptRoot '..\..\supabase\migrations-pending\20260818210000_content_v3_21h_hardened_preflight.sql'),
  [string]$PostverifySql = (Join-Path $PSScriptRoot 'postverify-21h.sql'),
  [string]$ContractSql = (Join-Path $PSScriptRoot 'runtime-contract-21h-r3.sql')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Output 'BLOCKED_PG17_ENVIRONMENT'
  Write-Output 'Set TAMKEEN_PG17_LOCAL_URL to a local PostgreSQL 17 connection string.'
  exit 3
}

function Stop-NonLocalDatabaseTarget([string]$Reason) {
  Write-Output 'STOP_NON_LOCAL_DATABASE_TARGET'
  throw $Reason
}

function Test-ExplicitLocalHost([string]$HostValue) {
  if ([string]::IsNullOrWhiteSpace($HostValue)) { return $false }
  $normalized = $HostValue.Trim().TrimStart('[').TrimEnd(']')
  if ($normalized -in @('localhost', '127.0.0.1', '::1')) { return $true }
  $ip = $null
  return [System.Net.IPAddress]::TryParse($normalized, [ref]$ip) -and
    $ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6 -and
    $ip.Equals([System.Net.IPAddress]::IPv6Loopback)
}

function Get-ConnectionHosts([string]$ConnectionString) {
  $uri = $null
  if ([System.Uri]::TryCreate($ConnectionString, [System.UriKind]::Absolute, [ref]$uri) -and
      $uri.Scheme -in @('postgres', 'postgresql')) {
    return @($uri.Host)
  }

  $hosts = [System.Collections.Generic.List[string]]::new()
  foreach ($match in [regex]::Matches($ConnectionString, '(?i)(?:^|\s)(host|hostaddr)\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s]+))')) {
    $value = @($match.Groups[2].Value, $match.Groups[3].Value, $match.Groups[4].Value) |
      Where-Object { $_ -ne '' } | Select-Object -First 1
    if ($null -ne $value) { [void]$hosts.Add([string]$value) }
  }
  return $hosts.ToArray()
}

$targetHosts = @(Get-ConnectionHosts $DatabaseUrl)
if ($targetHosts.Count -eq 0 -or ($targetHosts | Where-Object { -not (Test-ExplicitLocalHost $_) }).Count -gt 0) {
  Stop-NonLocalDatabaseTarget 'The connection target host could not be proven to be localhost, 127.0.0.1, or ::1.'
}
if ($targetHosts.Count -gt 2 -or ($targetHosts | Select-Object -Unique).Count -ne $targetHosts.Count) {
  Stop-NonLocalDatabaseTarget 'The connection string contains ambiguous or duplicate host targets.'
}
if ($DatabaseUrl -match '(?i)(?:^|\s)(?:host|hostaddr)\s*=\s*[^\s]+,[^\s]+') {
  Stop-NonLocalDatabaseTarget 'Multi-host connection targets are not accepted.'
}

Write-Output 'PG17_TARGET_CLASS=LOCAL_ONLY'

$schemaGate = Join-Path $PSScriptRoot 'verify-21h-fixture-schema.mjs'
& node $schemaGate
if ($LASTEXITCODE -ne 0) { throw '21H R3 fixture schema gate failed' }

$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($null -eq $psql) {
  Write-Output 'BLOCKED_PG17_ENVIRONMENT'
  Write-Output 'psql was not found; no client or server was installed automatically.'
  exit 3
}

function Invoke-PsqlFile([string]$Path) {
  & $psql.Source $DatabaseUrl --set=ON_ERROR_STOP=1 --file=$Path
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $Path" }
}

$version = (& $psql.Source $DatabaseUrl --no-align --tuples-only --command="SHOW server_version_num")
if ([int]$version.Trim() -lt 170000) { throw "PostgreSQL 17 required; got $version" }
Write-Output "PG17_VERSION=$($version.Trim())"

if (-not $SkipFixture) { Invoke-PsqlFile $FixtureSql }
foreach ($file in $PrerequisiteSql) { Invoke-PsqlFile $file }
# R5 is an ordering prerequisite for 21H: it adds evidence provenance and
# reconciles legacy READY rows before 21H introduces applicability.
Invoke-PsqlFile $R5MigrationSql
Invoke-PsqlFile $MigrationSql
Invoke-PsqlFile $PostverifySql
Invoke-PsqlFile $ContractSql
Write-Output 'PG17_PREFLIGHT=PASS'
