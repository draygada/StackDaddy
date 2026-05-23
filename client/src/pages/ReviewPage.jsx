import { useEffect, useRef, useState } from 'react'
import './ReviewPage.css'

const SKELETON = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
  ['leftAnkle', 'leftHeel'],
  ['leftHeel', 'leftFoot'],
  ['rightAnkle', 'rightHeel'],
  ['rightHeel', 'rightFoot']
]

function highlightKeys(faultType = '') {
  const fault = faultType.toLowerCase()
  if (fault.includes('knee') || fault.includes('uneven')) {
    return ['leftHip', 'leftKnee', 'leftAnkle', 'rightHip', 'rightKnee', 'rightAnkle']
  }
  if (fault.includes('depth') || fault.includes('shallow')) {
    return ['leftHip', 'rightHip', 'leftKnee', 'rightKnee']
  }
  if (fault.includes('chest') || fault.includes('torso')) {
    return ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']
  }
  if (fault.includes('stance')) {
    return ['leftAnkle', 'rightAnkle', 'leftFoot', 'rightFoot']
  }
  if (fault.includes('heel')) {
    return ['leftHeel', 'rightHeel', 'leftFoot', 'rightFoot']
  }
  return ['leftHip', 'rightHip', 'leftKnee', 'rightKnee']
}

function nearestFrame(frames, currentTimeSec) {
  if (!frames?.length) return null

  const targetMs = currentTimeSec * 1000
  let best = frames[0]
  let bestDelta = Math.abs(frames[0].timestamp_ms - targetMs)

  for (let i = 1; i < frames.length; i += 1) {
    const delta = Math.abs(frames[i].timestamp_ms - targetMs)
    if (delta < bestDelta) {
      best = frames[i]
      bestDelta = delta
    }
  }

  return bestDelta < 250 ? best : null
}

function midpoint(a, b) {
  if (!a || !b) return a || b || null

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  }
}

