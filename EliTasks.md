# Person 1 — Infrastructure & Server Setup
## Bodyweight AI Coach — Hackathon Day Guide

---

## Hackathon requirements (mandatory)

| Requirement | Your responsibility |
|-------------|---------------------|
| **Google GenAI SDK** | Use `@google/genai` in `server/index.js` (already in this guide) |
| **Hosted on Google Cloud** | Deploy backend to **Cloud Run** — judges need proof of Cloud deployment |
| **Hackathon account / credits** | Temp Google account from organizers; import project; API key to team |
| **API key security** | `.env` only — never commit to GitHub |

**Dev vs demo:** Use **ngrok** (Phase 4) for fast local testing. Use **Cloud Run** (Phase 5) for judging and submission video — **both are required**.

Portal: [goo.gle/CHM-hack-26](https://goo.gle/CHM-hack-26) · Account: [goo.gle/hackathon-account](https://goo.gle/hackathon-account)

---

## Team pivot (read first)

**We are NOT streaming video frames during the set.** That was too slow for real-time cues.

**New flow:**
1. Browser **records** one set (video blob)
2. Browser sends `recording_complete` when the user taps Stop
3. Server sends the video to Gemini → Coach **opens** with feedback or praise (audio + text)
4. Browser sends `audio_chunk` for **follow-up** conversation

You own API key, WebSocket server, Gemini config, **Cloud Run deploy**, ngrok (dev), and `squat.js`.

---

## Your Role
You are responsible for:
- Setting up the temporary Google account and getting the API key
- Building the WebSocket server that connects the browser to Gemini via **Google GenAI SDK**
- Handling **recorded video** after each set (not continuous frames)
- **Deploying the server to Google Cloud Run** (mandatory for hackathon judging)
- Using **ngrok** only for local/dev testing before Cloud Run is live
- Making sure the API key never gets pushed to GitHub

Everyone on the team is blocked until you have the API key.
Start immediately and do not stop until the key is in everyone's hands.

---

## CRITICAL RULES BEFORE YOU START

**1. Never hardcode the API key in your code.**
Always use a `.env` file. If you push the key to GitHub, Google will
automatically kill it and nothing will work. You won't get a warning.

**2. Make sure `.env` is in your `.gitignore` before your first commit.**

**3. Push all your code to your own personal GitHub before 10pm.**
The temporary account is deleted the next day. Your code is not.

**4. Align the Live model with Person 2's testing** (e.g. `gemini-2.0-flash-live-001`
or `gemini-3.1-flash-live-preview` — same model Person 2 validated in AI Studio).

---

## Phase 1 — Account Setup & API Key (First 30 minutes)
### Everyone is blocked on you. Do this first, do it fast.

### Step 1 — Set Up a New Chrome Profile
1. Open Chrome
2. Click your profile icon in the top right
3. Click "Add" to create a new profile
4. Name it "Hackathon"
5. Use this profile for everything today — keeps it separate from your
   personal Google account

### Step 2 — Log Into the Temporary Account
1. Open https://aistudio.google.com
2. Sign in with the email and password the organizers gave you at check-in
3. You should land on the AI Studio home screen

### Step 3 — Import the Project
1. Go to https://aistudio.google.com/api-keys
2. Click "Import project"
3. Select the project that was pre-created for you
4. Click "Import"

### Step 4 — Get Your API Key
1. You should now see a Tier 3 API key on the page
2. If you don't see one, click "Create API key" in the top right
3. Copy the key — it starts with `AIza...`
4. **Send this key to your whole team in your group chat RIGHT NOW**
5. Do not close this tab yet

