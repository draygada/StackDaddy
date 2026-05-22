import './RepIssuesPanel.css'

export default function RepIssuesPanel({ issues, onPlayRep, playingRep }) {
  if (!issues?.length) return null

  return (
    <aside className="rep-issues-panel" aria-label="Bad rep review">
      <p className="rep-issues-title">Reps to fix</p>
      <ul className="rep-issues-list">
        {issues.map((issue) => (
          <li key={`rep-${issue.rep}-${issue.fault}`} className="rep-issue-card">
            <div className="rep-issue-header">
              <span className="rep-issue-badge">Rep {issue.rep}</span>
              <span className="rep-issue-fault">{issue.fault}</span>
            </div>
            <p className="rep-issue-explanation">{issue.explanation}</p>
            {issue.cue ? <p className="rep-issue-cue">{issue.cue}</p> : null}
            <button
              type="button"
              className="rep-issue-play"
              onClick={() => onPlayRep(issue)}
              aria-pressed={playingRep === issue.rep}
            >
              {playingRep === issue.rep ? 'Playing...' : 'Watch this rep'}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
