import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { GoogleGenAI, Modality } from '@google/genai'
import { WebSocketServer } from 'ws'
import { buildSquatPrompt } from './prompts/squat.js'

dotenv.config({ quiet: true })

const port = process.env.PORT || 8080
const host = process.env.HOST || '127.0.0.1'
const apiKey = process.env.GEMINI_API_KEY
const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview'

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

async function openGeminiSession(browserSocket, exercise) {
  return genai.live.connect({
    model: liveModel,
    config: {
      systemInstruction: getExercisePrompt(exercise),
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      tools: [{ googleSearch: {} }]
    },
    callbacks: {
      onmessage: (message) => {
        const outputText = message.serverContent?.outputTranscription?.text
        const parts = message.serverContent?.modelTurn?.parts || []

        if (outputText?.trim()) {
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
            sendJson(browserSocket, {
              type: 'coach_text',
              text: part.text
            })
          }
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

  console.log(`Browser connected for ${exercise}`)

  try {
    geminiSession = await openGeminiSession(browserSocket, exercise)
    console.log('Gemini Live session opened successfully')
    sendJson(browserSocket, { type: 'session_ready' })

    coachingInterval = setInterval(() => {
      if (videoFrames === 0) {
        console.log('Waiting for video frames from browser...')
        return
      }

      console.log(
        `Forwarded ${videoFrames} video frames and ${audioChunks} audio chunks`
      )

      geminiSession.sendClientContent({
        turns:
          'Analyze the latest camera view. If you see a squat form issue, give one short coaching cue. If form looks good, give one short positive cue.',
        turnComplete: true
      })
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
