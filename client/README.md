# StackDaddy Frontend

React/Vite frontend for the StackDaddy real-time form coaching demo.

## Run locally

Install Node.js first if `node -v` or `npm -v` fails.

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173.

## WebSocket URL

The local default is in `.env`:

```bash
VITE_WS_URL=ws://127.0.0.1:8080
```

When the backend is deployed, replace it with Person 1's secure WebSocket URL:

```bash
VITE_WS_URL=wss://your-cloud-run-url
```

## Message Contract

The frontend sends:

- `video_frame`: base64 JPEG every 500ms.
- `audio_chunk`: base64 PCM16 microphone audio chunks.

The frontend expects:

- `session_ready`: starts frame and audio streaming.
- `coach_text`: displays `text` over the camera feed.
- `coach_audio`: plays base64 audio in `data`.
- `error`: shows an error state.
