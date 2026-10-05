---
title: Modelmaker
emoji: 🧬
colorFrom: purple
colorTo: indigo
sdk: gradio
sdk_version: 6.8.0
app_file: app.py
pinned: false
---

# Stellarproximology lab / Modelmaker

The root application is the repaired Hugging Face Gradio entrypoint. The original
Space's TypeScript files are preserved separately in Hugging Face; they reference
an incomplete Node application and are not the Gradio entrypoint.

Run `pip install -r requirements.txt` then `python app.py`.

Modelmaker trains a small GPT-2 model from scratch on supplied text and exports a
Hugging Face model ZIP. A tiny model trained this way is an experiment, not a
pretrained general-purpose LLM. Publishing models is optional and needs a write
token in `HF_TOKEN`.

`Modelmaker-repair/` remains the portable repair package. Root `app.py` delegates
to it, so there is one source of the trainer implementation.

The next architecture has **exactly four configurable LLM dimensions**. Their
interactions produce swarm units. The user's stated mappings are:

| Unit | Mapping | Meaning |
| --- | --- | --- |
| Bigram | 3 = 1 | Heart: direction / social |
| Trigram | 2 = 1 | Mind: transpersonal thought |
| Hexagram | 1 = 1 | Body: personal action |

These are three views of the same six binary lines, confirmed by the user.
`Modelmaker-repair/seed.py` implements the primitive, the three views, lossless
UTF-8/Unicode representations, ASCII where applicable, and NATO spelling for
Latin letters. Bit order is bottom-to-top; no King Wen ordering is implied.

The Gradio seed workbench composes primitives into a 2D website and exports HTML.
The exported website renders its content as particles attracted to text and
six-line targets, with pointer repulsion. Users can add primitives and the field
rebuilds. The standalone page runs without LLM calls and saves compositions in
browser local storage when available. The Gradio preview is a static target view.
This is an attraction/repulsion particle simulation, not a particle swarm
optimization solver. Rendering pauses in hidden tabs. It is not a 24/7 server
worker or a system that modifies its own executable code.

`seed.cycle(context, dimensions, history)` requires exactly four callable model
adapters. They each see the same context and prior history, and must return
`{"bits":"010101","text":"plain expression"}`. All four validated outputs
are retained in the next context cycle; failure leaves caller history unchanged.
The tests use adapter doubles. Live LLM adapters are not yet connected.

The four LLM dimensions are Movement, Evolution, Being, Design. Space is their
shared swarm environment. Model identities are unassigned; live model adapters
are the remaining integration step, rather than silently adding extra models.

The five reference screenshots supplied in this conversation define conceptual
perspectives, not a single agreed ordering. `seed.DIMENSIONS`, `seed.SPACE`, and
`seed.SOURCE_ORDERS` preserve their chains, human views, components, and differing
keynotes. In particular Movement has both 'I Create' and 'I Define'; Space has
both 'I Communicate' and 'I Think'. The last reference describes Space as the
condition resulting from the interaction of the four contributing fields.
Each adapter receives its own dimension profile and the reference orders.
Responses keep their dimension identity; disagreement is retained, not averaged.
The particle renderer implements software rules and does not simulate the
reference's cosmological formulas.

TCS is also unresolved; it is not implemented as TypeScript or assumed to be an
ISO standard. Binary/ASCII/Unicode/NATO spelling are representations, not model
dimensions. No I Ching sequence or linguistic grammar is silently substituted.

Repair checks: `python -m unittest discover -s tests -v`.

The [four-perspective capability builder](autonomy/README.md) adds a research,
hypothesis, code, isolated verification, and reflection loop. Its first concrete
job builds the missing 64 units for each of four dimensions, with a 256-unit
catalog promoted only when all four contracts pass. It has a persistent queue
worker and a real Hugging Face inference adapter; live inference needs chosen
model IDs and a runtime inference credential. The offline replay demonstration
tests the engine and sandbox without pretending that a live LLM ran.

The [native Android core](android/README.md) packages a local backend, SQLite/RAG,
relationship graph and trainable neural encoder, foreground worker, GitHub/MCP
hands, and a phone UI into an APK. This is the cellphone deliverable; the
Docker-based Python builder is a separate development tool. The first APK can
grow bounded declarative relationship rules and retain its own memory. It does
not bundle four pretrained LLM weights or unrestricted self-rewriting code.
