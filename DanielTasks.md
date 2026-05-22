# Person 3 — Frontend
## Bodyweight AI Coach — Hackathon Day Guide

---

## Team pivot (read first)

**We are NOT streaming live video frames during the set.**

**New flow:**
1. User sees camera preview and taps **Record**
2. User does one set of squats, taps **Stop**
3. UI shows **Analyzing...** while the video uploads
4. Coach **speaks first** (feedback or praise) — play audio + show text
5. User can **talk back** for follow-up (mic → `audio_chunk`)

You own record/stop UI, WebSocket messages, audio playback, and cue overlay.

---

## Your Role
You are responsible for:
- Building the React frontend
- Capturing webcam video with **MediaRecorder** (record one set, then stop)
- Connecting to Person 1's WebSocket server
- Sending `recording_complete` when the user stops
- Playing Coach's opening audio and showing text overlay
- Sending microphone audio for follow-up conversation after the opening
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
```

Use the browser **WebSocket API** (no socket.io needed).

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
        <p>Record a set. Get feedback.</p>
      </div>

      <div className="exercise-grid">
        <button
          className="exercise-card"
          onClick={() => onStart('squat')}
        >
          <span className="exercise-icon">🏋️</span>
          <span className="exercise-name">Air Squats</span>
          <span className="exercise-desc">Record a set, then hear Coach</span>
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
### Record a set → send video → hear Coach open → then allow follow-up mic.

### WebSocket message contract

| Direction | type | When |
|-----------|------|------|
| Server → client | `session_ready` | Gemini connected; show Record button |
| Client → server | `recording_complete` | User tapped Stop; `{ data, mimeType }` base64 webm |
| Server → client | `review_started` | Server got video (optional; show Analyzing) |
| Server → client | `coach_audio` | Coach speaking |
| Server → client | `coach_text` | Overlay text |
| Client → server | `audio_chunk` | After opening, user follow-up mic |
| Server → client | `error` | Something failed |

### File: `client/src/hooks/useCoachSession.js`

```javascript
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'

// connecting | ready | recording | analyzing | conversing | error
export function useCoachSession(exercise) {
  const [status, setStatus] = useState('connecting')
  const [currentCue, setCurrentCue] = useState('')
  const [cueVisible, setCueVisible] = useState(false)

  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const followUpMicStartedRef = useRef(false)

  const showCue = useCallback((text) => {
    setCurrentCue(text)
    setCueVisible(true)
    setTimeout(() => setCueVisible(false), 8000)
  }, [])

  const playAudio = useCallback(async (base64Audio) => {
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
      setStatus('conversing')
    } catch (error) {
      console.error('Audio playback error:', error)
    }
  }, [])

  const startFollowUpMic = useCallback(async (stream) => {
    if (followUpMicStartedRef.current) return
    followUpMicStartedRef.current = true

    const audioContext = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = audioContext
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      if (status !== 'conversing' && status !== 'analyzing') return

      const inputData = e.inputBuffer.getChannelData(0)
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
      }
      const bytes = new Uint8Array(pcm16.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])

      wsRef.current.send(JSON.stringify({
        type: 'audio_chunk',
        data: btoa(binary)
      }))
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }, [status])

  const startRecording = useCallback(() => {
    if (!streamRef.current || status !== 'ready') return

    chunksRef.current = []
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm'
    })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      setStatus('analyzing')
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1]
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'recording_complete',
            data: base64,
            mimeType: blob.type || 'video/webm'
          }))
        }
      }
      reader.readAsDataURL(blob)
    }

    recorder.start()
    setStatus('recording')
  }, [status])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const startSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true
        })

        if (!mounted) return
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        const ws = new WebSocket(`${WS_URL}?exercise=${exercise}`)
        wsRef.current = ws

        ws.onmessage = async (event) => {
          const message = JSON.parse(event.data)

          if (message.type === 'session_ready') {
            setStatus('ready')
          }

          if (message.type === 'review_started') {
            setStatus('analyzing')
          }

          if (message.type === 'coach_audio') {
            await playAudio(message.data)
            await startFollowUpMic(streamRef.current)
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
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      if (wsRef.current) wsRef.current.close()
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (processorRef.current) processorRef.current.disconnect()
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [exercise, playAudio, showCue, startFollowUpMic])

  return {
    status,
    currentCue,
    cueVisible,
    videoRef,
    startRecording,
    stopRecording
  }
}
```

---

## Phase 4 — Session Page (Hour 3)

### File: `client/src/pages/Session.jsx`

```jsx
import { useCoachSession } from '../hooks/useCoachSession'
import CueOverlay from '../components/CueOverlay'
import './Session.css'

