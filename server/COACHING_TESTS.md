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

Record one set (max 15 seconds), then tap Stop. The server should print timing
and the flash review text before voice:

```text
Recording received (video/webm, approx 0.80 MB)
Flash review done in 4200ms
Set review: On that set your knees caved on reps 3 and 4. Push your knees out over your toes.
Total review pipeline started in 4300ms (text sent)
```

The same review should appear on the overlay within a few seconds; voice follows.

## Demo Rounds

- Knee cave: let knees collapse inward, then stop. Expected review mentions knees and "Push your knees out".
- Chest forward: lean torso forward, then stop. Expected review mentions chest and "Chest up".
- Shallow depth: stop high, then stop. Expected review mentions depth or hips below parallel.
- Good form: clean squat, then stop. Expected review gives positive feedback like "Good depth" or "Strong set".

## Grounding Check

Open this while the server is running:

```text
http://127.0.0.1:8080/grounding-check
```

Success returns JSON with `ok: true` and a short answer about knees caving
inward. This verifies the Google Search tool is accepted by the SDK/server.

## Judge Talking Points

- StackDaddy records one set in the browser and uploads the full video.
- The backend bridges the browser to Gemini with the API key kept server-side.
- Gemini reviews the completed set video against a focused coaching knowledge base.
- The demo prioritizes short, actionable post-set feedback instead of long explanations.
- Google Search grounding is enabled for explanatory coaching questions.
