import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import {
  ActivityHandling,
  GoogleGenAI,
  Modality,
  TurnCoverage,
  Type
} from '@google/genai'
import { WebSocketServer } from 'ws'
import { buildSquatPrompt } from './prompts/squat.js'

dotenv.config({ quiet: true })

const port = process.env.PORT || 8080
const host = process.env.HOST || '127.0.0.1'
const apiKey = process.env.GEMINI_API_KEY
const reviewModel = process.env.GEMINI_REVIEW_MODEL || 'gemini-2.5-flash'
const liveModel =
  process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'

if (!apiKey || apiKey === 'PASTE_THE_KEY_HERE' || apiKey === 'your_key_here') {
  console.error(
    'Missing GEMINI_API_KEY. Add the real key to server/.env before starting.'
  )
  process.exit(1)
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '80mb' }))

const genai = new GoogleGenAI({ apiKey })

app.get('/', (req, res) => {
  res.send('StackDaddy server running')
})

app.get('/grounding-check', async (req, res) => {
  try {
    const response = await genai.models.generateContent({
      model: reviewModel,
      contents:
        'In one short paragraph, why do knees cave inward during squats?',
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        maxOutputTokens: 140
      }
    })

    res.json({
      ok: true,
      text: response.text || ''
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || 'Grounding check failed'
    })
  }
})

const httpServer = app.listen(port, host, () => {
  console.log(`StackDaddy server running at http://${host}:${port}`)
})

httpServer.on('error', (error) => {
  console.error('HTTP server error:', error.message)
})

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 80 * 1024 * 1024
})

