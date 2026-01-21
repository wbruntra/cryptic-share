import { useState } from 'react'

export type ClueExplanation =
  | WordplayExplanation
  | DoubleDefinitionExplanation
  | AndLitExplanation
  | CrypticDefinitionExplanation

export interface WordplayExplanation {
  clue_type: 'wordplay'
  definition: string
  letter_breakdown: Array<{ source: string; letters: string }>
  wordplay_steps?: Array<{ indicator: string; operation: string; result: string }>
  hint: {
    definition_location: 'start' | 'end'
    wordplay_types: string[]
  } | string
  full_explanation: string
}

export interface DoubleDefinitionExplanation {
  clue_type: 'double_definition'
  definitions: Array<{ definition: string; sense?: string }> | string[]
  hint: { definition_count: 2 } | string
  full_explanation: string
}

export interface AndLitExplanation {
  clue_type: '&lit'
  definition_scope: 'entire_clue'
  letter_breakdown: Array<{ source: string; letters: string }>
  wordplay_steps?: Array<{ indicator: string; operation: string; result: string }>
  hint: { wordplay_types: string[] } | string
  full_explanation: string
}

export interface CrypticDefinitionExplanation {
  clue_type: 'cryptic_definition'
  definition_scope: 'entire_clue'
  definition_paraphrase: string
  hint: { definition_scope: 'entire_clue' }
  full_explanation: string
}

type RevealedSections = {
  definition: boolean
  wordplayTypes: boolean
  wordplaySteps: boolean
  fullExplanation: boolean
}

interface ClueExplanationDisplayProps {
  explanation: ClueExplanation
}

