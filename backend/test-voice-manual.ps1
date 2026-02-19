# Manual test script for Voice endpoint (PowerShell)
# Run this once Amazon Transcribe subscription is active

$API_URL = "https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/voice"

Write-Host "🎯 Voice Endpoint Manual Test" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Valid request with audio
Write-Host "Test 1: Valid voice request" -ForegroundColor Yellow
Write-Host "----------------------------" -ForegroundColor Yellow
Write-Host "Note: This test requires Amazon Transcribe to be enabled"
Write-Host ""

Write-Host "To test with real audio:" -ForegroundColor Green
Write-Host "1. Record a 5-second audio file saying: 'Dallas to Atlanta dry van two thirty minimum'"
Write-Host "2. Save as test.wav"
Write-Host "3. Encode to base64:"
Write-Host '   $bytes = [IO.File]::ReadAllBytes("test.wav")'
Write-Host '   $base64 = [Convert]::ToBase64String($bytes)'
Write-Host "4. Use the base64 string in the request below"
Write-Host ""

Write-Host "Example PowerShell command:" -ForegroundColor Green
Write-Host @'
$body = @{
    audioBase64 = "AUDIO_BASE64_HERE"
    driverId = "test-driver-001"
    currentLat = 32.7767
    currentLng = -96.797
} | ConvertTo-Json

Invoke-RestMethod -Uri $API_URL -Method Post -Body $body -ContentType "application/json"
'@

Write-Host ""
Write-Host ""
Write-Host "Expected Response (once Transcribe is enabled):" -ForegroundColor Green
Write-Host @'
{
  "transcript": "Dallas to Atlanta dry van two thirty minimum",
  "parsed": {
    "tripType": "one_way",
    "originCity": "Dallas",
    "originState": "TX",
    "destCity": "Atlanta",
    "destState": "GA",
    "equipment": "Dry Van",
    "minRate": 2.30,
    "maxDeadhead": null,
    "homeCity": null,
    "homeState": null,
    "timeConstraint": null,
    "avoidRegions": null,
    "notes": ""
  },
  "searchParams": {
    "originCity": "Dallas",
    "destCity": "Atlanta",
    "equipment": "Dry Van",
    "minRate": 2.30
  },
  "copilotMessage": "Looking for loads from Dallas, TX to Atlanta, GA (Dry Van) at 2.30/mile or better..."
}
'@

Write-Host ""
Write-Host ""
Write-Host "Test 2: Error cases (these work now)" -ForegroundColor Yellow
Write-Host "-------------------------------------" -ForegroundColor Yellow

Write-Host ""
Write-Host "Missing audioBase64:" -ForegroundColor Cyan
$body = @{ driverId = "test-driver-002" } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri $API_URL -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json
} catch {
    $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json
}

Write-Host ""
Write-Host "Missing driverId:" -ForegroundColor Cyan
$body = @{ audioBase64 = "dGVzdA==" } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri $API_URL -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json
} catch {
    $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json
}

Write-Host ""
Write-Host "Empty body:" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri $API_URL -Method Post -ContentType "application/json" | ConvertTo-Json
} catch {
    $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json
}

Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "✅ Validation tests completed" -ForegroundColor Green
Write-Host "⚠️  Transcription test requires AWS Transcribe subscription" -ForegroundColor Yellow
