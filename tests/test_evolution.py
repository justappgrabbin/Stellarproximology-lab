import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('evolution', Path(__file__).resolve().parents[1] / 'scripts/evolution.py')
e = importlib.util.module_from_spec(spec); spec.loader.exec_module(e)


def proposal():
    p = {'schema': 1, 'repository': e.POLICY['repository'], 'base_sha': 'a' * 40,
         'summary': 'Improve chart copy', 'reason': 'Clarify approximation limits.',
         'files': [{'path': 'human-design/dist/app.mjs', 'content': 'export const x = 1;'}]}
    p['digest'] = e.digest(p)
    return p


class ApprovalTests(unittest.TestCase):
    def test_valid_owner_approval(self):
        p = proposal(); e.check_approval(p, p['digest'], 'justappgrabbin', 'a' * 40)
    def test_non_owner_denied(self):
        p = proposal()
        with self.assertRaises(PermissionError): e.check_approval(p, p['digest'], 'another-user', 'a' * 40)
    def test_changed_content_denied(self):
        p = proposal(); p['files'][0]['content'] += ' changed'
        with self.assertRaises(ValueError): e.validate(p)
    def test_different_digest_denied(self):
        p = proposal()
        with self.assertRaises(ValueError): e.check_approval(p, 'b' * 64, 'justappgrabbin', 'a' * 40)
    def test_stale_base_denied(self):
        p = proposal()
        with self.assertRaises(ValueError): e.check_approval(p, p['digest'], 'justappgrabbin', 'c' * 40)
    def test_traversal_hidden_and_protected_paths(self):
        for path in ['human-design/dist/../../secret.py', '.github/workflows/x.yml',
                     'human-design/dist/.env.py', 'Modelmaker-repair/requirements.txt',
                     'human-design/dist/corpus.json', '/human-design/dist/a.py',
                     'human-design//dist/app.mjs', 'human-design/dist/evil.exe']:
            p = proposal(); p['files'][0]['path'] = path; p['digest'] = e.digest(p)
            with self.subTest(path=path), self.assertRaises(ValueError): e.validate(p)
    def test_duplicate_and_large_candidate_denied(self):
        p = proposal(); p['files'] *= 2; p['digest'] = e.digest(p)
        with self.assertRaises(ValueError): e.validate(p)
        p = proposal(); p['files'][0]['content'] = 'x' * 180001; p['digest'] = e.digest(p)
        with self.assertRaises(ValueError): e.validate(p)
    def test_merge_requires_current_success_and_exact_sha(self):
        pr = {'state': 'open', 'head': {'sha': 'a'*40, 'ref': 'evolution/abc', 'repo': {'full_name': e.POLICY['repository']}}, 'base': {'ref': 'main'}}
        ok = [{'context': 'evolution/validated', 'state': 'success'}]
        e.validate_merge(pr, 'a'*40, 'justappgrabbin', ok)
        with self.assertRaises(ValueError): e.validate_merge(pr, 'b'*40, 'justappgrabbin', ok)
        with self.assertRaises(ValueError): e.validate_merge(pr, 'a'*40, 'justappgrabbin', [])
        with self.assertRaises(ValueError): e.validate_merge(pr, 'a'*40, 'justappgrabbin', [{'context': 'evolution/validated', 'state': 'failure'}] + ok)
    def test_digest_stable_across_key_order(self):
        p = proposal(); self.assertEqual(e.digest(p), e.digest(dict(reversed(list(p.items())))))


if __name__ == '__main__': unittest.main()
