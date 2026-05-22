# Person 1 — Infrastructure & Cloud Setup
## Bodyweight AI Coach — Hackathon Day Guide

---

## Your Role
You are responsible for:
- Setting up Google Cloud so the team can use Gemini
- Building the WebSocket server that connects the browser to Gemini Live
- Deploying the finished app to Cloud Run at the end

Everyone on the team is blocked until you finish Phase 1.
Start immediately and do not stop until the API key is in everyone's hands.

---

## Phase 1 — Google Cloud Setup (Hour 1)
### This is your only job until it's done. Do not skip steps.

### Step 1 — Create a Google Cloud Project
1. Go to https://console.cloud.google.com
2. Sign in with your Google account
3. Click the project dropdown at the top left (it says "Select a project")
4. Click "New Project"
5. Name it: `coach-hackathon`
6. Click "Create"
7. Wait 30 seconds, then select the project from the dropdown

### Step 2 — Claim Your Google Cloud Credits
1. The organizers will give you a credit code at 11:15am
2. Go to https://console.cloud.google.com/billing
3. Click "Redeem a promotion code"
4. Enter your code
5. Link the billing account to your `coach-hackathon` project

### Step 3 — Enable the APIs You Need
Run these one by one in Google Cloud Shell (click the terminal icon `>_` at the top right of the Cloud Console):

```bash
gcloud services enable aiplatform.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

Wait for each one to finish before running the next.

### Step 4 — Get Your Gemini API Key
1. Go to https://aistudio.google.com
2. Sign in with the same Google account
3. Click "Get API Key" in the left sidebar
4. Click "Create API key"
5. Select your `coach-hackathon` project
6. Copy the key — it starts with `AIza...`
7. **Send this key to your whole team immediately in your group chat**
8. Save it — you cannot retrieve it again

### Step 5 — Verify It Works
Open Google Cloud Shell and run:

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-live-preview:generateContent?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Say hello"}]}]}'
```

If you get a JSON response back with text in it, you're good. Move to Phase 2.

If you get an error, check:
- Did you enable the API? (Step 3)
- Is the API key correct? (Step 4)
- Is billing linked? (Step 2)

---

## Phase 2 — WebSocket Server (Hours 1-2)

### What You're Building
A Node.js Express server with a WebSocket endpoint that:
1. Receives video frames and audio from the browser
2. Forwards them to Gemini Live API
3. Receives Coach's audio response from Gemini
4. Sends it back to the browser

### Setup

```bash
mkdir server && cd server
npm init -y
npm install express ws @google/genai dotenv cors
```

Create a `.env` file:
```
GEMINI_API_KEY=your_key_here
PORT=8080
```

### File: `server/index.js`

```javascript
import express from 'express'
import { WebSocketServer } from 'ws'
import { GoogleGenAI, Modality } from '@google/genai'
import dotenv from 'dotenv'
import { buildSquatPrompt } from './prompts/squat.js'

dotenv.config()

const app = express()
app.use(express.json())

// Health check endpoint — Cloud Run needs this
app.get('/', (req, res) => res.send('Coach server running'))

const server = app.listen(process.env.PORT || 8080, () => {
  console.log(`Server running on port ${process.env.PORT || 8080}`)
})

// WebSocket server
const wss = new WebSocketServer({ server })

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

wss.on('connection', async (browserSocket) => {
  console.log('Browser connected')

  let geminiSession = null

  try {
    // Open Gemini Live session
    geminiSession = await client.live.connect({
      model: 'gemini-3.1-flash-live-preview',
      config: {
        system_instruction: buildSquatPrompt(),
        response_modalities: [Modality.AUDIO],
        tools: [{ google_search: {} }]
      },
      callbacks: {
        // Receive audio from Gemini → forward to browser
        onmessage: (message) => {
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData) {
                // Audio response from Coach
                browserSocket.send(JSON.stringify({
                  type: 'coach_audio',
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType
                }))
              }
              if (part.text) {
                // Text cue for overlay
                browserSocket.send(JSON.stringify({
                  type: 'coach_text',
                  text: part.text
                }))
              }
            }
          }
        },
        onerror: (error) => {
          console.error('Gemini error:', error)
          browserSocket.send(JSON.stringify({ type: 'error', message: error.message }))
        },
        onclose: () => {
          console.log('Gemini session closed')
        }
      }
    })

    console.log('Gemini Live session opened')
    browserSocket.send(JSON.stringify({ type: 'session_ready' }))

  } catch (error) {
    console.error('Failed to open Gemini session:', error)
    browserSocket.send(JSON.stringify({ type: 'error', message: 'Failed to connect to Coach' }))
    return
  }

  // Receive data from browser → forward to Gemini
  browserSocket.on('message', async (rawData) => {
    try {
      const message = JSON.parse(rawData)

      if (message.type === 'video_frame') {
        // Video frame from webcam
        await geminiSession.sendRealtimeInput({
          video: {
            data: message.data,
            mimeType: 'image/jpeg'
          }
        })
      }

      if (message.type === 'audio_chunk') {
        // Audio from microphone
        await geminiSession.sendRealtimeInput({
          audio: {
            data: message.data,
            mimeType: 'audio/pcm;rate=16000'
          }
        })
      }

    } catch (error) {
      console.error('Error forwarding to Gemini:', error)
    }
  })

  // Browser disconnects
  browserSocket.on('close', async () => {
    console.log('Browser disconnected')
    if (geminiSession) {
      await geminiSession.close()
    }
  })
})
```

