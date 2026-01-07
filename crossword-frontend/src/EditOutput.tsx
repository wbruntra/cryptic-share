interface EditOutputProps {
    outputString: string
    onSave: () => void
    saving: boolean
}

export function EditOutput({ outputString, onSave, saving }: EditOutputProps) {
    return (
        <>
            <textarea 
                readOnly 
                value={outputString} 
                onClick={(e) => e.currentTarget.select()}
            />
            <p>Click a cell to cycle: Numbered -&gt; White -&gt; Black</p>
            <button onClick={onSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Grid'}
            </button>
        </>
    )
}
