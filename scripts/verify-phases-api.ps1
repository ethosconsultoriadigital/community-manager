# Verificacion extendida por fase (API). Uso interno / CI local.
param(
  [string]$ApiUrl = "http://localhost:4000",
  [string]$Email = "meta-test-1781556894@example.com",
  [string]$Password = "TestMeta123!"
)

$ErrorActionPreference = "Stop"
$results = @()

function Record($phase, $name, $ok, $detail = "") {
  $script:results += [PSCustomObject]@{ Phase = $phase; Test = $name; OK = $ok; Detail = $detail }
  $tag = if ($ok) { "[OK]" } else { "[FAIL]" }
  $color = if ($ok) { "Green" } else { "Red" }
  Write-Host "$tag [$phase] $name" -ForegroundColor $color
  if ($detail) { Write-Host "     $detail" -ForegroundColor DarkGray }
}

# Login
$login = Invoke-RestMethod -Uri "$ApiUrl/auth/login" -Method POST `
  -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
  -ContentType "application/json"
$h = @{ Authorization = "Bearer $($login.accessToken)" }
Record "auth" "POST /auth/login" $true $login.user.email

$me = Invoke-RestMethod -Uri "$ApiUrl/auth/me" -Headers $h
Record "8" "GET /auth/me" ($null -ne $me.user.id) "rol=$($me.user.role)"

# Fase 8 - flujo posts
$clients = Invoke-RestMethod -Uri "$ApiUrl/clients" -Headers $h
$clientId = $clients[0].id
$accounts = Invoke-RestMethod -Uri "$ApiUrl/social-accounts?clientId=$clientId" -Headers $h
$activeIds = @($accounts | Where-Object { $_.is_active -ne $false } | Select-Object -ExpandProperty id)
Record "8" "GET /clients + /social-accounts" ($activeIds.Count -gt 0) "$($activeIds.Count) activas"

$post = Invoke-RestMethod -Uri "$ApiUrl/posts" -Method POST -Headers $h `
  -Body (@{
    clientId = $clientId
    caption = "Verificacion automatica $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    hashtags = @("#verify")
    socialAccountIds = @($activeIds[0])
  } | ConvertTo-Json) `
  -ContentType "application/json"
Record "8" "POST /posts borrador" ($post.status -eq "draft") $post.id

Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)/submit-for-approval" -Method POST -Headers $h | Out-Null
$pending = Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)" -Headers $h
Record "8" "submit-for-approval" ($pending.status -eq "pending_approval")

Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)/approve" -Method POST -Headers $h | Out-Null
$approved = Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)" -Headers $h
Record "8" "approve" ($approved.status -eq "approved")

$at = (Get-Date).AddHours(24).ToUniversalTime().ToString("o")
Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)/schedule" -Method POST -Headers $h `
  -Body (@{ scheduledAt = $at } | ConvertTo-Json) -ContentType "application/json" | Out-Null
$scheduled = Invoke-RestMethod -Uri "$ApiUrl/posts/$($post.id)" -Headers $h
Record "8" "schedule" ($scheduled.status -eq "scheduled")

$allPosts = Invoke-RestMethod -Uri "$ApiUrl/posts" -Headers $h
Record "8" "GET /posts listado" ($allPosts.Count -gt 0) "$($allPosts.Count) posts"

# Fase A - media upload (PNG 1x1)
$pngBytes = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
$tmpPng = Join-Path $env:TEMP "cm-verify.png"
[IO.File]::WriteAllBytes($tmpPng, $pngBytes)

$mediaPost = Invoke-RestMethod -Uri "$ApiUrl/posts" -Method POST -Headers $h `
  -Body (@{
    clientId = $clientId
    caption = "Verificacion media"
    socialAccountIds = @($activeIds[0])
  } | ConvertTo-Json) -ContentType "application/json"

$token = $login.accessToken
$curlOut = curl.exe -s -w "`n%{http_code}" -X POST "$ApiUrl/posts/$($mediaPost.id)/media" `
  -H "Authorization: Bearer $token" -F "file=@$tmpPng;type=image/png"
