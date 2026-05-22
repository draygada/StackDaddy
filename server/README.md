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
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
USE_FAST_REVIEW=true
```

`USE_FAST_REVIEW=true` (default) analyzes video with `GEMINI_REVIEW_MODEL`
(`gemini-2.5-flash` by default) so text appears quickly, then uses
`GEMINI_LIVE_MODEL` (`gemini-3.1-flash-live-preview`) to speak that opening.
Set `USE_FAST_REVIEW=false` to send the full video only through Live (slower).

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
| **WebM VP8, video-only** | Default in the client — no audio muxed into the set clip (mic is only for follow-up). Smaller and faster than WebM+Opus. |
| **`video/webm` MIME to Gemini** | Server strips `;codecs=vp8` so the API gets a clean MIME type. |
| **Not MP4 from MediaRecorder** | Chrome/Safari rarely support `MediaRecorder` → MP4; WebM is the practical browser format. |
| **Not JPEG strips (yet)** | Key frames would be smaller but worse for rep timing; full short WebM is simpler. |

Optional: set `USE_FAST_REVIEW=true` so Gemini Flash reads the clip before Live speaks.

## Message Flow

The browser sends:

- `recording_complete`: base64 WebM (video-only when supported) after Stop.
- `audio_chunk`: 16 kHz PCM follow-up mic audio after Coach opens.

The server sends:

- `session_ready`: server is ready to receive a recording.
- `review_started`: server received the recording.
- `coach_text`: opening feedback on the overlay.
- `coach_rep_issues`: array of bad reps with explanation + `startSec`/`endSec` for replay.
- `coach_audio`: Gemini Live speech audio for browser playback.
- `error`: connection or Gemini errors.
