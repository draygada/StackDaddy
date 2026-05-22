import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { GoogleGenAI, Modality, Type } from '@google/genai'
import { WebSocketServer } from 'ws'
import { buildSquatPrompt } from './prompts/squat.js'

dotenv.config({ quiet: true })

const port = process.env.PORT || 8080
const host = process.env.HOST || '127.0.0.1'
const apiKey = process.env.GEMINI_API_KEY
const reviewModel = process.env.GEMINI_REVIEW_MODEL || 'gemini-2.0-flash'
const liveModel =
  process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'

if (!apiKey || apiKey === 'PASTE_THE_KEY_HERE' || apiKey === 'your_key_here') {
  console.error('Missing GEMINI_API_KEY. Add the real key to server/.env before starting.')
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
  return text
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

<<<<<<< HEAD
function parseReviewResponse(text) {
  const cleaned = cleanText(text)

  try {
    const parsed = JSON.parse(cleaned)
    return cleanText(parsed.review || '')
  } catch {
    return cleaned
  }
}

async function generateTextFallbackReview({ data, mimeType, exercise }) {
=======
function normalizeVideoMimeType(mimeType = '') {
  const base = mimeType.split(';')[0].trim().toLowerCase()
  if (base === 'video/webm' || base === 'video/mp4') {
    return base
  }
  return 'video/webm'
}

// — Flash fault analysis —

function buildFaultAnalysisPrompt() {
  return `Analyze this squat set video. Return ONLY valid JSON, no markdown, no other text:
{
  "total_reps": 0,
  "faults": [
    {
      "rep": 3,
      "timestamp_start": 7.0,
      "timestamp_end": 10.2,
      "fault_type": "knee cave",
      "explanation": "Knees collapsed inward at the bottom of the squat."
    }
  ]
}

Rules:
- Only include reps with clear visible faults (max 2 total)
- timestamp_start is 0.5 seconds before the fault is visible
- timestamp_end is 0.5 seconds after the rep completes
- Priority order: knee cave first, then depth, then chest forward
- If no clear faults, faults must be an empty array`
}

function parseFaultAnalysis(rawText) {
  const trimmed = (rawText || '').trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const payload = jsonMatch ? jsonMatch[0] : trimmed

  try {
    const parsed = JSON.parse(payload)
    const totalReps = Math.max(0, Number(parsed.total_reps) || 0)
    const faults = Array.isArray(parsed.faults)
      ? parsed.faults
          .filter((f) => f && Number(f.rep) > 0)
          .slice(0, 2)
          .map((f) => ({
            rep: Number(f.rep),
            timestamp_start: Math.max(0, Number(f.timestamp_start) || 0),
            timestamp_end: Math.max(0, Number(f.timestamp_end) || 0),
            fault_type: cleanText(String(f.fault_type || 'form issue')),
            explanation: cleanText(String(f.explanation || ''))
          }))
          .map((f) => ({
            ...f,
            timestamp_end:
              f.timestamp_end > f.timestamp_start
                ? f.timestamp_end
                : f.timestamp_start + 2.5
          }))
      : []

    return { total_reps: totalReps, faults }
  } catch {
    return { total_reps: 0, faults: [] }
  }
}

async function reviewWithFlash({ data, mimeType }) {
  const started = Date.now()
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654
  const response = await genai.models.generateContent({
    model: reviewModel,
    contents: [
      {
        role: 'user',
        parts: [
<<<<<<< HEAD
          {
            inlineData: {
              data,
              mimeType
            }
          },
          {
            text: `Review this completed ${exercise} set. Return a specific 2-3 sentence review in English. Mention at most two faults, or give praise if the set looks good.`
          }
=======
          { inlineData: { data, mimeType } },
          { text: buildFaultAnalysisPrompt() }
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654
        ]
      }
    ],
    config: {
<<<<<<< HEAD
      systemInstruction: buildSquatPrompt(),
      temperature: 0.2,
      maxOutputTokens: 160,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          review: {
            type: Type.STRING
          }
        },
        required: ['review']
      }
    }
  })

  const review = parseReviewResponse(response.text || '')

  if (review.length >= 20) return review

  return 'Nice set. Keep your chest tall and push your knees out over your toes.'
}

function forwardLiveMessage(browserSocket, message, transcript) {
=======
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 512
    }
  })

  const result = parseFaultAnalysis(response.text || '')
  console.log(
    `Flash analysis done in ${Date.now() - started}ms — ${result.faults.length} fault(s)`
  )
  return result
}

// — Gemini Live session —

function buildCoachContextMessage(faults) {
  if (faults.length === 0) {
    return `The athlete's squat set looked clean — no clear faults detected. Give them one sentence of genuine praise and invite any questions.`
  }

  const faultLines = faults
    .map((f, i) => `${i + 1}. Rep ${f.rep} — ${f.fault_type}: ${f.explanation}`)
    .join('\n')

  return `You are now reviewing this squat set. Faults found:\n\n${faultLines}\n\nBegin immediately: explain Rep ${faults[0].rep}'s fault in 2 sentences max, then ask exactly "Any questions?" and wait. When you receive a NEXT_REP signal, explain the next fault the same way. When all faults are covered, close with one sentence of encouragement.`
}

