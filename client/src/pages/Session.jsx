import CueOverlay from '../components/CueOverlay'
import ReviewPage from './ReviewPage'
import { useCoachSession } from '../hooks/useCoachSession'
import './Session.css'

const exerciseLabels = {
  squat: 'Air Squats',
  handstand: 'Handstands'
}

const statusLabels = {
  connecting: 'Connecting to Coach',
  ready: 'Ready, tap Record',
  recording: 'Recording your set',
  analyzing: 'Coach is reviewing your set',
  conversing: 'Ask Coach anything out loud',
  error: 'Connection error'
}

export default function Session({ exercise, onEnd }) {
  const {
    status,
    currentCue,
    cueVisible,
    errorMessage,
    reviewFaults,
    reviewVideoUrl,
    conversationMessages,
    videoRef,
    startRecording,
    stopRecording,
    sendNextRep
  } = useCoachSession(exercise)

  if (status === 'reviewing') {
    return (
      <ReviewPage
        faults={reviewFaults || []}
        videoUrl={reviewVideoUrl}
        conversationMessages={conversationMessages}
        sendNextRep={sendNextRep}
        onEnd={onEnd}
      />
    )
  }

  return (
    <section className="session">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="camera-feed"
      />

      <div className="session-bar">
        <div className="session-info">
          {status === 'recording' && (
            <span className="live-dot" aria-hidden="true" />
          )}
          <span className={`status ${status}`}>
            {status === 'error'
              ? errorMessage || statusLabels.error
              : statusLabels[status]}
          </span>
          {status !== 'connecting' && status !== 'error' && (
            <span className="exercise-label">
              {exerciseLabels[exercise] || 'Session'}
            </span>
          )}
        </div>

        <button className="end-btn" onClick={onEnd} type="button">
          End
        </button>
      </div>

      <div className="record-controls">
        {status === 'ready' && (
          <button className="record-btn" onClick={startRecording} type="button">
            Record Set
          </button>
        )}

        {status === 'recording' && (
          <button className="stop-btn" onClick={stopRecording} type="button">
            Stop
          </button>
        )}

        {status === 'analyzing' && (
          <div className="analyzing-indicator" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Coach is watching your set...</span>
          </div>
        )}

        {status === 'conversing' && (
          <p className="session-hint">
            Tap a bad rep to replay it, or ask Coach anything out loud
          </p>
        )}
      </div>

      <CueOverlay text={currentCue} visible={cueVisible} />
    </section>
  )
}
