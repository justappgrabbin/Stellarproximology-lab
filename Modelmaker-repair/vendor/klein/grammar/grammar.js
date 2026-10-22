// Pure Synthia Automata — phrase-structure grammar for the tool-call language (spec §10)

/**
 * GRAMMAR — descriptive production rules for the deterministic tool-call
 * language. Tool calls are sentences (L5); chained calls are discourse (L6).
 * This object documents the language and is consumed by parser tests; the
 * executable recursive-descent parser lives in ./parser.js.
 *
 * Language overview (spec §10):
 *
 *   chain       → call (THEN chain)?          // right-associative; `A then B then C`
 *   call        → TOOL args
 *   args        → (arg)*
 *   arg         → STRING | words | NUMBER | flag | address
 *   words       → WORD+                        // consecutive bare words = one arg
 *   address     → AT NUMBER (DOT NUMBER){0,4}  // gate[.line[.color[.tone[.base]]]]
 *   flag        → FLAG                         // --word or --word=value
 *
 * Two-call form `A then B` = o_sequence(A_call, B_call): B receives A's
 * derivation packet (contract hard rule 3). Longer chains compose
 * associatively to the right: `A then (B then C)`.
 */

export const GRAMMAR = {
  name: 'synthia-tool-call',
  version: 'automata.1.0',
  start: 'chain',

  nonterminals: ['chain', 'call', 'args', 'arg', 'words', 'address', 'flag'],

  terminals: {
    TOOL: {
      description:
        'Tool name: one of the 16 registered canonical tool ids (lexicon.TOOL_IDS) ' +
        'or an alias resolved via lexicon.TOOL_ALIASES. Always the first word of a call.',
    },
    THEN: {
      description:
        "Chain keyword 'then' (lexicon.KEYWORDS.chain). Right-associative sequencing " +
        'operator o_sequence at L6.',
    },
    AT: {
      description:
        "Address marker 'at' (lexicon.KEYWORDS.addressMarker). Introduces a canonical " +
        'address argument (spec §2).',
    },
    STRING: {
      description:
        "Quoted string literal: 'single' or \"double\" quotes, with \\\\ \\' \\\" \\n \\t escapes.",
    },
    WORD: {
      description:
        'Bare word [A-Za-z_][A-Za-z0-9_-]*. Consecutive WORDs group into a single ' +
        "string argument. The keywords 'then' and 'at' are never bare-word arguments.",
    },
    NUMBER: {
      description: 'Integer or float literal, optional leading minus sign.',
    },
    FLAG: {
      description:
        "Flag token '--'word['='value] (lexicon.KEYWORDS.flagPrefix). Collected into " +
        'ParsedCall.flags; bare flags map to true.',
    },
    DOT: {
      description:
        "'.' punctuation separating address components (gate.line.color.tone.base).",
    },
    COMMA: {
      description: "',' punctuation: decorative separator between arguments; ignored by the parser.",
    },
    LPAREN: {
      description: "'(' punctuation: decorative grouping around arguments; ignored by the parser.",
    },
    RPAREN: {
      description: "')' punctuation: decorative grouping around arguments; ignored by the parser.",
    },
  },

  rules: [
    {
      lhs: 'chain',
      rhs: ['call'],
      note: 'single tool call — an L5 sentence of the mesh language',
    },
    {
      lhs: 'chain',
      rhs: ['call', 'THEN', 'chain'],
      note:
        'two-call+ chaining (right-assoc): `A then B` = o_sequence(A_call, B_call); ' +
        "B's automaton.run receives A's StatePacket as input.packet",
    },
    {
      lhs: 'call',
      rhs: ['TOOL', 'args'],
      note: 'a call is a tool name followed by zero or more arguments',
    },
    {
      lhs: 'args',
      rhs: [],
      note: 'empty argument list (epsilon)',
    },
    {
      lhs: 'args',
      rhs: ['arg', 'args'],
      note: 'argument sequence; parsing is greedy left-to-right',
    },
    {
      lhs: 'arg',
      rhs: ['STRING'],
      note: 'quoted string → one string arg (verbatim content)',
    },
    {
      lhs: 'arg',
      rhs: ['words'],
      note: 'bare-word group → one string arg (words joined with single spaces)',
    },
    {
      lhs: 'arg',
      rhs: ['NUMBER'],
      note: 'number literal → one numeric arg',
    },
    {
      lhs: 'arg',
      rhs: ['flag'],
      note: 'flag → entry in ParsedCall.flags (not in args)',
    },
    {
      lhs: 'arg',
      rhs: ['address'],
      note: 'canonical address → ParsedCall.address (not in args)',
    },
    {
      lhs: 'words',
      rhs: ['WORD'],
      note: 'single bare word',
    },
    {
      lhs: 'words',
      rhs: ['WORD', 'words'],
      note: "two or more consecutive bare words; 'then' and 'at' terminate the group",
    },
    {
      lhs: 'address',
      rhs: ['AT', 'NUMBER'],
      note: "'at' gate — gate 1..64",
    },
    {
      lhs: 'address',
      rhs: ['AT', 'NUMBER', 'DOT', 'NUMBER'],
      note: "'at' gate.line — line 1..6",
    },
    {
      lhs: 'address',
      rhs: ['AT', 'NUMBER', 'DOT', 'NUMBER', 'DOT', 'NUMBER'],
      note: "'at' gate.line.color — color 1..6",
    },
    {
      lhs: 'address',
      rhs: ['AT', 'NUMBER', 'DOT', 'NUMBER', 'DOT', 'NUMBER', 'DOT', 'NUMBER'],
      note: "'at' gate.line.color.tone — tone 1..6",
    },
    {
      lhs: 'address',
      rhs: ['AT', 'NUMBER', 'DOT', 'NUMBER', 'DOT', 'NUMBER', 'DOT', 'NUMBER', 'DOT', 'NUMBER'],
      note: "'at' gate.line.color.tone.base — base 1..5 (deepest canonical precision)",
    },
    {
      lhs: 'flag',
      rhs: ['FLAG'],
      note:
        "'--'word['='value]; value optional (true when absent); numeric values stay " +
        'numbers, everything else stays a string',
    },
  ],

  notes: [
    'chain is right-associative: A then B then C parses as A then (B then C); execution order is still left-to-right.',
    'Ranges enforced at parse time: gate 1..64, line 1..6, color 1..6, tone 1..6, base 1..5 (spec §2).',
    "The keywords 'then' (THEN) and 'at' (AT) are reserved: to pass them as data, quote them.",
    'COMMA / LPAREN / RPAREN are decorative and ignored by the parser; DOT outside an address is a parse error.',
    'A float NUMBER after AT is re-split on its decimal point into address components, so `at 41.2` ≡ `at 41 . 2`.',
  ],
};