wss.on('error', (error) => {
  console.error('WebSocket server error:', error.message)
})

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function cleanText(text) {
  return String(text || '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeVideoMimeType(mimeType = '') {
  const base = mimeType.split(';')[0].trim().toLowerCase()
  if (base === 'video/webm' || base === 'video/mp4') {
    return base
  }
  return 'video/webm'
}

function normalizeFault(fault, index = 0) {
  const start = Math.max(0, Number(fault?.timestamp_start) || 0)
  const end = Math.max(start + 1.5, Number(fault?.timestamp_end) || start + 3)
  const type = cleanText(fault?.fault_type || fault?.fault || 'form issue')

  return {
    rep: Math.max(1, Number(fault?.rep) || index + 1),
    timestamp_start: start,
    timestamp_end: end,
    fault_type: type,
    fault: type,
    explanation: cleanText(fault?.explanation || 'Form issue detected.'),
    cue: cleanText(fault?.cue || cueForFault(type)),
    confidence: Number(fault?.confidence) || 0.7,
    source: cleanText(fault?.source || 'analysis')
  }
}

function normalizePoseAnalysis(raw) {
  if (!raw || typeof raw !== 'object') return null

  return {
    source: cleanText(raw.source || 'local_pose'),
    analysis_model: cleanText(raw.analysis_model || 'unknown'),
    total_reps: Math.max(0, Number(raw.total_reps) || 0),
    tracked_frames: Math.max(0, Number(raw.tracked_frames) || 0),
    usable_frames: Math.max(0, Number(raw.usable_frames) || 0),
    motion_active_ratio: Math.max(0, Math.min(1, Number(raw.motion_active_ratio) || 0)),
    average_confidence: Math.max(0, Math.min(1, Number(raw.average_confidence) || 0)),
    guidance: cleanText(raw.guidance),
    faults: Array.isArray(raw.faults)
      ? raw.faults.slice(0, 2).map(normalizeFault)
      : [],
    frames: Array.isArray(raw.frames)
      ? raw.frames.slice(0, 260).map((frame) => ({
          timestamp_ms: Number(frame?.timestamp_ms) || 0,
          phase: cleanText(frame?.phase || ''),
          knee_angle: Number(frame?.knee_angle) || null,
          handstand_line:
            frame?.handstand_line && typeof frame.handstand_line === 'object'
              ? frame.handstand_line
              : null,
          points: frame?.points && typeof frame.points === 'object' ? frame.points : {}
        }))
      : [],
    reps: Array.isArray(raw.reps) ? raw.reps.slice(0, 12) : []
  }
}

function poseAnalysisIsUsable(analysis) {
  return (
    analysis &&
    analysis.total_reps > 0 &&
    analysis.usable_frames >= 10 &&
    analysis.average_confidence >= 0.45
  )
}

function cueForFault(type) {
  const fault = type.toLowerCase()
  if (fault.includes('shoulder')) return 'Push tall through your shoulders.'
  if (fault.includes('arch') || fault.includes('line')) return 'Stack ribs over hips.'
  if (fault.includes('elbow')) return 'Lock your elbows and press tall.'
  if (fault.includes('knee')) return 'Push your knees out over your toes.'
  if (fault.includes('depth') || fault.includes('shallow')) {
    return 'Sit deeper, hips below knees.'
  }
  if (fault.includes('chest') || fault.includes('torso')) {
    return 'Chest up and brace.'
  }
  return 'Slow down and control the rep.'
}

function fallbackPraise(analysis, exercise = 'squat') {
  if (exercise === 'handstand') {
    if (poseAnalysisIsUsable(analysis)) {
      return 'Solid hold. Your line stayed readable from this angle. Ask me anything about your handstand.'
    }
    return 'I could not track the full handstand clearly. Try a side angle with wrists, shoulders, hips, and ankles visible.'
  }

  if (poseAnalysisIsUsable(analysis)) {
    return 'Strong set. Your squat reps stayed controlled. Ask me anything about your form.'
  }
  return 'I could not track the full squat clearly. Try a side or slight front angle with your full body visible.'
}

function buildFaultAnalysisPrompt(exercise = 'squat') {
  if (exercise === 'handstand') {
    return `Analyze this handstand video. Return ONLY valid JSON, no markdown:
{
  "total_reps": 0,
  "faults": [
    {
      "rep": 1,
      "timestamp_start": 1.0,
      "timestamp_end": 3.5,
      "fault_type": "arched handstand line",
      "explanation": "Hips drifted away from the wrist-to-ankle line.",
      "cue": "Stack ribs over hips."
    }
  ]
}

Rules:
- Only include clearly visible alignment faults.
- Return at most 2 faults total.
- Priority order: shoulders not stacked, arched handstand line, hips piked, bent elbows.
- If there is no clear inverted handstand hold, total_reps must be 0 and faults must be an empty array.
- Keep explanations short and specific.`
  }

  return `Analyze this squat set video. Return ONLY valid JSON, no markdown:
{
  "total_reps": 0,
  "faults": [
    {
      "rep": 3,
      "timestamp_start": 7.0,
      "timestamp_end": 10.2,
      "fault_type": "knee cave",
      "explanation": "Knees collapsed inward at the bottom of the squat.",
      "cue": "Push your knees out over your toes."
    }
  ]
}

Rules:
- Only include reps with clear visible faults.
- Return at most 2 faults total.
- timestamp_start is 0.5 seconds before the fault is visible.
- timestamp_end is 0.5 seconds after the rep completes.
- Priority order: knee cave, shallow depth, chest forward.
- Do not use generic body movement as a rep. Walking toward or away from the camera is not a squat.
- If no clear faults, faults must be an empty array.
- Keep explanations short and specific.`
}

function parseFaultAnalysis(rawText) {
  const trimmed = cleanText(rawText)
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const payload = jsonMatch ? jsonMatch[0] : trimmed

  try {
    const parsed = JSON.parse(payload)
    return {
      total_reps: Math.max(0, Number(parsed.total_reps) || 0),
      faults: Array.isArray(parsed.faults)
        ? parsed.faults.slice(0, 2).map(normalizeFault)
        : []
    }
  } catch {
    return { total_reps: 0, faults: [] }
  }
}

async function reviewWithFlash({ data, mimeType, exercise }) {
  const started = Date.now()
  const response = await genai.models.generateContent({
    model: reviewModel,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data,
              mimeType
            }
          },
          {
            text: buildFaultAnalysisPrompt(exercise)
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          total_reps: { type: Type.NUMBER },
          faults: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                rep: { type: Type.NUMBER },
                timestamp_start: { type: Type.NUMBER },
                timestamp_end: { type: Type.NUMBER },
                fault_type: { type: Type.STRING },
                explanation: { type: Type.STRING },
                cue: { type: Type.STRING }
              }
            }
          }
        }
      },
      temperature: 0.2,
      maxOutputTokens: 512
    }
  })

  const result = parseFaultAnalysis(response.text || '')
  console.log(
    `Flash fallback analysis done in ${Date.now() - started}ms; ${result.faults.length} fault(s)`
  )
  return result
}

