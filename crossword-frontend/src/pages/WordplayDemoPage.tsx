import { useState } from 'react'
import { WordplayVisualizer } from '../components/wordplay/WordplayVisualizer'
import { examples } from '../components/wordplay/sampleData'

export function WordplayDemoPage() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const current = examples[selectedIndex]

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">Wordplay Visualizer</h1>
          <p className="text-[var(--color-text-secondary)] text-sm">
            Step-by-step view of how cryptic clue wordplay builds the answer.
          </p>
        </div>

        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          {examples.map((ex, i) => (
            <option key={i} value={i}>
              {ex.label}
            </option>
          ))}
        </select>

        <div className="border border-[var(--color-border)] rounded-xl p-5 bg-[var(--color-surface)]">
          <WordplayVisualizer key={selectedIndex} visualization={current.data} />
        </div>
      </div>
    </div>
  )
}
