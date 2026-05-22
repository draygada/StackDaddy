# Person 2 — Gemini Integration & Coaching Intelligence
## Bodyweight AI Coach — Hackathon Day Guide

---

## Hackathon requirements (Build With AI — Live Agents)

Your project must satisfy **mandatory** rules for judging:

| Requirement | How we meet it |
|-------------|----------------|
| **Category: Live Agents** (audio + vision) | Camera records the set; Gemini **sees** video; Coach **speaks** (audio) + **text overlay**; athlete can **talk back** after the opening |
| **Google GenAI SDK** | Person 1 uses `@google/genai` in `server/index.js` (not raw REST only) |
| **Hosted on Google Cloud** | Person 1 deploys backend to **Cloud Run** — demo video must show the `*.run.app` URL |
| **Grounding / robustness** (30% technical) | `tools: [{ google_search: {} }]` + post-set prompt (“only what you see”) |
| **Submission** | Repo README lists **all team members**; submit GitHub URL on the portal |

**Pitch framing:** We optimized for reliable **post-set video review + live voice conversation** because mid-rep Live latency was unreliable in the room — still a vision + voice agent, not a text-only chatbot.

Portal: [goo.gle/CHM-hack-26](https://goo.gle/CHM-hack-26) · Account setup: [goo.gle/hackathon-account](https://goo.gle/hackathon-account)

---

## Team pivot (read first)

**We are NOT doing real-time mid-rep coaching.** Live video streaming was too slow
and unreliable in AI Studio.

**New flow:**
1. Athlete **records one set** of air squats in the app
2. Athlete taps **Stop**
3. Coach **speaks first** — either corrective feedback or positive affirmation
4. Athlete can **reply** and continue the conversation (e.g. "Why do my knees cave?")

You own the **system prompt**, coaching quality, English-only responses, and testing.
Person 1 wires Gemini on the server; Person 3 builds record/stop UI.

---

## Your Role
You are responsible for:
- Refining the post-set review system prompt in `server/prompts/squat.js`
- Testing coaching quality (openings + follow-up questions)
- Verifying Google Search Grounding on "why" questions after the opening
- Supporting Person 1 on Gemini video + session logic if they get stuck

You are the AI expert on the team. If Coach's opening is vague, wrong language,
or generic, fix the prompt until it sounds like a real coach.

---

## Phase 1 — Test the prompt (Hour 1)
### Do this while Person 1 sets up the server. No repo code required yet.

### Step 1 — Open Google AI Studio
1. Go to https://aistudio.google.com (hackathon account in Hackathon Chrome profile)
2. Use **Chat** with a model that accepts **video upload** (e.g. Gemini 2.0 Flash),
   OR use **Stream Realtime** and say **"Set done"** after you finish a set on camera
   (upload is closer to the real app)

### Step 2 — Paste the system prompt
1. Open **System instructions**
2. Paste the full prompt from **Canonical prompt** below (same as Eli's `squat.js`)

### Step 3 — Test with video
1. On your phone, record **10–15 seconds**: 5 air squats with **obvious knee cave** on reps 3–4
2. Upload the clip to AI Studio (or finish a set on camera + say "Set done" in Live)
3. Coach should **open the conversation** without you asking first
4. Check: **English only**, **2–3 sentences**, names **1–2 real faults** or gives **praise**

### Step 4 — Test good form
1. Record a set with **good depth** and control
2. Opening should be **affirmation**, not nitpicking

### What a good opening sounds like

**Feedback:**
> "On that set your knees caved on the middle reps. Push your knees out over your toes. Want to work on depth or stance next?"

**Praise:**
> "Strong set — good depth and control. Your chest stayed tall. Keep that tempo."

**Bad:**
> "I can see several areas for improvement in your squat mechanics..."
> (too long, generic, or non-English)

### Step 5 — Document what works
Save the exact opening phrasing for the demo. Send the final prompt to Person 1.

---

## Phase 2 — Refine the knowledge base (Hour 2)

The prompt lives in Person 1's `server/prompts/squat.js`. Expand based on testing.

### Common issues to fix

**Issue: Coach waits for the user to speak first**
Fix — already in prompt; reinforce:
```
When the set ends, YOU speak first. The athlete does not prompt you.
```

**Issue: Coach responds in another language**
Fix:
```
LANGUAGE (CRITICAL): You MUST speak and write only in English.
```

**Issue: Opening is too long or lists every rep**
Fix:
```
Opening is maximum 2–3 sentences. Maximum 2 faults. Do not narrate every rep.
```

**Issue: Coach is too harsh on a good set**
Fix:
```
If form was good overall, opening must be genuine praise — do not invent faults.
```

**Issue: Coach is too generic**
Fix:
```
Only describe what you saw in the recording. Name rep timing if helpful ("reps 3–4").
```

**Issue: Follow-up "why" answers are shallow**
Fix: Verify `tools: [{ google_search: {} }]` on the server (Person 1). Tune prompt:
```
For why questions, answer briefly with real coaching concepts (muscles, mobility, cues).
```

### Extended squat knowledge to add if missing

```
Feet too narrow or too wide → "Widen your stance slightly" / "Toes out a little more"
Arms not used for balance → "Arms out in front for balance"
Rushing the descent → "Control the descent — slow down"
Not locking out at the top → "Stand all the way up — full lockout"
```

---

## Phase 3 — Google Search Grounding (Hour 3–4)

### What it does
Backs up follow-up answers when the athlete asks **why** (after the opening).

### How to enable
Already in Person 1's server:
```javascript
tools: [{ google_search: {} }]
```

### How to verify
After Coach gives the opening, ask (voice or text):
> "Why do my knees cave during squats?"

Working: valgus collapse, weak hip abductors, ankle mobility, etc.
Not working: generic filler — Person 1 checks `tools` in session config.

---

## Phase 4 — Coaching quality testing (Hour 4)

### Testing protocol

**Test A — Bad set (knee cave)**
- Record ~5 reps, knees cave on middle reps
- Stop → Coach opens with knee cave + short cue
- Opening in **English**, within a reasonable wait (processing state in app)

**Test B — Good set**
- Record controlled reps, solid depth
- Stop → Coach opens with **praise**, not fake corrections

**Test C — Follow-up**
- Ask "Why do my knees cave?"
- Answer should be specific (grounding if enabled)

**Test D — English only**
- If account locale is mixed, confirm opening stays English

### If a test fails

| Failure | Fix |
|--------|-----|
| No opening / user must speak first | Strengthen SESSION BEHAVIOR in prompt; Person 1 sends `SET_COMPLETE` trigger after video |
| Wrong fault | Add clearer fault description in knowledge base |
| Too long | Tighten "2–3 sentences max" |
| Wrong language | Strengthen LANGUAGE block |
| Slow processing | Normal for video upload; show "Analyzing..." in UI (Person 3) |

### Share results with the team before the demo

---

## Phase 5 — Demo preparation (Hour 5)

### Demo flow (rehearse 5×)

1. Athlete taps **Record** and does **5 squats** with **knee cave** on reps 3–4
2. Athlete taps **Stop** → UI shows **Analyzing...**
3. Coach **speaks first**: knee cave + one cue
4. Athlete asks: **"Why do my knees cave?"**
5. Coach gives a short, credible answer

**Backup demo:** Good-form set → Coach praises the set.

### Talking points for judges

- **Category:** Live Agents — multimodal coach that **sees** your set and **speaks** to you
- **Problem / solution:** Real-time form coaching without a human trainer
- **Tech:** Google **GenAI SDK**, Gemini **Live** (audio) + **video** input on **Google Cloud Run**
- **UX:** Not a text box — record a set → Coach **opens with voice** + on-screen text → athlete asks follow-ups out loud
- **Grounding:** Google Search backs up “why” questions (reduces hallucinations)
- **Cloud proof:** Show `https://your-service-….run.app` in the demo (health check + working app)
- **Honest design note:** Post-set analysis for accuracy; conversation after is live and interruptible

---

## Canonical prompt (copy to AI Studio and Person 1's squat.js)

```
LANGUAGE (CRITICAL):
- You MUST speak and write only in English. Never use any other language.

You are Coach, an expert calisthenics coach. The athlete records ONE set of air squats,
then stops recording. You receive their recorded video of that set.

MODE — POST-SET REVIEW (not live mid-rep):
- Do NOT coach rep-by-rep during the recording. Analyze the full set when it ends.
- When the recording ends (or you receive SET_COMPLETE), YOU speak first.
- Open with ONE short message (2–3 sentences max) that either:
  (A) names the 1–2 most important faults you saw and one cue each, OR
  (B) gives genuine positive affirmation if form was good overall.
- Pick A or B from what you actually saw — do not be generic.
- After your opening, answer follow-up questions briefly. Stay conversational but expert.

OPENING EXAMPLES (adapt to what you saw):
- Feedback: "On that set your knees caved on reps 3 and 5. Push your knees out over your toes. Want to fix stance or depth next?"
- Praise: "Strong set — good depth and control. Your chest stayed tall. Keep that tempo."

RULES:
- Maximum 2 faults in the opening. Prioritize knee cave, then depth, then chest forward.
- Cues must be short (8 words or fewer when possible). Name body parts and actions.
- If form was mixed, lead with the biggest issue; add one positive only if earned.
- Do not list every rep. Do not lecture. Only describe what is visible in the video.
- Do not repeat the same cue twice in a row in follow-up.

WHAT TO LOOK FOR IN THE SET:
Knee cave, chest forward, heels rising, shallow depth, butt wink,
stance too narrow/wide, rushing descent, no lockout at top, arms not helping balance.

For "why" questions, answer briefly with real coaching concepts.
You are reviewing a completed set. Open the conversation in English.
```

---

## Troubleshooting

**Coach never speaks after Stop:**
- Person 3 sent `recording_complete`? Person 1 logs show video received?
- Person 1 sent `SET_COMPLETE` text trigger after video?

**Opening in wrong language:**
- Strengthen LANGUAGE block; new Gemini session after prompt change

**Opening is generic:**
- Add rep-specific examples to prompt; use a clearer bad-form demo video

**Only text, no voice:**
- Person 1: `response_modalities` includes AUDIO; Person 3 plays `coach_audio`

**Follow-up why questions weak:**
- Check `google_search` tool; ask Person 1 to verify tools in config

---

## Submission support (Person 2)

Help the team with **demo video** and **README** (required on portal):

- [ ] Demo script rehearsed on **Cloud Run** URL (not only localhost)
- [ ] Video shows **working software** (record → stop → Coach speaks → follow-up question)
- [ ] Video or slides mention **GenAI SDK** + **Gemini** + **Cloud Run** (architecture screenshot)
- [ ] Confirm repo **README.md** lists every team member name

---

## Your Checklist

- [ ] Post-set prompt pasted and tested (bad set opening)
- [ ] Good-set opening tested (praise)
- [ ] Openings are English, 2–3 sentences, specific
- [ ] Knowledge base covers major squat faults
- [ ] Final prompt + **model name** sent to Person 1 for `squat.js` and `LIVE_MODEL`
- [ ] Google Search Grounding verified on a why question
- [ ] Bad-set demo flow rehearsed with Person 3 on **Cloud Run** backend
- [ ] Good-set backup demo rehearsed
- [ ] Judge talking points prepared (Live Agents + Cloud + SDK + grounding)
