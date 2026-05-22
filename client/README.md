# StackDaddy Frontend

React/Vite frontend for the StackDaddy post-set video review demo.

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
| Local dev | `ws://127.0.0.1:8080` |
| Dev tunnel (optional) | `wss://….ngrok-free.app` |
| **Judging / Cloud (required)** | `wss://….run.app` (Person 1's **Cloud Run** URL) |

Restart `npm run dev` after changing `.env`.

## Message contract (record -> upload -> review)

**Client → server**

| type | When |
|------|------|
| `recording_complete` | User taps Stop, base64 WebM video upload |
| `audio_chunk` | Follow-up mic audio after the first Coach response |

**Server → client**

| type | When |
|------|------|
| `session_ready` | Server connected, show Record |
| `review_started` | Server received the video, show Analyzing |
| `coach_audio` | Play Coach speech through the speakers |
| `coach_text` | Show overlay text |
| `error` | Show error state |

See [DanielTasks.md](../DanielTasks.md) for full hook implementation.

## Hackathon note

Judges require **Google Cloud** hosting. The frontend may run on `localhost` during
the live demo if it connects to a **Cloud Run** backend — show the `*.run.app` URL
in your submission video. Optional: deploy this app to Firebase Hosting (same GCP project).