function buildCoachContextMessage(faults, poseAnalysis, exercise = 'squat') {
  if (!faults.length) {
    return fallbackPraise(poseAnalysis, exercise)
  }

  const faultLines = faults
    .map(
      (fault, index) =>
        `${index + 1}. Rep ${fault.rep} - ${fault.fault_type}: ${fault.explanation} Cue: ${fault.cue}`
    )
    .join('\n')

  const metrics =
    poseAnalysis && poseAnalysisIsUsable(poseAnalysis)
      ? `\nLocal joint analysis: ${poseAnalysis.total_reps} rep(s), confidence ${poseAnalysis.average_confidence}, active motion ratio ${poseAnalysis.motion_active_ratio ?? 'unknown'}.\n${summarizeJointAnalysis(poseAnalysis)}`
      : ''

  const movementLabel = exercise === 'handstand' ? 'handstand' : 'squat'

  return `Use these reviewed ${movementLabel} faults as ground truth. Do not invent other faults.${metrics}

Faults:
${faultLines}

Open immediately with the first fault in 2 short sentences. Say the cue exactly once. Then ask, "Any questions?" Wait for follow-up.`
}

function summarizeJointAnalysis(poseAnalysis) {
  const reps = Array.isArray(poseAnalysis?.reps) ? poseAnalysis.reps.slice(0, 5) : []
  if (!reps.length) return 'No reliable per-rep joint metrics were captured.'

  return reps
    .map((rep) => {
      const parts = [
        `rep ${rep.rep}`,
        `knee ${rep.min_knee_angle ?? 'n/a'} deg`,
        `hip ${rep.min_hip_angle ?? 'n/a'} deg`,
        `torso ${rep.torso_lean ?? 'n/a'} deg`,
        `depth ${rep.depth_delta ?? 'n/a'}`,
        `knee/ankle width ${rep.knee_ankle_width_ratio ?? 'n/a'}`,
        `ankle/hip width ${rep.ankle_hip_width_ratio ?? 'n/a'}`,
        `asymmetry ${rep.knee_angle_asymmetry ?? 'n/a'} deg`
      ]
      return parts.join(', ')
    })
    .join('\n')
}

function coachTextFallback(faults, poseAnalysis, exercise = 'squat') {
  if (!faults.length) return fallbackPraise(poseAnalysis, exercise)

  const first = faults[0]
  const second = faults[1]
  const extra = second
    ? ` Also watch rep ${second.rep}: ${second.cue}`
    : ' Any questions?'

  return `Rep ${first.rep}: ${first.explanation} ${first.cue}${extra}`
}

function chooseReviewFaults(flashFaults, poseAnalysis, exercise = 'squat') {
  const localFaults = Array.isArray(poseAnalysis?.faults) ? poseAnalysis.faults : []

  if (exercise === 'squat') {
    if (poseAnalysisIsUsable(poseAnalysis) && localFaults.length > 0) {
      return localFaults.slice(0, 2)
    }
    return flashFaults.slice(0, 2)
  }

  if (flashFaults.length > 0) return flashFaults.slice(0, 2)
  return localFaults.slice(0, 2)
}