### Step 5 — Verify the Key Works
Open your terminal and run:

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Say hello"}]}]}'
```

If you get a JSON response with text in it — you're good. Move to Phase 2.

If you get an error:
- Make sure you imported the project correctly (Step 3)
- Try creating a new API key (Step 4)
- Ask an organizer — they can fix account issues fast

---

## Phase 2 — Project Setup (Hour 1)

### Step 1 — Create the Server Folder

```bash
mkdir server && cd server
npm init -y
npm install express ws @google/genai dotenv cors
```

### Step 2 — Create `.gitignore` BEFORE ANYTHING ELSE

```bash
echo ".env" >> .gitignore
echo "node_modules" >> .gitignore
```

Verify it's there:
```bash
cat .gitignore
# Should show:
# .env
# node_modules
```

**Do not skip this step.**

### Step 3 — Create `.env` File

```bash
touch .env
```

Open it and add:
```
GEMINI_API_KEY=your_key_here
PORT=8080
```

Replace `your_key_here` with the actual key from Phase 1.

### Step 4 — Update `package.json`
Open `package.json` and add `"type": "module"`:

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

## Phase 3 — WebSocket Server (Hours 1-2)

### File: `server/prompts/squat.js`

Create the folder first:
```bash
mkdir prompts
```

Use Person 2's **canonical post-set prompt** (keep in sync with DiegoTasks.md):

```javascript
export const buildSquatPrompt = () => `
LANGUAGE (CRITICAL):
- You MUST speak and write only in English. Never use any other language.

You are Coach, an expert calisthenics coach. The athlete records ONE set of air squats,
then stops recording. You receive their recorded video of that set.

MODE — POST-SET REVIEW (not live mid-rep):
- Do NOT coach rep-by-rep during the recording. Analyze the full set when it ends.
- When the recording ends (or you receive SET_COMPLETE), YOU speak first.
- Open with ONE short message (2–3 sentences max) that either:
  (A) names the 1–2 most important faults you saw and one cue each, OR
  (B) gives genuine positive affirmation if form was good overall.
- Pick A or B from what you actually saw — do not be generic.
- After your opening, answer follow-up questions briefly. Stay conversational but expert.

OPENING EXAMPLES (adapt to what you saw):
- Feedback: "On that set your knees caved on reps 3 and 5. Push your knees out over your toes. Want to fix stance or depth next?"
- Praise: "Strong set — good depth and control. Your chest stayed tall. Keep that tempo."

RULES:
- Maximum 2 faults in the opening. Prioritize knee cave, then depth, then chest forward.
- Cues must be short (8 words or fewer when possible). Name body parts and actions.
- If form was mixed, lead with the biggest issue; add one positive only if earned.
- Do not list every rep. Do not lecture. Only describe what is visible in the video.
- Do not repeat the same cue twice in a row in follow-up.

WHAT TO LOOK FOR IN THE SET:
Knee cave, chest forward, heels rising, shallow depth, butt wink,
stance too narrow/wide, rushing descent, no lockout at top, arms not helping balance.

For "why" questions, answer briefly with real coaching concepts.
You are reviewing a completed set. Open the conversation in English.
`
```

### File: `server/index.js`

**Pivot:** No `video_frame` streaming. On `recording_complete`, send the full
video to Gemini Live, then a text trigger so Coach opens the conversation.

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

app.get('/', (req, res) => res.send('Coach server running'))

const server = app.listen(process.env.PORT || 8080, () => {
  console.log(`Server running on port ${process.env.PORT || 8080}`)
})

const wss = new WebSocketServer({ server })
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// Match model Person 2 tested in AI Studio
const LIVE_MODEL = 'gemini-2.0-flash-live-001'

wss.on('connection', async (browserSocket) => {
  console.log('Browser connected')

  let geminiSession = null

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
                    browserSocket.send(JSON.stringify({
                      type: 'coach_audio',
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType
                    }))
                  }
                  if (part.text) {
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
    console.log('Gemini Live session opened successfully')
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

      // Person 3 sends recorded set when user taps Stop
      if (message.type === 'recording_complete') {
        console.log('Set recording received, sending to Gemini...')

        await geminiSession.sendRealtimeInput({
          video: {
            data: message.data,
            mimeType: message.mimeType || 'video/webm'
          }
        })

        // Trigger Coach to open the conversation (feedback or praise)
        await geminiSession.sendRealtimeInput({
          text: 'SET_COMPLETE: The athlete finished their set. Speak your opening message now in English only.'
        })

        browserSocket.send(JSON.stringify({ type: 'review_started' }))
      }

      // Follow-up conversation after the opening
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
        message: 'Failed to analyze set'
      }))
    }
  })

  browserSocket.on('close', async () => {
    console.log('Browser disconnected')
    if (geminiSession) {
      try {
        await geminiSession.close()
      } catch (e) {
        console.error('Error closing Gemini session:', e)
      }
    }
  })
})
```

### Run It

```bash
node index.js
# Should print: Server running on port 8080
```

Tell Person 2 and Person 3 the server is running.

---

## Phase 4 — Dev testing with ngrok (Hour 3–4)

**ngrok is for development only.** The hackathon requires **Google Cloud** hosting
for submission — complete **Phase 5 (Cloud Run)** before judges or the demo video.

Use ngrok to expose your **local** server so Person 3 can test before Cloud Run is ready.

### Step 1 — Install ngrok

```bash
# Mac
brew install ngrok

# Or download from https://ngrok.com/download
```

### Step 2 — Sign Up for Free ngrok Account
1. Go to https://ngrok.com
2. Create a free account
3. Copy your auth token from the dashboard
4. Run:
```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

### Step 3 — Expose Your Server

```bash
# In a new terminal tab (keep the server running in the other tab)
ngrok http 8080
```

ngrok will print something like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8080
```

Copy the `https://abc123.ngrok-free.app` URL.

### Step 4 — Give Person 3 the WebSocket URL
The WebSocket URL is the same but with `wss://` instead of `https://`:
```
wss://abc123.ngrok-free.app
```

Tell Person 3 to update their `.env`:
```
VITE_WS_URL=wss://abc123.ngrok-free.app
```

