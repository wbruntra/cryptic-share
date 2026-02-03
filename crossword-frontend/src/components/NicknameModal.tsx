import { useState } from 'react'

interface NicknameModalProps {
  onSubmit: (nickname: string) => void
}

export function NicknameModal({ onSubmit }: NicknameModalProps) {
  const [nickname, setNickname] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = nickname.trim()
    if (trimmed) {
      onSubmit(trimmed)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg shadow-xl max-w-md w-full p-6 border border-border">
        <h2 className="text-2xl font-bold mb-2 text-text">Choose a Nickname</h2>
        <p className="text-text-secondary mb-6">
          Enter a nickname so others can see your contributions to the puzzle.
        </p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your nickname"
            maxLength={20}
            className="w-full px-4 py-2 bg-input-bg border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text placeholder:text-text-secondary mb-4"
            autoFocus
          />
          
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!nickname.trim()}
              className="flex-1 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed transition-colors font-medium"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
