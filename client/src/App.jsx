import { useState } from 'react'
import Home from './pages/Home'
import Session from './pages/Session'
import './App.css'

export default function App() {
  const [page, setPage] = useState('home')
  const [exercise, setExercise] = useState(null)

  const startSession = (selectedExercise) => {
    setExercise(selectedExercise)
    setPage('session')
  }

  const endSession = () => {
    setExercise(null)
    setPage('home')
  }

  return (
    <main className="app-shell">
      {page === 'home' && <Home onStart={startSession} />}
      {page === 'session' && (
        <Session exercise={exercise} onEnd={endSession} />
      )}
    </main>
  )
}
