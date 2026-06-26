# Expone localhost:4000 con túnel HTTPS para que Meta descargue imágenes.
# Preferir cloudflared (más estable que localtunnel).
#
# Uso:
#   .\scripts\start-media-tunnel.ps1
#   → copiar URL en MEDIA_PUBLIC_BASE_URL del .env
#   → reiniciar pnpm dev:api

param(
  [int]$Port = 4000,
  [ValidateSet('cloudflared', 'localtunnel')]
  [string]$Provider = 'cloudflared'
)

Write-Host "Iniciando túnel ($Provider) hacia puerto $Port..."
Write-Host "Cuando aparezca la URL, añádela al .env:"
Write-Host "  MEDIA_PUBLIC_BASE_URL=https://TU-URL-SIN-BARRA-FINAL"
Write-Host "Luego reinicia: pnpm dev:api"
Write-Host ""

if ($Provider -eq 'cloudflared') {
  npx --yes cloudflared tunnel --url "http://localhost:$Port"
} else {
  npx --yes localtunnel --port $Port
}
