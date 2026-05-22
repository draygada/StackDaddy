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

Record one set, then tap Stop. The server should print the uploaded recording
and then a set review:

```text
Recording received (video/webm, approx 2.40 MB)
Set review: On that set your knees caved near the bottom. Push your knees out over your toes. Want to fix stance or depth next?
```

The same review should appear over the camera feed.

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
