interface EditOutputProps {
  outputString: string
  onSave: () => void
  saving: boolean
}

export function EditOutput({ outputString, onSave, saving }: EditOutputProps) {
  return (
    <div className="mt-8 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-text-secondary">Grid Data (Serialized)</label>
        <textarea
          readOnly
          value={outputString}
          onClick={(e) => e.currentTarget.select()}
          className="w-full px-4 py-3 rounded-xl bg-input-bg border border-border text-text font-mono text-xs h-32 focus:border-primary outline-none transition-all cursor-all-scroll shadow-inner"
          title="Click to select all"
        />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
        <p className="text-sm text-text-secondary italic m-0">
          <span className="font-bold text-primary mr-2">Hint:</span>
          Click a cell to cycle:{' '}
          <span className="text-text font-medium px-1.5 py-0.5 bg-surface border border-border rounded">
            N
          </span>{' '}
          (Numbered) →{' '}
          <span className="text-text font-medium px-1.5 py-0.5 bg-surface border border-border rounded">
            W
          </span>{' '}
          (White) →{' '}
          <span className="text-text font-medium px-1.5 py-0.5 bg-surface border border-border rounded">
            B
          </span>{' '}
          (Black)
        </p>
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full sm:w-auto px-8 py-3 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 transition-all border-none cursor-pointer flex items-center justify-center gap-2"
        >
          {saving && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          )}
          {saving ? 'Saving...' : 'Save Current Grid'}
        </button>
      </div>
    </div>
  )
}
