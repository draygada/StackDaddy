import { useCallback, useEffect, useRef, useState } from 'react'
import { createPoseAnalyzer } from '../utils/squatPoseAnalyzer'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8080'
const MAX_RECORDING_MS = 15_000

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function cleanTranscript(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

const COACH_PCM_SAMPLE_RATE = 24000

function getPcmSampleRate(mimeType = '') {
  const match = mimeType.match(/rate=(\d+)/)
  return match ? Number(match[1]) : COACH_PCM_SAMPLE_RATE
}

function isPcmMimeType(mimeType = '') {
  const lower = mimeType.toLowerCase()
  return (
    lower.includes('pcm') ||
    lower.includes('l16') ||
    lower.startsWith('audio/raw')
  )
}

function normalizeVideoMimeType(mimeType = '') {
  const base = mimeType.split(';')[0].trim().toLowerCase()
  if (base === 'video/webm' || base === 'video/mp4') {
    return base
  }
  return 'video/webm'
}

function getRecorderOptions() {
  const candidates = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ]

  const mimeType = candidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  )

  const videoOnly = mimeType && !mimeType.includes('opus')

  return mimeType
    ? {
        mimeType,
        videoBitsPerSecond: 400_000,
        ...(videoOnly ? {} : { audioBitsPerSecond: 32_000 })
      }
    : {}
}

function getRecordingStream(stream) {
  const videoOnly = new MediaStream(stream.getVideoTracks())
  return videoOnly.getVideoTracks().length > 0 ? videoOnly : stream
}

let msgIdCounter = 0
function nextMsgId() {
  msgIdCounter += 1
  return msgIdCounter
}

