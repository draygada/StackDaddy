# StackDaddy — Bodyweight AI Coach

**Build With AI Hackathon** · Category: **Live Agents** (audio + vision)

AI calisthenics coach: record a set of air squats, get Gemini-powered **voice feedback**
or praise, then continue the conversation (e.g. “Why do my knees cave?”).

## Team members (required for submission — fill in)

| Name | Role |
|------|------|
| Eli | Infrastructure, Google Cloud Run, GenAI SDK server |
| Diego | Gemini prompts, coaching quality, grounding tests |
| Daniel | React frontend, record/stop UX |
| _Add all contributors_ | |

## Hackathon compliance

| Mandatory | Implementation |
|-----------|----------------|
| Google GenAI SDK | `@google/genai` in `server/` |
| Hosted on Google Cloud | Backend on **Cloud Run** (`https://….run.app`) |
| Live Agents (audio + vision) | Video of set + Coach voice + text overlay + follow-up mic |
| Grounding | `google_search` tool on Gemini Live session |

**Portal:** [goo.gle/CHM-hack-26](https://goo.gle/CHM-hack-26) · **Account:** [goo.gle/hackathon-account](https://goo.gle/hackathon-account)

## Architecture

```
Browser (React)  --WebSocket-->  Cloud Run (Node + @google/genai)
       |                                    |
  MediaRecorder                         Gemini Live API
  (record set)                          (video + audio + grounding)
```

## Run locally

### Backend (Person 1)

See [EliTasks.md](./EliTasks.md) — `server/`, `.env` with `GEMINI_API_KEY`, `node index.js`.

### Frontend (Person 3)

```bash
cd client
npm install
npm run dev
```

Set `client/.env`:

```bash
VITE_WS_URL=ws://localhost:8080
```

For judging, use Person 1's Cloud Run URL:

```bash
VITE_WS_URL=wss://coach-server-xxxxxxxx-uc.a.run.app
```

## Production backend (Cloud Run)

After deploy, health check:

```bash
curl https://coach-server-xxxxxxxx-uc.a.run.app
# Coach server running
```

Document your live URL here after deploy:

- **Cloud Run URL:** `https://________________.run.app`
- **WebSocket URL:** `wss://________________.run.app`

## Task guides

- [EliTasks.md](./EliTasks.md) — API key, server, Cloud Run, ngrok dev
- [DiegoTasks.md](./DiegoTasks.md) — prompts, testing, demo script
- [DanielTasks.md](./DanielTasks.md) — React UI, record/stop flow

## Submit

1. Push to GitHub (this repo).
2. Ensure **README team table** is complete.
3. Submit repo URL on the hackathon portal.
4. Demo video must show **working app** + **Cloud Run** deployment proof.
