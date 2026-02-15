import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import imageCompression from 'browser-image-compression'
import { CrosswordGrid } from '../CrosswordGrid'
import { ImageCropperDialog } from '../components/ImageCropperDialog'
import { useAuth } from '../context/AuthContext'
import { useGetPuzzleByIdQuery, useUpdatePuzzleMutation } from '../store/api/adminApi'
import type { CellType } from '../types'
import { validateClues } from '../utils/clueHelpers'
import { parseGridString, renderGrid } from '../utils/gridRenderer'

export function EditPuzzleClues() {
  const { puzzleId } = useParams<{ puzzleId: string }>()
  const { user, loading: authLoading } = useAuth()
  const isAdmin = user?.isAdmin === true

  const { data: puzzle, isLoading: puzzleLoading } = useGetPuzzleByIdQuery(puzzleId!, {
    skip: !isAdmin || !puzzleId,
  })
  const [updatePuzzle, { isLoading: isSaving }] = useUpdatePuzzleMutation()

  const [cluesJson, setCluesJson] = useState('')
  const [transcribingClues, setTranscribingClues] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)

  const grid = useMemo(() => {
    if (!puzzle?.grid) return [] as CellType[][]
    return parseGridString(puzzle.grid)
  }, [puzzle?.grid])

  const renderedGrid = useMemo(() => {
    if (grid.length === 0) return []
    return renderGrid({ grid, mode: 'view' }).renderedGrid
  }, [grid])

  useEffect(() => {
    if (puzzle && cluesJson.trim().length === 0) {
      setCluesJson(JSON.stringify(puzzle.clues ?? { across: [], down: [] }, null, 2))
    }
  }, [puzzle, cluesJson])

  const validationErrors = useMemo(() => {
    if (!grid.length) return []
    return validateClues(grid, cluesJson)
  }, [grid, cluesJson])

  const handleSelectClueImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropImageSrc(reader.result as string)
      setCropModalOpen(true)
      e.target.value = ''
    }
    reader.readAsDataURL(file)
  }

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropModalOpen(false)
    setTranscribingClues(true)
    setError(null)

    try {
      const compressedFile = await imageCompression(croppedBlob as File, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })

      const reader = new FileReader()
      reader.readAsDataURL(compressedFile)
      reader.onload = async () => {
        try {
          const base64Image = reader.result as string
          const response = await axios.post('/api/clues/from-image', { image: base64Image })
          setCluesJson(JSON.stringify(response.data, null, 2))
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to transcribe clues'
          setError(message)
        } finally {
          setTranscribingClues(false)
          setCropImageSrc(null)
        }
      }
      reader.onerror = () => {
        setError('Failed to process compressed file')
        setTranscribingClues(false)
      }
    } catch {
      setError('Failed to compress image')
      setTranscribingClues(false)
    }
  }

  const handleCropCancel = () => {
    setCropModalOpen(false)
    setCropImageSrc(null)
  }

  const handleSave = async () => {
    if (!puzzleId) return

    let parsedClues: unknown
    try {
      parsedClues = JSON.parse(cluesJson)
    } catch {
      setError('Clues JSON is invalid.')
      return
    }

    if (validationErrors.length > 0) {
      const proceed = confirm(
        `There are ${validationErrors.length} clue validation errors. Save anyway?`,
      )
      if (!proceed) return
    }

    try {
      await updatePuzzle({ id: puzzleId, data: { clues: parsedClues } }).unwrap()
      alert('Clues saved successfully!')
    } catch {
      setError('Failed to save clues.')
    }
  }

  if (authLoading || puzzleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Loading puzzle...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-error/10 border border-error/20 rounded-2xl text-error text-center font-medium">
        Admin access required.
      </div>
    )
  }

  if (!puzzle) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-error/10 border border-error/20 rounded-2xl text-error text-center font-medium">
        Puzzle not found.
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-bold text-text italic tracking-tight">Clue Upload: {puzzle.title}</h1>
          <p className="text-text-secondary text-sm">Grid is locked; update clues only.</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/admin/missing-clues"
            className="px-6 py-2.5 rounded-xl bg-input-bg border border-border text-text-secondary font-bold hover:text-text hover:border-text transition-all text-center no-underline"
          >
            Back to Queue
          </Link>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover transition-all disabled:opacity-50 border-none cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Clues'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-surface p-6 rounded-2xl shadow-xl border border-border">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-bold text-text">Clues JSON</h2>
            <label className="text-xs font-bold text-primary cursor-pointer hover:text-primary-hover flex items-center gap-1">
              {transcribingClues ? (
                <>
                  <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin"></div>
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
                onChange={handleSelectClueImage}
                disabled={transcribingClues}
                className="hidden"
              />
            </label>
          </div>

          <textarea
            value={cluesJson}
            onChange={(e) => setCluesJson(e.target.value)}
            className="w-full min-h-[420px] p-4 rounded-xl bg-input-bg border border-border text-text font-mono text-sm outline-none focus:border-primary"
            spellCheck={false}
          />

          {validationErrors.length > 0 && (
            <div className="mt-4 p-4 bg-error/5 border border-error/20 rounded-xl max-h-56 overflow-y-auto">
              <h4 className="text-error font-bold text-sm mb-2">Validation Issues</h4>
              <ul className="text-xs text-error/90 space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm font-medium">
              {error}
            </div>
          )}
        </div>

        <div className="bg-surface p-6 rounded-2xl shadow-xl border border-border">
          <h2 className="text-xl font-bold text-text mb-3">Grid Preview (Read-only)</h2>
          <p className="text-sm text-text-secondary mb-4">Use this to verify clue numbering and positions.</p>
          <div className="bg-bg p-4 rounded-xl border border-border shadow-inner flex justify-center">
            <CrosswordGrid grid={renderedGrid} mode="view" onCellClick={() => {}} />
          </div>
        </div>
      </div>

      {cropModalOpen && cropImageSrc && (
        <ImageCropperDialog
          imageSrc={cropImageSrc}
          onCancel={handleCropCancel}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  )
}
