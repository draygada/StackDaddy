# Person 2 — Gemini Integration & Coaching Intelligence
## Bodyweight AI Coach — Hackathon Day Guide

---

## Hackathon Requirements

| Requirement | How you meet it |
|-------------|-----------------|
| **Live Agents (audio + vision)** | Gemini sees the squat video, Coach speaks feedback, athlete talks back |
| **Google GenAI SDK** | Person 1 uses `@google/genai` — confirm model name matches what you test |
| **Grounding / robustness** | `tools: [{ google_search: {} }]` backs up why questions |
| **Not prohibited** | Vision + voice coaching — not a text chatbot, not a PDF RAG app |

---

## What You Are Building

The full flow you own:

1. Athlete records a set → taps Stop
2. Video sent to Gemini Live
3. **Coach speaks first** — 2–3 sentence opening: either names 1–2 faults with cues, or gives genuine praise
4. Athlete can talk back out loud — ask why, ask about a specific rep, ask what to fix next
5. Coach responds conversationally, backed by Google Search grounding on why questions

No bad rep video clips. No timestamp extraction. Just: video in → Coach speaks → conversation.

Your job is making sure Coach sounds like a real coach, not a chatbot.

---

## Phase 1 — Test in AI Studio (Hour 1)
### Do this while Person 1 sets up the server.

### Step 1 — Open AI Studio
1. Go to https://aistudio.google.com (hackathon account, Hackathon Chrome profile)
2. Go to **Stream Realtime** in the left sidebar
3. Select model: `gemini-3.1-flash-live-preview` (must match `GEMINI_LIVE_MODEL` on the server)

### Step 2 — Paste the System Prompt
Open System Instructions and paste the canonical prompt below.

### Step 3 — Test with a Bad Form Video
1. Record 10–15 seconds on your phone: 5 squats with obvious knee cave on reps 3–4
2. Upload the clip or show it to the camera in Stream Realtime
3. Say "SET_COMPLETE" when done
4. Coach should open without you asking first

**What a good opening sounds like:**
> "On that set your knees caved on reps 3 and 4. Drive them out over your toes. Want to work on stance or depth next?"

**What a bad opening sounds like:**
> "I can see several areas for improvement in your squat mechanics..." ← too long, generic

### Step 4 — Test with Good Form
Record a clean set. Opening should be genuine praise:
> "Strong set — good depth and control. Your chest stayed tall. Keep that tempo."

Coach should NOT invent faults on a good set.

### Step 5 — Test Follow-Up Questions
After the opening, ask out loud:
- "Why do my knees cave?"
- "What drill fixes that?"
- "Was rep 3 the worst one?"

Coach should answer briefly and specifically. Not re-lecture the whole set.

### Step 6 — Confirm the Model Name
Whatever model works reliably in AI Studio — send that exact model string to Person 1.
They will use it as `LIVE_MODEL` in `server/index.js`.

---

## Phase 2 — Canonical Prompt

This is the single source of truth. Send the final version to Person 1 for `squat.js`.

```
LANGUAGE (CRITICAL):
You MUST speak and write only in English. Never use any other language.

You are Coach, an expert calisthenics coach. The athlete has just finished
recording a set of air squats. You receive their video of the full set.

MODE — POST-SET REVIEW:
- Watch the entire set before responding.
- When you receive SET_COMPLETE, YOU speak first immediately.
- Open with ONE short message (2–3 sentences max) that either:
  (A) Names the 1–2 most important faults you saw, one cue each,
      AND the rep number where it happened, OR
  (B) Gives genuine positive affirmation if form was solid throughout.
- Pick A or B from what you actually saw. Do not be generic.
- After your opening, answer follow-up questions briefly.
  Stay conversational but expert.

OPENING EXAMPLES (adapt to what you saw):
- Fault: "Rep 3 and 4 your knees caved — drive them out over your toes.
  Want to work on stance or depth next?"
- Praise: "Strong set — good depth and control. Your chest stayed tall.
  Keep that tempo."

RULES:
- Maximum 2 faults in the opening.
- Priority order: knee cave → depth → chest forward → heels rising.
- Cues must be 8 words or fewer.
- Always name the rep number for every fault you call out.
- Do not list every rep. Do not lecture. Do not be generic.
- Only describe what you can actually see in the video.
- If form was mixed, lead with the biggest issue, then one positive if earned.
- Do not repeat the same cue twice in follow-up.

FAULTS TO LOOK FOR:
Knee cave, chest falling forward, heels rising, shallow depth (hip crease
not below knee), butt wink, stance too narrow or wide, rushing descent,
no lockout at top, arms not used for balance.

FOLLOW-UP BEHAVIOR:
- Answer "why" questions briefly with real coaching concepts.
- If asked about a specific rep, describe exactly what you saw.
- If asked "which rep was bad" or "show me", say the rep number and
  what happened: "Rep 3 — knees caved at the bottom."
- Stay conversational. Do not re-lecture the full set unprompted.
- One thought at a time.

You are reviewing a completed set. Open the conversation immediately
when you receive SET_COMPLETE. English only.
```

