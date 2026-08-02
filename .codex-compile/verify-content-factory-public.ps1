$ErrorActionPreference = "Stop"

$base = "https://api.751152.xyz"
$username = "codex_verify_0718"
$password = "CodexVerify0718!"
$email = "codex_verify_0718@751152.xyz"

$authBody = @{
  username = $username
  password = $password
  email = $email
} | ConvertTo-Json -Compress

try {
  Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -ContentType "application/json; charset=utf-8" -Body $authBody | Out-Null
} catch {
  # Existing verification user is expected after earlier runs.
}

$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json; charset=utf-8" -Body $authBody
$token = $login.data.token
if (-not $token) {
  throw "LOGIN_FAILED"
}

Write-Output "LOGIN_OK"
$headers = @{ Authorization = "Bearer $token" }
$status = Invoke-RestMethod -Method Get -Uri "$base/api/admin/content/status" -Headers $headers
Write-Output ("STATUS_CONFIGS:" + (($status.data | ConvertTo-Json -Compress -Depth 10)))

$runBody = @{
  category = "Technology / Internet"
  topic = "AI search is reshaping how ordinary readers find information"
  instruction = "Generate a standard WeChat article with a cover and 2-3 inline images. Create a WeChat draft after the quality gate passes. Do not auto publish."
  angle = "Explain the information gap through search entry changes, platform distribution and reader verification cost."
  audience = "ordinary readers who use search and feeds for everyday decisions"
  tone = "clear, concrete, conversational, not academic"
  length = "standard"
  generateCover = $true
  autoWechatDraft = $true
  autoPublish = $false
} | ConvertTo-Json -Compress

$start = Invoke-RestMethod -Method Post -Uri "$base/api/admin/content/automation/run" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $runBody
$jobId = $start.data.jobId
if (-not $jobId) {
  throw ("JOB_START_FAILED:" + ($start | ConvertTo-Json -Compress -Depth 10))
}
Write-Output "JOB_ID:$jobId"

$job = $null
for ($i = 1; $i -le 90; $i++) {
  $job = Invoke-RestMethod -Method Get -Uri "$base/api/admin/content/automation/run/$jobId" -Headers $headers
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
Write-Output ("QUALITY_GATE:" + (($automation.qualityGate | ConvertTo-Json -Compress -Depth 10)))
$err = $data.errorMessage
if (-not $err) {
  $err = $article.errorMessage
}
Write-Output ("ERROR:" + $err)
