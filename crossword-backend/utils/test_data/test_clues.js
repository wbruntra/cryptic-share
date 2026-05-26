export const testClues = [
  {
    clue: 'Stay, having put up disgusting student (5)',
    answer: 'DWELL',
    explanation: JSON.parse(`{
  "clue_type": "wordplay",
  "definition": "Stay",
  "wordplay_steps": [
    {
      "tokens": [
        "disgusting"
      ],
      "operation": "synonym",
      "result": "LEWD",
      "clue_after": "Stay, having put up LEWD student (5)"
    },
    {
      "tokens": [
        "having",
        "put",
        "up",
        "LEWD"
      ],
      "operation": "reverse (indicator 'having put up' consumed with fodder)",
      "result": "DWEL",
      "clue_after": "Stay, DWEL student (5)"
    },
    {
      "tokens": [
        "student"
      ],
      "operation": "abbreviate (learner -> L)",
      "result": "L",
      "clue_after": "Stay, DWEL L (5)"
    },
    {
      "tokens": [
        "DWEL",
        "L"
      ],
      "operation": "concatenate (charade)",
      "result": "DWELL",
      "clue_after": "Stay, DWELL (5)"
    }
  ],
  "hint": {
    "definition_location": "start",
    "wordplay_types": [
      "synonym",
      "reversal",
      "abbreviation",
      "charade"
    ]
  },
  "full_explanation": "Definition at the start: 'Stay'. 'disgusting' -> LEWD; 'having put up' reverses LEWD to DWEL; 'student' -> L (learner). DWEL + L yields DWELL."
}`),
  },
  {
    clue: 'SE Asian national ordered to ignore name (7)',
    answer: 'LAOTIAN',
  },
  {
    clue: 'Second free policeman in Ottowa (7)',
    answer: 'MOUNTIE',
  },
  {
    clue: 'How rich old women start argument (3)',
    answer: 'ROW',
    explanation: JSON.parse(`{
  "clue_type": "wordplay",
  "definition": "argument",
  "wordplay_steps": [
    {
      "tokens": [
        "rich",
        "old",
        "women",
        "start"
      ],
      "operation": "initial letters (indicator 'start')",
      "result": "ROW",
      "clue_after": "How ROW argument"
    }
  ],
  "hint": {
    "definition_location": "end",
    "wordplay_types": [
      "initial letters"
    ]
  },
  "full_explanation": "The definition is 'argument' (end of clue). 'Start' indicates taking the starts of 'Rich Old Women', giving R O W = ROW, which is an argument."`),
  },
  {
    clue: "Let's somehow incorporate variable design (5)",
    answer: 'STYLE',
  },
]
