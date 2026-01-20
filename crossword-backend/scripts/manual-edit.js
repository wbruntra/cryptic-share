const db = require('../db-knex').default

const run = async () => {
  const ce = await db('clue_explanations as ce')
    .join('puzzles as p', 'ce.puzzle_id', 'p.id')
    .select('ce.*')
    .where('p.puzzle_number', 27)
    .where({
      'ce.clue_number': 18,
    })
    .first()

  const correct_answer = {
    definition: 'this sultanate',
    letter_breakdown: [
      {
        source: "Anagram of 'neighbours' minus 'gosh'",
        letters: 'BRUNEI',
      },
    ],
    wordplay_steps: [
      {
        indicator: 'could make',
        operation: 'Compound Connector',
        result: 'GOSH + BRUNEI',
      },
      {
        indicator: 'angry',
        operation: "anagram of 'neighbours'",
        result: 'GOSH + BRUNEI',
      },
    ],
    hint: {
      definition_location: 'start',
      wordplay_types: ['Compound Anagram', 'Subtraction'],
    },
    full_explanation:
      "This is a Compound (or Composite) Anagram. The clue sets up an algebraic equation: 'Gosh' combined with 'this sultanate' (the answer) 'could make' the word 'neighbours' (if made 'angry'/shuffled). To solve it, you take the letters of NEIGHBOURS and subtract the letters of GOSH (G-O-S-H), leaving N-E-I-B-U-R, which rearranges to BRUNEI.",
  }

  const answer2 = {
    definition: "He'd treat your skin",
    letter_breakdown: [
      {
        source: 'Double Definition',
        letters: 'TANNER',
      },
    ],
    wordplay_steps: [
      {
        indicator: "He'd treat your skin",
        operation: 'Definition 1: A person who cures animal hides/skins into leather',
        result: 'TANNER',
      },
      {
        indicator: 'a bit in the past',
        operation: 'Definition 2: Old British slang for a sixpence coin',
        result: 'TANNER',
      },
    ],
    hint: {
      definition_location: 'start',
      wordplay_types: ['Double Definition'],
    },
    full_explanation:
      "This is a Double Definition clue. The first definition is straightforward: a 'tanner' is a worker who treats animal skins to make leather. The second definition, 'a bit in the past,' relies on British history. A 'bit' is a common term for a coin or money (e.g., 'threepenny bit'). In pre-decimal Britain (the past), a sixpence coin was colloquially known as a 'tanner'.",
  }

  console.log(ce)

  await db('clue_explanations')
    .where({ id: ce.id })
    .update({ explanation_json: JSON.stringify(correct_answer) })
}

run().then(() => {
  process.exit(0)
})