export function useCoachSession(exercise) {
  const [status, setStatus] = useState('connecting')
  const [currentCue, setCurrentCue] = useState('')
  const [cueVisible, setCueVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [reviewFaults, setReviewFaults] = useState(null)
  const [reviewPoseAnalysis, setReviewPoseAnalysis] = useState(null)
  const [reviewVideoUrl, setReviewVideoUrl] = useState(null)
  const [conversationMessages, setConversationMessages] = useState([])
  const [callActive, setCallActive] = useState(false)
  const [callStatus, setCallStatus] = useState('paused')
  const [liveUserTranscript, setLiveUserTranscript] = useState('')

  const captureContextRef = useRef(null)
  const callActiveRef = useRef(false)
  const playbackContextRef = useRef(null)
  const playbackCursorRef = useRef(0)
  const chunksRef = useRef([])
  const poseAnalyzerRef = useRef(null)
  const poseSamplingRef = useRef(null)
  const playbackDoneTimerRef = useRef(null)
  const recordingUrlRef = useRef(null)
  const cueTimerRef = useRef(null)
  const followUpStartedRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const recordingTimerRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const interimTranscriptRef = useRef('')
  const mediaSourceRef = useRef(null)
  const processorRef = useRef(null)
  const silentGainRef = useRef(null)
  const speechRecognitionRef = useRef(null)
  const statusRef = useRef(status)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    callActiveRef.current = callActive
  }, [callActive])

  const showCue = useCallback((text, duration = 8000) => {
    window.clearTimeout(cueTimerRef.current)
    setCurrentCue(text)
    setCueVisible(true)
    cueTimerRef.current = window.setTimeout(() => {
      setCueVisible(false)
    }, duration)
  }, [])

  const addMessage = useCallback((role, text) => {
    const cleaned = cleanTranscript(text)
    if (!cleaned) return

    setConversationMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === role && last.text === cleaned) return prev

      return [
        ...prev,
        { id: nextMsgId(), role, text: cleaned }
      ]
    })
  }, [])

  const stopLocalTranscription = useCallback(() => {
    const recognition = speechRecognitionRef.current
    speechRecognitionRef.current = null

    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      try {
        recognition.stop()
      } catch {
        // Speech recognition may already be stopped by the browser.
      }
    }

    const transcript = cleanTranscript(
      `${finalTranscriptRef.current} ${interimTranscriptRef.current}`
    )
    finalTranscriptRef.current = transcript
    interimTranscriptRef.current = ''
    setLiveUserTranscript(transcript)

    return transcript
  }, [])

  const startLocalTranscription = useCallback(() => {
    stopLocalTranscription()
    finalTranscriptRef.current = ''
    interimTranscriptRef.current = ''
    setLiveUserTranscript('')

    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let finalChunk = ''
      let interimChunk = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = cleanTranscript(result[0]?.transcript)

        if (!text) continue

        if (result.isFinal) {
          finalChunk = cleanTranscript(`${finalChunk} ${text}`)
        } else {
          interimChunk = cleanTranscript(`${interimChunk} ${text}`)
        }
      }

      if (finalChunk) {
        finalTranscriptRef.current = cleanTranscript(
          `${finalTranscriptRef.current} ${finalChunk}`
        )
      }

      interimTranscriptRef.current = interimChunk
      setLiveUserTranscript(
        cleanTranscript(`${finalTranscriptRef.current} ${interimChunk}`)
      )
    }

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error)
    }

    recognition.onend = () => {
      if (callActiveRef.current && speechRecognitionRef.current === recognition) {
        try {
          recognition.start()
        } catch {
          // Ignore restart races.
        }
      }
    }

    try {
      recognition.start()
      speechRecognitionRef.current = recognition
    } catch (error) {
      console.warn('Speech recognition unavailable:', error)
    }
  }, [stopLocalTranscription])

  const resetCoachPlayback = useCallback(() => {
    const ctx = playbackContextRef.current
    playbackCursorRef.current = ctx ? ctx.currentTime : 0
  }, [])

  const getPlaybackContext = useCallback(async () => {
    if (!playbackContextRef.current) {
      // Default device rate; each buffer uses the sample rate from Gemini's mimeType.
      playbackContextRef.current = new AudioContext()
    }

    if (playbackContextRef.current.state === 'suspended') {
      await playbackContextRef.current.resume()
    }

    return playbackContextRef.current
  }, [])

  const queueCoachAudio = useCallback(
    async (base64Audio, mimeType = '') => {
      try {
        const ctx = await getPlaybackContext()
        const sampleRate = getPcmSampleRate(mimeType)
        const arrayBuffer = base64ToArrayBuffer(base64Audio)
        let audioBuffer

        if (isPcmMimeType(mimeType)) {
          const pcm16 = new Int16Array(arrayBuffer)
          if (pcm16.length === 0) return

          audioBuffer = ctx.createBuffer(1, pcm16.length, sampleRate)
          const channel = audioBuffer.getChannelData(0)
          for (let i = 0; i < pcm16.length; i += 1) {
            channel[i] = pcm16[i] / 32768
          }
        } else {
          audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
        }

        const now = ctx.currentTime
        if (playbackCursorRef.current < now) {
          playbackCursorRef.current = now
        }

        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        source.start(playbackCursorRef.current)
        playbackCursorRef.current += audioBuffer.duration

        setCallStatus('speaking')
        window.clearTimeout(playbackDoneTimerRef.current)
        playbackDoneTimerRef.current = window.setTimeout(() => {
          setCallStatus(callActiveRef.current ? 'listening' : 'paused')
        }, Math.max(250, (playbackCursorRef.current - ctx.currentTime) * 1000 + 180))
      } catch (error) {
        console.error('Audio playback error:', error, mimeType)
      }
    },
    [getPlaybackContext]
  )

  const startFollowUpMic = useCallback(async (stream) => {
    if (!stream || followUpStartedRef.current) return
    followUpStartedRef.current = true

    if (!captureContextRef.current) {
      captureContextRef.current = new AudioContext({ sampleRate: 16000 })
    }

    const audioContext = captureContextRef.current

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    const silentGain = audioContext.createGain()

    silentGain.gain.value = 0
    processor.onaudioprocess = (event) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      if (!callActiveRef.current) return

      const s = statusRef.current
      if (s !== 'conversing' && s !== 'reviewing') return

      const inputData = event.inputBuffer.getChannelData(0)
      const pcm16 = new Int16Array(inputData.length)

      for (let i = 0; i < inputData.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, inputData[i]))
        pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767
      }

      ws.send(
        JSON.stringify({
          type: 'audio_chunk',
          data: bytesToBase64(new Uint8Array(pcm16.buffer))
        })
      )
    }

    source.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(audioContext.destination)

    mediaSourceRef.current = source
    processorRef.current = processor
    silentGainRef.current = silentGain
  }, [])

  const sendCallControl = useCallback((action, transcript = '') => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(
      JSON.stringify({
        type: 'call_control',
        action,
        transcript
      })
    )
  }, [])

  const startCall = useCallback(async () => {
    if (statusRef.current !== 'reviewing' && statusRef.current !== 'conversing') {
      return
    }

    callActiveRef.current = true
    await startFollowUpMic(streamRef.current)
    startLocalTranscription()
    setCallActive(true)
    setCallStatus('listening')
    sendCallControl('start')
  }, [sendCallControl, startFollowUpMic, startLocalTranscription])

  const stopCall = useCallback(() => {
    callActiveRef.current = false
    const transcript = stopLocalTranscription()
    if (transcript) addMessage('user', transcript)

    setCallActive(false)
    setCallStatus('thinking')
    sendCallControl('stop', transcript)
  }, [addMessage, sendCallControl, stopLocalTranscription])

  const revokeRecordingUrl = useCallback(() => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current)
      recordingUrlRef.current = null
    }
  }, [])

  const sendNextRep = useCallback((fault) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        type: 'next_rep',
        rep: fault.rep,
        faultType: fault.fault_type
      })
    )
  }, [])

  const stopPoseSampling = useCallback(() => {
    window.clearInterval(poseSamplingRef.current)
    poseSamplingRef.current = null
  }, [])

  const startPoseSampling = useCallback(() => {
    stopPoseSampling()

    const analyzer = poseAnalyzerRef.current
    if (!analyzer || !videoRef.current) return

    analyzer.reset()
    poseSamplingRef.current = window.setInterval(() => {
      analyzer.sample(videoRef.current)
    }, 80)
  }, [stopPoseSampling])

  const sendRecording = useCallback(
    (blob, poseAnalysis) => {
      revokeRecordingUrl()
      const url = URL.createObjectURL(blob)
      recordingUrlRef.current = url
      setReviewVideoUrl(url)

      const reader = new FileReader()

      reader.onloadend = () => {
        const ws = wsRef.current
        const result = reader.result

        if (
          !ws ||
          ws.readyState !== WebSocket.OPEN ||
          typeof result !== 'string'
        ) {
          setStatus('error')
          setErrorMessage('Could not upload the recording')
          return
        }

        ws.send(
          JSON.stringify({
            type: 'recording_complete',
            data: result.split(',')[1],
            mimeType: normalizeVideoMimeType(blob.type),
            poseAnalysis
          })
        )
      }

      reader.readAsDataURL(blob)
    },
    [revokeRecordingUrl]
  )

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream || statusRef.current !== 'ready') return

    chunksRef.current = []

    const recorder = new MediaRecorder(
      getRecordingStream(stream),
      getRecorderOptions()
    )
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'video/webm'
      })
      stopPoseSampling()
      const poseAnalysis = poseAnalyzerRef.current?.finish()

      setStatus('analyzing')
      showCue('Coach is reviewing your set...', 3000)
      sendRecording(blob, poseAnalysis)
    }

    recorder.start(1000)
    startPoseSampling()
    setStatus('recording')

    window.clearTimeout(recordingTimerRef.current)
    recordingTimerRef.current = window.setTimeout(() => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }, MAX_RECORDING_MS)
  }, [sendRecording, showCue, startPoseSampling, stopPoseSampling])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function startSession() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 640 },
            height: { ideal: 480, max: 480 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        createPoseAnalyzer(exercise || 'squat')
          .then((analyzer) => {
            if (!mounted) {
              analyzer.close()
              return
            }
            poseAnalyzerRef.current = analyzer
            console.log(`Local ${exercise || 'squat'} pose analyzer ready`)
          })
          .catch((error) => {
            console.warn('Local squat pose analyzer unavailable:', error)
          })

        const url = new URL(WS_URL)
        url.searchParams.set('exercise', exercise || 'squat')

        const ws = new WebSocket(url.toString())
        wsRef.current = ws

        ws.onmessage = async (event) => {
          const message = JSON.parse(event.data)

          if (message.type === 'session_ready') {
            setStatus('ready')
            setReviewFaults(null)
            setReviewPoseAnalysis(null)
            setConversationMessages([])
            setLiveUserTranscript('')
          }

          if (message.type === 'review_started') {
            setStatus('analyzing')
            showCue('Coach is reviewing your set...', 3000)
          }

          if (message.type === 'review_ready') {
            resetCoachPlayback()
            setReviewFaults(message.faults || [])
            setReviewPoseAnalysis(message.poseAnalysis || null)
            setStatus('reviewing')
          }

          if (message.type === 'coach_audio') {
            await queueCoachAudio(message.data, message.mimeType)
          }

          if (message.type === 'coach_text') {
            addMessage('coach', message.text)
            showCue(message.text)

            if (statusRef.current === 'analyzing') {
              setStatus('conversing')
            }

            if (!callActiveRef.current) {
              window.clearTimeout(playbackDoneTimerRef.current)
              playbackDoneTimerRef.current = window.setTimeout(() => {
                setCallStatus('paused')
              }, 1200)
            }
          }

          if (message.type === 'user_text') {
            addMessage('user', message.text)
          }

          if (message.type === 'error') {
            setStatus('error')
            setErrorMessage(message.message || 'Server error')
            console.error('Server error:', message.message)
          }
        }

        ws.onerror = () => {
          setStatus('error')
          setErrorMessage('Could not connect to the coach server')
        }

        ws.onclose = () => {
          console.log('WebSocket closed')
        }
      } catch (error) {
        console.error('Session start error:', error)
        setStatus('error')
        setErrorMessage(
          error?.name === 'NotAllowedError'
            ? 'Camera or microphone permission was denied'
            : 'Could not start the camera and microphone'
        )
      }
    }

    startSession()

    return () => {
      mounted = false
      window.clearTimeout(cueTimerRef.current)
      window.clearTimeout(playbackDoneTimerRef.current)
      window.clearTimeout(recordingTimerRef.current)
      stopPoseSampling()
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      revokeRecordingUrl()
      setCallActive(false)
      setCallStatus('paused')
      stopLocalTranscription()
      poseAnalyzerRef.current?.close()
      wsRef.current?.close()
      processorRef.current?.disconnect()
      mediaSourceRef.current?.disconnect()
      silentGainRef.current?.disconnect()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      captureContextRef.current?.close()
      playbackContextRef.current?.close()
    }
  }, [
    exercise,
    queueCoachAudio,
    resetCoachPlayback,
    revokeRecordingUrl,
    showCue,
    stopPoseSampling,
    startFollowUpMic,
    addMessage,
    stopLocalTranscription
  ])

  return {
    status,
    currentCue,
    cueVisible,
    errorMessage,
    reviewFaults,
    reviewPoseAnalysis,
    reviewVideoUrl,
    conversationMessages,
    videoRef,
    startRecording,
    stopRecording,
    sendNextRep,
    callActive,
    callStatus,
    liveUserTranscript,
    startCall,
    stopCall
  }
}