function injectCoachContext(geminiSession, faults) {
  geminiSession.sendClientContent({
    turns: [
      {
        role: 'user',
        parts: [{ text: buildCoachContextMessage(faults) }]
      }
    ],
    turnComplete: true
  })
}

function forwardLiveMessage(browserSocket, message, transcript, liveState) {
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654
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
      liveState.voiceStarted = true
    }

<<<<<<< HEAD
    if (part.text) {
      transcript.hasResponse = true
=======
    if (part.text && !liveState.muteTextToClient) {
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654
      transcript.text += part.text
    }
  }

  const outputText = message.serverContent?.outputTranscription?.text
<<<<<<< HEAD
  if (outputText) {
    transcript.hasResponse = true
    transcript.text += outputText
  }

  if (message.text) {
    transcript.hasResponse = true
=======
  if (outputText && !liveState.muteTextToClient) {
    transcript.text += outputText
  }

  if (message.text && !liveState.muteTextToClient) {
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654
    transcript.text += message.text
  }

  if (
    transcript.text &&
    !liveState.muteTextToClient &&
    (message.serverContent?.generationComplete || message.serverContent?.turnComplete)
  ) {
    const text = cleanText(transcript.text)
    transcript.text = ''

    if (text) {
<<<<<<< HEAD
      console.log(`Forwarding Coach text: ${text}`)
      sendJson(browserSocket, {
        type: 'coach_text',
        text
      })
=======
      sendJson(browserSocket, { type: 'coach_text', text })
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654
    }
  }

  if (message.serverContent?.turnComplete) {
    liveState.muteTextToClient = false
  }

  // Forward user speech transcription so the frontend can show it in the chat
  const inputText = message.serverContent?.inputTranscription?.text
  if (inputText) {
    sendJson(browserSocket, { type: 'user_text', text: cleanText(inputText) })
  }
}

<<<<<<< HEAD
async function openLiveSession(browserSocket) {
  const transcript = { text: '', hasResponse: false }
=======
async function openLiveSession(browserSocket, liveState) {
  const transcript = { text: '' }
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654

  const session = await genai.live.connect({
    model: liveModel,
    config: {
      systemInstruction: buildSquatPrompt(),
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      temperature: 0.2,
      maxOutputTokens: 180,
      tools: [{ googleSearch: {} }]
    },
    callbacks: {
      onopen: () => {
        console.log(`Gemini Live session opened (${liveModel})`)
      },
      onmessage: (message) => {
        forwardLiveMessage(browserSocket, message, transcript, liveState)
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
  const liveState = {
    muteTextToClient: false,
    voiceStarted: false
  }
  let geminiSession = null
  let transcript = null
  let fallbackTimer = null

  console.log(`Browser connected for ${exercise}`)

  try {
<<<<<<< HEAD
    const live = await openLiveSession(browserSocket)
    geminiSession = live.session
    transcript = live.transcript
=======
    geminiSession = await openLiveSession(browserSocket, liveState)
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654
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

        console.log(
          `Recording received (${mimeType}, approx ${sizeMb.toFixed(2)} MB)`
        )
<<<<<<< HEAD
        sendJson(browserSocket, { type: 'review_started' })
        transcript.hasResponse = false
=======
>>>>>>> c7dfe4ed97fa69b669d2b9277eef43d736066654

        // Run Flash fault analysis
        let faults = []
        try {
          const result = await reviewWithFlash({ data: message.data, mimeType })
          faults = result.faults
        } catch (error) {
          console.error('Flash fault analysis failed:', error)
          // Continue with empty faults — Coach will give general praise
        }

        // Inject fault context into the Live session (runs in parallel)
        try {
          injectCoachContext(geminiSession, faults)
        } catch (error) {
          console.error('Failed to inject coach context:', error)
        }

        // Send review_ready so the frontend can navigate to the Review Page
        sendJson(browserSocket, {
          type: 'review_ready',
          faults,
          videoMime: mimeType
        })

        console.log(`review_ready sent with ${faults.length} fault(s)`)
      }

      if (message.type === 'next_rep') {
        geminiSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: `NEXT_REP: Rep ${message.rep} — ${message.faultType}`
                }
              ]
            }
          ],
          turnComplete: true
        })

        fallbackTimer = setTimeout(async () => {
          if (transcript.hasResponse || browserSocket.readyState !== browserSocket.OPEN) {
            return
          }

          console.warn('Gemini Live did not respond in time; using text fallback')

          try {
            const review = await generateTextFallbackReview({
              data: message.data,
              mimeType,
              exercise
            })

            transcript.hasResponse = true
            sendJson(browserSocket, {
              type: 'coach_text',
              text: review
            })
          } catch (error) {
            console.error('Fallback review failed:', error)
            sendJson(browserSocket, {
              type: 'error',
              message: 'Coach timed out while reviewing the set'
            })
          }
        }, 30000)
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
