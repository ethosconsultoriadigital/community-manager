# Prueba E2E: post con foto → aprobación → programación → publicación Meta
param(
  [string]$ApiUrl = "http://localhost:4000",
  [string]$Email = "meta-test-1781556894@example.com",
  [string]$Password = "TestMeta123!",
  [string]$ClientId = "b84f4c90-c415-499f-8a37-d8fd86ad99da",
  [string]$ImagePath = "",
  [int]$ScheduleMinutes = 2,
  [int]$WaitSeconds = 150
)

$ErrorActionPreference = "Stop"

if (-not $ImagePath) {
  $ImagePath = Resolve-Path (Join-Path $PSScriptRoot "..\apps\web\public\ethos-logo.png")
}
if (-not (Test-Path $ImagePath)) {
  throw "No se encontró imagen de prueba: $ImagePath"
}

Write-Host "==> Health API"
$health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method GET -TimeoutSec 5
if ($health.status -ne "ok") { throw "API no healthy" }

Write-Host "==> Login"
$login = Invoke-RestMethod -Uri "$ApiUrl/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

Write-Host "==> Cuentas sociales del cliente"
$accounts = Invoke-RestMethod -Uri "$ApiUrl/social-accounts?clientId=$ClientId" -Headers $h
if (-not $accounts.Count) {
  throw "Sin cuentas Meta conectadas para el cliente. Conecta OAuth Meta primero."
}
$accountIds = @($accounts | ForEach-Object { $_.id })
Write-Host "    Destinos: $($accounts.platform -join ', ')"

Write-Host "==> Crear borrador con foto"
$post = Invoke-RestMethod -Uri "$ApiUrl/posts" -Method POST -Headers $h `
  -ContentType "application/json" `
  -Body (@{
    clientId = $ClientId
    caption = "E2E foto $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    hashtags = @("#e2e", "#prueba")
    socialAccountIds = $accountIds
  } | ConvertTo-Json)
Write-Host "    Post: $($post.id)"

Write-Host "==> Subir imagen"
$uploadJson = curl.exe -s -X POST "$ApiUrl/posts/$($post.id)/media" `
  -H "Authorization: Bearer $($login.accessToken)" `
  -F "file=@$ImagePath"
$upload = $uploadJson | ConvertFrom-Json
Write-Host "    Media URL: $($upload.storage_url)"

if ($upload.storage_url -match 'localhost|127\.0\.0\.1') {
  Write-Warning "La URL de media es localhost. Meta NO podrá descargarla."
  Write-Warning "Configura MEDIA_PUBLIC_BASE_URL con un túnel (scripts/start-media-tunnel.ps1) y reinicia la API."
}

Write-Host "==> Enviar a aprobación"
Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)/submit-for-approval" -Method POST -Headers $h | Out-Null

Write-Host "==> Aprobar"
Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)/approve" -Method POST -Headers $h | Out-Null

Write-Host "==> Programar (+$ScheduleMinutes min)"
$at = (Get-Date).AddMinutes($ScheduleMinutes).ToUniversalTime().ToString("o")
$scheduled = Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)/schedule" -Method POST -Headers $h `
  -ContentType "application/json" -Body (@{ scheduledAt = $at } | ConvertTo-Json)
Write-Host "    Programado para: $($scheduled.scheduled_at)"

Write-Host "==> Esperando publicación (hasta $WaitSeconds s)..."
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$final = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 10
  $final = Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)" -Headers $h
  $targetStatuses = $final.post_targets | ForEach-Object { "$($_.social_accounts.platform)=$($_.status)" }
  Write-Host "    Estado post=$($final.status) | $($targetStatuses -join ' | ')"
  if ($final.status -eq "published") { break }
  if ($final.status -eq "failed") { break }
  if (($final.post_targets | Where-Object { $_.status -eq "published" }).Count -eq $final.post_targets.Count) { break }
}

Write-Host ""
Write-Host "==> RESULTADO"
Write-Host "Post ID: $($post.id)"
Write-Host "Estado:  $($final.status)"
foreach ($t in $final.post_targets) {
  $err = if ($t.PSObject.Properties.Name -contains "error_message") { $t.error_message } else { "" }
  Write-Host "  - $($t.social_accounts.platform): $($t.status) $(if ($t.platform_post_id) { "(id: $($t.platform_post_id))" }) $(if ($err) { "[$err]" })"
}

if ($final.status -eq "published") {
  Write-Host "`nOK: Publicación E2E con foto completada." -ForegroundColor Green
  exit 0
}

Write-Host "`nREVISAR: logs de pnpm dev:api y MEDIA_PUBLIC_BASE_URL pública si Meta falló." -ForegroundColor Yellow
exit 1
