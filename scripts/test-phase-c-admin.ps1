# Smoke test Fase C - panel admin (API + comprobaciones de acceso)
param(
  [string]$ApiUrl = "http://localhost:4000",
  [string]$WebUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$passed = 0
$failed = 0

function Record($name, $ok, $detail = "") {
  if ($ok) {
    Write-Host "[OK] $name" -ForegroundColor Green
    if ($detail) { Write-Host "     $detail" }
    $script:passed++
  } else {
    Write-Host "[FAIL] $name" -ForegroundColor Red
    if ($detail) { Write-Host "     $detail" }
    $script:failed++
  }
}

Write-Host ""
Write-Host "=== Fase C - prueba admin ==="
Write-Host ""

try {
  $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method GET
  Record "GET /health" ($health.status -eq "ok")
} catch {
  Record "GET /health" $false $_.Exception.Message
  exit 1
}

$adminEmail = "admin-fasec-$ts@example.com"
$adminPass = "TestPass123!"
try {
  $reg = Invoke-RestMethod -Uri "$ApiUrl/auth/register" -Method POST -ContentType "application/json" `
    -Body (@{ agencyName = "Fase C Test $ts"; email = $adminEmail; password = $adminPass } | ConvertTo-Json)
  $adminToken = $reg.accessToken
  Record "POST /auth/register (admin owner)" ($reg.user.role -eq "owner")
} catch {
  Record "POST /auth/register (admin owner)" $false $_.Exception.Message
  exit 1
}

$adminH = @{ Authorization = "Bearer $adminToken" }

try {
  $users = Invoke-RestMethod -Uri "$ApiUrl/admin/users" -Headers $adminH
  Record "GET /admin/users (owner)" ($users -is [array])
} catch {
  Record "GET /admin/users (owner)" $false $_.Exception.Message
}

try {
  $client = Invoke-RestMethod -Uri "$ApiUrl/clients" -Method POST -Headers $adminH -ContentType "application/json" `
    -Body (@{ name = "Negocio Fase C $ts" } | ConvertTo-Json)
  $clientId = $client.id
  Record "POST /clients" ($client.name -like "Negocio Fase C*")
} catch {
  Record "POST /clients" $false $_.Exception.Message
  $clientId = $null
}

$managerEmail = "manager-fasec-$ts@example.com"
$managerPass = "ManagerPass123!"
$managerUserId = $null
$managerToken = $null

if ($clientId) {
  try {
    $newUser = Invoke-RestMethod -Uri "$ApiUrl/admin/users" -Method POST -Headers $adminH -ContentType "application/json" `
      -Body (@{
        email = $managerEmail
        password = $managerPass
        fullName = "Manager Fase C"
        role = "manager"
        clientId = $clientId
      } | ConvertTo-Json)
    Record "POST /admin/users" ($newUser.email -eq $managerEmail -and $newUser.client.id -eq $clientId)
    $managerUserId = $newUser.id
  } catch {
    Record "POST /admin/users" $false $_.Exception.Message
  }
}

if ($managerUserId) {
  try {
    Invoke-RestMethod -Uri "$ApiUrl/admin/users/$managerUserId/deactivate" -Method PATCH -Headers $adminH | Out-Null
    $loginFail = $false
    try {
      Invoke-RestMethod -Uri "$ApiUrl/auth/login" -Method POST -ContentType "application/json" `
        -Body (@{ email = $managerEmail; password = $managerPass } | ConvertTo-Json) | Out-Null
    } catch { $loginFail = $true }
    Record "PATCH deactivate + login bloqueado" $loginFail

    Invoke-RestMethod -Uri "$ApiUrl/admin/users/$managerUserId/activate" -Method PATCH -Headers $adminH | Out-Null
    $newPass = "NewPass123!"
    Invoke-RestMethod -Uri "$ApiUrl/admin/users/$managerUserId/reset-password" -Method POST -Headers $adminH -ContentType "application/json" `
      -Body (@{ password = $newPass } | ConvertTo-Json) | Out-Null
    $loginNew = Invoke-RestMethod -Uri "$ApiUrl/auth/login" -Method POST -ContentType "application/json" `
      -Body (@{ email = $managerEmail; password = $newPass } | ConvertTo-Json)
    Record "reset-password + login nueva clave" ($loginNew.user.role -eq "manager")
    $managerToken = $loginNew.accessToken
  } catch {
    Record "deactivate/activate/reset-password" $false $_.Exception.Message
  }
}

if ($managerToken) {
  $managerH = @{ Authorization = "Bearer $managerToken" }
  $managerForbidden = $false
  try {
    Invoke-RestMethod -Uri "$ApiUrl/admin/users" -Headers $managerH | Out-Null
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403) { $managerForbidden = $true }
  }
  Record "GET /admin/users (manager -> 403)" $managerForbidden

  try {
    $mgrClients = Invoke-RestMethod -Uri "$ApiUrl/clients" -Headers $managerH
    $onlyAssigned = ($mgrClients.Count -eq 1 -and $mgrClients[0].id -eq $clientId)
    Record "GET /clients (manager solo su cliente)" $onlyAssigned "count=$($mgrClients.Count)"
  } catch {
    Record "GET /clients (manager solo su cliente)" $false $_.Exception.Message
  }

  try {
    $connect = Invoke-RestMethod -Uri "$ApiUrl/oauth/meta/connect-url?clientId=$clientId" -Headers $managerH
    Record "GET oauth/meta/connect-url (manager su cliente)" ($connect.url -match "facebook\.com")
  } catch {
    Record "GET oauth/meta/connect-url (manager su cliente)" $false $_.Exception.Message
  }
}

try {
  $adminPage = Invoke-WebRequest -Uri "$WebUrl/admin" -UseBasicParsing
  Record "GET /admin (web responde 200)" ($adminPage.StatusCode -eq 200)
  Record "Web carga chunk /admin" ($adminPage.Content -match "admin/page")
} catch {
  Record "GET /admin (web)" $false $_.Exception.Message
}

Write-Host ""
Write-Host "Resultado: $passed OK, $failed FAIL"
Write-Host ""
if ($failed -gt 0) { exit 1 }