---

## Phase 3 — Refine If Needed (Hour 2)

Test results will tell you what to fix. Common issues:

| Issue | Fix |
|-------|-----|
| Coach waits for user to speak first | Add to prompt: "When you receive SET_COMPLETE, speak immediately. Do not wait." |
| Opening is in another language | Strengthen LANGUAGE block; restart session |
| Opening too long or lists every rep | Add: "Maximum 2–3 sentences. Never list every rep." |
| Generic opening not based on video | Add: "Only describe what is visible. Name the rep number." |
| Inventing faults on a good set | Add: "If form was good overall, opening must be genuine praise. Do not invent faults." |
| Follow-up answers too shallow | Verify `google_search` tool is on; add: "Use real coaching concepts for why questions." |
| Repeating the same cue | Add: "Do not repeat the same cue twice in a row." |

---

## Phase 4 — Google Search Grounding (Hour 3)

Already enabled in Person 1's server code:
```javascript
tools: [{ google_search: {} }]
```

### Verify it's working
After Coach gives the opening, ask:
> "Why do my knees cave during squats?"

**Working:** Answer mentions valgus collapse, hip abductor weakness, or ankle mobility.
**Not working:** Vague generic answer. Tell Person 1 to check `tools` in the session config.

Grounding is most useful for why questions during conversation — not for the opening itself.

---

## Phase 5 — Coaching Quality Testing (Hour 4)

Run these four tests before the demo. All on Person 1's Cloud Run URL.

**Test A — Bad form set**
Do 5 squats with obvious knee cave on reps 3–4.
Expected: Coach opens with knee cave, names rep number, gives one cue.

**Test B — Good form set**
Do 5 controlled squats with good depth.
Expected: Coach gives genuine praise. Does NOT invent faults.

**Test C — Follow-up conversation**
After Test A opening, ask: "Why do my knees cave?"
Expected: Brief specific answer with a real coaching concept.

**Test D — Rep-specific question**
Ask: "Was rep 3 the worst?"
Expected: Coach describes what it saw on rep 3 specifically.

If any test fails, fix the prompt and retest. Share results with the team
before the demo so everyone knows exactly what to expect.

---

## Phase 6 — Demo Preparation (Hour 5)

### The demo sequence (rehearse 5 times)
1. Tap Record — do 5 squats with knee cave on reps 3–4
2. Tap Stop — UI shows "Analyzing..."
3. Coach speaks: "Rep 3 and 4 your knees caved — drive them out over your toes."
4. Ask out loud: "Why do my knees cave?"
5. Coach gives a brief specific answer

Backup demo: clean set → Coach gives praise.

### Talking points for judges
- **Category:** Live Agents — multimodal coach that sees your set and speaks to you
- **Vision + voice:** Gemini watches the video and responds with audio
- **Conversational:** Athlete can interrupt and ask follow-ups out loud after the opening
- **Grounding:** Google Search backs up why questions — reduces hallucinations
- **Cloud:** Running on Google Cloud Run (show the `*.run.app` URL)
- **Not a chatbot:** No text box — record a set, hear a coach, talk back

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No opening after SET_COMPLETE | Strengthen trigger instruction; check Person 1 is sending SET_COMPLETE text after video |
| Opening in wrong language | Add more explicit LANGUAGE block; restart session |
| Opening is generic | Use a more extreme bad-form demo video; add rep-specific examples to prompt |
| No voice, only text | Person 1: check `response_modalities` includes AUDIO |
| Follow-up why answers weak | Verify `google_search` tool in Person 1's config |

---

## Your Checklist

- [ ] AI Studio Stream Realtime tested and working
- [ ] Bad form set tested — Coach opens with specific fault + rep number
- [ ] Good form set tested — Coach gives genuine praise
- [ ] Follow-up "why" question tested — specific answer
- [ ] Rep-specific question tested — Coach describes what it saw
- [ ] Opening is English only, 2–3 sentences, specific
- [ ] Final prompt sent to Person 1 for `squat.js`
- [ ] Model name confirmed and sent to Person 1 for `LIVE_MODEL`
- [ ] Google Search Grounding verified
- [ ] All 4 tests passing on Cloud Run URL
- [ ] Demo sequence rehearsed 5 times
- [ ] Judge talking points prepared