function sendTextTurn(geminiSession, text) {
  geminiSession.sendRealtimeInput({ activityStart: {} })
  geminiSession.sendRealtimeInput({ text })
  geminiSession.sendRealtimeInput({ activityEnd: {} })
}

function buildLiveSystemPrompt(exercise = 'squat') {
  if (exercise !== 'handstand') return buildSquatPrompt()

  return `
LANGUAGE:
- Speak and write only in English.

ROLE:
You are Coach, an expert calisthenics coach reviewing one recorded handstand set.

MODE:
- Do not coach while the athlete is recording.
- After the set is reviewed, answer in short spoken coaching responses.
- For follow-up questions, use the reviewed set and the handstand line overlay as context.

HANDSTAND PRIORITIES:
1. Shoulders stacked over wrists.
2. Ribs, hips, and ankles stacked in one line.
3. Elbows locked.
4. Controlled entry and exit.

STYLE:
- Give one correction at a time.
- Keep cues short and practical.
- Do not diagnose injuries.
- If tracking was unclear, say what was not visible.
`
}

function forwardLiveMessage(browserSocket, message, transcript) {
  const parts = message.serverContent?.modelTurn?.parts || []

  for (const part of parts) {
    if (part.inlineData?.data) {
      transcript.hasResponse = true
      console.log(`Forwarding Coach audio (${part.inlineData.mimeType || 'audio/pcm'})`)
      sendJson(browserSocket, {
        type: 'coach_audio',
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
      })
    }

    if (part.text) {
      transcript.hasResponse = true
      transcript.text += part.text
    }
  }

  const outputText = message.serverContent?.outputTranscription?.text
  if (outputText) {
    transcript.hasResponse = true
    transcript.text += outputText
  }

  const inputText = message.serverContent?.inputTranscription?.text
  if (inputText) {
    sendJson(browserSocket, {
      type: 'user_text',
      text: cleanText(inputText)
    })
  }

  if (
    transcript.text &&
    (message.serverContent?.generationComplete || message.serverContent?.turnComplete)
  ) {
    const text = cleanText(transcript.text)
    transcript.text = ''

    if (text) {
      console.log(`Forwarding Coach text: ${text}`)
      sendJson(browserSocket, {
        type: 'coach_text',
        text
      })
    }
  }
}

async function openLiveSession(browserSocket, exercise) {
  const transcript = { text: '', hasResponse: false }

  const session = await genai.live.connect({
    model: liveModel,
    config: {
      systemInstruction: buildLiveSystemPrompt(exercise),
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      temperature: 0.2,
      maxOutputTokens: 180,
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: true
        },
        activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
        turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY
      },
      thinkingConfig: {
        thinkingLevel: 'low'
      },
      tools: [{ googleSearch: {} }]
    },
    callbacks: {
      onopen: () => {
        console.log(`Gemini Live session opened (${liveModel})`)
      },
      onmessage: (message) => {
        forwardLiveMessage(browserSocket, message, transcript)
      },
      onerror: (error) => {
        console.error('Gemini Live error:', error)
        sendJson(browserSocket, {
          type: 'error',
          message: error?.message || 'Gemini Live error'
        })
      },
      onclose: () => {
        console.log('Gemini Live session closed')
      }
    }
  })

  return { session, transcript }
}

