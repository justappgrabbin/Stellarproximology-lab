// Pure Synthia Automata — experiments/scale: sealed phase-1 benchmark results (verbatim fixtures for the reproduction gate)

/**
 * SEALED RESULTS — copied byte-for-byte (via JSON round-trip) from the sealed
 * phase-1 package. These are the reproduction targets for the ported D1/D2/D3
 * benchmarks. They are FIXTURE DATA, never recomputed here.
 *
 * provenance: { status: 'SOURCE_STATEMENT',
 *   source: 'pure-synthia-phase1-d1-d2-d31/{D1_RESULTS.json,D2_RESULTS.json,D3_RESULTS.json}' }
 */

// sealed: pure-synthia-phase1-d1-d2-d31/D1_RESULTS.json
export const SEALED_D1_RESULTS = Object.freeze({
  "contractVersion": "D1-contract-1.0.0",
  "discoveryLabels": [
    "p",
    "b",
    "t",
    "d",
    "k",
    "f",
    "s",
    "m",
    "n"
  ],
  "testLabels": [
    "g",
    "v",
    "z"
  ],
  "metrics": {
    "generationAccuracy": 1,
    "reconstructionAccuracy": 1,
    "novelCompositionRate": 1,
    "derivationIntegrity": 1,
    "compressionGain": -0.9166666666666667
  },
  "compression": {
    "directBits": 48,
    "grammarBits": 92
  },
  "ablations": {
    "removeBundle": {
      "ablatedAccuracy": 0,
      "impact": 1
    },
    "removeVoicedPrimitive": {
      "ablatedAccuracy": 0,
      "impact": 1
    }
  },
  "ledger": {
    "primitivesActivated": 9,
    "statesGenerated": 3,
    "edgesTraversed": 6,
    "operationsExecuted": 3,
    "recursionDepth": 1,
    "activeAutomata": 1,
    "transitionCount": 3
  },
  "heldout": [
    {
      "label": "g",
      "correct": true,
      "novel": true,
      "replayMatch": true,
      "signature": "manner:f.manner.stop|place:f.place.velar|voice:f.voice.voiced",
      "derivationHash": "64a30c93",
      "ledger": {
        "primitivesActivated": 3,
        "statesGenerated": 1,
        "edgesTraversed": 2,
        "operationsExecuted": 1,
        "recursionDepth": 1,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    },
    {
      "label": "v",
      "correct": true,
      "novel": true,
      "replayMatch": true,
      "signature": "manner:f.manner.fricative|place:f.place.labial|voice:f.voice.voiced",
      "derivationHash": "689ef19b",
      "ledger": {
        "primitivesActivated": 3,
        "statesGenerated": 1,
        "edgesTraversed": 2,
        "operationsExecuted": 1,
        "recursionDepth": 1,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    },
    {
      "label": "z",
      "correct": true,
      "novel": true,
      "replayMatch": true,
      "signature": "manner:f.manner.fricative|place:f.place.alveolar|voice:f.voice.voiced",
      "derivationHash": "64d02ccc",
      "ledger": {
        "primitivesActivated": 3,
        "statesGenerated": 1,
        "edgesTraversed": 2,
        "operationsExecuted": 1,
        "recursionDepth": 1,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    }
  ],
  "reconstruction": [
    {
      "label": "p",
      "correct": true
    },
    {
      "label": "b",
      "correct": true
    },
    {
      "label": "t",
      "correct": true
    },
    {
      "label": "d",
      "correct": true
    },
    {
      "label": "k",
      "correct": true
    },
    {
      "label": "g",
      "correct": true
    },
    {
      "label": "f",
      "correct": true
    },
    {
      "label": "v",
      "correct": true
    },
    {
      "label": "s",
      "correct": true
    },
    {
      "label": "z",
      "correct": true
    },
    {
      "label": "m",
      "correct": true
    },
    {
      "label": "n",
      "correct": true
    }
  ]
});

// sealed: pure-synthia-phase1-d1-d2-d31/D2_RESULTS.json
export const SEALED_D2_RESULTS = Object.freeze({
  "contractVersion": "D2-contract-1.0.0",
  "discoveryIds": [
    "d2.pt",
    "d2.tp",
    "d2.bd",
    "d2.db",
    "d2.ks",
    "d2.sk",
    "d2.mn",
    "d2.nm",
    "d2.fb"
  ],
  "testIds": [
    "d2.gv",
    "d2.vz",
    "d2.zg"
  ],
  "metrics": {
    "generationAccuracy": 1,
    "reconstructionAccuracy": 1,
    "novelCompositionRate": 1,
    "orderSensitivity": 1,
    "derivationIntegrity": 1,
    "compressionGain": -1.3333333333333335
  },
  "compression": {
    "directBits": 48,
    "grammarBits": 112
  },
  "ablations": {
    "removeSequence": {
      "ablatedAccuracy": 0,
      "impact": 1
    },
    "removeBundle": {
      "ablatedAccuracy": 0,
      "impact": 1
    },
    "destroyOrder": {
      "collisionCount": 4
    }
  },
  "ledger": {
    "primitivesActivated": 6,
    "statesGenerated": 3,
    "edgesTraversed": 3,
    "operationsExecuted": 3,
    "recursionDepth": 2,
    "activeAutomata": 1,
    "transitionCount": 3
  },
  "heldout": [
    {
      "id": "d2.gv",
      "phonemes": [
        "g",
        "v"
      ],
      "correct": true,
      "novel": true,
      "orderSensitive": true,
      "replayMatch": true,
      "signature": "0:composite:0fc4619f|1:composite:a0011297",
      "reversedSignature": "0:composite:a0011297|1:composite:0fc4619f",
      "derivationHash": "ac3f3dbb",
      "operandDerivationHashes": [
        "381a97d8",
        "80e13204"
      ],
      "ledger": {
        "primitivesActivated": 2,
        "statesGenerated": 1,
        "edgesTraversed": 1,
        "operationsExecuted": 1,
        "recursionDepth": 2,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    },
    {
      "id": "d2.vz",
      "phonemes": [
        "v",
        "z"
      ],
      "correct": true,
      "novel": true,
      "orderSensitive": true,
      "replayMatch": true,
      "signature": "0:composite:a0011297|1:composite:c1a0ef24",
      "reversedSignature": "0:composite:c1a0ef24|1:composite:a0011297",
      "derivationHash": "d3aa46bf",
      "operandDerivationHashes": [
        "80e13204",
        "24f5c77f"
      ],
      "ledger": {
        "primitivesActivated": 2,
        "statesGenerated": 1,
        "edgesTraversed": 1,
        "operationsExecuted": 1,
        "recursionDepth": 2,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    },
    {
      "id": "d2.zg",
      "phonemes": [
        "z",
        "g"
      ],
      "correct": true,
      "novel": true,
      "orderSensitive": true,
      "replayMatch": true,
      "signature": "0:composite:c1a0ef24|1:composite:0fc4619f",
      "reversedSignature": "0:composite:0fc4619f|1:composite:c1a0ef24",
      "derivationHash": "a06af3d1",
      "operandDerivationHashes": [
        "24f5c77f",
        "381a97d8"
      ],
      "ledger": {
        "primitivesActivated": 2,
        "statesGenerated": 1,
        "edgesTraversed": 1,
        "operationsExecuted": 1,
        "recursionDepth": 2,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    }
  ],
  "reconstruction": [
    {
      "id": "d2.pt",
      "correct": true
    },
    {
      "id": "d2.tp",
      "correct": true
    },
    {
      "id": "d2.bd",
      "correct": true
    },
    {
      "id": "d2.db",
      "correct": true
    },
    {
      "id": "d2.ks",
      "correct": true
    },
    {
      "id": "d2.sk",
      "correct": true
    },
    {
      "id": "d2.mn",
      "correct": true
    },
    {
      "id": "d2.nm",
      "correct": true
    },
    {
      "id": "d2.fb",
      "correct": true
    },
    {
      "id": "d2.gv",
      "correct": true
    },
    {
      "id": "d2.vz",
      "correct": true
    },
    {
      "id": "d2.zg",
      "correct": true
    }
  ]
});

// sealed: pure-synthia-phase1-d1-d2-d31/D3_RESULTS.json
export const SEALED_D3_RESULTS = Object.freeze({
  "contractVersion": "D3-contract-1.0.0",
  "discoveryIds": [
    "d3.w1",
    "d3.w2",
    "d3.w3",
    "d3.w4",
    "d3.w5",
    "d3.w6"
  ],
  "testIds": [
    "d3.w7",
    "d3.w8"
  ],
  "metrics": {
    "generationAccuracy": 1,
    "reconstructionAccuracy": 1,
    "novelCompositionRate": 1,
    "orderSensitivity": 1,
    "derivationIntegrity": 1,
    "compressionGain": -2.3333333333333335
  },
  "compression": {
    "directBits": 24,
    "grammarBits": 80
  },
  "ablations": {
    "removeD3Sequence": {
      "ablatedAccuracy": 0,
      "impact": 1
    },
    "removeD2MorphemeConstruction": {
      "ablatedAccuracy": 0,
      "impact": 1
    },
    "destroyOrder": {
      "collisionCount": 3
    }
  },
  "ledger": {
    "primitivesActivated": 4,
    "statesGenerated": 2,
    "edgesTraversed": 2,
    "operationsExecuted": 2,
    "recursionDepth": 3,
    "activeAutomata": 1,
    "transitionCount": 2
  },
  "heldout": [
    {
      "id": "d3.w7",
      "morphemes": [
        "d2.gv",
        "d2.vz"
      ],
      "correct": true,
      "novel": true,
      "orderSensitive": true,
      "replayMatch": true,
      "signature": "0:d2-composite:de32d172|1:d2-composite:e2f32c35",
      "reversedSignature": "0:d2-composite:e2f32c35|1:d2-composite:de32d172",
      "derivationHash": "907901a7",
      "operandDerivationHashes": [
        "e234787b",
        "352235f0"
      ],
      "ledger": {
        "primitivesActivated": 2,
        "statesGenerated": 1,
        "edgesTraversed": 1,
        "operationsExecuted": 1,
        "recursionDepth": 3,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    },
    {
      "id": "d3.w8",
      "morphemes": [
        "d2.vz",
        "d2.zg"
      ],
      "correct": true,
      "novel": true,
      "orderSensitive": true,
      "replayMatch": true,
      "signature": "0:d2-composite:e2f32c35|1:d2-composite:0c48caa3",
      "reversedSignature": "0:d2-composite:0c48caa3|1:d2-composite:e2f32c35",
      "derivationHash": "210e413d",
      "operandDerivationHashes": [
        "352235f0",
        "183d23bf"
      ],
      "ledger": {
        "primitivesActivated": 2,
        "statesGenerated": 1,
        "edgesTraversed": 1,
        "operationsExecuted": 1,
        "recursionDepth": 3,
        "activeAutomata": 1,
        "transitionCount": 1
      }
    }
  ],
  "reconstruction": [
    {
      "id": "d3.w1",
      "correct": true
    },
    {
      "id": "d3.w2",
      "correct": true
    },
    {
      "id": "d3.w3",
      "correct": true
    },
    {
      "id": "d3.w4",
      "correct": true
    },
    {
      "id": "d3.w5",
      "correct": true
    },
    {
      "id": "d3.w6",
      "correct": true
    },
    {
      "id": "d3.w7",
      "correct": true
    },
    {
      "id": "d3.w8",
      "correct": true
    }
  ]
});

export const SEALED_PROVENANCE = Object.freeze({
  status: 'SOURCE_STATEMENT',
  source: 'pure-synthia-phase1-d1-d2-d31/{D1,D2,D3}_RESULTS.json',
  note: 'sealed before this port existed; the reproduction gate compares ported output against these fixtures field-by-field',
});

