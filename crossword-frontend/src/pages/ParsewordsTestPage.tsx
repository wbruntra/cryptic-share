import { useEffect, useState } from 'react'
import axios from 'axios'
import type { Puzzle } from '../components/parsewords/types'
import { ParsewordsGame } from '../components/parsewords/ParsewordsGame'

// ---------------------------------------------------------------------------
// Hardcoded fallback puzzles
// ---------------------------------------------------------------------------

const hardcodedPuzzles: Puzzle[] = [
  {
    label: 'LULLABY',
    clue: "With Christmas nearly over recall dance's sleepy tune (7)",
    answer: 'LULLABY',
    tokens: [
      { id: 't1', text: 'With',      role: 'indicator' },
      { id: 't2', text: 'Christmas', role: 'wordplay' },
      { id: 't3', text: 'nearly',    role: 'indicator' },
      { id: 't4', text: 'over',      role: 'indicator' },
      { id: 't5', text: 'recall',    role: 'indicator' },
      { id: 't6', text: "dance's",   role: 'wordplay' },
      { id: 't7', text: 'sleepy',    role: 'definition' },
      { id: 't8', text: 'tune',      role: 'definition' },
    ],
    triggers: [
      { match: 'sleepy tune',     action: { kind: 'replace', options: ['CRADLE SONG', 'SERENADE', 'NOCTURNE'] } },
      { match: 'Christmas',       action: { kind: 'replace', options: ['YULE', 'NOEL', 'XMAS'] } },
      { match: "dance's",         action: { kind: 'replace', options: ['BALL', 'WALTZ', 'JIVE'] } },
      { match: 'YULE nearly',     action: { kind: 'compute', fn: 'trim-last', source: 'YULE' } },
      { match: 'YUL over',        action: { kind: 'compute', fn: 'reverse',   source: 'YUL' } },
      { match: 'BALL recall',     action: { kind: 'compute', fn: 'reverse',   source: 'BALL' } },
      { match: 'With LUY LLAB',   action: { kind: 'container' } },
    ],
  },
  {
    label: 'TROUNCE',
    clue: 'Beat counter, frustrated (7)',
    answer: 'TROUNCE',
    tokens: [
      { id: 't1', text: 'Beat',       role: 'definition' },
      { id: 't2', text: 'counter,',   role: 'wordplay' },
      { id: 't3', text: 'frustrated', role: 'indicator' },
    ],
    triggers: [
      { match: 'Beat',               action: { kind: 'replace', options: ['DEFEAT', 'THRASH', 'PUMMEL'] } },
      { match: 'counter, frustrated', action: { kind: 'result',  options: ['TROUNCE', 'RECOUNT', 'CORNUTE'] } },
    ],
  },
  {
    label: 'STYLE',
    clue: "Let's somehow incorporate variable design (5)",
    answer: 'STYLE',
    tokens: [
      { id: 't1', text: "Let's",       role: 'wordplay' },
      { id: 't2', text: 'somehow',     role: 'indicator' },
      { id: 't3', text: 'incorporate', role: 'indicator' },
      { id: 't4', text: 'variable',    role: 'wordplay' },
      { id: 't5', text: 'design',      role: 'definition' },
    ],
    triggers: [
      { match: 'design',            action: { kind: 'replace', options: ['FASHION', 'MOTIF', 'PATTERN'] } },
      { match: 'variable',          action: { kind: 'replace', options: ['Y', 'X', 'N'] } },
      { match: "Let's somehow",     action: { kind: 'result',  options: ['STLE', 'LEST', 'LETS'] } },
      { match: 'STLE incorporate Y', action: { kind: 'container' } },
    ],
  },
  {
    label: 'EXCEL',
    clue: 'It sounds like 40 in Rome do very well (5)',
    answer: 'EXCEL',
    tokens: [
      { id: 't1', text: 'It',     role: 'indicator' },
      { id: 't2', text: 'sounds', role: 'indicator' },
      { id: 't3', text: 'like',   role: 'indicator' },
      { id: 't4', text: '40',     role: 'wordplay' },
      { id: 't5', text: 'in',     role: 'link' },
      { id: 't6', text: 'Rome',   role: 'wordplay' },
      { id: 't7', text: 'do',     role: 'definition' },
      { id: 't8', text: 'very',   role: 'definition' },
      { id: 't9', text: 'well',   role: 'definition' },
    ],
    triggers: [
      { match: 'do very well',         action: { kind: 'replace', options: ['THRIVE', 'SUCCEED', 'PROSPER'] } },
      { match: '40 in Rome',           action: { kind: 'replace', options: ['XL', 'XC', 'FORTY'] } },
      { match: 'It sounds like XL',    action: { kind: 'result',  options: ['EXCEL', 'EXPEL', 'EXULT'] } },
    ],
  },
  {
    label: 'EMCEE',
    clue: 'He introduces many comedians at the start in full (5)',
    answer: 'EMCEE',
    tokens: [
      { id: 't1', text: 'He',         role: 'definition' },
      { id: 't2', text: 'introduces', role: 'definition' },
      { id: 't3', text: 'many',       role: 'wordplay' },
      { id: 't4', text: 'comedians',  role: 'wordplay' },
      { id: 't5', text: 'at',         role: 'indicator' },
      { id: 't6', text: 'the',        role: 'indicator' },
      { id: 't7', text: 'start',      role: 'indicator' },
      { id: 't8', text: 'in',         role: 'indicator' },
      { id: 't9', text: 'full',       role: 'indicator' },
    ],
    triggers: [
      { match: 'He introduces',              action: { kind: 'replace', options: ['COMPERE', 'HOST', 'PRESENTER'] } },
      { match: 'start',                      action: { kind: 'replace', options: ['BEGINNING', 'ONSET', 'OPENING'] } },
      { match: 'many comedians at the start', action: { kind: 'result',  options: ['MC', 'CM', 'MCO'] } },
      { match: 'MC in full',                 action: { kind: 'result',  options: ['EMCEE', 'EMCAY', 'MCEE'] } },
    ],
  },
  {
    label: 'MAIL ORDER',
    clue: 'Marie cleverly engages peer in buying by post (4,5)',
    answer: 'MAILORDER',
    displayAnswer: 'MAIL ORDER',
    tokens: [
      { id: 't1', text: 'Marie',   role: 'wordplay' },
      { id: 't2', text: 'cleverly', role: 'indicator' },
      { id: 't3', text: 'engages', role: 'indicator' },
      { id: 't4', text: 'peer',    role: 'wordplay' },
      { id: 't5', text: 'in',      role: 'link' },
      { id: 't6', text: 'buying',  role: 'definition' },
      { id: 't7', text: 'by',      role: 'definition' },
      { id: 't8', text: 'post',    role: 'definition' },
    ],
    triggers: [
      { match: 'peer',              action: { kind: 'replace', options: ['LORD', 'DUKE', 'EARL'] } },
      { match: 'post',              action: { kind: 'replace', options: ['MAIL', 'PILLAR', 'STAMP'] } },
      { match: 'buying by post',    action: { kind: 'replace', options: ['CATALOGUE', 'DELIVERY', 'SHOPPING'] } },
      { match: 'Marie cleverly',    action: { kind: 'result',  options: ['MAIER', 'AIMER', 'RAMIE'] } },
      { match: 'MAIER engages LORD', action: { kind: 'container' } },
    ],
  },
  {
    label: 'SITTING DOWN',
    clue: 'Doing stint working with wife on sofa perhaps (7,4)',
    answer: 'SITTINGDOWN',
    displayAnswer: 'SITTING DOWN',
    tokens: [
      { id: 't1', text: 'Doing',   role: 'wordplay' },
      { id: 't2', text: 'stint',   role: 'wordplay' },
      { id: 't3', text: 'working', role: 'indicator' },
      { id: 't4', text: 'with',    role: 'indicator' },
      { id: 't5', text: 'wife',    role: 'wordplay' },
      { id: 't6', text: 'on',      role: 'definition' },
      { id: 't7', text: 'sofa',    role: 'definition' },
      { id: 't8', text: 'perhaps', role: 'definition' },
    ],
    triggers: [
      { match: 'wife',                action: { kind: 'replace', options: ['W', 'MISSUS', 'SPOUSE'] } },
      { match: 'on sofa perhaps',     action: { kind: 'replace', options: ['SEATED', 'RESTING', 'LOUNGING'] } },
      { match: 'Doing stint working', action: { kind: 'result',  options: ['SITTINGDON', 'STONIGDINT', 'DONITSTING'] } },
      { match: 'SITTINGDON with W',   action: { kind: 'container' } },
    ],
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ParsewordsTestPage() {
  const [puzzles, setPuzzles] = useState<Puzzle[]>(hardcodedPuzzles)
  const [puzzleIndex, setPuzzleIndex] = useState(0)

  useEffect(() => {
    axios
      .get('/api/parsewords')
      .then((res) => {
        const fetched: Puzzle[] = res.data.map((entry: { puzzle: Puzzle }) => entry.puzzle)
        if (fetched.length === 0) return
        setPuzzles((prev) => {
          const byAnswer = new Map(prev.map((p) => [p.answer, p]))
          for (const p of fetched) byAnswer.set(p.answer, p)
          return [...byAnswer.values()]
        })
      })
      .catch(() => {/* backend unavailable */})
  }, [])

  const puzzle = puzzles[puzzleIndex] ?? puzzles[0]

  function switchPuzzle(index: number) {
    setPuzzleIndex(index)
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">Parsewords</h1>
          <p className="text-[var(--color-text-secondary)] text-sm">Click words to select them.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {puzzles.map((p, i) => (
            <button key={i} onClick={() => switchPuzzle(i)}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer"
              style={i === puzzleIndex
                ? { background: '#facc15', color: '#000', fontWeight: 600 }
                : { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              {p.label}
            </button>
          ))}
        </div>

        <ParsewordsGame key={puzzle.answer} puzzle={puzzle} />
      </div>
    </div>
  )
}
