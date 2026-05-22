import { useCallback, useEffect, useRef, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'

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

export function useCoachSession(exercise) {
  const [status, setStatus] = useState('connecting')
  const [currentCue, setCurrentCue] = useState('')
  const [cueVisible, setCueVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const audioContextRef = useRef(null)
  const cueTimerRef = useRef(null)
  const frameIntervalRef = useRef(null)
  const mediaSourceRef = useRef(null)
  const processorRef = useRef(null)
  const silentGainRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)

  const showCue = useCallback((text) => {
    window.clearTimeout(cueTimerRef.current)
    setCurrentCue(text)
    setCueVisible(true)
    cueTimerRef.current = window.setTimeout(() => {
      setCueVisible(false)
    }, 4000)
  }, [])

  const playAudio = useCallback(async (base64Audio) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(
        base64ToArrayBuffer(base64Audio)
      )
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      source.start()
    } catch (error) {
      console.error('Audio playback error:', error)
    }
  }, [])

  const sendVideoFrame = useCallback(() => {
    const video = videoRef.current
    const ws = wsRef.current

    if (!video || !ws || ws.readyState !== WebSocket.OPEN) return
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480

    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    ws.send(
      JSON.stringify({
        type: 'video_frame',
        data: canvas.toDataURL('image/jpeg', 0.78).split(',')[1]
      })
    )
  }, [])

  const startAudioCapture = useCallback(async (stream) => {
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

        ws.onopen = () => {
          console.log('WebSocket connected')
        }

        ws.onmessage = async (event) => {
          const message = JSON.parse(event.data)

          if (message.type === 'session_ready') {
            setStatus('ready')
            frameIntervalRef.current = window.setInterval(sendVideoFrame, 500)
            await startAudioCapture(stream)
          }

          if (message.type === 'coach_audio') {
            await playAudio(message.data)
          }

          if (message.type === 'coach_text') {
            showCue(message.text)
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
      window.clearInterval(frameIntervalRef.current)
      wsRef.current?.close()
      processorRef.current?.disconnect()
      mediaSourceRef.current?.disconnect()
      silentGainRef.current?.disconnect()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      audioContextRef.current?.close()
    }
  }, [exercise, playAudio, sendVideoFrame, showCue, startAudioCapture])

  return {
    status,
    currentCue,
    cueVisible,
    errorMessage,
    videoRef
  }
}
