# Prueba E2E: post con video (opcional Reel) → aprobación → programación → publicación Meta
param(
  [string]$ApiUrl = "http://localhost:4000",
  [string]$Email = "meta-test-1781556894@example.com",
  [string]$Password = "TestMeta123!",
  [string]$ClientId = "b84f4c90-c415-499f-8a37-d8fd86ad99da",
  [string]$VideoPath = "",
  [switch]$AsReel,
  [int]$ScheduleMinutes = 2,
  [int]$WaitSeconds = 180
)

$ErrorActionPreference = "Stop"

if (-not $VideoPath) {
  throw "Indica -VideoPath con un MP4 de prueba (max ~50 MB). Ej: .\scripts\e2e-publish-with-video.ps1 -VideoPath C:\Videos\test.mp4"
}
if (-not (Test-Path $VideoPath)) {
  throw "No se encontró el video: $VideoPath"
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
  throw "Sin cuentas Meta conectadas para el cliente."
}
$accountIds = @($accounts | ForEach-Object { $_.id })
Write-Host "    Destinos: $($accounts.platform -join ', ')"

$videoFormat = if ($AsReel) { "reel" } else { "feed" }
Write-Host "==> Crear borrador con video (formato: $videoFormat)"
$post = Invoke-RestMethod -Uri "$ApiUrl/posts" -Method POST -Headers $h `
  -ContentType "application/json" `
  -Body (@{
    clientId = $ClientId
    caption = "E2E video $(Get-Date -Format 'yyyy-MM-dd HH:mm') $(if ($AsReel) { '[Reel]' })"
    hashtags = @("#e2e", "#video")
    socialAccountIds = $accountIds
    videoFormat = $videoFormat
  } | ConvertTo-Json)
Write-Host "    Post: $($post.id)"

Write-Host "==> Subir video"
$uploadJson = curl.exe -s -X POST "$ApiUrl/posts/$($post.id)/media" `
  -H "Authorization: Bearer $($login.accessToken)" `
  -F "file=@$VideoPath;type=video/mp4"
$upload = $uploadJson | ConvertFrom-Json
Write-Host "    Media URL: $($upload.storage_url)"
if (-not $upload.storage_url) {
  throw "Subida de video fallida: $uploadJson"
}

if ($upload.storage_url -match 'localhost|127\.0\.0\.1') {
  Write-Warning "La URL de media es localhost. Meta NO podrá descargarla."
  Write-Warning "Configura MEDIA_PUBLIC_BASE_URL con un túnel y reinicia la API."
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
  Write-Host "    Estado post=$($final.status) video_format=$($final.video_format) | $($targetStatuses -join ' | ')"
  if ($final.status -eq "published") { break }
  if ($final.status -eq "failed") { break }
  $pending = ($final.post_targets | Where-Object { $_.status -in @('pending', 'publishing') }).Count
  if ($pending -eq 0) { break }
}

Write-Host ""
Write-Host "==> RESULTADO"
Write-Host "Post ID: $($post.id)"
Write-Host "Estado:  $($final.status)"
Write-Host "Formato: $($final.video_format)"
foreach ($t in $final.post_targets) {
  $err = if ($t.PSObject.Properties.Name -contains "error_message") { $t.error_message } else { "" }
  Write-Host "  - $($t.social_accounts.platform): $($t.status) $(if ($t.platform_post_id) { "(id: $($t.platform_post_id))" }) $(if ($err) { "[$err]" })"
}

if ($final.status -eq "published") {
  Write-Host "`nOK: Publicación E2E con video completada." -ForegroundColor Green
  exit 0
}

Write-Host "`nREVISAR: logs de pnpm dev:api y MEDIA_PUBLIC_BASE_URL pública." -ForegroundColor Yellow
exit 1
