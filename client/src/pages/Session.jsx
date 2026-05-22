import CueOverlay from '../components/CueOverlay'
import { useCoachSession } from '../hooks/useCoachSession'
import './Session.css'

const exerciseLabels = {
  squat: 'Air Squats',
  handstand: 'Handstands'
}

export default function Session({ exercise, onEnd }) {
  const { status, currentCue, cueVisible, errorMessage, videoRef } =
    useCoachSession(exercise)

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
          {status === 'connecting' && (
            <span className="status connecting">Connecting to Coach</span>
          )}

          {status === 'ready' && (
            <>
              <span className="live-dot" aria-hidden="true" />
              <span className="status live">Live</span>
              <span className="exercise-label">
                {exerciseLabels[exercise] || 'Session'}
              </span>
            </>
          )}

          {status === 'error' && (
            <span className="status error">
              {errorMessage || 'Connection error'}
            </span>
          )}
        </div>

        <button className="end-btn" onClick={onEnd} type="button">
          End
        </button>
      </div>

      <CueOverlay text={currentCue} visible={cueVisible} />
    </section>
  )
}
