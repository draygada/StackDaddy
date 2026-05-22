# Person 3 — Frontend
## Bodyweight AI Coach — Hackathon Day Guide

---

## Your Role
You are responsible for:
- Building the React frontend
- Capturing webcam video and microphone audio in the browser
- Connecting to Person 1's WebSocket server
- Playing Coach's audio responses through the speakers
- Displaying Coach's cues as a text overlay on the camera feed
- Making the UI look clean enough to demo

You can start building the UI immediately while Person 1 sets up
the server. Connect to the real server once Person 1 gives you
the WebSocket URL.

---

## Phase 1 — Project Setup (Hour 1)

### Step 1 — Create the React App

```bash
npm create vite@latest client -- --template react
cd client
npm install
npm install socket.io-client
```

### Step 2 — Folder Structure

```
client/src/
  pages/
    Home.jsx
    Session.jsx
  hooks/
    useCoachSession.js
  components/
    CueOverlay.jsx
  App.jsx
  App.css
  index.css
```

### Step 3 — App.jsx (routing)

```jsx
import { useState } from 'react'
import Home from './pages/Home'
import Session from './pages/Session'

export default function App() {
  const [page, setPage] = useState('home')
  const [exercise, setExercise] = useState(null)

  const startSession = (ex) => {
    setExercise(ex)
    setPage('session')
  }

  const endSession = () => {
    setExercise(null)
    setPage('home')
  }

  return (
    <div>
      {page === 'home' && <Home onStart={startSession} />}
      {page === 'session' && <Session exercise={exercise} onEnd={endSession} />}
    </div>
  )
}
```

---

## Phase 2 — Home Page (Hour 1)

Simple and fast. Two buttons. Get out of the way.

### File: `client/src/pages/Home.jsx`

```jsx
import './Home.css'

export default function Home({ onStart }) {
  return (
    <div className="home">
      <div className="logo">
        <h1>Coach</h1>
        <p>AI-powered real-time form coaching</p>
      </div>

      <div className="exercise-grid">
        <button
          className="exercise-card"
          onClick={() => onStart('squat')}
        >
          <span className="exercise-icon">🏋️</span>
          <span className="exercise-name">Air Squats</span>
          <span className="exercise-desc">Real-time form coaching</span>
        </button>

        <button
          className="exercise-card disabled"
          disabled
        >
          <span className="exercise-icon">🤸</span>
          <span className="exercise-name">Handstands</span>
          <span className="exercise-desc">Coming soon</span>
        </button>
      </div>
    </div>
  )
}
```

### File: `client/src/pages/Home.css`

```css
.home {
  min-height: 100vh;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  padding: 40px;
}

.logo h1 {
  font-size: 48px;
  font-weight: 800;
  color: #ffffff;
  text-align: center;
  letter-spacing: -2px;
  margin: 0;
}

.logo p {
  font-size: 16px;
  color: #666;
  text-align: center;
  margin: 8px 0 0;
}

.exercise-grid {
  display: flex;
  gap: 24px;
}

.exercise-card {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 16px;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
  width: 200px;
}

.exercise-card:hover:not(.disabled) {
  background: #222;
  border-color: #3b82f6;
  transform: translateY(-2px);
}

.exercise-card.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.exercise-icon {
  font-size: 40px;
}

.exercise-name {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.exercise-desc {
  font-size: 13px;
  color: #666;
}
```

---

## Phase 3 — The Coach Session Hook (Hours 2-3)
### This is the hardest and most important part of your work.

This hook handles everything:
- Opening the WebSocket connection to the server
- Capturing webcam video
- Capturing microphone audio
- Sending video frames every 500ms
- Sending audio continuously
- Receiving Coach's audio and playing it
- Receiving Coach's text cue and displaying it

### File: `client/src/hooks/useCoachSession.js`

