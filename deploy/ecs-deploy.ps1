param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "root",
  [string]$RemoteDir = "/opt/website",
  [string]$Port = "3000",
  [string]$BackendUrl = "https://api.751152.xyz",
  [string]$SshKey = "$HOME\.ssh\id_ed25519"
)

$ErrorActionPreference = "Stop"

npm run build

$archive = Join-Path $env:TEMP "website-ecs.tar.gz"
if (Test-Path $archive) {
  Remove-Item -LiteralPath $archive -Force
}

tar -czf $archive dist server package.json package-lock.json deploy/website-ecs.service deploy/nginx.website.conf

$target = "${User}@${HostName}"
ssh -i $SshKey $target "mkdir -p $RemoteDir"
scp -i $SshKey $archive "${target}:${RemoteDir}/website-ecs.tar.gz"

$remoteScript = @"
set -e
cd '$RemoteDir'
tar -xzf website-ecs.tar.gz
cat > .env.ecs <<'EOF'
NODE_ENV=production
PORT=$Port
BACKEND_URL=$BackendUrl
DIST_DIR=$RemoteDir/dist
EOF
if command -v systemctl >/dev/null 2>&1; then
  cp deploy/website-ecs.service /etc/systemd/system/website-ecs.service
  systemctl daemon-reload
  systemctl enable --now website-ecs.service
  systemctl restart website-ecs.service
fi
"@

$remoteScriptPath = Join-Path $env:TEMP "website-ecs-remote.sh"
Set-Content -LiteralPath $remoteScriptPath -Value $remoteScript -Encoding ASCII
scp -i $SshKey $remoteScriptPath "${target}:${RemoteDir}/deploy-ecs.sh"
ssh -i $SshKey $target "tr -d '\r' < '${RemoteDir}/deploy-ecs.sh' > '${RemoteDir}/deploy-ecs.unix.sh' && bash '${RemoteDir}/deploy-ecs.unix.sh'"

Write-Host "Deployed to ${target}:$RemoteDir"
Write-Host "Runtime health check: http://${HostName}:$Port/healthz"