export default function Session({ exercise, onEnd }) {
  const {
    status,
    currentCue,
    cueVisible,
    videoRef,
    startRecording,
    stopRecording
  } = useCoachSession(exercise)

  const statusLabel = {
    connecting: 'Connecting to Coach...',
    ready: 'Ready — tap Record',
    recording: 'Recording your set',
    analyzing: 'Analyzing your set...',
    conversing: 'Coach is with you',
    error: 'Connection error — check server'
  }[status]

  return (
    <div className="session">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="camera-feed"
      />

      <div className="session-bar">
        <div className="session-info">
          {status === 'recording' && <span className="live-dot" />}
          <span className={`status ${status}`}>{statusLabel}</span>
          {status !== 'connecting' && status !== 'error' && (
            <span className="exercise-label">Air Squats</span>
          )}
        </div>

        <button className="end-btn" onClick={onEnd}>
          End Session
        </button>
      </div>

      <div className="record-controls">
        {status === 'ready' && (
          <button className="record-btn" onClick={startRecording}>
            Record Set
          </button>
        )}
        {status === 'recording' && (
          <button className="stop-btn" onClick={stopRecording}>
            Stop
          </button>
        )}
        {(status === 'analyzing' || status === 'conversing') && (
          <p className="hint">Listen to Coach — you can ask a follow-up out loud</p>
        )}
      </div>

      <CueOverlay text={currentCue} visible={cueVisible} />
    </div>
  )
}
```

### File: `client/src/pages/Session.css`

Add to the existing Session.css:

```css
.status.recording { color: #ef4444; }
.status.analyzing { color: #f59e0b; }
.status.conversing { color: #22c55e; }
.status.ready { color: #94a3b8; }

.record-controls {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.record-btn,
.stop-btn {
  padding: 16px 40px;
  border-radius: 999px;
  font-size: 18px;
  font-weight: 700;
  border: none;
  cursor: pointer;
}

.record-btn {
  background: #ef4444;
  color: white;
}

.stop-btn {
  background: #ffffff;
  color: #0a0a0a;
}

.hint {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  text-align: center;
  margin: 0;
}
```

Keep the rest of Session.css from the original guide (`.session`, `.camera-feed`, `.session-bar`, etc.).

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
  bottom: 140px;
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
  font-size: 20px;
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

When Person 1 exposes ngrok, update to:
```
VITE_WS_URL=wss://abc123.ngrok-free.app
```

Note: `wss://` not `ws://` for ngrok.

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

### Step 4 — Demo flow test (with Person 1's server running)

1. Start squat session → wait for **Ready**
2. **Record Set** → do 5 squats (~15 sec max to keep file small)
3. **Stop** → see **Analyzing...**
4. Coach audio + text overlay (opening feedback or praise)
5. Ask out loud: "Why do my knees cave?" — hear follow-up

### Step 5 — Build for Production (optional)

```bash
npm run build
```

---

## Troubleshooting

**Camera not showing:**
- Check browser permissions
- `videoRef` must get `srcObject` from the same stream as MediaRecorder
- Use Chrome

**WebSocket not connecting:**
- Person 1's server running? Correct `VITE_WS_URL`?
- DevTools → Network → WS

**recording_complete not received server-side:**
- Log blob size — keep sets under ~20 seconds
- Check `reader.onloadend` fires before disconnect

**Coach silent after Stop:**
- Person 1 logs: video + SET_COMPLETE sent?
- Try shorter recording

**Audio not playing:**
- User must click Record (gesture unlocks AudioContext)
- Resume AudioContext if browser suspended it

**Follow-up mic not working:**
- `startFollowUpMic` runs after first `coach_audio`
- Check `audio_chunk` in WS frames after opening

**Analyzing forever:**
- Person 1 Gemini error in terminal — check model name and API key

---

## Your Checklist

- [ ] React app created and running locally
- [ ] Home screen copy reflects record-then-review flow
- [ ] Camera preview working on session page
- [ ] WebSocket connects; `session_ready` received
- [ ] Record / Stop buttons work; status states update correctly
- [ ] `recording_complete` sent on Stop (check WS in DevTools)
- [ ] Analyzing state shown while waiting
- [ ] Coach opening audio plays
- [ ] Coach opening text shows on overlay
- [ ] Follow-up mic sends `audio_chunk` after opening
- [ ] End Session cleans up camera and WS
- [ ] `VITE_WS_URL` updated to Person 1's ngrok `wss://` URL
- [ ] Demo flow tested end to end with Person 2's prompt
