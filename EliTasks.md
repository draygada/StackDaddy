# Person 1 — Infrastructure & Server Setup
## Bodyweight AI Coach — Hackathon Day Guide

---

## Hackathon Requirements (mandatory)

| Requirement | Your responsibility |
|-------------|---------------------|
| **Google GenAI SDK** | Use `@google/genai` in `server/index.js` |
| **Hosted on Google Cloud** | Deploy backend to **Cloud Run** — judges need proof |
| **Hackathon account / credits** | Temp Google account from organizers; import project; API key to team |
| **API key security** | `.env` only — never commit to GitHub |

**Dev:** Use **ngrok** for fast local testing.
**Judging:** Use **Cloud Run** `wss://` URL — mandatory for submission video.

Portal: [goo.gle/CHM-hack-26](https://goo.gle/CHM-hack-26) · Account: [goo.gle/hackathon-account](https://goo.gle/hackathon-account)

---

## What You Are Building

**The flow:**
1. Browser records one set of squats (video blob)
2. Browser sends `recording_complete` when user taps Stop
3. Server sends the video to Gemini Live → sends `SET_COMPLETE` trigger
4. Gemini speaks opening feedback (audio + text) back to browser
5. Browser sends `audio_chunk` for follow-up conversation
6. Gemini responds conversationally for as long as the user wants

No real-time video frame streaming. No bad rep clip extraction. Just:
video in → Coach speaks → user talks back.

---

## CRITICAL RULES BEFORE YOU START

1. **Never hardcode the API key.** Always use `.env`. If you push it to GitHub,
   Google kills it automatically with no warning.
2. **Add `.env` to `.gitignore` before your first commit.**
3. **Push all code to your personal GitHub before 10pm.**
   The temporary account is deleted the next day.
4. **Use the same model Person 2 validated in AI Studio.**
   Confirm model name with Person 2 before writing it in code.

---

## Phase 1 — Account Setup & API Key (First 30 minutes)
### Everyone is blocked on you. Do this first.

### Step 1 — New Chrome Profile
1. Open Chrome → click profile icon top right → Add
2. Name it "Hackathon"
3. Use this profile for everything today

### Step 2 — Log Into Temporary Account
1. Go to https://aistudio.google.com
2. Sign in with the email and password from the organizers

### Step 3 — Import the Project
1. Go to https://aistudio.google.com/api-keys
2. Click "Import project"
3. Select the pre-created project
4. Click "Import"

### Step 4 — Get Your API Key
1. You should see a Tier 3 API key on the page
2. If not, click "Create API key" top right
3. Copy the key (starts with `AIza...`)
4. **Send to your whole team in the group chat immediately**

### Step 5 — Verify the Key Works
```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Say hello"}]}]}'
```
JSON response with text = good. Move to Phase 2.

If error: reimport the project, try a new key, or ask an organizer.

---

## Phase 2 — Project Setup (Hour 1)

```bash
mkdir server && cd server
npm init -y
npm install express ws @google/genai dotenv cors
```

**Create `.gitignore` FIRST before anything else:**
```bash
echo ".env" >> .gitignore
echo "node_modules" >> .gitignore
cat .gitignore   # verify both lines are there
```

**Create `.env`:**
```
GEMINI_API_KEY=your_key_here
PORT=8080
```

**Update `package.json`** — add `"type": "module"`:
```json
{
  "name": "server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  }
}
```

---

## Phase 3 — WebSocket Server (Hours 1–2)

### File: `server/prompts/squat.js`
```bash
mkdir prompts
```

**Get the exact prompt text from Person 2** — they are testing and refining it
in AI Studio. Use whatever they give you. Do not write your own version.

```javascript
// server/prompts/squat.js
// Get final prompt from Person 2 before the hackathon starts

export const buildSquatPrompt = () => `
PASTE PERSON 2'S FINAL PROMPT HERE
`
```

### File: `server/index.js`

```javascript
import express from 'express'
import { WebSocketServer } from 'ws'
import { GoogleGenAI, Modality } from '@google/genai'
import dotenv from 'dotenv'
import cors from 'cors'
import { buildSquatPrompt } from './prompts/squat.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Health check — Cloud Run needs this
app.get('/', (req, res) => res.send('Coach server running'))

const server = app.listen(process.env.PORT || 8080, () => {
  console.log(`Server running on port ${process.env.PORT || 8080}`)
})

const wss = new WebSocketServer({ server })
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// Confirm this model name with Person 2
const LIVE_MODEL = 'gemini-2.0-flash-live-001'

wss.on('connection', async (browserSocket) => {
  console.log('Browser connected')
  let geminiSession = null

  // Open Gemini Live session with retry
  const openGeminiSession = async () => {
    let attempts = 0
    while (attempts < 3) {
      try {
        return await client.live.connect({
          model: LIVE_MODEL,
          config: {
            system_instruction: buildSquatPrompt(),
            response_modalities: [Modality.AUDIO],
            tools: [{ google_search: {} }]
          },
          callbacks: {
            onmessage: (message) => {
              if (message.serverContent?.modelTurn?.parts) {
                for (const part of message.serverContent.modelTurn.parts) {
                  if (part.inlineData) {
                    // Coach audio → send to browser
                    browserSocket.send(JSON.stringify({
                      type: 'coach_audio',
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType
                    }))
                  }
                  if (part.text) {
                    // Coach text → send to browser for overlay
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
              browserSocket.send(JSON.stringify({
                type: 'error',
                message: error.message
              }))
            },
            onclose: () => console.log('Gemini session closed')
          }
        })
      } catch (e) {
        attempts++
        console.error(`Gemini connect attempt ${attempts} failed:`, e)
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
    throw new Error('Failed to open Gemini session after 3 attempts')
  }

  try {
    geminiSession = await openGeminiSession()
    console.log('Gemini Live session opened')
    browserSocket.send(JSON.stringify({ type: 'session_ready' }))
  } catch (error) {
    console.error('Failed to open Gemini session:', error)
    browserSocket.send(JSON.stringify({
      type: 'error',
      message: 'Failed to connect to Coach. Check your API key.'
    }))
    return
  }

  browserSocket.on('message', async (rawData) => {
    try {
      const message = JSON.parse(rawData)

      // User finished recording their set
      if (message.type === 'recording_complete') {
        console.log('Video received, sending to Gemini...')

        // Send the video to Gemini
        await geminiSession.sendRealtimeInput({
          video: {
            data: message.data,
            mimeType: message.mimeType || 'video/webm'
          }
        })

        // Tell Coach the set is done — triggers opening feedback
        await geminiSession.sendRealtimeInput({
          text: 'SET_COMPLETE: The athlete finished their set. Give your opening message now in English only.'
        })

        browserSocket.send(JSON.stringify({ type: 'review_started' }))
      }

      // User talking back after Coach's opening
      if (message.type === 'audio_chunk') {
        await geminiSession.sendRealtimeInput({
          audio: {
            data: message.data,
            mimeType: 'audio/pcm;rate=16000'
          }
        })
      }

    } catch (error) {
      console.error('Error forwarding to Gemini:', error)
      browserSocket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process set'
      }))
    }
  })

  browserSocket.on('close', async () => {
    console.log('Browser disconnected')
    if (geminiSession) {
      try { await geminiSession.close() }
      catch (e) { console.error('Error closing Gemini session:', e) }
    }
  })
})
```

**Run it:**
```bash
node index.js
# Should print: Server running on port 8080
```

Tell Person 3 the server is at `ws://localhost:8080`.

---

## Phase 4 — Dev Testing with ngrok (Hour 3–4)

```bash
# Mac
brew install ngrok
ngrok config add-authtoken YOUR_NGROK_TOKEN
ngrok http 8080
```

Get the forwarding URL e.g. `https://abc123.ngrok-free.app`

Give Person 3:
```
wss://abc123.ngrok-free.app
```

Keep ngrok running all day — don't restart it or the URL changes.

---

## Phase 5 — Deploy to Cloud Run (Hour 4–5) — MANDATORY

### Step 1 — Create `server/Dockerfile`
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
```

### Step 2 — Enable APIs
```bash
gcloud config set project YOUR_HACKATHON_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

### Step 3 — Deploy
```bash
cd server
gcloud run deploy coach-server \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key_here \
  --port 8080
```

Takes 3–5 minutes. You get a URL like:
`https://coach-server-xxxxxxxx-uc.a.run.app`

**Screenshot this URL** — you need it for the submission video.

### Step 4 — Verify
```bash
curl https://coach-server-xxxxxxxx-uc.a.run.app
# Should return: Coach server running
```

### Step 5 — Give Person 3 the production URL
```
wss://coach-server-xxxxxxxx-uc.a.run.app
```

Run a full end-to-end test on the Cloud Run URL before the demo.

---

## Phase 6 — Before You Leave (End of Day)

```bash
git add .
git commit -m "hackathon: coach server"
git push origin main

# Verify .env is NOT in the push
git status   # .env should not appear
```

Add to root `README.md`:
- Cloud Run URL
- All team member names (portal requirement)
- "Backend uses Google GenAI SDK (@google/genai) on Google Cloud Run"

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| API key not working | Reimport project in AI Studio; create new key; ask organizer |
| 503 model overwhelmed | Retry loop is in `openGeminiSession`; switch model if persistent |
| Coach silent after recording | Check base64 payload arrived; confirm SET_COMPLETE text is sent after video |
| Payload too large | Person 3 caps recording at 15–20 sec; `limit: '50mb'` is set |
| WebSocket refused | Server running? Port 8080? Person 3 using `wss://` not `ws://` for ngrok/Cloud Run? |
| Cloud Run deploy fails | Check project ID matches hackathon project; check billing credits |
| Cloud Run logs | `gcloud run services logs read coach-server --region us-central1` |

---

## Your Checklist

- [ ] Logged into temporary Google account in Hackathon Chrome profile
- [ ] Project imported in AI Studio
- [ ] API key retrieved and sent to team
- [ ] API key verified with curl test
- [ ] `.gitignore` has `.env` and `node_modules` — done BEFORE first commit
- [ ] `.env` has `GEMINI_API_KEY` and `PORT`
- [ ] Server uses `@google/genai` SDK — mandatory
- [ ] `squat.js` prompt from Person 2 pasted in
- [ ] `index.js` running locally on port 8080
- [ ] Gemini Live session opening successfully
- [ ] `recording_complete` → video + SET_COMPLETE → Coach opens working
- [ ] `audio_chunk` follow-up conversation working
- [ ] `tools: [{ google_search: {} }]` enabled
- [ ] ngrok running for dev testing
- [ ] **Cloud Run deployed** — `*.run.app` URL documented
- [ ] Cloud Run health check passing
- [ ] Person 3 confirmed full flow on Cloud Run URL
- [ ] Cloud Run URL screenshotted for submission video
- [ ] Code pushed to team GitHub — `.env` NOT included
- [ ] README has team member names + Cloud Run URL