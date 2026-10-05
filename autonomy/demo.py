"""Create explicit recorded-response fixtures to exercise the real code sandbox.

This is a plumbing demonstration, not model-generated research or reasoning.
"""
from pathlib import Path
import json

from .engine import write_json
from .models import NAMES
from .engine import DIMENSIONS


def make_replay(directory: Path, first_round_broken=False):
    directory.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        write_json(directory / f"{name}.research.json", {
            "findings": [{"claim": "The supplied profile defines a distinct dimension and three six-line views.",
                          "source_ids": ["dimension-profiles"]}],
            "unknowns": ["TCS mapping", "live model selection", "3D embodiment rules"],
        })
        write_json(directory / f"{name}.hypothesis.json", {
            "hypothesis": "Enumerating six binary lines and preserving the supplied profile yields 64 distinct units.",
            "prediction": "The trusted validator will accept all 64 dimension-specific records.",
            "uncertainties": ["This does not validate linguistic meaning or a 3D embodiment."],
        })
        code = f'''PROFILE = {DIMENSIONS[name]!r}

def build_units(dimension):
    return [dict(id=dimension + ":" + bits, dimension=dimension, bits=bits,
                 heart=[bits[:2], bits[2:4], bits[4:]], mind=[bits[:3], bits[3:]],
                 body=bits, tcs=None, perspective=PROFILE)
            for bits in (format(i, "06b") for i in range(64))]
'''
        write_json(directory / f"{name}.build.json", {"code": code})
        if first_round_broken and name == "Movement":
            write_json(directory / f"{name}.build.1.json", {"code": "def build_units(dimension):\n    return []\n"})
        write_json(directory / f"{name}.reflect.json", {
            "interpretation": "Read the measured_result supplied to this recorded-response stage; no live inference ran.",
            "next_research": ["Determine TCS and linguistic mappings from actual source evidence."],
            "remaining_uncertainty": ["Catalog shape does not establish semantic truth."],
        })


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--broken-first-round", action="store_true")
    args = parser.parse_args()
    make_replay(args.directory, args.broken_first_round)
    print("Created offline replay responses; no LLM was called.")
