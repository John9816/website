$sshKey = "$env:USERPROFILE\.ssh\id_ed25519"
while ($true) {
  try {
    & ssh.exe -i $sshKey -N -R 18787:127.0.0.1:18787 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes root@8.156.95.93
  } catch {}
  Start-Sleep -Seconds 2
}
