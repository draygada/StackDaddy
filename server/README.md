# StackDaddy Server

WebSocket bridge between the browser frontend and Gemini Live.

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

- `video_frame`: base64 JPEG image.
- `audio_chunk`: base64 PCM16 audio.

The server sends:

- `session_ready`: Gemini Live is connected.
- `coach_text`: cue text for the overlay.
- `coach_audio`: base64 audio for playback.
- `error`: connection or Gemini errors.
