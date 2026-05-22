import { useCallback, useEffect, useRef, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8080'

function getRecorderOptions() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ]

  const mimeType = candidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  )

  return mimeType
    ? {
        mimeType,
        videoBitsPerSecond: 1_200_000,
        audioBitsPerSecond: 64_000
      }
    : {}
}

export function useCoachSession(exercise) {
  const [status, setStatus] = useState('connecting')
  const [currentCue, setCurrentCue] = useState('')
  const [cueVisible, setCueVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const chunksRef = useRef([])
  const cueTimerRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const statusRef = useRef(status)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const showCue = useCallback((text, duration = 10000) => {
    window.clearTimeout(cueTimerRef.current)
    setCurrentCue(text)
    setCueVisible(true)
    cueTimerRef.current = window.setTimeout(() => {
      setCueVisible(false)
    }, duration)
  }, [])

  const sendRecording = useCallback((blob) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      const ws = wsRef.current
      const result = reader.result

      if (!ws || ws.readyState !== WebSocket.OPEN || typeof result !== 'string') {
        setStatus('error')
        setErrorMessage('Could not upload the recording')
        return
      }

      ws.send(
        JSON.stringify({
          type: 'recording_complete',
          data: result.split(',')[1],
          mimeType: blob.type || 'video/webm'
        })
      )
    }

    reader.readAsDataURL(blob)
  }, [])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream || statusRef.current !== 'ready') return

    chunksRef.current = []

    const recorder = new MediaRecorder(stream, getRecorderOptions())
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

      setStatus('analyzing')
      showCue('Analyzing your set...', 3000)
      sendRecording(blob)
    }

    recorder.start()
    setStatus('recording')
  }, [sendRecording, showCue])

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
            width: { ideal: 1280 },
            height: { ideal: 720 },
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

        const url = new URL(WS_URL)
        url.searchParams.set('exercise', exercise || 'squat')

        const ws = new WebSocket(url.toString())
        wsRef.current = ws

        ws.onmessage = async (event) => {
          const message = JSON.parse(event.data)

          if (message.type === 'session_ready') {
            setStatus('ready')
          }

          if (message.type === 'review_started') {
            setStatus('analyzing')
            showCue('Analyzing your set...', 3000)
          }

          if (message.type === 'coach_text') {
            setStatus('complete')
            showCue(message.text, 12000)
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
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      wsRef.current?.close()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [exercise, showCue])

  return {
    status,
    currentCue,
    cueVisible,
    errorMessage,
    videoRef,
    startRecording,
    stopRecording
  }
}
