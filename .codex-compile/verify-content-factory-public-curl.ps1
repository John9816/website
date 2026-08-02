$ErrorActionPreference = "Stop"

$base = "https://api.751152.xyz"
$tmp = ".codex-compile"
$authPath = Join-Path $tmp "public-auth.json"
$runPath = Join-Path $tmp "public-run.json"
$loginPath = Join-Path $tmp "public-login-response.json"
$statusPath = Join-Path $tmp "public-status-response.json"
$startPath = Join-Path $tmp "public-start-response.json"
$jobPath = Join-Path $tmp "public-job-response.json"

'{"username":"codex_verify_0718","password":"CodexVerify0718!","email":"codex_verify_0718@751152.xyz"}' | Set-Content -LiteralPath $authPath -Encoding ascii

& curl.exe -sS -X POST "$base/api/auth/login" -H "Content-Type: application/json" --data-binary "@$authPath" -o $loginPath
$login = Get-Content -LiteralPath $loginPath -Raw | ConvertFrom-Json
$token = $login.data.token
if (-not $token) {
  throw "LOGIN_FAILED: $(Get-Content -LiteralPath $loginPath -Raw)"
}
Write-Output "LOGIN_OK"

& curl.exe -sS "$base/api/admin/content/status" -H "Authorization: Bearer $token" -o $statusPath
Write-Output ("STATUS_CONFIGS:" + (Get-Content -LiteralPath $statusPath -Raw))

$run = @{
  category = "Technology / Internet"
  topic = "AI search is reshaping how ordinary readers find information"
  instruction = "Generate a standard WeChat article with a cover and 2-3 inline AI images. Create a WeChat draft after the quality gate passes. Do not auto publish."
  angle = "Explain the information gap through search entry changes, platform distribution and reader verification cost."
  audience = "ordinary readers who use search and feeds for everyday decisions"
  tone = "clear, concrete, conversational, not academic"
  length = "standard"
  generateCover = $true
  autoWechatDraft = $true
  autoPublish = $false
} | ConvertTo-Json -Compress
$run | Set-Content -LiteralPath $runPath -Encoding utf8

& curl.exe -sS -X POST "$base/api/admin/content/automation/run" -H "Authorization: Bearer $token" -H "Content-Type: application/json; charset=utf-8" --data-binary "@$runPath" -o $startPath
$start = Get-Content -LiteralPath $startPath -Raw | ConvertFrom-Json
$jobId = $start.data.jobId
if (-not $jobId) {
  throw "JOB_START_FAILED: $(Get-Content -LiteralPath $startPath -Raw)"
}
Write-Output "JOB_ID:$jobId"

$job = $null
for ($i = 1; $i -le 90; $i++) {
  & curl.exe -sS "$base/api/admin/content/automation/run/$jobId" -H "Authorization: Bearer $token" -o $jobPath
  $job = Get-Content -LiteralPath $jobPath -Raw | ConvertFrom-Json
  $jobStatus = $job.data.status
  Write-Output "JOB_STATUS:$jobStatus"
  if ($jobStatus -eq "SUCCESS" -or $jobStatus -eq "FAILED") {
    break
  }
  Start-Sleep -Seconds 10
}

$data = $job.data
$article = $data.article
$inline = @($article.inlineImages)
$ready = @($inline | Where-Object { $_.status -eq "READY" })
$failed = @($inline | Where-Object { $_.status -eq "FAILED" })
$draft = $data.draft
$automation = $data.automation

Write-Output ("ARTICLE_ID:" + $article.id)
Write-Output ("ARTICLE_STATUS:" + $article.status)
Write-Output ("TITLE:" + $article.title)
Write-Output ("COVER:" + [bool]$article.coverImageUrl)
Write-Output ("COVER_URL:" + $article.coverImageUrl)
Write-Output ("INLINE_TOTAL:{0} READY:{1} FAILED:{2}" -f $inline.Count, $ready.Count, $failed.Count)
foreach ($img in $inline) {
  Write-Output ("INLINE:{0}|{1}|{2}|{3}|{4}" -f $img.slotId, $img.status, $img.sourceType, $img.sourcePageUrl, $img.failureReason)
}
Write-Output ("DRAFT_MODE:{0} MEDIA_ID:{1}" -f $draft.mode, $draft.mediaId)
Write-Output ("QUALITY_GATE:" + ($automation.qualityGate | ConvertTo-Json -Compress -Depth 10))
$err = $data.errorMessage
if (-not $err) {
  $err = $article.errorMessage
}
Write-Output ("ERROR:" + $err)
