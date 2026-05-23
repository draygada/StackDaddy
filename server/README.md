# StackDaddy Server

WebSocket bridge between the browser frontend, local pose analysis, and Gemini
Live voice coaching.

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
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
```

The browser now sends local MediaPipe pose metrics with the recording. The server
trusts those measured squat faults first, uses `GEMINI_REVIEW_MODEL` only as a
fallback if pose tracking fails, then uses `GEMINI_LIVE_MODEL` to speak and chat.

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

## Video format (file type optimization)

| Choice | Why |
|--------|-----|
| **WebM VP8, video-only** | Default in the client - no audio muxed into the set clip (mic is only for follow-up). Smaller and faster than WebM+Opus. |
| **`video/webm` MIME to Gemini** | Server strips `;codecs=vp8` so the API gets a clean MIME type. |
| **Not MP4 from MediaRecorder** | Chrome/Safari rarely support `MediaRecorder` -> MP4; WebM is the practical browser format. |
| **Not JPEG strips (yet)** | Key frames would be smaller but worse for rep timing; full short WebM is simpler. |

## Message Flow

The browser sends:

- `recording_complete`: base64 WebM plus local squat `poseAnalysis` after Stop.
- `audio_chunk`: 16 kHz PCM follow-up mic audio after Coach opens.
- `next_rep`: selected rep/fault in the review UI.
- `call_control`: starts or stops follow-up audio capture.

The server sends:

- `session_ready`: server is ready to receive a recording.
- `review_started`: server received the recording.
- `review_ready`: array of detected faults with timestamps for replay.
- `coach_audio`: Gemini Live speech audio for browser playback.
- `coach_text`: opening feedback/transcript on the overlay/review chat.
- `user_text`: transcript of follow-up mic audio.
- `error`: connection or Gemini errors.
