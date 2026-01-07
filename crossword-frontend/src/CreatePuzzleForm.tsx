import { useState, useEffect } from 'react'
import axios from 'axios'
import { parseGridString, parseGridJson, renderGrid } from './utils/gridRenderer'
import { CrosswordGrid } from './CrosswordGrid'
import type { PuzzleSummary } from './types'

interface CreatePuzzleFormProps {
  onSubmit: (title: string, grid: string, cluesJson: string) => Promise<void>
  onCancel: () => void
  initialData?: {
    title: string
    grid: string
    cluesJson: string
  }
  isEdit?: boolean
}

export function CreatePuzzleForm({
  onSubmit,
  onCancel,
  initialData,
  isEdit,
}: CreatePuzzleFormProps) {
  const [title, setTitle] = useState(initialData?.title || '')
  const [grid, setGrid] = useState(initialData?.grid || '')
  const [cluesJson, setCluesJson] = useState(initialData?.cluesJson || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => {
    axios
      .get('/api/puzzles')
      .then((res) => setPuzzles(res.data))
      .catch(console.error)
  }, [])

  const handleCopyGrid = async (id: number) => {
    if (!id) return
    try {
      const res = await axios.get(`/api/puzzles/${id}`)
      setGrid(res.data.grid)
    } catch (err) {
      console.error(err)
      setError('Failed to copy grid')
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }

    setTranscribing(true)
    setError(null)

    try {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        try {
          const base64Image = reader.result as string
          const response = await axios.post('/api/clues/from-image', {
            image: base64Image,
          })
          setCluesJson(JSON.stringify(response.data, null, 2))
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to transcribe clues'
          console.error('Transcription error:', err)
          setError('Transcription failed: ' + message)
        } finally {
          setTranscribing(false)
        }
      }
      reader.onerror = () => {
        setError('Failed to read file')
        setTranscribing(false)
      }
    } catch (err) {
      console.error(err)
      setError('Failed to process image')
      setTranscribing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim() || !grid.trim() || !cluesJson.trim()) {
      setError('All fields are required')
      return
    }

    try {
      JSON.parse(cluesJson)
    } catch {
      setError('Invalid JSON format for clues')
      return
    }

    let formattedGrid = ''
    try {
      const parsedJson = parseGridJson(grid)
      if (parsedJson.length > 0) {
        formattedGrid = parsedJson.map((row) => row.join(' ')).join('\n')
      } else {
        const parsedString = parseGridString(grid)
        if (parsedString.length > 0 && parsedString[0].length > 0) {
          formattedGrid = parsedString.map((row) => row.join(' ')).join('\n')
        } else {
          throw new Error('Invalid grid format. Use JSON array or newline-separated rows.')
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid grid format'
      setError('Grid Error: ' + message)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(title, formattedGrid, cluesJson)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save puzzle'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const previewGridData = (() => {
    const parsedJson = parseGridJson(grid)
    if (parsedJson.length > 0) return parsedJson
    return parseGridString(grid)
  })()

  const { renderedGrid: previewRenderedGrid } = renderGrid({
    grid: previewGridData,
    mode: 'view',
  })

  const inputClasses =
    'w-full px-4 py-2.5 rounded-xl bg-input-bg border border-border text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-mono text-sm'
  const labelClasses = 'block text-sm font-semibold mb-2 text-text-secondary'

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8 bg-surface p-6 md:p-8 rounded-2xl shadow-xl border border-border"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Metadata and Clues */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-text italic tracking-tight border-b border-border pb-4">
            {isEdit ? 'Edit Puzzle' : 'Create New Puzzle'}
          </h2>

          <div>
            <label htmlFor="title" className={labelClasses}>
              Puzzle Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Cryptic #2"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="copy-grid" className={labelClasses}>
              Copy Grid Layout From (Optional)
            </label>
            <select
              id="copy-grid"
              onChange={(e) => handleCopyGrid(Number(e.target.value))}
              defaultValue=""
              className={`${inputClasses} cursor-pointer`}
            >
              <option value="" disabled>
                Select existing puzzle...
              </option>
              {puzzles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="clues" className="text-sm font-semibold text-text-secondary">
                Clues (JSON format)
              </label>
              <label className="text-xs font-bold text-primary cursor-pointer hover:text-primary-hover flex items-center gap-1 group">
                {transcribing ? (
                  <>
                    <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin"></div>{' '}
                    Transcribing...
                  </>
                ) : (
                  <>
                    <span>✨</span> Auto-fill from Image
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={transcribing}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              id="clues"
              value={cluesJson}
              onChange={(e) => setCluesJson(e.target.value)}
              placeholder='{"across": [{"number": 1, "clue": "..."}], "down": [...]}'
              rows={15}
              className={`${inputClasses} resize-y min-h-[300px]`}
            />
          </div>
        </div>

        {/* Right Column: Grid and Preview */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-text italic tracking-tight border-b border-border pb-4 invisible md:visible">
            Grid Layout
          </h2>

          <div>
            <label htmlFor="grid" className={labelClasses}>
              Grid Representation (JSON Array or Newlines)
            </label>
            <textarea
              id="grid"
              value={grid}
              onChange={(e) => setGrid(e.target.value)}
              placeholder='["N W N...", "W B W..."] OR&#10;N W N...&#10;W B W...'
              rows={10}
              className={`${inputClasses} resize-y min-h-[220px]`}
            />
          </div>

          <div>
            <label className={labelClasses}>Visual Preview</label>
            <div className="bg-bg rounded-xl border border-border p-4 flex items-center justify-center min-h-[350px] shadow-inner relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              {previewRenderedGrid.length > 0 ? (
                <div className="transform scale-90 sm:scale-100 transition-transform">
                  <CrosswordGrid grid={previewRenderedGrid} mode="view" onCellClick={() => {}} />
                </div>
              ) : (
                <div className="text-text-secondary italic text-sm text-center">
                  <p>Enter grid data above to see preview</p>
                  <p className="text-[10px] mt-2 opacity-50 uppercase tracking-widest">
                    Awaiting valid format
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-border">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-3 px-8 rounded-xl bg-primary text-white font-bold shadow-lg hover:bg-primary-hover hover:shadow-xl active:scale-[0.98] disabled:opacity-50 transition-all border-none cursor-pointer flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
              Saving...
            </>
          ) : isEdit ? (
            'Update Puzzle'
          ) : (
            'Create Puzzle'
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="py-3 px-8 rounded-xl bg-input-bg border border-border text-text-secondary font-bold hover:text-text hover:border-text transition-all active:scale-[0.98] border-none cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