### File: `server/prompts/squat.js`

```javascript
export const buildSquatPrompt = () => `
You are Coach, an expert calisthenics coach watching an athlete
perform air squats in real time through their camera.

CRITICAL RULES:
- Give ONE cue at a time. Maximum one sentence.
- Wait at least 4 seconds between cues.
- Be specific: "push your knees out" not "fix your knees"
- Reference body parts directly: "your left knee", "your hips", "your chest"
- If form is good, say it: "Good depth", "That's it", "Nice rep"
- If the athlete talks to you, answer briefly and let them keep going
- Never give a list of corrections. Fix the most important thing first.

WHAT TO WATCH FOR:

Knee cave (most common):
- Knees collapsing inward
- Cues: "Push your knees out over your toes"
         "Spread the floor with your feet"
         "Drive those knees out"

Chest falling forward:
- Torso leaning too far forward, losing upright position
- Cues: "Chest up"
         "Stay tall through your torso"
         "Keep your chest proud"

Heels rising:
- Weight shifting to toes, heels coming off floor
- Cues: "Weight in your heels"
         "Drive your heels into the floor"
         "Sit back more"

Not hitting depth:
- Hips not reaching parallel (hip crease below top of knee)
- Cues: "Go deeper — hips below parallel"
         "Sit all the way down"
         "Break parallel with your hips"

Butt wink (lower back rounding at bottom):
- Pelvis tucking under at the bottom of the squat
- Cues: "Brace your core at the bottom"
         "Keep your lower back neutral"
         "Don't let your pelvis tuck"

Good squat looks like:
- Feet shoulder width, toes slightly out
- Knees tracking over toes throughout
- Chest tall, slight forward lean is okay
- Hip crease below top of knee at bottom
- Weight distributed through whole foot
- Core braced throughout

You are watching them RIGHT NOW. React to what you see immediately.
Keep it short. They are mid-movement.
`
```

### Test It Locally
```bash
node index.js
# Should print: Server running on port 8080
```

Tell Person 3 the server is running at `ws://localhost:8080` so they can connect.

---

## Phase 3 — Deploy to Cloud Run (Hour 5)
### Do this only after the app is fully working locally.

### Step 1 — Create a Dockerfile in the server folder

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
```

### Step 2 — Add package.json type
Make sure your `server/package.json` has:
```json
{
  "type": "module"
}
```

### Step 3 — Deploy

Open Google Cloud Shell and run:

```bash
# Set your project
gcloud config set project coach-hackathon

# Deploy directly from your server folder
gcloud run deploy coach-server \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key_here \
  --port 8080
```

Wait 3-5 minutes. When it finishes it will print a URL like:
`https://coach-server-xxxxxxxx-uc.a.run.app`

Send that URL to Person 3 immediately so they can update the frontend WebSocket URL.

### Step 4 — Verify Deployment
```bash
curl https://coach-server-xxxxxxxx-uc.a.run.app
# Should return: Coach server running
```

---

## Troubleshooting

**API key not working:**
- Make sure billing is linked to the project
- Make sure you enabled aiplatform.googleapis.com
- Try generating a new key at aistudio.google.com

**WebSocket connection refused:**
- Make sure server is running: `node index.js`
- Check the port matches what Person 3 is connecting to

**Cloud Run deploy failing:**
- Check Dockerfile exists in the server folder
- Make sure cloudbuild.googleapis.com is enabled
- Check the logs: `gcloud run logs read coach-server --region us-central1`

**Gemini Live session not opening:**
- Verify the model name: `gemini-3.1-flash-live-preview`
- Check your API key is in the .env file
- Make sure @google/genai package is installed

---

## Your Checklist

- [ ] Google Cloud project created
- [ ] Credits redeemed and linked to project
- [ ] APIs enabled (aiplatform, run, cloudbuild)
- [ ] API key generated and sent to team
- [ ] API key verified with curl test
- [ ] WebSocket server running locally
- [ ] Gemini Live session opening successfully
- [ ] Person 2 and Person 3 both connected and getting responses
- [ ] App fully working locally
- [ ] Deployed to Cloud Run
- [ ] Cloud Run URL sent to Person 3