import type { WordplayVisualization, Stage, Segment, ClueToken } from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface NextTargets {
  /** tokenIds of text segments that will be consumed in the next stage */
  textTokenIds: Set<string>
  /** letter strings whose boxes will change or disappear in the next stage */
  changingLetters: Set<string>
}

function getNextTargets(current: Stage, next: Stage | undefined): NextTargets {
  if (!next) return { textTokenIds: new Set(), changingLetters: new Set() }

  const nextTextIds = new Set(
    next.segments.filter((s): s is Extract<Segment, { kind: 'text' }> => s.kind === 'text').map((s) => s.tokenId),
  )
  // Tokens becoming indicators or definition are not fodder — exclude from yellow highlight
  const nextIndicatorIds = new Set(
    next.segments.filter((s): s is Extract<Segment, { kind: 'indicator' }> => s.kind === 'indicator').map((s) => s.tokenId),
  )
  const nextDefinitionIds = new Set(
    next.segments
      .filter((s): s is Extract<Segment, { kind: 'definition' }> => s.kind === 'definition')
      .flatMap((s) => s.tokenIds),
  )

  const textTokenIds = new Set<string>()
  for (const seg of current.segments) {
    if (
      seg.kind === 'text' &&
      !nextTextIds.has(seg.tokenId) &&
      !nextIndicatorIds.has(seg.tokenId) &&
      !nextDefinitionIds.has(seg.tokenId)
    ) {
      textTokenIds.add(seg.tokenId)
    }
  }

  const nextLetterStrings = new Set(
    next.segments
      .filter((s): s is Extract<Segment, { kind: 'letters' }> => s.kind === 'letters')
      .map((s) => s.letters),
  )
  const changingLetters = new Set(
    current.segments
      .filter((s): s is Extract<Segment, { kind: 'letters' }> => s.kind === 'letters')
      .filter((s) => !nextLetterStrings.has(s.letters))
      .map((s) => s.letters),
  )

  return { textTokenIds, changingLetters }
}

// ─── Segment renderers ────────────────────────────────────────────────────────

function TextSegment({
  tokenId,
  tokens,
  isTarget,
}: {
  tokenId: string
  tokens: ClueToken[]
  isTarget: boolean
}) {
  const text = tokens.find((t) => t.id === tokenId)?.text ?? tokenId
  if (isTarget) {
    return (
      <span
        style={{ backgroundColor: '#f4d35e' }}
        className="inline-flex items-center px-2 py-0.5 rounded text-black font-bold font-mono uppercase text-sm tracking-wide"
      >
        {text.toUpperCase()}
      </span>
    )
  }
  return <span className="text-[var(--color-text-secondary)] px-0.5">{text}</span>
}

function LettersSegment({ letters, isTarget }: { letters: string; isTarget: boolean }) {
  if (isTarget) {
    return (
      <span
        style={{ backgroundColor: '#f4d35e' }}
        className="inline-flex items-center px-2.5 py-1 rounded-md text-black font-mono font-bold tracking-widest uppercase text-sm"
      >
        {letters}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-100 font-mono font-bold tracking-widest uppercase text-sm shadow-[0_0_8px_rgba(245,158,11,0.15)]">
      {letters}
    </span>
  )
}

function IndicatorSegment({
  tokenId,
  tooltip,
  tokens,
}: {
  tokenId: string
  tooltip: string
  tokens: ClueToken[]
}) {
  const text = tokens.find((t) => t.id === tokenId)?.text ?? tokenId
  return (
    <span className="relative group inline-flex flex-col items-center">
      <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm cursor-help gap-1.5">
        {text}
        <span className="text-emerald-500/70 text-xs">↗</span>
      </span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-emerald-950 text-emerald-200 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none border border-emerald-700/50 z-10 shadow-lg">
        {tooltip}
      </span>
    </span>
  )
}

function DefinitionSegment({ tokenIds, tokens }: { tokenIds: string[]; tokens: ClueToken[] }) {
  const text = tokenIds.map((id) => tokens.find((t) => t.id === id)?.text ?? '').join(' ')
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-violet-500/15 border border-violet-500/40 text-violet-200 text-sm italic">
      {text}
    </span>
  )
}

