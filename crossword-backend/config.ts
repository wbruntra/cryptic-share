export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-password'
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret'

export const OPENROUTER_MODELS = {
  flash: 'google/gemini-3.7-flash',
  ['flash-3.7']: 'google/gemini-3.7-flash',
  gemini: 'google/gemini-3-pro-preview',
  haiku: 'anthropic/claude-haiku-4.5',
  sonnet: 'anthropic/claude-sonnet-4.6',
  [`gpt-5-mini`]: 'openai/gpt-5-mini',
  [`gpt-5.4-mini`]: 'openai/gpt-5.4-mini',
  [`deepseek-flash`]: 'deepseek/deepseek-v4-flash',
  [`deepseek-pro`]: 'deepseek/deepseek-v4-pro',
  [`mimo-pro`]: 'xiaomi/mimo-v2.5-pro',
  [`qwen-max`]: 'qwen/qwen3.7-max',
  [`grok`]: 'x-ai/grok-4.6',
  [`gpt-luna`]: 'openai/gpt-5.6-luna',
  [`gpt-terra`]: 'openai/gpt-5.6-terra',
  [`flash-3.5-lite`]: 'google/gemini-3.5-flash-lite',
  [`muse-spark`]: 'meta/muse-spark-1.3-contributor',
}

/**
 * Raw (non-prefixed) model id for calling a provider's own SDK directly
 * (e.g. OpenAI's `responses.create`), derived from the OpenRouter slug above
 * so each model has a single source of truth regardless of which API calls it.
 */
export function directModelId(key: keyof typeof OPENROUTER_MODELS): string {
  return OPENROUTER_MODELS[key].replace(/^[^/]+\//, '')
}

export const DIRECT_MODELS = {
  gptLuna: directModelId('gpt-luna'),
}

// cd /home/william/src/tries/2026-01-06-cryptic-share/crossword-backend && bun scripts/test-gpt-luna.ts openai/gpt-5.6-luna 3 --plain-gpt-luna.ts openai/gpt-5.6-luna-pro 3 --plain 
// bun scripts/test-gpt-luna.ts openai/gpt-5.6-terra 3 --plain