function drawHandstandLines(ctx, point, width, height, scale) {
  const wrist = midpoint(point('leftWrist'), point('rightWrist'))
  const shoulder = midpoint(point('leftShoulder'), point('rightShoulder'))
  const hip = midpoint(point('leftHip'), point('rightHip'))
  const ankle = midpoint(point('leftAnkle'), point('rightAnkle'))

  if (!wrist || !shoulder || !hip || !ankle) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.strokeStyle = 'rgba(78, 224, 186, 0.74)'
  ctx.lineWidth = 2 * scale
  ctx.setLineDash([10 * scale, 10 * scale])
  ctx.beginPath()
  ctx.moveTo(wrist.x, wrist.y)
  ctx.lineTo(wrist.x, ankle.y)
  ctx.stroke()

  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(247, 178, 69, 0.88)'
  ctx.lineWidth = 3 * scale
  ctx.beginPath()
  ctx.moveTo(wrist.x, wrist.y)
  ctx.lineTo(shoulder.x, shoulder.y)
  ctx.lineTo(hip.x, hip.y)
  ctx.lineTo(ankle.x, ankle.y)
  ctx.stroke()

  for (const marker of [wrist, shoulder, hip, ankle]) {
    ctx.fillStyle = 'rgba(238, 243, 248, 0.94)'
    ctx.beginPath()
    ctx.arc(marker.x, marker.y, 4 * scale, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

export default function ReviewPage({
  faults,
  poseAnalysis,
  videoUrl,
  conversationMessages,
  callActive,
  callStatus,
  liveUserTranscript,
  exercise,
  sendNextRep,
  startCall,
  stopCall,
  onEnd
}) {
  const [currentFaultIndex, setCurrentFaultIndex] = useState(0)
  const overlayRef = useRef(null)
  const videoRef = useRef(null)
  const messagesEndRef = useRef(null)

  const currentFault = faults?.length > 0 ? faults[currentFaultIndex] : null
  const hasPrev = currentFaultIndex > 0
  const hasNext = faults && currentFaultIndex < faults.length - 1
  const callLabel = {
    paused: 'Call paused',
    listening: 'Listening, stop when done',
    thinking: 'Coach is thinking',
    speaking: 'Coach is speaking'
  }[callStatus || 'paused']

  // Auto-scroll conversation to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversationMessages])

  // Loop the current fault clip, or the whole recording when there is no fault.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoUrl) return

    const loop = () => {
      if (currentFault && video.currentTime >= currentFault.timestamp_end) {
        video.currentTime = currentFault.timestamp_start
      }

      if (!currentFault && video.duration && video.currentTime >= video.duration - 0.1) {
        video.currentTime = 0
      }
    }

    // Seek and play only after metadata is available; setting currentTime
    // before loadedmetadata is a silent no-op and the clip starts from t=0.
    const onLoaded = () => {
      video.currentTime = currentFault?.timestamp_start || 0
      video.play().catch(() => {})
    }

    video.src = videoUrl
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', loop)

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', loop)
      video.pause()
    }
  }, [currentFault, videoUrl])

  useEffect(() => {
    const video = videoRef.current
    const canvas = overlayRef.current
    const frames = poseAnalysis?.frames || []
    if (!video || !canvas || !frames.length) return

    const ctx = canvas.getContext('2d')
    let animationFrame = 0

    const draw = () => {
      const rect = video.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(rect.width * scale))
      const height = Math.max(1, Math.round(rect.height * scale))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      ctx.clearRect(0, 0, width, height)
      const frame = nearestFrame(frames, video.currentTime)
      if (!frame?.points) {
        animationFrame = requestAnimationFrame(draw)
        return
      }

      const highlighted = new Set(highlightKeys(currentFault?.fault_type))
      const point = (key) => {
        const p = frame.points[key]
        if (!p || p.c < 0.45) return null
        return {
          x: (1 - p.x) * width,
          y: p.y * height
        }
      }

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (exercise === 'handstand') {
        if (frame.phase === 'hold') {
          drawHandstandLines(ctx, point, width, height, scale)
        }
      } else {
        for (const [a, b] of SKELETON) {
          const pa = point(a)
          const pb = point(b)
          if (!pa || !pb) continue

          const hot = highlighted.has(a) || highlighted.has(b)
          ctx.strokeStyle = hot ? 'rgba(244, 82, 64, 0.96)' : 'rgba(226, 231, 238, 0.54)'
          ctx.lineWidth = hot ? 5 * scale : 2 * scale
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.stroke()
        }

        for (const key of Object.keys(frame.points)) {
          const p = point(key)
          if (!p) continue

          const hot = highlighted.has(key)
          ctx.fillStyle = hot ? 'rgba(244, 82, 64, 0.96)' : 'rgba(235, 240, 247, 0.92)'
          ctx.beginPath()
          ctx.arc(p.x, p.y, (hot ? 5 : 3) * scale, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      animationFrame = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [currentFault, exercise, poseAnalysis])

  const handleNext = () => {
    if (!hasNext) return
    const nextIndex = currentFaultIndex + 1
    setCurrentFaultIndex(nextIndex)
    sendNextRep?.(faults[nextIndex])
  }

  const handlePrev = () => {
    if (!hasPrev) return
    const prevIndex = currentFaultIndex - 1
    setCurrentFaultIndex(prevIndex)
    sendNextRep?.(faults[prevIndex])
  }

  return (
    <div className="review-page">
      {/* Left panel: video clip + fault info + nav */}
      <div className="review-left">
        <>
          {videoUrl && (
            <div className="review-video-wrap">
              <video
                ref={videoRef}
                className="review-video"
                playsInline
                muted
              />
              <canvas
                ref={overlayRef}
                className="review-pose-overlay"
                aria-hidden="true"
              />
            </div>
          )}

          {faults?.length === 0 ? (
            <div className="review-no-faults">
              <p>
                {exercise === 'handstand'
                  ? 'No major line break found.'
                  : 'No faults found. Great set!'}
              </p>
            </div>
          ) : (
            <>

            {currentFault && (
              <div className="review-fault-card">
                <div className="review-fault-info">
                  <span className="review-rep-badge">Rep {currentFault.rep}</span>
                  <span className="review-fault-type">{currentFault.fault_type}</span>
                </div>
                <p className="review-fault-copy">{currentFault.explanation}</p>
                {currentFault.cue ? (
                  <p className="review-fault-cue">{currentFault.cue}</p>
                ) : null}
              </div>
            )}

            <div className="review-nav">
              <button
                className="review-nav-btn"
                onClick={handlePrev}
                disabled={!hasPrev}
                type="button"
              >
                Prev
              </button>
              <span className="review-nav-count">
                {currentFaultIndex + 1} / {faults?.length}
              </span>
              <button
                className="review-nav-btn"
                onClick={handleNext}
                disabled={!hasNext}
                type="button"
              >
                Next
              </button>
            </div>
            </>
          )}
        </>

        <button className="review-done-btn" onClick={onEnd} type="button">
          Done
        </button>
      </div>

      {/* Right panel: conversation */}
      <div className="review-right">
        <div className="review-messages">
          {conversationMessages.length === 0 && (
            <p className="review-messages-empty">Coach is speaking...</p>
          )}
          {conversationMessages.map((msg) => (
            <div
              key={msg.id}
              className={`review-bubble review-bubble--${msg.role}`}
            >
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className={`review-call-bar ${callActive ? 'is-active' : ''}`}>
          <div className="review-call-state">
            <span className="review-mic-dot" aria-hidden="true" />
            <span className="review-mic-label">{callLabel}</span>
            {liveUserTranscript ? (
              <span className="review-live-transcript">
                {liveUserTranscript}
              </span>
            ) : null}
          </div>
          <button
            className="review-call-btn"
            onClick={callActive ? stopCall : startCall}
            disabled={callStatus === 'thinking' || callStatus === 'speaking'}
            type="button"
          >
            {callActive ? 'Stop Call' : 'Start Call'}
          </button>
        </div>
      </div>
    </div>
  )
}
