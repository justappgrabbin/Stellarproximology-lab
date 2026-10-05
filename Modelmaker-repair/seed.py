"""Six-line primitives and a four-LLM context boundary. No invented TCS codec."""
from __future__ import annotations

from dataclasses import dataclass
from html import escape
import json
import hashlib
import tempfile
from pathlib import Path
from typing import Callable

NATO = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (
    "Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike "
    "November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu"
).split()))


@dataclass(frozen=True)
class Primitive:
    bits: str
    text: str

    def __post_init__(self):
        if len(self.bits) != 6 or set(self.bits) - {"0", "1"}:
            raise ValueError("A primitive requires exactly six binary lines.")
        if not isinstance(self.text, str) or len(self.text) > 4000:
            raise ValueError("Primitive text must be a string of at most 4000 characters.")

    def as_dict(self):
        return {
            "bits": self.bits,
            "text": self.text,
            "heart": [self.bits[i:i + 2] for i in range(0, 6, 2)],
            "mind": [self.bits[:3], self.bits[3:]],
            "body": self.bits,
            "representations": {
                "utf8_binary": " ".join(f"{b:08b}" for b in self.text.encode("utf-8")),
                "ascii": list(self.text.encode("ascii")) if self.text.isascii() else None,
                "unicode": [f"U+{ord(c):04X}" for c in self.text],
                "nato": [NATO.get(c.upper(), c) for c in self.text],
                "tcs": None,
            },
        }


def cycle(context: str, dimensions: list[Callable], history: list[dict] | None = None):
    """Each actual LLM adapter receives the same context and prior cycle history.

    An adapter must return {bits: '010101', text: '...'} parsed from its model.
    All four outputs are retained; no majority voting or fifth model is added.
    Exceptions abort the cycle, leaving caller history unchanged.
    """
    if len(dimensions) != 4 or not all(callable(d) for d in dimensions):
        raise ValueError("Exactly four callable LLM dimensions are required.")
    prior = json.loads(json.dumps(history or [], ensure_ascii=False))
    prompt = {"context": context, "history": prior,
              "output_schema": {"bits": "six 0/1 characters", "text": "plain text"}}
    primitives = []
    for dimension in dimensions:
        response = dimension(json.loads(json.dumps(prompt, ensure_ascii=False)))
        primitives.append(Primitive(response["bits"], response["text"]).as_dict())
    return prior + [{"context": context, "primitives": primitives}]


def render(primitives: list[Primitive]) -> str:
    """Compose primitives as escaped 2D website elements with particle targets."""
    elements = []
    for p in primitives:
        lines = []
        for i, bit in enumerate(p.bits):
            # Input order is explicitly bottom-to-top; no King Wen lookup implied.
            y = 110 - i * 18
            targets = range(12) if bit == "1" else [j for j in range(12) if j not in (5, 6)]
            lines.extend(f'<circle cx="{12 + j * 10}" cy="{y}" r="3" fill="currentColor"/>' for j in targets)
        elements.append('<article><svg viewBox="0 0 140 130" width="140" role="img" '
                        f'aria-label="Six binary lines {p.bits}">{"".join(lines)}</svg>'
                        f'<p>{escape(p.text)}</p><small>{p.bits}</small></article>')
    return '<section style="display:flex;flex-wrap:wrap;gap:24px;color:#50dccb">' + "".join(elements) + '</section>'


def build_seed(bits: str, text: str, history: list[dict] | None):
    primitive = Primitive(bits.strip(), text)
    next_history = list(history or []) + [{"bits": primitive.bits, "text": primitive.text}]
    if len(next_history) > 64:
        raise ValueError("This seed is limited to 64 primitives; start a new composition.")
    if sum(len(p["text"]) for p in next_history) > 8000:
        raise ValueError("This seed composition supports up to 8000 text characters.")
    composed = [Primitive(**p) for p in next_history]
    html = render(composed)
    path = Path(tempfile.mkdtemp(prefix="swarm-seed-")) / "seed.html"
    data = json.dumps(next_history, ensure_ascii=False).replace("<", "\\u003c")
    key = hashlib.sha256(data.encode()).hexdigest()[:16]
    script = (Path(__file__).parent / "swarm.js").read_text(encoding="utf-8")
    path.write_text('<!doctype html><html lang="en"><meta charset="utf-8">'
                    '<meta name="viewport" content="width=device-width,initial-scale=1">'
                    '<title>Six-line seed</title><style>body{background:#0e1724;color:#eef6ff;'
                    'font:16px system-ui;margin:0}form{padding:16px;display:flex;flex-wrap:wrap;gap:12px}'
                    'input,button{font:inherit;padding:10px;border-radius:8px}canvas{display:block}'
                    '#status{padding:0 16px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;'
                    'clip-path:inset(50%)}'
                    '</style><body><form id="compose">'
                    '<label>Six lines <input id="bits" value="010101" pattern="[01]{6}" maxlength="6" required></label>'
                    '<label>Expression <input id="expression" maxlength="4000"></label>'
                    '<button>Compose primitive</button><button id="reset" type="button">Reset</button></form>'
                    '<p id="status" role="status">Move across the page to interact with the swarm.</p>'
                    '<canvas id="space" aria-hidden="true"></canvas><main id="semantic" class="sr"></main>'
                    f'<script id="initial-state" type="application/json" data-id="{key}">{data}</script>'
                    '<script>' + script + '</script></body></html>', encoding="utf-8")
    return next_history, primitive.as_dict(), html, str(path)
