#!/bin/bash
# Manual test script for Voice endpoint
# Run this once Amazon Transcribe subscription is active

API_URL="https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/voice"

echo "🎯 Voice Endpoint Manual Test"
echo "=============================="
echo ""

# Test 1: Valid request with audio
echo "Test 1: Valid voice request"
echo "----------------------------"
echo "Note: This test requires Amazon Transcribe to be enabled"
echo ""

# Create a simple WAV file (1 second of silence)
# In a real test, you would use actual voice recording
echo "Creating test audio file..."

# For manual testing, you can record audio with:
# - Windows: Sound Recorder app
# - Mac: QuickTime Player > New Audio Recording
# - Linux: arecord -d 5 -f cd test.wav

# Then encode to base64:
# - Windows PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("test.wav"))
# - Mac/Linux: base64 test.wav

echo ""
echo "To test with real audio:"
echo "1. Record a 5-second audio file saying: 'Dallas to Atlanta dry van two thirty minimum'"
echo "2. Save as test.wav"
echo "3. Encode to base64: base64 test.wav > test.b64"
echo "4. Use the base64 string in the curl command below"
echo ""

# Example curl command (replace AUDIO_BASE64 with actual base64 string)
cat << 'EOF'
curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{
    "audioBase64": "AUDIO_BASE64_HERE",
    "driverId": "test-driver-001",
    "currentLat": 32.7767,
    "currentLng": -96.797
  }'
EOF

echo ""
echo ""
echo "Expected Response (once Transcribe is enabled):"
cat << 'EOF'
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
EOF

echo ""
echo ""
echo "Test 2: Error cases (these work now)"
echo "-------------------------------------"

echo ""
echo "Missing audioBase64:"
curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{"driverId": "test-driver-002"}' \
  2>/dev/null | jq .

echo ""
echo "Missing driverId:"
curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d '{"audioBase64": "dGVzdA=="}' \
  2>/dev/null | jq .

echo ""
echo "Empty body:"
curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  2>/dev/null | jq .

echo ""
echo "=============================="
echo "✅ Validation tests completed"
echo "⚠️  Transcription test requires AWS Transcribe subscription"
