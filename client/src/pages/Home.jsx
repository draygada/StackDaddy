import './Home.css'

const exercises = [
  {
    id: 'squat',
    label: 'Air Squats',
    eyebrow: 'Rep review and joint highlights',
    enabled: true
  },
  {
    id: 'handstand',
    label: 'Handstands',
    eyebrow: 'Line check and alignment overlay',
    enabled: true
  }
]

export default function Home({ onStart }) {
  return (
    <section className="home">
      <div className="home-heading">
        <p className="home-kicker">AI Form Coach</p>
        <h1>StackDaddy</h1>
        <p>
          Record a set, see the movement lines, then talk through the fix with
          Coach.
        </p>
      </div>

      <div className="exercise-grid" aria-label="Choose an exercise">
        {exercises.map((exercise) => (
          <button
            key={exercise.id}
            className="exercise-card"
            disabled={!exercise.enabled}
            onClick={() => onStart(exercise.id)}
            type="button"
          >
            <span className="exercise-mark" aria-hidden="true">
              {exercise.id === 'squat' ? '01' : '02'}
            </span>
            <span className="exercise-name">{exercise.label}</span>
            <span className="exercise-desc">{exercise.eyebrow}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
