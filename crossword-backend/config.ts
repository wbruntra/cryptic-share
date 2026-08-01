export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-password'
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret'

export const OPENROUTER_MODELS = {
  flash: 'google/gemini-3-flash-preview',
  ['flash-3.5']: 'google/gemini-3.6-flash',
  ['flash-3.6']: 'google/gemini-3.6-flash',
  gemini: 'google/gemini-3-pro-preview',
  haiku: 'anthropic/claude-haiku-4.5',
  sonnet: 'anthropic/claude-sonnet-4.6',
  [`gpt-5-mini`]: 'openai/gpt-5-mini',
  [`gpt-5.4-mini`]: 'openai/gpt-5.4-mini',
  [`deepseek-flash`]: 'deepseek/deepseek-v4-flash',
  [`deepseek-pro`]: 'deepseek/deepseek-v4-pro',
  [`mimo-pro`]: 'xiaomi/mimo-v2.5-pro',
  [`qwen-max`]: 'qwen/qwen3.7-max',
  [`grok-4.3`]: 'x-ai/grok-4.3',
  [`gpt-luna`]: 'openai/gpt-5.6-luna',
  [`gpt-terra`]: 'openai/gpt-5.6-terra',
  [`flash-3.5-lite`]: 'google/gemini-3.5-flash-lite',
}

// cd /home/william/src/tries/2026-01-06-cryptic-share/crossword-backend && bun scripts/test-gpt-luna.ts openai/gpt-5.6-luna 3 --plain-gpt-luna.ts openai/gpt-5.6-luna-pro 3 --plain 
// bun scripts/test-gpt-luna.ts openai/gpt-5.6-terra 3 --plain


