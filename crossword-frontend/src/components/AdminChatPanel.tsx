import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: 'Ask for help with crossword clues.',
}

export function AdminChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setError(null)
    setLoading(true)

    try {
      const { data } = await axios.post('/api/admin/chat', { message: trimmed })
      const assistantMsg: ChatMessage = { role: 'assistant', content: data.reply }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE])
    setError(null)
  }

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-bold tracking-widest text-text-secondary uppercase">
          Chat Helper
        </h3>
        <button
          onClick={clearChat}
          className="text-xs text-text-secondary hover:text-text px-2 py-1 rounded border border-border hover:border-text-secondary transition-colors cursor-pointer"
        >
          Clear
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-primary/10 text-text rounded-xl rounded-br-sm px-3 py-2 ml-8'
                : 'bg-input-bg text-text rounded-xl rounded-bl-sm px-3 py-2 mr-8'
            }`}
          >
            {msg.content}
          </div>
        ))}

        {loading && (
          <div className="bg-input-bg text-text-secondary rounded-xl rounded-bl-sm px-3 py-2 mr-8 text-sm">
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 px-2">
            Error: {error}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage() }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-input-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-hover disabled:opacity-40 transition-colors cursor-pointer shrink-0"
          >
            {loading ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
