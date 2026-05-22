# Person 1 — Infrastructure & Server Setup
## Bodyweight AI Coach — Hackathon Day Guide

---

## Your Role
You are responsible for:
- Setting up the temporary Google account and getting the API key
- Building the WebSocket server that connects the browser to Gemini Live
- Exposing the server to the internet so the demo works
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
- Torso leaning too far forward
- Cues: "Chest up"
         "Stay tall through your torso"

Heels rising:
- Weight shifting to toes
- Cues: "Weight in your heels"
         "Drive your heels into the floor"
         "Sit back more"

Not hitting depth:
- Hips not reaching parallel
- Cues: "Go deeper — hips below parallel"
         "Sit all the way down"

Butt wink:
- Lower back rounding at the bottom
- Cues: "Brace your core at the bottom"
         "Keep your lower back neutral"

Good squat:
- Feet shoulder width, toes slightly out
- Knees tracking over toes
- Chest tall
- Hip crease below top of knee at bottom
- Weight through whole foot
- Core braced throughout

You are watching them RIGHT NOW. React to what you see immediately.
Keep it short. They are mid-movement.
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
app.use(express.json())

// Health check
app.get('/', (req, res) => res.send('Coach server running'))

const server = app.listen(process.env.PORT || 8080, () => {
  console.log(`Server running on port ${process.env.PORT || 8080}`)
})

const wss = new WebSocketServer({ server })

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

wss.on('connection', async (browserSocket) => {
  console.log('Browser connected')

  let geminiSession = null

  try {
    // Open Gemini Live session
    geminiSession = await client.live.connect({
      model: 'gemini-2.0-flash-live-001',
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
                // Send audio back to browser
                browserSocket.send(JSON.stringify({
                  type: 'coach_audio',
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType
                }))
              }
              if (part.text) {
                // Send text cue for overlay
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
        onclose: () => {
          console.log('Gemini session closed')
        }
      }
    })

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

  // Receive data from browser and forward to Gemini
  browserSocket.on('message', async (rawData) => {
    try {
      const message = JSON.parse(rawData)

      if (message.type === 'video_frame') {
        await geminiSession.sendRealtimeInput({
          video: {
            data: message.data,
            mimeType: 'image/jpeg'
          }
        })
      }

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

## Phase 4 — Expose Server to Internet with ngrok (Hour 4)

Cloud Run is not needed. Use ngrok to expose your local server so the
demo works from any browser in the room.

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

## Phase 5 — Before You Leave (End of Day)

### IMPORTANT — Do This Before 9pm

**Push your code to your personal GitHub:**
```bash
# From the server folder
git init
git add .
git commit -m "hackathon: coach server"
git remote add origin https://github.com/YOUR_USERNAME/coach-server
git push -u origin main
```

Double check `.env` is NOT in the push:
```bash
git status
# .env should not appear in the list
```

The temporary account is deleted tomorrow. Your code is not backed up
anywhere else. Do not forget this.

---

## Troubleshooting

**API key not working:**
- Make sure you imported the project in AI Studio (Phase 1, Step 3)
- Try creating a new key at aistudio.google.com/api-keys
- Ask an organizer — they can reset accounts

**503 / model overwhelmed errors:**
- The model is under heavy load from other hackathon teams
- Switch to a different model version
- Add a retry with a 2 second delay:
```javascript
// Wrap your gemini call in a retry
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let attempts = 0
while (attempts < 3) {
  try {
    geminiSession = await client.live.connect(...)
    break
  } catch (e) {
    attempts++
    await sleep(2000)
  }
}
```

**WebSocket connection refused:**
- Make sure `node index.js` is running in a terminal
- Make sure ngrok is also running in a separate terminal
- Check Person 3 is using `wss://` not `ws://` for the ngrok URL

**Gemini session not opening:**
- Check the model name is correct
- Check GEMINI_API_KEY is in your .env file
- Check .env file is in the server folder not the root

**ngrok URL keeps changing:**
- Free ngrok gives a new URL every restart
- Keep ngrok running the whole day — don't restart it
- If it restarts, give Person 3 the new URL immediately

---

## Your Checklist

- [ ] Logged into temporary Google account in new Chrome profile
- [ ] Project imported in AI Studio
- [ ] API key retrieved and sent to team
- [ ] API key verified with curl test
- [ ] .gitignore created with .env listed BEFORE first commit
- [ ] .env file created with API key
- [ ] Server folder set up with npm packages installed
- [ ] index.js and prompts/squat.js created
- [ ] Server running locally on port 8080
- [ ] Gemini Live session opening successfully
- [ ] ngrok installed and running
- [ ] ngrok WebSocket URL sent to Person 3
- [ ] Person 3 confirmed connection working end to end
- [ ] Code pushed to personal GitHub before 9pm
- [ ] .env confirmed NOT in the GitHub push