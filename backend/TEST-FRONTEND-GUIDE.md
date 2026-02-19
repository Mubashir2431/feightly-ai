# Test Frontend Guide

## Overview
A simple HTML frontend to test both the Copilot (text) and Voice Input endpoints with real microphone input.

## How to Use

### 1. Open the Test Page
Simply open `test-frontend.html` in your web browser:

```bash
# Windows
start backend/test-frontend.html

# Or just double-click the file in File Explorer
```

### 2. Test Text Copilot

**Section: 📝 Text Copilot Test**

1. Enter a text request like:
   - "Dallas to Atlanta dry van two thirty minimum"
   - "I need to get home to Dallas from Miami"
   - "What loads are available near me?"

2. Enter Driver ID (default: DRIVER-001)

3. Click "Send to Copilot"

4. View the response showing:
   - Parsed intent (trip type, origin, destination, equipment, rate)
   - Search parameters
   - Copilot message

### 3. Test Voice Input

**Section: 🎤 Voice Input Test**

1. Enter Driver ID (default: DRIVER-001)

2. (Optional) Enter GPS coordinates:
   - Latitude: 32.7767
   - Longitude: -96.797

3. Click "🎤 Start Recording"
   - Browser will ask for microphone permission - click "Allow"
   - Button will turn red and pulse while recording

4. Speak your request clearly:
   - "Dallas to Atlanta dry van two thirty minimum"
   - "I need a load from Houston to Chicago"
   - "Find me a reefer load paying at least three dollars per mile"

5. Click "⏹️ Stop Recording"
   - Status will show "Recording saved - Ready to send"

6. Click "Send Voice Input"
   - Audio will be sent to OpenAI Whisper for transcription
   - Then parsed by Bedrock AI
   - Response will show:
     - Transcript (what Whisper heard)
     - Parsed intent
     - Search parameters
     - Copilot message

## Features

### Visual Feedback
- ✅ Color-coded responses (green for success, red for errors)
- 🔴 Pulsing red button while recording
- 📊 Status indicators (Ready, Recording, Processing)
- 📋 Formatted JSON responses

### Error Handling
- Validates required fields
- Shows clear error messages
- Handles microphone permission issues
- Displays API errors

### Response Display
- Pretty-printed JSON
- Scrollable response boxes
- Syntax highlighting with borders
- Separate sections for each test

## Example Requests

### Text Examples
```
"Dallas to Atlanta dry van two thirty minimum"
"I need to get home to Dallas from Miami"
"What loads are available near me?"
"Find me a reefer load from Chicago to Miami paying at least 2.50 per mile"
"I need a flatbed load, no more than 100 miles deadhead"
```

### Voice Examples
Say these phrases clearly:
- "Dallas to Atlanta dry van two thirty minimum"
- "I need a load from Houston to Chicago"
- "Find me a reefer load paying at least three dollars per mile"
- "I want to get home to Dallas"
- "What loads are available near me"

## Expected Response Format

### Copilot Response
```json
{
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
```

### Voice Response
```json
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
    ...
  },
  "searchParams": {
    "originCity": "Dallas",
    "destCity": "Atlanta",
    "equipment": "Dry Van",
    "minRate": 2.30
  },
  "copilotMessage": "Looking for loads from Dallas, TX to Atlanta, GA (Dry Van) at 2.30/mile or better..."
}
```

## Troubleshooting

### Microphone Not Working
- Check browser permissions (usually a camera icon in the address bar)
- Try a different browser (Chrome/Edge recommended)
- Make sure no other app is using the microphone

### CORS Errors
- The API Gateway is configured with CORS enabled
- If you see CORS errors, check the browser console
- Make sure you're using the correct API URL

### Poor Transcription Quality
- Speak clearly and at a moderate pace
- Reduce background noise
- Use a good quality microphone
- Try recording in a quiet environment

### Empty or Wrong Transcript
- Make sure you're speaking loud enough
- Check that the microphone is working (test in another app)
- Try speaking more slowly and clearly
- Ensure you clicked "Stop Recording" before sending

## Browser Compatibility

✅ **Recommended:**
- Google Chrome (latest)
- Microsoft Edge (latest)
- Firefox (latest)

⚠️ **Limited Support:**
- Safari (may have microphone issues)
- Older browsers (may not support MediaRecorder API)

## API Endpoints

- **Copilot:** `POST https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/copilot`
- **Voice:** `POST https://f4x56v8gcl.execute-api.us-east-1.amazonaws.com/prod/voice`

## Next Steps

After testing:
1. ✅ Verify transcription accuracy with different phrases
2. ✅ Test with various accents and speaking speeds
3. ✅ Try different trip types (backhaul, round trip, etc.)
4. ✅ Test error handling (empty input, invalid data)
5. 📝 Document any issues or improvements needed