wss.on('connection', async (browserSocket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const exercise = url.searchParams.get('exercise') || 'squat'
  let geminiSession = null
  let transcript = null
  let fallbackTimer = null

  console.log(`Browser connected for ${exercise}`)

  try {
    const live = await openLiveSession(browserSocket, exercise)
    geminiSession = live.session
    transcript = live.transcript
    sendJson(browserSocket, { type: 'session_ready' })
  } catch (error) {
    console.error('Failed to open Gemini Live session:', error)
    sendJson(browserSocket, {
      type: 'error',
      message: 'Failed to connect to Coach. Check the API key and Live model.'
    })
    return
  }

  browserSocket.on('message', async (rawData) => {
    try {
      const message = JSON.parse(rawData.toString())

      if (message.type === 'recording_complete') {
        const mimeType = normalizeVideoMimeType(message.mimeType)
        const sizeMb = ((message.data?.length || 0) * 0.75) / 1024 / 1024
        const poseAnalysis = normalizePoseAnalysis(message.poseAnalysis)

        console.log(
          `Recording received (${mimeType}, approx ${sizeMb.toFixed(2)} MB)`
        )
        sendJson(browserSocket, { type: 'review_started' })

        let flashFaults = []

        if (poseAnalysisIsUsable(poseAnalysis)) {
          console.log(
            `Local pose analysis available: ${poseAnalysis.total_reps} rep(s), ${poseAnalysis.faults.length} fault(s), confidence ${poseAnalysis.average_confidence}`
          )
        } else {
          console.warn('Local pose analysis unavailable or low confidence')
        }

        const result = await reviewWithFlash({
          data: message.data,
          mimeType,
          exercise
        })
        flashFaults = result.faults

        const faults = chooseReviewFaults(flashFaults, poseAnalysis, exercise)

        transcript.hasResponse = false
        transcript.text = ''

        sendTextTurn(geminiSession, buildCoachContextMessage(faults, poseAnalysis, exercise))

        sendJson(browserSocket, {
          type: 'review_ready',
          faults,
          poseAnalysis,
          videoMime: mimeType
        })

        clearTimeout(fallbackTimer)
        fallbackTimer = setTimeout(() => {
          if (
            transcript.hasResponse ||
            browserSocket.readyState !== browserSocket.OPEN
          ) {
            return
          }

          console.warn('Gemini Live did not answer in time; sending text fallback')
          transcript.hasResponse = true
          sendJson(browserSocket, {
            type: 'coach_text',
            text: coachTextFallback(faults, poseAnalysis, exercise)
          })
        }, 16_000)

        console.log(`review_ready sent with ${faults.length} fault(s)`)
      }

      if (message.type === 'next_rep') {
        transcript.hasResponse = false
        transcript.text = ''
        sendTextTurn(
          geminiSession,
          `NEXT_REP: Rep ${message.rep} - ${message.faultType}. Explain this fault in 2 short sentences, give one cue, then ask "Any questions?".`
        )
      }

      if (message.type === 'call_control') {
        if (message.action === 'stop') {
          console.log('Follow-up call stopped')
          clearTimeout(fallbackTimer)
          transcript.hasResponse = false
          const userTranscript = cleanText(message.transcript)

          if (userTranscript) {
            geminiSession.sendRealtimeInput({
              text: `The athlete asked: "${userTranscript}". Answer briefly, use the reviewed ${exercise} set as context, and give one practical next step.`
            })
          }

          geminiSession.sendRealtimeInput({ activityEnd: {} })
          fallbackTimer = setTimeout(() => {
            if (
              transcript.hasResponse ||
              browserSocket.readyState !== browserSocket.OPEN
            ) {
              return
            }

            sendJson(browserSocket, {
              type: 'coach_text',
              text: 'I did not catch a clear question. Start Call and ask again in one sentence.'
            })
          }, 12_000)
        }

        if (message.action === 'start') {
          console.log('Follow-up call started')
          clearTimeout(fallbackTimer)
          transcript.hasResponse = false
          transcript.text = ''
          geminiSession.sendRealtimeInput({ activityStart: {} })
        }
      }

      if (message.type === 'audio_chunk') {
        geminiSession.sendRealtimeInput({
          audio: {
            data: message.data,
            mimeType: 'audio/pcm;rate=16000'
          }
        })
      }
    } catch (error) {
      console.error('Error handling browser message:', error)
      sendJson(browserSocket, {
        type: 'error',
        message: 'Failed to analyze set'
      })
    }
  })

  browserSocket.on('close', () => {
    console.log('Browser disconnected')
    clearTimeout(fallbackTimer)
    geminiSession?.close()
  })
})
