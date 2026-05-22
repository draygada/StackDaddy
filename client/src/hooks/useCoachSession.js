import { useCallback, useEffect, useRef, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8080'

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

function getPcmSampleRate(mimeType = '') {
  const match = mimeType.match(/rate=(\d+)/)
  return match ? Number(match[1]) : 24000
}

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

  const audioContextRef = useRef(null)
  const chunksRef = useRef([])
  const cueTimerRef = useRef(null)
  const followUpStartedRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const mediaSourceRef = useRef(null)
  const processorRef = useRef(null)
  const silentGainRef = useRef(null)
  const statusRef = useRef(status)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const showCue = useCallback((text, duration = 8000) => {
    window.clearTimeout(cueTimerRef.current)
    setCurrentCue(text)
    setCueVisible(true)
    cueTimerRef.current = window.setTimeout(() => {
      setCueVisible(false)
    }, duration)
  }, [])

  const playAudio = useCallback(async (base64Audio, mimeType = '') => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      let audioBuffer
      const arrayBuffer = base64ToArrayBuffer(base64Audio)

      if (mimeType.includes('pcm')) {
        const pcm16 = new Int16Array(arrayBuffer)
        audioBuffer = audioContextRef.current.createBuffer(
          1,
          pcm16.length,
          getPcmSampleRate(mimeType)
        )

        const channel = audioBuffer.getChannelData(0)
        for (let i = 0; i < pcm16.length; i += 1) {
          channel[i] = pcm16[i] / 32768
        }
      } else {
        audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)
      }

      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      source.start()
      setStatus('conversing')
    } catch (error) {
      console.error('Audio playback error:', error)
    }
  }, [])

  const startFollowUpMic = useCallback(async (stream) => {
    if (!stream || followUpStartedRef.current) return
    followUpStartedRef.current = true

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
    }

    const audioContext = audioContextRef.current

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
      if (statusRef.current !== 'conversing') return

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
      showCue('Coach is reviewing your set...', 3000)
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
            showCue('Coach is reviewing your set...', 3000)
          }

          if (message.type === 'coach_audio') {
            await playAudio(message.data, message.mimeType)
            await startFollowUpMic(stream)
          }

          if (message.type === 'coach_text') {
            showCue(message.text)

            if (statusRef.current === 'analyzing') {
              setStatus('conversing')
              await startFollowUpMic(stream)
            }
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
      processorRef.current?.disconnect()
      mediaSourceRef.current?.disconnect()
      silentGainRef.current?.disconnect()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      audioContextRef.current?.close()
    }
  }, [exercise, playAudio, showCue, startFollowUpMic])

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
