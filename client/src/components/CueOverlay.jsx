import './CueOverlay.css'

export default function CueOverlay({ text, visible }) {
  if (!text) return null

  return (
    <div className={`cue-overlay ${visible ? 'visible' : 'hidden'}`}>
      <p className="cue-text">{text}</p>
    </div>
  )
}
