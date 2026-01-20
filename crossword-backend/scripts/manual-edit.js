const db = require('../db-knex').default

const run = async () => {
  const ce = await db('clue_explanations as ce').join('puzzles as p', 'ce.puzzle_id', 'p.id').select('ce.*').where('p.puzzle_number', 27).where({
    'ce.clue_number': 18}
  ).first()

  const correct_answer = {
  "definition": "this sultanate",
  "letter_breakdown": [
    {
      "source": "Anagram of 'neighbours' minus 'gosh'",
      "letters": "BRUNEI"
    }
  ],
  "wordplay_steps": [
    {
      "indicator": "angry",
      "operation": "Anagram Indicator",
      "result": "Indicates letters of 'neighbours' are the target composition"
    },
    {
      "indicator": "could make",
      "operation": "Compound Connector",
      "result": "GOSH + ANSWER = NEIGHBOURS"
    },
    {
      "indicator": "None",
      "operation": "Subtraction",
      "result": "NEIGHBOURS (minus) GOSH = NEIBUR"
    },
    {
      "indicator": "None",
      "operation": "Rearrangement",
      "result": "NEIBUR becomes BRUNEI"
    }
  ],
  "hint": {
    "definition_location": "start",
    "wordplay_types": [
      "Compound Anagram",
      "Subtraction"
    ]
  },
  "full_explanation": "This is a Compound (or Composite) Anagram. The clue sets up an algebraic equation: 'Gosh' combined with 'this sultanate' (the answer) 'could make' the word 'neighbours' (if made 'angry'/shuffled). To solve it, you take the letters of NEIGHBOURS and subtract the letters of GOSH (G-O-S-H), leaving N-E-I-B-U-R, which rearranges to BRUNEI."
}

  console.log(ce)

  await db('clue_explanations').where({id: ce.id}).update({explanation_json: JSON.stringify(correct_answer)})
}

run().then(() => {
  process.exit(0)
})
