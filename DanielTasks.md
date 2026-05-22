# Person 3 — Frontend
## Bodyweight AI Coach — Hackathon Day Guide

---

## Hackathon Requirements

| Requirement | How you meet it |
|-------------|-----------------|
| **Live Agents (audio + vision)** | Camera records the set; Coach audio plays back; mic follow-up |
| **Google Cloud hosting** | Point `VITE_WS_URL` at Person 1's Cloud Run `wss://` URL for judging |
| **Working demo video** | Show real app: Record → Stop → Analyzing → Coach speaks → ask a question |
| **Not prohibited** | Vision + voice coaching — not a text chatbot |

**Dev:** `ws://localhost:8080` or Person 1's ngrok URL.
**Judging:** Person 1's Cloud Run `wss://` URL — mandatory.

---

## What You Are Building

**The full UI flow:**

1. Home screen — select Air Squats
2. Session screen — camera preview shows immediately
3. User clicks **Record Set** → MediaRecorder starts
4. User clicks **Stop** → video blob sent to server as `recording_complete`
5. UI shows **"Coach is reviewing your set..."**
6. Coach audio plays back through speakers + text overlay appears
7. UI shows **"Ask Coach anything out loud"** — mic is live for follow-up
8. User talks back — Coach responds conversationally
9. User clicks End Session to go back to home

No bad rep clips. No video replay. No timestamps. Just: record → hear Coach → talk back.

---

## WebSocket Message Contract

| Direction | `type` | When |
|-----------|--------|------|
| Server → client | `session_ready` | Gemini connected; show Record button |
| Client → server | `recording_complete` | User tapped Stop; `{ data, mimeType }` base64 webm |
| Server → client | `review_started` | Server got video; show Analyzing state |
| Server → client | `coach_audio` | Coach speaking — play through speakers |
| Server → client | `coach_text` | Show as text overlay |
| Client → server | `audio_chunk` | After opening, user follow-up mic |
| Server → client | `error` | Something failed |

---

## Phase 1 — Project Setup (Hour 1)

```bash
npm create vite@latest client -- --template react
cd client
npm install
```

No extra packages needed — use native browser WebSocket API.

**Folder structure:**
```
client/src/
  pages/
    Home.jsx + Home.css
    Session.jsx + Session.css
  hooks/
    useCoachSession.js
  components/
    CueOverlay.jsx + CueOverlay.css
  App.jsx
```

**Create `.env`:**
```
VITE_WS_URL=ws://localhost:8080
```

---

## Phase 2 — App.jsx

```jsx
import { useState } from 'react'
import Home from './pages/Home'
import Session from './pages/Session'

export default function App() {
  const [page, setPage] = useState('home')

  return (
    <div>
      {page === 'home' && (
        <Home onStart={() => setPage('session')} />
      )}
      {page === 'session' && (
        <Session onEnd={() => setPage('home')} />
      )}
    </div>
  )
}
```

---

## Phase 3 — Home Page

### `client/src/pages/Home.jsx`
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
        <button className="exercise-card" onClick={onStart}>
          <span className="exercise-icon">🏋️</span>
          <span className="exercise-name">Air Squats</span>
          <span className="exercise-desc">Record a set, hear Coach</span>
        </button>
        <button className="exercise-card disabled" disabled>
          <span className="exercise-icon">🤸</span>
          <span className="exercise-name">Handstands</span>
          <span className="exercise-desc">Coming soon</span>
        </button>
      </div>
    </div>
  )
}
```

### `client/src/pages/Home.css`
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
  color: #fff;
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
  color: white;
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
.exercise-icon { font-size: 40px; }
.exercise-name { font-size: 18px; font-weight: 600; }
.exercise-desc { font-size: 13px; color: #666; }
```

---

## Phase 4 — Coach Session Hook (Hours 2–3)

This hook handles everything: WebSocket, camera, MediaRecorder, audio playback, mic.

### `client/src/hooks/useCoachSession.js`

```javascript
import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'

// Status flow: connecting → ready → recording → analyzing → conversing → error
export function useCoachSession() {
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
  const followUpStartedRef = useRef(false)

  // Show text overlay for 8 seconds then fade
  const showCue = useCallback((text) => {
    setCurrentCue(text)
    setCueVisible(true)
    setTimeout(() => setCueVisible(false), 8000)
  }, [])

  // Play Coach audio through speakers
  const playAudio = useCallback(async (base64Audio) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }
      // Resume if browser suspended it
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
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

  // Start sending mic audio for follow-up conversation
  const startFollowUpMic = useCallback(async (stream) => {
    if (followUpStartedRef.current) return
    followUpStartedRef.current = true

    const audioContext = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = audioContext
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

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
  }, [])

  // Start recording the set
  const startRecording = useCallback(() => {
    if (!streamRef.current || status !== 'ready') return

    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm'

    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      setStatus('analyzing')
      const blob = new Blob(chunksRef.current, { type: mimeType })

      // Convert to base64 and send to server
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

  // Stop recording — triggers Coach review
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const startSession = async () => {
      try {
        // Get camera + mic
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true
        })
        if (!mounted) return
        streamRef.current = stream

        // Attach camera to video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        // Open WebSocket
        const ws = new WebSocket(WS_URL)
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
            // Start mic for follow-up after first Coach audio
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
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (processorRef.current) processorRef.current.disconnect()
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [playAudio, showCue, startFollowUpMic])

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

## Phase 5 — Session Page (Hour 3)

### `client/src/pages/Session.jsx`

```jsx
import { useCoachSession } from '../hooks/useCoachSession'
import CueOverlay from '../components/CueOverlay'
import './Session.css'

