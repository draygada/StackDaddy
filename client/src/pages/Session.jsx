import CueOverlay from '../components/CueOverlay'
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
  analyzing: 'Analyzing your set',
  complete: 'Review complete',
  error: 'Connection error'
}

export default function Session({ exercise, onEnd }) {
  const {
    status,
    currentCue,
    cueVisible,
    errorMessage,
    videoRef,
    startRecording,
    stopRecording
  } = useCoachSession(exercise)

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
          <p className="session-hint">Uploading your set for review</p>
        )}

        {status === 'complete' && (
          <p className="session-hint">End this session or record again</p>
        )}
      </div>

      <CueOverlay text={currentCue} visible={cueVisible} />
    </section>
  )
}
