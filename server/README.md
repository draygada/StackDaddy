# StackDaddy Server

WebSocket bridge between the browser frontend and Gemini video review.

## Setup

```bash
cd server
npm install
```

Put the temporary Google AI Studio key in `.env`:

```bash
GEMINI_API_KEY=your_key_here
PORT=8080
HOST=127.0.0.1
GEMINI_REVIEW_MODEL=gemini-2.5-flash
GEMINI_LIVE_MODEL=gemini-live-2.5-flash-preview
```

Do not commit `.env`.

## Run Locally

```bash
npm run dev
```

Health check:

```text
http://127.0.0.1:8080
```

The frontend should use:

```bash
VITE_WS_URL=ws://127.0.0.1:8080
```

## Expose With Ngrok

```bash
ngrok http 8080
```

If ngrok gives:

```text
https://abc123.ngrok-free.app
```

then the frontend WebSocket URL is:

```bash
VITE_WS_URL=wss://abc123.ngrok-free.app
```

Restart the frontend after changing `VITE_WS_URL`.

## Message Flow

The browser sends:

- `recording_complete`: base64 WebM video after Stop.
- `audio_chunk`: 16 kHz PCM follow-up mic audio after Coach opens.

The server sends:

- `session_ready`: server is ready to receive a recording.
- `review_started`: server received the recording.
- `coach_audio`: Gemini Live speech audio for browser playback.
- `coach_text`: cue text for the overlay.
- `error`: connection or Gemini errors.
