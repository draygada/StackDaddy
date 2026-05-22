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
const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview'
const textModel = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash'
const responseModality =
  process.env.GEMINI_RESPONSE_MODALITY === 'AUDIO' ? Modality.AUDIO : Modality.TEXT

if (!apiKey || apiKey === 'PASTE_THE_KEY_HERE' || apiKey === 'your_key_here') {
  console.error('Missing GEMINI_API_KEY. Add the real key to server/.env before starting.')
  process.exit(1)
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/', (req, res) => {
  res.send('StackDaddy server running')
})

app.get('/grounding-check', async (req, res) => {
  try {
    const response = await genai.models.generateContent({
      model: textModel,
      contents:
        'In one short paragraph, why do knees cave inward during squats?',
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        maxOutputTokens: 120
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

const wss = new WebSocketServer({ server: httpServer })
const genai = new GoogleGenAI({ apiKey })

httpServer.on('error', (error) => {
  console.error('HTTP server error:', error.message)
})

wss.on('error', (error) => {
  console.error('WebSocket server error:', error.message)
})

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function getExercisePrompt(exercise) {
  if (exercise === 'squat') return buildSquatPrompt()
  return buildSquatPrompt()
}

function cleanCue(text) {
  return text
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUsableCue(cue) {
  const words = cue.split(/\s+/).filter(Boolean)
  return cue.length >= 4 && words.length >= 2 && words.length <= 10
}

function parseCueResponse(text) {
  const cleaned = cleanCue(text)

  try {
    const parsed = JSON.parse(cleaned)
    return cleanCue(parsed.cue || '')
  } catch {
    return cleaned
  }
}

async function generateFrameCue({ frame, exercise, lastCue }) {
  const response = await genai.models.generateContent({
    model: textModel,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: frame,
              mimeType: 'image/jpeg'
            }
          },
          {
            text: `Analyze this latest ${exercise} frame. Choose the best cue right now. Use one of the cue styles from the system instructions. Do not repeat this previous cue: ${lastCue || 'none'}.`
          }
        ]
      }
    ],
    config: {
      systemInstruction: getExercisePrompt(exercise),
      temperature: 0,
      maxOutputTokens: 48,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cue: {
            type: Type.STRING
          }
        },
        required: ['cue']
      }
    }
  })

  const cue = parseCueResponse(response.text || '')

  if (isUsableCue(cue)) return cue

  console.log(`Rejected weak fallback cue: ${cue || '[empty]'}`)
  return lastCue === 'Chest up' ? 'Push your knees out' : 'Chest up'
}

async function openGeminiSession(browserSocket, exercise) {
  return genai.live.connect({
    model: liveModel,
    config: {
      systemInstruction: getExercisePrompt(exercise),
      responseModalities: [responseModality],
      tools: [{ googleSearch: {} }]
    },
    callbacks: {
      onmessage: (message) => {
        const outputText = message.serverContent?.outputTranscription?.text
        const parts = message.serverContent?.modelTurn?.parts || []
        const textParts = []

        if (outputText?.trim()) {
          console.log(`Gemini cue: ${outputText.trim()}`)
          sendJson(browserSocket, {
            type: 'coach_text',
            text: outputText.trim()
          })
        }

        for (const part of parts) {
          if (part.inlineData?.data) {
            sendJson(browserSocket, {
              type: 'coach_audio',
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType
            })
          }

          if (part.text) {
            textParts.push(part.text)
          }
        }

        if (textParts.length > 0) {
          const text = textParts.join(' ').trim()
          console.log(`Gemini cue: ${text}`)
          sendJson(browserSocket, {
            type: 'coach_text',
            text
          })
        }

        if (message.serverContent?.turnComplete) {
          console.log('Gemini turn complete')
        }
      },
      onerror: (error) => {
        console.error('Gemini error:', error)
        sendJson(browserSocket, {
          type: 'error',
          message: error?.message || 'Gemini session error'
        })
      },
      onclose: () => {
        console.log('Gemini session closed')
      }
    }
  })
}

wss.on('connection', async (browserSocket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const exercise = url.searchParams.get('exercise') || 'squat'
  let geminiSession = null
  let coachingInterval = null
  let videoFrames = 0
  let audioChunks = 0
  let latestFrame = null
  let lastCue = ''
  let fallbackBusy = false

  console.log(`Browser connected for ${exercise}`)

  try {
    geminiSession = await openGeminiSession(browserSocket, exercise)
    console.log(`Gemini Live session opened successfully (${responseModality})`)
    sendJson(browserSocket, { type: 'session_ready' })

    coachingInterval = setInterval(async () => {
      if (videoFrames === 0) {
        console.log('Waiting for video frames from browser...')
        return
      }

      console.log(
        `Forwarded ${videoFrames} video frames and ${audioChunks} audio chunks`
      )

      geminiSession.sendClientContent({
        turns:
          'Analyze the latest camera view. Give exactly one short squat coaching cue now. Maximum 8 words.',
        turnComplete: true
      })

      if (!latestFrame || fallbackBusy) return

      fallbackBusy = true
      try {
        const cue = await generateFrameCue({
          frame: latestFrame,
          exercise,
          lastCue
        })

        if (cue) {
          lastCue = cue
          console.log(`Fallback cue: ${cue}`)
          sendJson(browserSocket, {
            type: 'coach_text',
            text: cue
          })
        } else {
          console.log('Fallback cue was empty')
        }
      } catch (error) {
        console.error('Fallback cue error:', error?.message || error)
      } finally {
        fallbackBusy = false
      }
    }, 5000)
  } catch (error) {
    console.error('Failed to open Gemini session:', error)
    sendJson(browserSocket, {
      type: 'error',
      message: 'Failed to connect to StackDaddy. Check the API key.'
    })
    browserSocket.close()
    return
  }

  browserSocket.on('message', async (rawData) => {
    try {
      const message = JSON.parse(rawData.toString())

      if (message.type === 'video_frame') {
        videoFrames += 1
        latestFrame = message.data
        geminiSession.sendRealtimeInput({
          video: {
            data: message.data,
            mimeType: 'image/jpeg'
          }
        })
      }

      if (message.type === 'audio_chunk') {
        audioChunks += 1
        geminiSession.sendRealtimeInput({
          audio: {
            data: message.data,
            mimeType: 'audio/pcm;rate=16000'
          }
        })
      }
    } catch (error) {
      console.error('Error forwarding browser data to Gemini:', error)
    }
  })

  browserSocket.on('close', async () => {
    console.log('Browser disconnected')
    clearInterval(coachingInterval)

    if (geminiSession) {
      try {
        await geminiSession.close()
      } catch (error) {
        console.error('Error closing Gemini session:', error)
      }
    }
  })
})