```javascript
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'

export function useCoachSession(exercise) {
  const [status, setStatus] = useState('connecting') // connecting | ready | error
  const [currentCue, setCurrentCue] = useState('')
  const [cueVisible, setCueVisible] = useState(false)

  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const frameIntervalRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)

  // Show cue overlay for 4 seconds then fade
  const showCue = useCallback((text) => {
    setCurrentCue(text)
    setCueVisible(true)
    setTimeout(() => setCueVisible(false), 4000)
  }, [])

  // Play audio from Coach
  const playAudio = useCallback(async (base64Audio, mimeType) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      const audioData = atob(base64Audio)
      const arrayBuffer = new ArrayBuffer(audioData.length)
      const view = new Uint8Array(arrayBuffer)
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i)
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      source.start()
    } catch (error) {
      console.error('Audio playback error:', error)
    }
  }, [])

  // Capture a video frame and send to server
  const sendVideoFrame = useCallback(() => {
    if (!videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0, 640, 480)

    // Convert to base64 JPEG
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]

    wsRef.current.send(JSON.stringify({
      type: 'video_frame',
      data: base64
    }))
  }, [])

  // Start capturing microphone audio
  const startAudioCapture = useCallback(async (stream) => {
    const audioContext = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = audioContext

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

      // Convert float32 audio to int16 PCM
      const inputData = e.inputBuffer.getChannelData(0)
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
      }

      // Convert to base64
      const buffer = pcm16.buffer
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)

      wsRef.current.send(JSON.stringify({
        type: 'audio_chunk',
        data: base64
      }))
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }, [])

  useEffect(() => {
    let mounted = true

    const startSession = async () => {
      try {
        // Get camera + mic access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true
        })

        if (!mounted) return
        streamRef.current = stream

        // Connect WebSocket
        const ws = new WebSocket(`${WS_URL}?exercise=${exercise}`)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('WebSocket connected')
        }

        ws.onmessage = async (event) => {
          const message = JSON.parse(event.data)

          if (message.type === 'session_ready') {
            setStatus('ready')
            // Start sending video frames
            frameIntervalRef.current = setInterval(sendVideoFrame, 500)
            // Start sending audio
            await startAudioCapture(stream)
          }

          if (message.type === 'coach_audio') {
            await playAudio(message.data, message.mimeType)
          }

          if (message.type === 'coach_text') {
            showCue(message.text)
          }

          if (message.type === 'error') {
            setStatus('error')
            console.error('Server error:', message.message)
          }
        }

        ws.onerror = () => setStatus('error')
        ws.onclose = () => console.log('WebSocket closed')

      } catch (error) {
        console.error('Session start error:', error)
        setStatus('error')
      }
    }

    startSession()

    return () => {
      mounted = false
      // Cleanup everything
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current)
      if (wsRef.current) wsRef.current.close()
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (processorRef.current) processorRef.current.disconnect()
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [exercise])

  return {
    status,
    currentCue,
    cueVisible,
    videoRef
  }
}
```

---

## Phase 4 — Session Page (Hour 3)

### File: `client/src/pages/Session.jsx`

```jsx
import { useEffect } from 'react'
import { useCoachSession } from '../hooks/useCoachSession'
import CueOverlay from '../components/CueOverlay'
import './Session.css'

export default function Session({ exercise, onEnd }) {
  const { status, currentCue, cueVisible, videoRef } = useCoachSession(exercise)

  // Attach camera stream to video element
  useEffect(() => {
    if (videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        videoRef.current.srcObject = stream
      })
    }
  }, [])

  return (
    <div className="session">
      {/* Camera feed */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="camera-feed"
      />

      {/* Status bar */}
      <div className="session-bar">
        <div className="session-info">
          {status === 'connecting' && (
            <span className="status connecting">Connecting to Coach...</span>
          )}
          {status === 'ready' && (
            <>
              <span className="live-dot" />
              <span className="status live">LIVE</span>
              <span className="exercise-label">Air Squats</span>
            </>
          )}
          {status === 'error' && (
            <span className="status error">Connection error — check server</span>
          )}
        </div>

        <button className="end-btn" onClick={onEnd}>
          End Session
        </button>
      </div>

      {/* Coach cue overlay */}
      <CueOverlay text={currentCue} visible={cueVisible} />
    </div>
  )
}
```

