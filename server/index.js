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
const reviewModel = process.env.GEMINI_REVIEW_MODEL || 'gemini-2.5-flash'
const liveModel = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-preview'

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
            text: `Review this completed ${exercise} set. Return a specific 2-3 sentence review in English. Mention at most two faults, or give praise if the set looks good.`
          }
        ]
      }
    ],
    config: {
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

  if (message.text) {
    transcript.hasResponse = true
    transcript.text += message.text
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

async function openLiveSession(browserSocket) {
  const transcript = { text: '', hasResponse: false }

  const session = await genai.live.connect({
    model: liveModel,
    config: {
      systemInstruction: buildSquatPrompt(),
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      temperature: 0.2,
      maxOutputTokens: 180,
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
    const live = await openLiveSession(browserSocket)
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
        const mimeType = message.mimeType || 'video/webm'
        const sizeMb = ((message.data?.length || 0) * 0.75) / 1024 / 1024

        console.log(
          `Recording received (${mimeType}, approx ${sizeMb.toFixed(2)} MB)`
        )
        sendJson(browserSocket, { type: 'review_started' })
        transcript.hasResponse = false

        geminiSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: message.data,
                    mimeType
                  }
                },
                {
                  text: `SET_COMPLETE: The athlete finished one ${exercise} set. Review the recorded video now. Speak first in English only. Give a specific 2-3 sentence opening, with at most two faults or genuine praise.`
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
