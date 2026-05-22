# StackDaddy Frontend

React/Vite frontend for the Bodyweight AI Coach hackathon demo (**Live Agents**).

## Run locally

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173.

## WebSocket URL (`client/.env`)

| Environment | `VITE_WS_URL` |
|-------------|----------------|
| Local dev | `ws://localhost:8080` |
| Dev tunnel (optional) | `wss://….ngrok-free.app` |
| **Judging / Cloud (required)** | `wss://….run.app` (Person 1's **Cloud Run** URL) |

Restart `npm run dev` after changing `.env`.

## Message contract (record → review pivot)

**Client → server**

| type | When |
|------|------|
| `recording_complete` | User taps Stop — base64 video (`data`, `mimeType`) |
| `audio_chunk` | After Coach opening — follow-up mic (PCM16 base64) |

**Server → client**

| type | When |
|------|------|
| `session_ready` | Gemini connected — show Record |
| `review_started` | Server received video (optional — show Analyzing) |
| `coach_audio` | Coach speaking — play audio |
| `coach_text` | Show overlay text |
| `error` | Show error state |

See [DanielTasks.md](../DanielTasks.md) for full hook implementation.

## Hackathon note

Judges require **Google Cloud** hosting. The frontend may run on `localhost` during
the live demo if it connects to a **Cloud Run** backend — show the `*.run.app` URL
in your submission video. Optional: deploy this app to Firebase Hosting (same GCP project).
