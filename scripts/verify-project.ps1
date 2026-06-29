# Verificación automática del proyecto (sin publicar en Meta).
# Uso: .\scripts\verify-project.ps1
# Requiere: Docker (Postgres + Redis). API en http://localhost:4000 (opcional pero recomendado).

param(
  [string]$ApiUrl = "http://localhost:4000",
  [string]$Email = "meta-test-1781556894@example.com",
  [string]$Password = "TestMeta123!"
)

$ErrorActionPreference = "Stop"
$failed = 0

function Pass($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:failed++ }
function Info($msg) { Write-Host "[--] $msg" -ForegroundColor Cyan }

Info "1/4 Docker (Postgres + Redis)"
try {
  $ps = docker compose ps --format json 2>$null | ConvertFrom-Json
  $healthy = @($ps | Where-Object { $_.Health -eq "healthy" -or $_.State -eq "running" })
  if ($healthy.Count -ge 2) { Pass "Docker: $($healthy.Count) servicios activos" }
  else { Fail "Docker: ejecuta 'docker compose up -d'" }
} catch {
  Fail "Docker no disponible: $_"
}

Info "2/4 API health + endpoints clave"
try {
  $health = Invoke-RestMethod -Uri "$ApiUrl/health" -TimeoutSec 5
  Pass "GET /health: $($health.status)"
} catch {
  Fail "API no responde en $ApiUrl - ejecuta pnpm dev:api"
}

if ($failed -eq 0 -or $health) {
  try {
    $login = Invoke-RestMethod -Uri "$ApiUrl/auth/login" -Method POST `
      -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
      -ContentType "application/json"
    Pass "POST /auth/login: $($login.user.email)"

    $h = @{ Authorization = "Bearer $($login.accessToken)" }
    $clients = Invoke-RestMethod -Uri "$ApiUrl/clients" -Headers $h
    Pass "GET /clients: $($clients.Count) cliente(s)"

    $posts = Invoke-RestMethod -Uri "$ApiUrl/posts" -Headers $h
    Pass "GET /posts: $($posts.Count) post(s)"

    if ($clients.Count -gt 0) {
      $cid = $clients[0].id
      $accounts = Invoke-RestMethod -Uri "$ApiUrl/social-accounts?clientId=$cid" -Headers $h
      $active = @($accounts | Where-Object { $_.is_active -ne $false }).Count
      Pass "GET /social-accounts: $($accounts.Count) total, $active activas"

      try {
        $connect = Invoke-RestMethod -Uri "$ApiUrl/oauth/meta/connect-url?clientId=$cid" -Headers $h
        if ($connect.url -match "facebook\.com") {
          Pass "GET /oauth/meta/connect-url (Fase E)"
        } else {
          Fail "connect-url no devolvió URL de Meta"
        }
      } catch {
        Fail "GET /oauth/meta/connect-url 404 (reinicia pnpm dev:api con codigo Fase E)"
      }
    }
  } catch {
    Fail "Smoke API: $_"
  }
}

Info "3/4 Tests unitarios (pnpm test)"
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  pnpm test 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass 'pnpm test OK - 55 tests esperados' }
  else { Fail "pnpm test exit $LASTEXITCODE" }
} catch {
  Fail "pnpm test: $_"
} finally {
  Pop-Location
}

Info "4/4 Lint (pnpm lint)"
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  pnpm lint 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Pass "pnpm lint OK" }
  else { Fail "pnpm lint exit $LASTEXITCODE" }
} catch {
  Fail "pnpm lint: $_"
} finally {
  Pop-Location
}

Write-Host ""
if ($failed -eq 0) {
  Write-Host "Verificación automática completada sin errores." -ForegroundColor Green
  Write-Host "Revisa la checklist de revisión humana en docs/Estado del Proyecto.md"
  exit 0
} else {
  Write-Host "$failed comprobacion(es) fallida(s). Corrige y vuelve a ejecutar." -ForegroundColor Yellow
  exit 1
}