function SegmentDisplay({
  segment,
  tokens,
  targets,
}: {
  segment: Segment
  tokens: ClueToken[]
  targets: NextTargets
}) {
  switch (segment.kind) {
    case 'text':
      return (
        <TextSegment
          tokenId={segment.tokenId}
          tokens={tokens}
          isTarget={targets.textTokenIds.has(segment.tokenId)}
        />
      )
    case 'letters':
      return <LettersSegment letters={segment.letters} isTarget={targets.changingLetters.has(segment.letters)} />
    case 'indicator':
      return <IndicatorSegment tokenId={segment.tokenId} tooltip={segment.tooltip} tokens={tokens} />
    case 'definition':
      return <DefinitionSegment tokenIds={segment.tokenIds} tokens={tokens} />
  }
}

// ─── Stage row ────────────────────────────────────────────────────────────────

function StageRow({
  segments,
  tokens,
  targets,
  nextAnnotation,
  isFinal,
  isFirst,
}: {
  segments: Segment[]
  tokens: ClueToken[]
  targets: NextTargets
  nextAnnotation?: string
  isFinal: boolean
  isFirst: boolean
}) {
  const hasDefinition = segments.some((s) => s.kind === 'definition')

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      {/* Clue row */}
      <div className="flex-1 min-w-0">
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg px-3 py-2.5 transition-colors ${
            isFinal
              ? 'bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm'
              : isFirst
                ? 'bg-transparent'
                : 'bg-[var(--color-surface)]/40'
          }`}
        >
          {segments.map((seg, i) => {
            const isDefinition = seg.kind === 'definition'
            const isFirstSeg = i === 0
            const eq = (
              <span className="text-[var(--color-text-secondary)]/40 font-mono text-sm">=</span>
            )
            return (
              <span key={i} className="contents">
                {/* = before definition when it isn't the first segment */}
                {isDefinition && !isFirstSeg && eq}
                <SegmentDisplay segment={seg} tokens={tokens} targets={targets} />
                {/* = after definition when it is the first segment */}
                {isDefinition && isFirstSeg && eq}
              </span>
            )
          })}
        </div>
      </div>

      {/* Annotation column — shows what is about to happen */}
      <div className="shrink-0 w-44 hidden sm:block">
        {nextAnnotation && (
          <span className="text-xs text-[var(--color-text-secondary)]/60 font-mono leading-tight">
            {nextAnnotation}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Connector ────────────────────────────────────────────────────────────────

function StageConnector() {
  return (
    <div className="flex items-start gap-4 sm:gap-6">
      <div className="flex-1 flex items-center pl-4">
        <div className="flex flex-col items-center">
          <div className="w-px h-2 bg-[var(--color-border)]" />
          <svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            className="text-[var(--color-border)] fill-current"
          >
            <path d="M5 6L0 0h10L5 6z" />
          </svg>
        </div>
      </div>
      {/* Keep the annotation column width so the arrow stays aligned */}
      <div className="shrink-0 w-44 hidden sm:block" />
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-secondary)]/70">
      <div className="flex items-center gap-1.5">
        <span
          style={{ backgroundColor: '#f4d35e' }}
          className="w-3 h-3 rounded-sm inline-block"
        />
        about to be used
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm bg-amber-500/30 border border-amber-500/50 inline-block" />
        letter box
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/40 inline-block" />
        indicator (hover for role)
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm bg-violet-500/20 border border-violet-500/40 inline-block" />
        definition
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WordplayVisualizer({ visualization }: { visualization: WordplayVisualization }) {
  const { clue, answer, tokens, stages } = visualization

  return (
    <div className="space-y-1 w-full">
      {/* Clue header */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]/60 mb-1">
          Clue
        </p>
        <p className="text-[var(--color-text)] text-base italic">"{clue}"</p>
      </div>

      {/* Answer badge */}
      <div className="flex items-center gap-2 mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]/60">
          Answer
        </p>
        <div className="flex gap-0.5">
          {answer.split('').map((letter, i) => (
            <span
              key={i}
              className="w-7 h-7 flex items-center justify-center rounded bg-amber-500/20 border border-amber-500/50 text-amber-100 font-mono font-bold text-sm"
            >
              {letter}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <Legend />

      {/* Divider */}
      <div className="border-t border-[var(--color-border)] my-4" />

      {/* Stages */}
      <div className="space-y-0">
        {stages.map((stage, i) => {
          const isFinal = i === stages.length - 1
          const isFirst = i === 0
          const nextStage = stages[i + 1]
          const targets = getNextTargets(stage, nextStage)

          return (
            <div key={stage.id}>
              <StageRow
                segments={stage.segments}
                tokens={tokens}
                targets={targets}
                nextAnnotation={stage.annotation}
                isFinal={isFinal}
                isFirst={isFirst}
              />
              {!isFinal && <StageConnector />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
