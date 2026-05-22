import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { GoogleGenAI, Type } from '@google/genai'
import { WebSocketServer } from 'ws'
import { buildSquatPrompt } from './prompts/squat.js'

dotenv.config({ quiet: true })

const port = process.env.PORT || 8080
const host = process.env.HOST || '127.0.0.1'
const apiKey = process.env.GEMINI_API_KEY
const reviewModel = process.env.GEMINI_REVIEW_MODEL || 'gemini-2.5-flash'

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

function cleanReview(text) {
  return text
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseReviewResponse(text) {
  const cleaned = cleanReview(text)

  try {
    const parsed = JSON.parse(cleaned)
    return cleanReview(parsed.review || '')
  } catch {
    return cleaned
  }
}

async function generateVideoReview({ data, mimeType, exercise }) {
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
            text: `Review this completed ${exercise} set. Coach opens the conversation first. Return a specific 2-3 sentence review in English. Mention at most two faults, or give praise if the set looks good.`
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

  console.log(`Rejected weak review: ${review || '[empty]'}`)
  return 'Nice set. Keep your chest tall and push your knees out over your toes.'
}

wss.on('connection', (browserSocket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const exercise = url.searchParams.get('exercise') || 'squat'

  console.log(`Browser connected for ${exercise}`)
  sendJson(browserSocket, { type: 'session_ready' })

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

        const review = await generateVideoReview({
          data: message.data,
          mimeType,
          exercise
        })

        console.log(`Set review: ${review}`)
        sendJson(browserSocket, {
          type: 'coach_text',
          text: review
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
  })
})