### Step 5 — Verify It Works
Open the ngrok URL in a browser:
```
https://abc123.ngrok-free.app
```
Should show: `Coach server running`

---

## Phase 5 — Deploy to Google Cloud Run (Hour 4–5) — MANDATORY

Judging requires **Google Cloud deployment** and visual proof in the demo video.
Deploy the **server** to Cloud Run (Person 3 can keep running the Vite frontend locally
pointing at Cloud Run, or deploy frontend to Firebase Hosting later).

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

### Step 2 — Enable Cloud Run API (once per project)

```bash
gcloud config set project YOUR_HACKATHON_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

### Step 3 — Deploy from the server folder

Use the hackathon Google Cloud project (from AI Studio import / organizers):

```bash
cd server
gcloud run deploy coach-server \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key_here \
  --port 8080
```

Wait 3–5 minutes. You will get a URL like:
`https://coach-server-xxxxxxxx-uc.a.run.app`

**Screenshot this URL** for the submission video (judges: “Proof of Cloud deployment”).

### Step 4 — Give Person 3 the production WebSocket URL

```
wss://coach-server-xxxxxxxx-uc.a.run.app
```

Tell Person 3 to set in `client/.env`:
```
VITE_WS_URL=wss://coach-server-xxxxxxxx-uc.a.run.app
```

### Step 5 — Verify Cloud deployment

```bash
curl https://coach-server-xxxxxxxx-uc.a.run.app
# Should return: Coach server running
```

Run one full test: Record → Stop → Coach opening, using the **Cloud Run** URL.

### Step 6 — Document in repo README

Add to the root `README.md`:
- Cloud Run service URL
- “Backend uses Google GenAI SDK (`@google/genai`) on Google Cloud Run”

---

## Phase 6 — Before You Leave (End of Day)

### IMPORTANT — Do This Before 9pm

**Push code to the team GitHub** (e.g. `https://github.com/draygada/StackDaddy`):

```bash
git add .
git commit -m "hackathon: coach server on Cloud Run"
git push origin main
```

Double check `.env` is NOT in the push:
```bash
git status
# .env should not appear in the list
```

The temporary hackathon Google account may be deleted tomorrow. Cloud Run can keep
running until credits expire — confirm billing is on the hackathon project.

---

## Troubleshooting

**API key not working:**
- Make sure you imported the project in AI Studio (Phase 1, Step 3)
- Try creating a new key at aistudio.google.com/api-keys
- Ask an organizer — they can reset accounts

**503 / model overwhelmed errors:**
- Switch `LIVE_MODEL` to the model Person 2 confirmed works
- Retry loop is already in `openGeminiSession`

**Coach silent after recording_complete:**
- Log that video payload arrived (check base64 length)
- Confirm `SET_COMPLETE` text is sent after video
- Try `mimeType: 'video/webm'` — match what Person 3's MediaRecorder produces

**Payload too large:**
- Person 3 should cap recording length (~15–20 sec) or lower bitrate
- `express.json({ limit: '50mb' })` is set above

**WebSocket connection refused:**
- Make sure `node index.js` is running in a terminal
- Make sure ngrok is also running in a separate terminal
- Check Person 3 is using `wss://` not `ws://` for the ngrok URL

**Gemini session not opening:**
- Check the model name matches Person 2's Studio test
- Check GEMINI_API_KEY is in your .env file
- Check .env file is in the server folder not the root

**ngrok URL keeps changing:**
- Free ngrok gives a new URL every restart
- For judging, use **Cloud Run URL** — do not rely on ngrok for finals

**Cloud Run deploy fails:**
- Confirm `gcloud` project matches hackathon project
- Confirm billing / credits from [goo.gle/CHM-hack-26](https://goo.gle/CHM-hack-26)
- Check Cloud Run logs: `gcloud run services logs read coach-server --region us-central1`

---

## Your Checklist

- [ ] Logged into temporary Google account in new Chrome profile
- [ ] Project imported in AI Studio
- [ ] API key retrieved and sent to team
- [ ] API key verified with curl test
- [ ] .gitignore created with .env listed BEFORE first commit
- [ ] .env file created with API key
- [ ] Server uses **@google/genai** (GenAI SDK) — mandatory
- [ ] Post-set `squat.js` and updated `index.js` created
- [ ] `recording_complete` handler working (video + SET_COMPLETE trigger)
- [ ] `tools: [{ google_search: {} }]` enabled for grounding
- [ ] Server running locally on port 8080
- [ ] Gemini Live session opening successfully
- [ ] ngrok used for dev testing (optional but helpful)
- [ ] **Cloud Run deployed** — `*.run.app` URL documented
- [ ] Cloud Run health check works (`curl` → `Coach server running`)
- [ ] Person 3 confirmed record → stop → Coach opening on **Cloud Run** URL
- [ ] Cloud Run URL shared for **demo video** / judging
- [ ] Team repo pushed; `.env` NOT in GitHub
- [ ] Root README lists team members + Cloud Run URL
