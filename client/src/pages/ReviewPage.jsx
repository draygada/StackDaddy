import { useEffect, useRef, useState } from 'react'
import './ReviewPage.css'

export default function ReviewPage({
  faults,
  videoUrl,
  conversationMessages,
  sendNextRep,
  onEnd
}) {
  const [currentFaultIndex, setCurrentFaultIndex] = useState(0)
  const videoRef = useRef(null)
  const messagesEndRef = useRef(null)

  const currentFault = faults?.length > 0 ? faults[currentFaultIndex] : null
  const hasPrev = currentFaultIndex > 0
  const hasNext = faults && currentFaultIndex < faults.length - 1

  // Auto-scroll conversation to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversationMessages])

  // Loop the current fault clip
  useEffect(() => {
    const video = videoRef.current
    if (!video || !currentFault || !videoUrl) return

    const loop = () => {
      if (video.currentTime >= currentFault.timestamp_end) {
        video.currentTime = currentFault.timestamp_start
      }
    }

    // Seek and play only after metadata is available — setting currentTime
    // before loadedmetadata is a silent no-op and the clip starts from t=0.
    const onLoaded = () => {
      video.currentTime = currentFault.timestamp_start
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
      {/* Left panel — video clip + fault info + nav */}
      <div className="review-left">
        {faults?.length === 0 ? (
          <div className="review-no-faults">
            <p>No faults found — great set!</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="review-video"
              playsInline
              muted
            />

            {currentFault && (
              <div className="review-fault-info">
                <span className="review-rep-badge">Rep {currentFault.rep}</span>
                <span className="review-fault-type">{currentFault.fault_type}</span>
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

        <button className="review-done-btn" onClick={onEnd} type="button">
          Done
        </button>
      </div>

      {/* Right panel — conversation */}
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

        <div className="review-mic-bar">
          <span className="review-mic-dot" aria-hidden="true" />
          <span className="review-mic-label">Mic live — speak to Coach</span>
        </div>
      </div>
    </div>
  )
}
