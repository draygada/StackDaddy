# StackDaddy — Bodyweight AI Coach

**Google I/O: Build With AI Hackathon** · Category: **Live Agents** (audio + vision)

AI calisthenics coach: record a set of air squats, upload the full video, and
get Gemini-powered feedback or praise.

## Hackathon compliance

| Mandatory | Implementation |
|-----------|----------------|
| Google GenAI SDK | `@google/genai` in `server/` |
| Live Agents (audio + vision) | Recorded set video + Coach feedback + text overlay |
| Grounding | `google_search` tool on Gemini Live session |

## Architecture

```
Browser (React)  --WebSocket-->  Cloud Run (Node + @google/genai)
       |                                    |
  MediaRecorder                         Gemini API
  (record set)                          (video review + grounding)
```

## Demo

https://drive.google.com/file/d/1T-haP7uRKm7jKeZBMAi8jd-1DmloEJ9c/view?usp=sharing
