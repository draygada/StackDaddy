# Person 2 — Gemini Integration & Coaching Intelligence
## Bodyweight AI Coach — Hackathon Day Guide

---

## Your Role
You are responsible for:
- Making sure Gemini Live is working correctly end to end
- Refining the system prompt and knowledge base so Coach sounds credible
- Testing and debugging the coaching quality
- Adding Google Search Grounding
- Supporting Person 1 on the Gemini session logic if they get stuck

You are the AI expert on the team. If Coach says something wrong or
vague, it's your job to fix the prompt until it sounds like a real coach.

---

## Phase 1 — Test Gemini Live in AI Studio (Hour 1)
### Do this while Person 1 sets up Cloud infrastructure.
### No code needed yet — just verify the model works and test prompts.

### Step 1 — Open Google AI Studio
1. Go to https://aistudio.google.com
2. Sign in with your Google account
3. Click "Stream Realtime" in the left sidebar
   (this is the Live API interface)

### Step 2 — Test the Model
1. Select model: `gemini-3.1-flash-live-preview`
2. Click the microphone icon and talk to it
3. Make sure you get a voice response back
4. If it works, the model is accessible and your API key is valid

### Step 3 — Test Your System Prompt
1. In AI Studio, find the "System Instructions" field
2. Paste the squat coaching prompt (from Person 1's squat.js file)
3. Enable camera in AI Studio
4. Do some air squats in front of your camera
5. Listen to what Coach says
6. If the cues are too long, too generic, or wrong — edit the prompt
7. Keep testing until Coach sounds like a real coach

### What Good Coaching Sounds Like
Good: "Push your knees out over your toes"
Bad: "I can see that your knees are caving inward which is a common issue"

Good: "Chest up — you're falling forward"
Bad: "Your chest position could be improved"

Good: "Go deeper — break parallel"
Bad: "Try to squat a little lower if you can"

Every cue should be:
- One sentence
- Specific body part named
- Actionable direction given
- Under 8 words if possible

### Step 4 — Document What Works
Write down the exact prompt wording that produces good cues.
This goes into the final system prompt that Person 1 deploys.

---

## Phase 2 — Refine the Knowledge Base (Hour 2)

### Your main job in hour 2 is making Coach smarter.

The base squat knowledge base is in Person 1's `server/prompts/squat.js`.
Your job is to expand and refine it based on what you learned in AI Studio.

### Common Issues to Fix

**Issue: Coach gives too many cues at once**
Fix: Add to prompt:
```
Never give more than one correction per 5 seconds.
Pick the most important fault you see and address only that.
```

**Issue: Coach is too verbose**
Fix: Add to prompt:
```
Maximum 8 words per cue. Be as short as possible.
```

**Issue: Coach doesn't react fast enough**
Fix: This is a latency issue, not a prompt issue.
Tell Person 1 to reduce the video frame interval from 500ms to 300ms.

**Issue: Coach gives generic advice not related to what it sees**
Fix: Add to prompt:
```
Only give cues for faults you can actually see right now.
Do not give general advice. React only to what is visible.
```

**Issue: Coach keeps repeating the same cue**
Fix: Add to prompt:
```
Do not repeat the same cue twice in a row.
If you already called out knee cave, move to the next issue.
```

### Extended Squat Knowledge to Add

Add these fault/cue pairs to the knowledge base if Coach is missing them:

```
Feet too narrow or too wide:
- Optimal: shoulder width, toes 15-30 degrees out
- Cue: "Widen your stance slightly"
       "Toes out a little more"

Arms not used for balance:
- Beginners often let arms hang
- Cue: "Arms out in front for balance"
       "Reach your arms forward as you squat"

Rushing the descent:
- Dropping too fast, losing control
- Cue: "Control the descent — slow down"
       "3 seconds down"

Not locking out at the top:
- Not fully standing between reps
- Cue: "Stand all the way up — full lockout"
       "Squeeze your glutes at the top"
```

---

## Phase 3 — Google Search Grounding (Hour 3-4)

### What It Does
Allows Gemini to search Google in real time to back up its coaching
answers with real sources. Especially useful for the Call Coach mode
and when athletes ask "why" questions.

### How to Enable It
It's already in Person 1's server code:
```javascript
tools: [{ google_search: {} }]
```

That's the entire implementation. Google handles the rest.

### How to Verify It's Working
During a call session, ask Coach:
"Why do my knees cave during squats?"

If grounding is working, Coach should give a specific answer about
valgus collapse, hip abductor weakness, or ankle mobility — backed
by real coaching knowledge pulled from the web.

If Coach gives a generic answer, grounding may not be working.
Check that the tools parameter is being passed correctly to the
Gemini Live session config.

---

## Phase 4 — Coaching Quality Testing (Hour 4)

### This is the most important thing you do all day.
### The demo lives or dies on coaching quality.

### Testing Protocol
Do 3 rounds of squats with intentionally bad form:

**Round 1 — Knee cave**
Let your knees collapse inward.
Coach should say something about knees within 5 seconds.

**Round 2 — Chest forward**
Lean your torso forward excessively.
Coach should say "chest up" or equivalent.

**Round 3 — Shallow depth**
Only squat to 90 degrees, don't break parallel.
Coach should call out depth.

**Round 4 — Good form**
Do a perfect squat.
Coach should give positive feedback: "Good depth", "That's it"

### If Any Round Fails
The cue didn't come → prompt needs to be more explicit about that fault
The cue was wrong → add clarification to the knowledge base
The cue was too slow → tell Person 1 to reduce frame interval
The cue was too long → add word limit to prompt

### Write Down Your Test Results
Share with the team before the demo so everyone knows
exactly what works and what to show the judges.

---

## Phase 5 — Demo Preparation (Hour 5)

### Your job is to make sure the demo squat is perfect.

The demo flow:
1. Person doing the demo intentionally does a bad squat (knee cave)
2. Coach immediately calls it out
3. Person fixes it
4. Coach confirms: "That's it"

Practice this exact sequence 5 times before the judges arrive.
You should be able to predict exactly what Coach will say.

### Backup Plan
If Gemini Live has latency issues during the demo:
- Do the squat slower and hold the bad position longer
- Give Gemini more time to process the video frame
- Coach will respond — it just might take 3-4 seconds

### Talking Points for the Judges
Be ready to explain:
- "We're using Gemini Live API for real-time video + audio"
- "The model watches continuous video frames and responds with voice"
- "Google Search Grounding backs up the coaching with real sources"
- "The system prompt contains a detailed coaching knowledge base"

---

## Troubleshooting

**Coach not responding to video at all:**
- Check that video frames are actually being sent (ask Person 3)
- Verify the mimeType is `image/jpeg`
- Check Gemini session logs on Person 1's server

**Coach responding with text but no audio:**
- Check response_modalities includes AUDIO
- Make sure the audio is being forwarded to the browser

**Coach hallucinating (saying wrong things):**
- Add more specific fault descriptions to the knowledge base
- Add explicit instruction: "Only cue what you can actually see"

**Latency too high (5+ seconds before Coach responds):**
- Reduce video frame interval: 500ms → 300ms
- This is a network/API issue, not a prompt issue

---

## Your Checklist

- [ ] AI Studio Live API tested and working
- [ ] Squat coaching prompt tested in AI Studio
- [ ] Coaching cues are short, specific, and accurate
- [ ] Knowledge base covers all major squat faults
- [ ] Google Search Grounding enabled and verified
- [ ] Knee cave demo tested — Coach responds correctly
- [ ] Chest forward demo tested — Coach responds correctly
- [ ] Shallow depth demo tested — Coach responds correctly
- [ ] Good form tested — Coach gives positive feedback
- [ ] Demo sequence rehearsed 5 times
- [ ] Talking points prepared for judges