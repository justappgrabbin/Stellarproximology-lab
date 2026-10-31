"""Source-complete, dimension-assigned research for the EXISTING Modelmaker Assembly.

Researchers collect observations from assigned sources. They DO NOT infer a fixed
primitive vocabulary, judge dimensions, or run prediction benchmarks. The ledger
tracks every source span, failed generation, and evidence anchor separately.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

DIMENSIONS = frozenset({'Movement', 'Evolution', 'Being', 'Design'})
PASSAGE_CHARS = 1600


def _hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def spans(text, width=PASSAGE_CHARS):
    """Partition full source with no dropped characters, including whitespace."""
    if not text:
        return []
    out = []
    i = 0
    while i < len(text):
        bound = min(i + width, len(text))
        if bound < len(text):
            cut = text.rfind('\n', i + max(1, width // 2), bound)
            if cut < 0:
                cut = text.rfind(' ', i + max(1, width // 2), bound)
            if cut >= 0:
                bound = cut + 1
        out.append((i, bound, text[i:bound]))
        i = bound
    assert ''.join(piece for _, _, piece in out) == text
    return out


def _parse_notes(raw, passage):
    s = raw.strip()
    if s.startswith('```'):
        s = re.sub(r'^```(?:json)?\s*|\s*```$', '', s).strip()
    value = json.loads(s)
    entries = value.get('observations') if isinstance(value, dict) else None
    if not isinstance(entries, list) or not entries:
        raise ValueError('Researcher did not return any source-anchored observations')
    anchored = []
    for item in entries:
        if not isinstance(item, dict):
            raise ValueError('Observation must be an object')
        quote = item.get('quote')
        description = item.get('observation')
        if not isinstance(quote, str) or not quote.strip() or quote not in passage:
            raise ValueError('Quotation is not an exact substring of the assigned passage')
        if not isinstance(description, str) or not description.strip():
            raise ValueError('Observation text is missing')
        anchored.append({'quote': quote, 'offset_in_passage': passage.index(quote),
                         'observation': description,
                         'dimension_connection': str(item.get('dimension_connection') or ''),
                         'questions': item.get('questions') if isinstance(item.get('questions'), list) else []})
    return anchored


class DimensionResearch:
    """Works with Assembly(directory, user), its document store, and CPU model runtime."""

    def __init__(self, assembly):
        self.runtime = assembly
        self.db = assembly.db
        with assembly.lock, self.db:
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS dimension_assignments (
                    user TEXT, dimension TEXT, checkpoint TEXT, document_id TEXT,
                    instructions TEXT NOT NULL, source_sha TEXT NOT NULL,
                    PRIMARY KEY(user,dimension,document_id));
                CREATE TABLE IF NOT EXISTS dimension_passage_research (
                    user TEXT, dimension TEXT, document_id TEXT, passage_start INTEGER,
                    passage_end INTEGER, passage_sha TEXT, status TEXT,
                    observations_json TEXT, raw_output TEXT, error TEXT, updated TEXT,
                    PRIMARY KEY(user,dimension,document_id,passage_start));
            """)

    def configure(self, assignments):
        """Require exact owner-supplied dimension, model checkpoint, research scope and sources."""
        if not isinstance(assignments, list) or len(assignments) != 4:
            raise ValueError('Provide exactly four explicitly assigned dimension researchers')
        if {a.get('dimension') for a in assignments if isinstance(a, dict)} != DIMENSIONS:
            raise ValueError('Assignments must identify Movement, Evolution, Being, and Design once each')
        prepared = []
        for a in assignments:
            dim, checkpoint, ids = a['dimension'], a.get('checkpoint'), a.get('document_ids')
            instructions = a.get('instructions')
            if not isinstance(checkpoint, str) or not checkpoint.strip():
                raise ValueError(f'{dim}: specify the existing local model checkpoint; none will be invented')
            if not isinstance(ids, list) or not ids or len(set(ids)) != len(ids):
                raise ValueError(f'{dim}: provide a nonempty, unique set of assigned document IDs')
            if not isinstance(instructions, str) or not instructions.strip():
                raise ValueError(f'{dim}: provide the research scope/instructions')
            for doc_id in ids:
                if not isinstance(doc_id, str):
                    raise ValueError('Document IDs must be strings')
                doc = self.db.execute('SELECT text FROM documents WHERE id=? AND user=?',
                                      (doc_id, self.runtime.user)).fetchone()
                if not doc or not doc['text'].strip():
                    raise ValueError(f'{dim}: source {doc_id} is missing, empty, or belongs to another profile')
                prepared.append((self.runtime.user, dim, checkpoint, doc_id, instructions, _hash(doc['text'])))
        with self.runtime.lock, self.db:
            previous = self.db.execute('SELECT dimension,document_id,checkpoint,instructions,source_sha FROM dimension_assignments WHERE user=?',
                                       (self.runtime.user,)).fetchall()
            old = {(x['dimension'], x['document_id']): (x['checkpoint'], x['instructions'], x['source_sha']) for x in previous}
            new = {(x[1], x[3]): (x[2], x[4], x[5]) for x in prepared}
            for dim, doc in old.keys() | new.keys():
                if old.get((dim, doc)) != new.get((dim, doc)):
                    self.db.execute('DELETE FROM dimension_passage_research WHERE user=? AND dimension=? AND document_id=?',
                                    (self.runtime.user, dim, doc))
            self.db.execute('DELETE FROM dimension_assignments WHERE user=?', (self.runtime.user,))
            self.db.executemany('INSERT INTO dimension_assignments VALUES(?,?,?,?,?,?)', prepared)
        return self.status()

    def _assignments(self, dimension=None):
        if dimension is not None and dimension not in DIMENSIONS:
            raise ValueError('Unknown dimension')
        args = (self.runtime.user,) + ((dimension,) if dimension else ())
        where = ' AND dimension=?' if dimension else ''
        return self.db.execute('SELECT * FROM dimension_assignments WHERE user=?'+where+' ORDER BY dimension,document_id', args).fetchall()

    def _work_items(self, dimension):
        for a in self._assignments(dimension):
            doc = self.db.execute('SELECT title,source,text FROM documents WHERE id=? AND user=?',
                                  (a['document_id'], self.runtime.user)).fetchone()
            if not doc or _hash(doc['text']) != a['source_sha']:
                raise ValueError(f'Assigned source changed or disappeared: {a["document_id"]}')
            for start, end, passage in spans(doc['text']):
                yield a, doc, start, end, passage

    def sources(self):
        """List indexed source IDs available to this profile, without guessing assignments."""
        return [dict(row) for row in self.db.execute(
            'SELECT id,title,source,kind,length(text) AS characters FROM documents WHERE user=? ORDER BY created,title',
            (self.runtime.user,)).fetchall()]

    def status(self):
        result = {}
        for dimension in sorted(DIMENSIONS):
            sources = []
            for a, doc, start, end, passage in self._work_items(dimension):
                key = a['document_id']
                if not sources or sources[-1]['document_id'] != key:
                    sources.append({'document_id': key, 'title': doc['title'], 'source': doc['source'],
                                    'passages_total': 0, 'passages_verified': 0, 'passages_needing_review': 0})
                source = sources[-1]
                source['passages_total'] += 1
                r = self.db.execute('SELECT status,passage_sha FROM dimension_passage_research WHERE user=? AND dimension=? AND document_id=? AND passage_start=?',
                                    (self.runtime.user, dimension, key, start)).fetchone()
                if r and r['passage_sha'] == _hash(passage):
                    if r['status'] == 'anchored':
                        source['passages_verified'] += 1
                    else:
                        source['passages_needing_review'] += 1
            total = sum(x['passages_total'] for x in sources)
            done = sum(x['passages_verified'] for x in sources)
            result[dimension] = {'sources': sources, 'passages_total': total,
                                 'passages_verified': done, 'passages_remaining': total-done,
                                 'traversal_complete': bool(sources) and total == done}
        return {'team': 'Klein dimension source research', 'research_job': 'comprehensive assigned-source collection',
                'not_the_job': ['primitive extraction','dimension judging','prediction benchmarking'],
                'dimensions': result}

    def run(self, dimension, max_passages=1, generate=None):
        """Process bounded assigned passages, never masking failed or invented evidence."""
        if dimension not in DIMENSIONS:
            raise ValueError('Unknown dimension')
        if not isinstance(max_passages, int) or not 1 <= max_passages <= 100:
            raise ValueError('max_passages must be an integer from 1 through 100')
        if not self._assignments(dimension):
            raise ValueError(f'{dimension} has no assigned sources')
        worker = None
        attempts = []
        try:
            for a, doc, start, end, passage in self._work_items(dimension):
                old = self.db.execute('SELECT status,passage_sha FROM dimension_passage_research WHERE user=? AND dimension=? AND document_id=? AND passage_start=?',
                                      (self.runtime.user, dimension, a['document_id'], start)).fetchone()
                if old and old['status'] == 'anchored' and old['passage_sha'] == _hash(passage):
                    continue
                if len(attempts) >= max_passages:
                    break
                prompt = (
                    f'You are the {dimension} DIMENSION RESEARCHER. Your job is to collect as much information as possible '
                    'from the entire assigned source, one passage at a time. Do not extract a fixed set of primitives; '
                    'do not reduce the text to keywords; do not judge or invent correspondences. '
                    'Include terminology, claims, examples, relationships, methods, counterexamples, nuances, ambiguities, '
                    'and cross-references whether or not they fit a prior theory. Never invent missing information. '
                    'Return ONLY JSON {"observations":[{"quote":"exact brief substring copied from passage",'
                    '"observation":"what the passage actually conveys",'
                    '"dimension_connection":"specific relevance if supported, otherwise not established",'
                    '"questions":["open questions"]}]}. Include multiple observations when warranted.\n'
                    f'ASSIGNED RESEARCH SCOPE: {a["instructions"]}\n'
                    f'SOURCE TITLE: {doc["title"]}\nSOURCE REFERENCE: {doc["source"]}\n'
                    f'CHARACTER RANGE: [{start},{end})\nPASSAGE:\n{passage}'
                )
                raw = ''
                error = None
                observations = []
                status = 'needs_review'
                try:
                    if generate is not None:
                        raw = generate(dimension, a['checkpoint'], prompt)
                    else:
                        if worker is None:
                            from .runtime import Assembly
                            worker = Assembly(self.runtime.directory, self.runtime.user)
                            worker.load_model(a['checkpoint'])
                        elif worker.setting('checkpoint') != a['checkpoint']:
                            worker.load_model(a['checkpoint'])
                        generation = worker.generate_text([{'role':'user','content':prompt}], max_new_tokens=1024, truncate=False)
                        if generation['context_truncated']:
                            raise ValueError('Model input was truncated; passage not marked read')
                        raw = generation['text']
                    observations = _parse_notes(raw, passage)
                    for o in observations:
                        o['source_char_start'] = start + o['offset_in_passage']
                        o['source_char_end'] = o['source_char_start'] + len(o['quote'])
                    status = 'anchored'
                except Exception as exc:
                    error = str(exc)
                with self.runtime.lock, self.db:
                    self.db.execute("""INSERT OR REPLACE INTO dimension_passage_research
                        (user,dimension,document_id,passage_start,passage_end,passage_sha,status,observations_json,raw_output,error,updated)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                        (self.runtime.user, dimension, a['document_id'], start, end, _hash(passage), status,
                         json.dumps(observations, ensure_ascii=False), str(raw), error,
                         datetime.now(timezone.utc).isoformat()))
                attempts.append({'document_id': a['document_id'], 'title': doc['title'], 'range': [start,end],
                                 'status': status, 'observations': len(observations), 'error': error})
        finally:
            if worker is not None:
                worker.close()
        return {'dimension': dimension, 'attempts': attempts, 'status': self.status()['dimensions'][dimension]}

    def export(self, dimension):
        if dimension not in DIMENSIONS:
            raise ValueError('Unknown dimension')
        rows = self.db.execute("""SELECT p.*,d.title,d.source FROM dimension_passage_research p
            JOIN documents d ON d.id=p.document_id AND d.user=p.user
            WHERE p.user=? AND p.dimension=? ORDER BY d.title,p.passage_start""",
            (self.runtime.user, dimension)).fetchall()
        return {'dimension': dimension, 'coverage': self.status()['dimensions'][dimension],
                'passages': [{'source_id': r['document_id'], 'title': r['title'], 'source': r['source'],
                              'range': [r['passage_start'],r['passage_end']], 'status': r['status'],
                              'observations': json.loads(r['observations_json'] or '[]'),
                              'error': r['error'], 'raw_output': r['raw_output'] if r['status'] != 'anchored' else None}
                             for r in rows]}


def main():
    import argparse
    from .runtime import Assembly
    p = argparse.ArgumentParser(description='Modelmaker: dimension researchers, assigned-source complete reading')
    p.add_argument('command', choices=['sources','configure','status','run','export'])
    p.add_argument('--manifest', help='JSON with {"assignments": [four explicit assignments]}')
    p.add_argument('--dimension', choices=sorted(DIMENSIONS))
    p.add_argument('--max-passages', type=int, default=1)
    p.add_argument('--data', help='Existing Modelmaker data directory')
    p.add_argument('--user', default='local')
    a = p.parse_args()
    with_assembly = Assembly(a.data, a.user)
    try:
        team = DimensionResearch(with_assembly)
        if a.command == 'sources':
            result = team.sources()
        elif a.command == 'configure':
            if not a.manifest:
                p.error('configure requires --manifest')
            result = team.configure(json.loads(Path(a.manifest).read_text(encoding='utf-8'))['assignments'])
        elif a.command == 'run':
            if not a.dimension:
                p.error('run requires --dimension')
            result = team.run(a.dimension, a.max_passages)
        elif a.command == 'export':
            if not a.dimension:
                p.error('export requires --dimension')
            result = team.export(a.dimension)
        else:
            result = team.status()
        print(json.dumps(result, indent=2, ensure_ascii=False))
    finally:
        with_assembly.close()


if __name__ == '__main__':
    main()
