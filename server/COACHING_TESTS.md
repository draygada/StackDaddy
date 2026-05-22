# StackDaddy Coaching Tests

Use this checklist when testing Diego's coaching intelligence work.

## Run

Start the backend and frontend in two terminals, then open the StackDaddy site.

```bash
cd server
npm run dev
```

```bash
cd client
npm run dev
```

## What Good Looks Like

The server should print frame counts:

```text
Forwarded 20 video frames and 40 audio chunks
Fallback cue: Chest up
```

The same cue should appear over the camera feed.

## Demo Rounds

- Knee cave: let knees collapse inward. Expected cue: "Push your knees out".
- Chest forward: lean torso forward. Expected cue: "Chest up".
- Shallow depth: stop high. Expected cue: "Go deeper".
- Good form: clean squat. Expected cue: "Good depth" or "Nice rep".

## Grounding Check

Open this while the server is running:

```text
http://127.0.0.1:8080/grounding-check
```

Success returns JSON with `ok: true` and a short answer about knees caving
inward. This verifies the Google Search tool is accepted by the SDK/server.

## Judge Talking Points

- StackDaddy streams webcam frames and microphone chunks from the browser.
- The backend bridges the browser to Gemini with the API key kept server-side.
- Gemini analyzes squat form against a focused coaching knowledge base.
- The demo prioritizes short, actionable cues instead of long explanations.
- Google Search grounding is enabled for explanatory coaching questions.
