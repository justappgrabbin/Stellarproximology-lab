"""Source-grounded five-dimensional *structural adjacency* for TRIDENT.

Preserves chain word order, not a claimed causal or neural transition law.
Independent of weights; unknown frame orders and cross-links are not inferred.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

SOURCE = (
    "Synthia_Semantic_Swarm_Master_Spec_v3.docx section 4.1-4.2;"
    " Paper.html state/spec-locked-dimensional-relations.mjs"
)
DIMENSIONS = ("Movement", "Evolution", "Being", "Design", "Space")
CHAINS: dict[str, tuple[str, ...]] = {
    "Movement": ("Movement", "Energy", "Creation", "Seeing", "Landscape", "Environment"),
    "Evolution": ("Evolution", "Gravity", "Memory", "Taste", "Love", "Light"),
    "Being": ("Being", "Matter", "Touch", "Sex", "Survival"),
    "Design": ("Design", "Structure", "Progress", "Smell", "Life", "Art"),
    "Space": ("Space", "Form", "Illusion", "Hearing", "Music", "Freedom"),
}
# Distinct source texts disagree on Movement and Being interrogatives.
# Preserve both interpretations; no single question mapping is silently canonized.
QUESTION_SOURCE_CLAIMS = {
    "Synthia_Semantic_Swarm_Master_Spec_v3.docx": {
        "Movement": "WHEN", "Evolution": "WHAT", "Being": "WHERE",
        "Design": "WHY", "Space": "WHO",
    },
    "Pure Synthia Automata merged/dimension-router.js": {
        "Movement": "WHERE", "Evolution": "WHAT", "Being": "WHEN",
        "Design": "WHY", "Space": "WHO",
    },
}
QUESTION_CONFLICTS = ("Movement", "Being")
AXES = {
    "Movement": "vertical", "Evolution": "horizontal",
    "Being": "vertical", "Design": "diagonal", "Space": "horizontal",
}
# This is the one full interdimensional traversal order explicitly in Paper.html.
# Do NOT rotate it to manufacture the missing four orders.
FRAME_ORDERS = {
    "Being": ("Being", "Movement", "Space", "Design", "Evolution"),
}
SPACE_ROLE_UNRESOLVED = ("named fifth perspective", "emergent from four origin dimensions")
FEATURE_WIDTH = 32
FEATURE_CHANNEL = 5  # Existing TRIDENT feature channel for semantic spacetime.
MAX_EVENTS = 32


class DimensionalRuleError(ValueError):
    pass


@dataclass(frozen=True)
class CrossLink:
    from_dimension: str
    from_word: str
    to_dimension: str
    to_word: str
    provenance: str
    evidence: str
    source_explicit: bool = False


@dataclass(frozen=True)
class FrameOrder:
    leader: str
    order: tuple[str, ...]
    provenance: str
    evidence: str
    source_explicit: bool = False


class DimensionalRouter:
    """Document source-chain adjacency; keep causal laws explicitly unresolved."""

    def __init__(self, links: tuple[CrossLink, ...] = (),
                 frame_orders: tuple[FrameOrder, ...] = ()) -> None:
        self.links: dict[tuple[str, str, str, str], CrossLink] = {}
        self.frame_orders = dict(FRAME_ORDERS)
        self.frame_order_provenance = {"Being": SOURCE}
        self.proposed_frame_orders: dict[str, FrameOrder] = {}
        for item in frame_orders:
            if item.leader not in DIMENSIONS:
                raise DimensionalRuleError("Unknown leader dimension")
            if (not isinstance(item.order, tuple) or len(item.order) != len(DIMENSIONS)
                    or set(item.order) != set(DIMENSIONS) or item.order[0] != item.leader):
                raise DimensionalRuleError("Frame order must be a complete five-dimension permutation led by its frame")
            if not isinstance(item.provenance, str) or not item.provenance.strip():
                raise DimensionalRuleError("Frame order provenance required")
            if not isinstance(item.evidence, str) or not item.evidence.strip():
                raise DimensionalRuleError("Frame order evidence required")
            if item.leader in self.frame_orders or item.leader in self.proposed_frame_orders:
                raise DimensionalRuleError("Cannot overwrite or duplicate an existing frame order")
            if item.source_explicit:
                self.frame_orders[item.leader] = item.order
                self.frame_order_provenance[item.leader] = item.provenance
            else:
                self.proposed_frame_orders[item.leader] = item
        for link in links:
            self._validate_dimension_word(link.from_dimension, link.from_word)
            self._validate_dimension_word(link.to_dimension, link.to_word)
            if link.from_dimension == link.to_dimension:
                raise DimensionalRuleError("Cross-links must connect distinct dimensions")
            if not isinstance(link.provenance, str) or not link.provenance.strip():
                raise DimensionalRuleError("Cross-link provenance required")
            if not isinstance(link.evidence, str) or not link.evidence.strip():
                raise DimensionalRuleError("Cross-link evidence required")
            key = (link.from_dimension, link.from_word, link.to_dimension, link.to_word)
            if key in self.links:
                raise DimensionalRuleError("Conflicting or duplicate cross-dimensional link")
            self.links[key] = link

    @staticmethod
    def _validate_dimension_word(dimension: str, word: str) -> None:
        if dimension not in CHAINS:
            raise DimensionalRuleError(f"Unknown dimension: {dimension!r}")
        if not isinstance(word, str) or word not in CHAINS[dimension]:
            raise DimensionalRuleError(f"Unknown word {word!r} in {dimension!r}")

    def route(self, event: dict[str, Any]) -> dict[str, Any]:
        """Inspect a proposed edge; ordering is NOT a causal transition law.

        status is structural adjacency or caller-attested cross-link, never
        an independently proved cause/effect relationship.
        """
        if not isinstance(event, dict):
            raise DimensionalRuleError("A transition event must be an object")
        permitted = {"dimension", "from", "to", "to_dimension", "frame_dimension"}
        extra = set(event) - permitted
        if extra:
            raise DimensionalRuleError(f"Unsupported transition fields: {sorted(extra)!r}")
        dimension = event.get("dimension")
        target_dimension = event.get("to_dimension", dimension)
        source = event.get("from")
        target = event.get("to")
        self._validate_dimension_word(dimension, source)
        self._validate_dimension_word(target_dimension, target)
        frame = event.get("frame_dimension")
        if frame is not None and frame not in CHAINS:
            raise DimensionalRuleError(f"Unknown frame dimension: {frame!r}")

        chain = CHAINS[dimension]
        from_index = chain.index(source)
        target_index = CHAINS[target_dimension].index(target)
        link: CrossLink | None = None
        if dimension == target_dimension:
            status = "source_chain_adjacent" if target_index == from_index + 1 else "invalid_local_edge"
        else:
            link = self.links.get((dimension, source, target_dimension, target))
            status = ("caller_attested_cross_link" if link and link.source_explicit
                      else "proposed_cross_link" if link else "unresolved_cross_link")
        frame_status = ("not_requested" if frame is None else
                        "source_defined" if frame in self.frame_orders else
                        "proposed_order" if frame in self.proposed_frame_orders else
                        "unresolved_order")
        return {
            "from_dimension": dimension,
            "from": source,
            "to_dimension": target_dimension,
            "to": target,
            "status": status,
            "supported": status in ("source_chain_adjacent", "caller_attested_cross_link"),
            "relation_kind": ("ordered_chain_adjacency" if dimension == target_dimension
                              else "cross_dimension_relation"),
            "causal_transition_verified": False,
            "transition_rule": None,
            "source_attestation": ("provided_chain_order" if dimension == target_dimension
                                   else "caller_claim_not_independently_verified" if link and link.source_explicit
                                   else "unverified"),
            "source_index": from_index,
            "target_index": target_index,
            "frame_dimension": frame,
            "frame_status": frame_status,
            "frame_order": list(self.frame_orders[frame]) if frame in self.frame_orders else None,
            "frame_provenance": self.frame_order_provenance.get(frame),
            "edge_provenance": link.provenance if link else SOURCE if status == "source_chain_adjacent" else None,
            "axis": AXES[dimension],
        }

    def walk(self, dimension: str, words: list[str],
             frame_dimension: str | None = None) -> list[dict[str, Any]]:
        if not isinstance(words, list) or len(words) < 2:
            raise DimensionalRuleError("A path needs at least two ordered words")
        traces = [self.route({
            "dimension": dimension, "from": a, "to": b,
            "frame_dimension": frame_dimension,
        }) for a, b in zip(words, words[1:])]
        if any(not trace["supported"] for trace in traces):
            raise DimensionalRuleError("Path contains an unsupported structural edge")
        if any(trace["frame_status"] in ("unresolved_order", "proposed_order") for trace in traces):
            raise DimensionalRuleError("Cannot traverse a frame with unverified leading order")
        return traces

    def encode(self, events: list[dict[str, Any]]) -> tuple[list[float], list[dict[str, Any]]]:
        """32 numeric summary features for the EXISTING TRIDENT [8,32] bridge.

        This is NOT a bijective ontological address or a new learning algorithm.
        Only source-chain adjacencies or explicitly supplied, provenance-bearing
        cross-links are encoded. This is NOT evidence of a causal transition.
        An explicitly requested frame with an unresolved/proposed order is rejected.
        """
        if not isinstance(events, list) or len(events) > MAX_EVENTS:
            raise DimensionalRuleError(f"dimension_events must be an array of <= {MAX_EVENTS}")
        features = [0.0] * FEATURE_WIDTH
        traces: list[dict[str, Any]] = []
        for event in events:
            trace = self.route(event)
            traces.append(trace)
            if not trace["supported"]:
                raise DimensionalRuleError(
                    f"Cannot encode {trace['status']}: "
                    f"{trace['from_dimension']}/{trace['from']} -> "
                    f"{trace['to_dimension']}/{trace['to']}"
                )
            if trace["frame_status"] in ("unresolved_order", "proposed_order"):
                raise DimensionalRuleError(
                    f"Cannot condition on {trace['frame_dimension']} frame: "
                    f"{trace['frame_status']} is not an evidenced traversal"
                )
            index = DIMENSIONS.index(trace["from_dimension"])
            features[index] += 1.0              # 0-4: starting dimension
            features[5 + trace["source_index"]] += 1.0   # 5-10: from-chain position
            features[11 + trace["target_index"]] += 1.0  # 11-16: to-chain position
            features[17 + index] += 1.0         # 17-21: edges by originating dimension
            if trace["from_dimension"] != trace["to_dimension"]:
                features[22 + index] += 1.0     # 22-26: evidenced cross-dimensional edges
            features[27] += 1.0                # 27: admissible structural relationships
            if trace["frame_status"] == "source_defined":
                features[28] += 1.0            # 28: source-defined frame traversals
            # 29 remains zero: unknown frame traversal is never encoded.
        # Reserve 30-31 for a future source-backed rule; keep zero for now.
        return features, traces

    def membership(self) -> dict[str, dict[str, bool]]:
        vocabulary = sorted(set(word for chain in CHAINS.values() for word in chain))
        return {
            dimension: {word: word in chain for word in vocabulary}
            for dimension, chain in CHAINS.items()
        }

    def overlap(self) -> dict[str, dict[str, list[str]]]:
        return {
            left: {
                right: sorted(set(CHAINS[left]) & set(CHAINS[right]))
                for right in DIMENSIONS
            } for left in DIMENSIONS
        }


DEFAULT_ROUTER = DimensionalRouter()
