$ErrorActionPreference = "Continue"
$proxy = "D:\Projects\VSCode\website\.codex-compile\mimo-proxy.cjs"
$sshKey = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
function Ensure-Proxy {
  $l = Get-NetTCPConnection -LocalPort 18787 -State Listen -ErrorAction SilentlyContinue
  if (-not $l) {
    Start-Process -FilePath "node.exe" -ArgumentList $proxy -WindowStyle Hidden
    Start-Sleep 2
  }
}
function Ensure-Tunnel {
  $ssh = Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object { $_.CommandLine -match "18787:127.0.0.1:18787" }
  if (-not $ssh) {
    Start-Process -FilePath "C:\Windows\System32\OpenSSH\ssh.exe" -ArgumentList @("-i",$sshKey,"-N","-R","127.0.0.1:18787:127.0.0.1:18787","-o","ServerAliveInterval=10","-o","ServerAliveCountMax=30","-o","TCPKeepAlive=yes","-o","ExitOnForwardFailure=yes","-o","StrictHostKeyChecking=no","root@8.156.95.93") -WindowStyle Hidden
  }
}
while ($true) {
  try { Ensure-Proxy; Ensure-Tunnel } catch {}
  Start-Sleep -Seconds 5
}