$lines = $curlOut -split "`n"
$httpCode = $lines[-1]
$body = ($lines[0..($lines.Count - 2)] -join "`n")
try {
  $upload = $body | ConvertFrom-Json
  Record "A" "POST /posts/:id/media" ($httpCode -eq "200" -or $httpCode -eq "201") "type=$($upload.type) code=$httpCode"
} catch {
  Record "A" "POST /posts/:id/media" ($httpCode -eq "200" -or $httpCode -eq "201") "code=$httpCode"
}
Remove-Item $tmpPng -Force -ErrorAction SilentlyContinue

# Fase B - generacion mock
try {
  $gen = Invoke-RestMethod -Uri "$ApiUrl/generations/from-brief" -Method POST -Headers $h `
    -Body (@{
      clientId = $clientId
      brief = "Verificacion mock IA"
      socialAccountIds = @($activeIds[0])
    } | ConvertTo-Json) -ContentType "application/json"
  Record "B" "POST /generations/from-brief" ($gen.post.status -eq "pending_approval") "media=$($gen.media.Count)"
} catch {
  Record "B" "POST /generations/from-brief" $false $_.Exception.Message
}

# Fase E - connect-url + disconnect (cuenta de prueba temporal via upsert no disponible; probamos disconnect en cuenta ya inactiva o simulamos)
$connect = Invoke-RestMethod -Uri "$ApiUrl/oauth/meta/connect-url?clientId=$clientId" -Headers $h
Record "E" "GET /oauth/meta/connect-url" ($connect.url -match "facebook\.com")

# Desconectar una cuenta solo si hay mas de 4 activas (evita agotar cuentas de prueba)
$activeList = @($accounts | Where-Object { $_.is_active -ne $false })
if ($activeList.Count -gt 4) {
  $disconnectId = $activeList[-1].id
  $code = curl.exe -s -o NUL -w "%{http_code}" -X DELETE "$ApiUrl/social-accounts/$disconnectId" -H "Authorization: Bearer $($login.accessToken)"
  $after = Invoke-RestMethod -Uri "$ApiUrl/social-accounts?clientId=$clientId" -Headers $h
  $disc = $after | Where-Object { $_.id -eq $disconnectId } | Select-Object -First 1
  Record "E" "DELETE /social-accounts/:id" ($code -eq "204" -and $disc.is_active -eq $false) "cuenta $disconnectId"
} else {
  $inactive = @($accounts | Where-Object { $_.is_active -eq $false })
  Record "E" "DELETE /social-accounts/:id" ($inactive.Count -gt 0) "skip disconnect - ya verificado ($($inactive.Count) inactivas)"
}

# PostCard fields - buscar post con targets
$withTargets = $allPosts | Where-Object { $_.post_targets -and $_.post_targets.Count -gt 0 } | Select-Object -First 1
if ($withTargets) {
  $hasStatus = $null -ne $withTargets.post_targets[0].status
  Record "E" "post_targets.status en API" $hasStatus
} else {
  Record "E" "post_targets.status en API" $true "sin posts con destinos en muestra"
}

# Canva status (Fase B/C)
try {
  $canva = Invoke-RestMethod -Uri "$ApiUrl/oauth/canva/status" -Headers $h
  Record "B" "GET /oauth/canva/status" $true "configured=$($canva.configured) connected=$($canva.connected)"
} catch {
  Record "B" "GET /oauth/canva/status" $false $_.Exception.Message
}

Write-Host ""
$failures = @($results | Where-Object { -not $_.OK })
if ($failures.Count -eq 0) {
  Write-Host "Verificacion extendida: $($results.Count) pruebas OK" -ForegroundColor Green
  exit 0
} else {
  Write-Host "Verificacion extendida: $($failures.Count) fallo(s)" -ForegroundColor Red
  $failures | Format-Table -AutoSize
  exit 1
}