### File: `client/src/pages/Session.css`

```css
.session {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #000;
  overflow: hidden;
}

.camera-feed {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1); /* mirror the feed */
}

.session-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);
}

.session-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.status {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.status.live { color: #ef4444; }
.status.connecting { color: #f59e0b; }
.status.error { color: #ef4444; }

.exercise-label {
  font-size: 14px;
  color: rgba(255,255,255,0.7);
  font-weight: 500;
}

.end-btn {
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 0.2s;
}

.end-btn:hover {
  background: rgba(255,255,255,0.25);
}
```

### File: `client/src/components/CueOverlay.jsx`

```jsx
import './CueOverlay.css'

export default function CueOverlay({ text, visible }) {
  if (!text) return null

  return (
    <div className={`cue-overlay ${visible ? 'visible' : 'hidden'}`}>
      <p className="cue-text">{text}</p>
    </div>
  )
}
```

### File: `client/src/components/CueOverlay.css`

```css
.cue-overlay {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  padding: 14px 28px;
  max-width: 600px;
  text-align: center;
  transition: opacity 0.3s ease;
  border: 1px solid rgba(255,255,255,0.1);
}

.cue-overlay.visible { opacity: 1; }
.cue-overlay.hidden { opacity: 0; }

.cue-text {
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
  line-height: 1.4;
}
```

---

## Phase 5 — Environment Config & Build (Hour 4-5)

### Step 1 — Create `.env` file in client folder

```
VITE_WS_URL=ws://localhost:8080
```

When Person 1 deploys to Cloud Run, update this to:
```
VITE_WS_URL=wss://coach-server-xxxxxxxx-uc.a.run.app
```

Note: `wss://` not `ws://` for production (secure WebSocket).

### Step 2 — Update vite.config.js

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
})
```

### Step 3 — Run Locally

```bash
npm run dev
```

Open http://localhost:5173 — you should see the home screen.

### Step 4 — Build for Production (when ready to deploy)

```bash
npm run build
```

This creates a `dist/` folder. Person 1 can serve this from Cloud Run
or you can deploy to Firebase Hosting (easier for static frontend).

### Step 5 — Deploy Frontend to Firebase Hosting (optional)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select your project: coach-hackathon
# Public directory: dist
# Single page app: yes
firebase deploy
```

This gives you a URL like `https://coach-hackathon.web.app`

---

## Troubleshooting

**Camera not showing:**
- Check browser permissions — click the camera icon in the address bar
- Make sure video element has `autoPlay` and `playsInline` attributes
- Try in Chrome — Safari sometimes has issues with getUserMedia

**WebSocket not connecting:**
- Make sure Person 1's server is running
- Check the WS_URL in your .env file
- Open browser DevTools → Network tab → WS to see connection status

**Audio not playing:**
- Browser requires a user gesture before playing audio
- Make sure the user clicked something before audio starts
- Check AudioContext is created after a click event

**Video frames not sending:**
- Check the canvas drawImage is getting a valid video element
- Make sure videoRef is attached to the video element correctly
- Log the base64 string length — should be several thousand chars

**Coach not responding:**
- Check Person 1's server logs for errors
- Verify the WebSocket messages are being received server-side
- Make sure session_ready message was received before sending frames

---

## Your Checklist

- [ ] React app created and running locally
- [ ] Home screen showing two exercise cards
- [ ] Camera permission working, feed visible on screen
- [ ] WebSocket connecting to Person 1's server
- [ ] Video frames sending every 500ms (check network tab)
- [ ] Audio chunks sending continuously
- [ ] session_ready message received from server
- [ ] Coach audio playing through speakers
- [ ] Cue text appearing as overlay
- [ ] Cue fades after 4 seconds
- [ ] End Session button works and returns to home
- [ ] Updated WS_URL to production Cloud Run URL
- [ ] Demo flow tested end to end