export function ClueExplanationDisplay({ explanation }: ClueExplanationDisplayProps) {
  const [revealedSections, setRevealedSections] = useState<RevealedSections>({
    definition: false,
    wordplayTypes: false,
    wordplaySteps: false,
    fullExplanation: false,
  })

  const revealSection = (section: keyof RevealedSections) => {
    setRevealedSections((prev) => ({ ...prev, [section]: true }))
  }

  const renderWordplayExplanation = (exp: WordplayExplanation) => (
    <>
      <ExplanationSection
        title="📖 Definition"
        revealed={revealedSections.definition}
        onReveal={() => revealSection('definition')}
      >
        <p className="text-text">
          <span className="font-semibold">"{exp.definition}"</span>
          {typeof exp.hint === 'object' && exp.hint.definition_location && (
            <span className="text-text-secondary ml-2">
              (at the {exp.hint.definition_location} of the clue)
            </span>
          )}
        </p>
      </ExplanationSection>

      {typeof exp.hint === 'object' && exp.hint.wordplay_types && exp.hint.wordplay_types.length > 0 && (
        <ExplanationSection
          title="🧩 Wordplay Types"
          revealed={revealedSections.wordplayTypes}
          onReveal={() => revealSection('wordplayTypes')}
        >
          <div className="flex flex-wrap gap-2">
            {exp.hint.wordplay_types.map((type, i) => (
              <span key={i} className="px-3 py-1 bg-secondary/10 text-secondary text-sm rounded-full">
                {type}
              </span>
            ))}
          </div>
        </ExplanationSection>
      )}

      {(!exp.wordplay_steps || exp.wordplay_steps.length === 0) && exp.letter_breakdown.length > 0 && (
        <ExplanationSection
          title="🔤 Letter Breakdown"
          revealed={revealedSections.wordplaySteps}
          onReveal={() => revealSection('wordplaySteps')}
        >
          <div className="space-y-3">
            {exp.letter_breakdown.map((part, i) => (
              <div key={i} className="bg-surface-highlight border border-border/50 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center min-w-[2rem] h-8 bg-primary/20 text-primary text-sm font-bold rounded px-2 shrink-0">
                    {part.letters}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-text">
                      <span className="text-text-secondary">from:</span> {part.source}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ExplanationSection>
      )}

      {exp.wordplay_steps && exp.wordplay_steps.length > 0 && (
        <ExplanationSection
          title="🛠️ Wordplay Breakdown"
          revealed={revealedSections.wordplaySteps}
          onReveal={() => revealSection('wordplaySteps')}
        >
          <div className="space-y-4">
            {exp.wordplay_steps.map((step, i) => (
              <div key={i} className="bg-surface-highlight border border-border/50 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 bg-primary/20 text-primary text-xs font-bold rounded-full shrink-0 mt-0.5">
                    {i + 1}
                  </span>

                  <div className="flex-1 space-y-2">
                    {step.indicator !== 'None' && (
                      <div>
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          Clue:
                        </span>
                        <p className="text-sm font-medium text-text mt-0.5">"{step.indicator}"</p>
                      </div>
                    )}

                    <div>
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                        Operation:
                      </span>
                      <p className="text-sm text-text mt-0.5">{step.operation}</p>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                        Result:
                      </span>
                      <p className="text-sm font-bold text-primary mt-0.5">{step.result}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ExplanationSection>
      )}
    </>
  )

  const renderDoubleDefinitionExplanation = (exp: DoubleDefinitionExplanation) => (
    <>
      <ExplanationSection
        title="📖 Two Definitions"
        revealed={revealedSections.definition}
        onReveal={() => revealSection('definition')}
      >
        <div className="space-y-3">
          {(Array.isArray(exp.definitions) ? exp.definitions : []).map((def, i) => {
            const definition = typeof def === 'string' ? def : def.definition
            const sense = typeof def === 'string' ? undefined : def.sense

            return (
              <div key={i} className="flex items-start gap-3">
                <span className="text-primary font-bold text-sm mt-0.5">{i + 1}.</span>
                <div>
                  <p className="text-text font-medium">"{definition}"</p>
                  {sense && <p className="text-text-secondary text-sm">{sense}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </ExplanationSection>

      <ExplanationSection
        title="💡 Hint"
        revealed={revealedSections.wordplayTypes}
        onReveal={() => revealSection('wordplayTypes')}
      >
        <p className="text-text">
          {typeof exp.hint === 'string'
            ? exp.hint
            : 'Two distinct definitions point to the same answer.'}
        </p>
      </ExplanationSection>
    </>
  )

  const renderAndLitExplanation = (exp: AndLitExplanation) => (
    <>
      <ExplanationSection
        title="📖 Definition"
        revealed={revealedSections.definition}
        onReveal={() => revealSection('definition')}
      >
        <p className="text-text">
          <span className="font-semibold">The entire clue serves as both definition and wordplay</span>
          <span className="text-text-secondary block mt-2 text-sm">
            This is an "&amp;lit" (all-in-one) clue where every word works double duty.
          </span>
        </p>
      </ExplanationSection>

      {typeof exp.hint === 'object' && exp.hint.wordplay_types && exp.hint.wordplay_types.length > 0 && (
        <ExplanationSection
          title="🧩 Wordplay Types"
          revealed={revealedSections.wordplayTypes}
          onReveal={() => revealSection('wordplayTypes')}
        >
          <div className="flex flex-wrap gap-2">
            {exp.hint.wordplay_types.map((type, i) => (
              <span key={i} className="px-3 py-1 bg-secondary/10 text-secondary text-sm rounded-full">
                {type}
              </span>
            ))}
          </div>
        </ExplanationSection>
      )}

      {(!exp.wordplay_steps || exp.wordplay_steps.length === 0) && exp.letter_breakdown.length > 0 && (
        <ExplanationSection
          title="🔤 Letter Breakdown"
          revealed={revealedSections.wordplaySteps}
          onReveal={() => revealSection('wordplaySteps')}
        >
          <div className="space-y-3">
            {exp.letter_breakdown.map((part, i) => (
              <div key={i} className="bg-surface-highlight border border-border/50 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center min-w-[2rem] h-8 bg-primary/20 text-primary text-sm font-bold rounded px-2 shrink-0">
                    {part.letters}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-text">
                      <span className="text-text-secondary">from:</span> {part.source}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ExplanationSection>
      )}

      {exp.wordplay_steps && exp.wordplay_steps.length > 0 && (
        <ExplanationSection
          title="🛠️ Wordplay Breakdown"
          revealed={revealedSections.wordplaySteps}
          onReveal={() => revealSection('wordplaySteps')}
        >
          <div className="space-y-4">
            {exp.wordplay_steps.map((step, i) => (
              <div key={i} className="bg-surface-highlight border border-border/50 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 bg-primary/20 text-primary text-xs font-bold rounded-full shrink-0 mt-0.5">
                    {i + 1}
                  </span>

                  <div className="flex-1 space-y-2">
                    {step.indicator !== 'None' && (
                      <div>
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          Clue:
                        </span>
                        <p className="text-sm font-medium text-text mt-0.5">"{step.indicator}"</p>
                      </div>
                    )}

                    <div>
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                        Operation:
                      </span>
                      <p className="text-sm text-text mt-0.5">{step.operation}</p>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                        Result:
                      </span>
                      <p className="text-sm font-bold text-primary mt-0.5">{step.result}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ExplanationSection>
      )}
    </>
  )

  const renderCrypticDefinitionExplanation = (exp: CrypticDefinitionExplanation) => (
    <>
      <ExplanationSection
        title="📖 Cryptic Definition"
        revealed={revealedSections.definition}
        onReveal={() => revealSection('definition')}
      >
        <div className="space-y-3">
          <p className="text-text">
            <span className="font-semibold">The entire clue is a single, misleading definition</span>
            <span className="text-text-secondary block mt-2 text-sm">
              No wordplay - just a clever, oblique way to describe the answer.
            </span>
          </p>
          <div className="border-l-4 border-primary/50 pl-3 mt-3">
            <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-1">
              What it's defining:
            </p>
            <p className="text-text">{exp.definition_paraphrase}</p>
          </div>
        </div>
      </ExplanationSection>
    </>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Render sections based on clue type */}
      {explanation.clue_type === 'wordplay' &&
        renderWordplayExplanation(explanation as WordplayExplanation)}

      {explanation.clue_type === 'double_definition' &&
        renderDoubleDefinitionExplanation(explanation as DoubleDefinitionExplanation)}

      {explanation.clue_type === '&lit' &&
        renderAndLitExplanation(explanation as AndLitExplanation)}

      {explanation.clue_type === 'cryptic_definition' &&
        renderCrypticDefinitionExplanation(explanation as CrypticDefinitionExplanation)}

      {/* Full Explanation (common to all types) */}
      <ExplanationSection
        title="📝 Full Explanation"
        revealed={revealedSections.fullExplanation}
        onReveal={() => revealSection('fullExplanation')}
      >
        <p className="text-text whitespace-pre-wrap leading-relaxed">
          {'full_explanation' in explanation ? explanation.full_explanation : ''}
        </p>
      </ExplanationSection>
    </div>
  )
}

// Helper component for revealable sections
function ExplanationSection({
  title,
  revealed,
  onReveal,
  children,
}: {
  title: string
  revealed: boolean
  onReveal: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className={`flex justify-between items-center px-4 py-3 ${
          revealed ? 'bg-surface' : 'bg-surface hover:bg-surface-highlight cursor-pointer'
        }`}
        onClick={!revealed ? onReveal : undefined}
      >
        <span className="font-medium text-text">{title}</span>
        {!revealed && (
          <button
            onClick={onReveal}
            className="px-3 py-1 text-sm font-medium text-primary bg-primary/10 rounded hover:bg-primary/20 transition-colors"
          >
            Reveal
          </button>
        )}
      </div>
      {revealed && <div className="px-4 py-3 border-t border-border bg-bg">{children}</div>}
    </div>
  )
}