export default function Session({ onEnd }) {
  const {
    status,
    currentCue,
    cueVisible,
    videoRef,
    startRecording,
    stopRecording
  } = useCoachSession()

  const statusLabel = {
    connecting: 'Connecting to Coach...',
    ready: 'Ready — tap Record',
    recording: 'Recording your set',
    analyzing: 'Coach is reviewing your set...',
    conversing: 'Ask Coach anything out loud',
    error: 'Connection error — check server'
  }[status] ?? status

  return (
    <div className="session">
      {/* Live camera preview */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="camera-feed"
      />

      {/* Top status bar */}
      <div className="session-bar">
        <div className="session-info">
          {status === 'recording' && <span className="live-dot" />}
          <span className={`status ${status}`}>{statusLabel}</span>
        </div>
        <button className="end-btn" onClick={onEnd}>
          End Session
        </button>
      </div>

      {/* Record / Stop controls */}
      <div className="record-controls">
        {status === 'ready' && (
          <button className="record-btn" onClick={startRecording}>
            ● Record Set
          </button>
        )}
        {status === 'recording' && (
          <button className="stop-btn" onClick={stopRecording}>
            ■ Stop
          </button>
        )}
        {status === 'analyzing' && (
          <div className="analyzing-indicator">
            <span className="spinner" />
            <span>Coach is watching your set...</span>
          </div>
        )}
        {status === 'conversing' && (
          <p className="hint">🎙 Ask Coach anything out loud</p>
        )}
      </div>

      {/* Coach text overlay */}
      <CueOverlay text={currentCue} visible={cueVisible} />
    </div>
  )
}
```

### `client/src/pages/Session.css`

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
  transform: scaleX(-1);
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
  color: white;
}

.status.recording { color: #ef4444; }
.status.analyzing { color: #f59e0b; }
.status.conversing { color: #22c55e; }
.status.ready { color: #94a3b8; }
.status.error { color: #ef4444; }

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

.record-controls {
  position: absolute;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.record-btn {
  background: #ef4444;
  color: white;
  border: none;
  padding: 16px 40px;
  border-radius: 999px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}

.record-btn:hover { opacity: 0.85; }

.stop-btn {
  background: #ffffff;
  color: #0a0a0a;
  border: none;
  padding: 16px 40px;
  border-radius: 999px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.analyzing-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #f59e0b;
  font-size: 15px;
  font-weight: 500;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(245, 158, 11, 0.3);
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.hint {
  color: rgba(255,255,255,0.8);
  font-size: 15px;
  font-weight: 500;
  text-align: center;
  margin: 0;
}
```

---

## Phase 6 — CueOverlay Component

### `client/src/components/CueOverlay.jsx`
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

### `client/src/components/CueOverlay.css`
```css
.cue-overlay {
  position: absolute;
  bottom: 140px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.75);
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
  color: #fff;
  margin: 0;
  line-height: 1.4;
}
```

---

## Phase 7 — Connect to Cloud Run (Hour 5)

When Person 1 gives you the Cloud Run URL:

1. Update `client/.env`:
```
VITE_WS_URL=wss://coach-server-xxxxxxxx-uc.a.run.app
```
Note: `wss://` not `ws://` for Cloud Run and ngrok.

2. Restart dev server: `npm run dev`

3. Run the full demo flow on the Cloud Run URL before submission.

4. Confirm in DevTools → Network → WS that it connects to `*.run.app`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Camera not showing | Check browser permissions; `videoRef.current.srcObject = stream` in useEffect |
| WebSocket not connecting | Person 1's server running? Correct `VITE_WS_URL`? DevTools → Network → WS |
| `recording_complete` not received server-side | Cap recording at 15–20 seconds; check blob size > 0 |
| Coach silent after Stop | Check Person 1's server logs; try shorter recording |
| Audio not playing | User must have clicked Record first (browser gesture unlocks AudioContext) |
| Follow-up mic not working | Starts after first `coach_audio` — check that audio is actually playing |
| Analyzing forever | Person 1 Gemini error in terminal — check model name and API key |
| `wss://` vs `ws://` | Use `ws://` for localhost only; `wss://` for ngrok and Cloud Run |

---

## Your Checklist

- [ ] React app created and running locally
- [ ] Home screen shows Air Squats card
- [ ] Camera preview showing on session page
- [ ] WebSocket connects — `session_ready` received
- [ ] Record button appears when ready
- [ ] Recording starts and status changes to "recording"
- [ ] Stop button works — status changes to "analyzing"
- [ ] `recording_complete` sent to server (check DevTools → WS)
- [ ] "Coach is reviewing your set..." shown during analyzing
- [ ] Coach audio plays through speakers
- [ ] Coach text overlay appears and fades after 8 seconds
- [ ] Status changes to "conversing" after first audio
- [ ] "Ask Coach anything out loud" hint shown
- [ ] Follow-up mic sends `audio_chunk` (check DevTools → WS)
- [ ] End Session returns to home and stops camera
- [ ] `VITE_WS_URL` updated to Cloud Run `wss://` URL
- [ ] Full flow tested on Cloud Run URL
- [ ] Demo flow rehearsed — record → stop → Coach speaks → ask a question