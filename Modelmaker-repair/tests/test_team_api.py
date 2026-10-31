"""Smoke the real Modelmaker FastAPI team routes without downloading any model."""
import tempfile
import unittest

from fastapi.testclient import TestClient
from assembly.desktop_server import create_app


class TeamApiSmokeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.client = TestClient(create_app(directory=self.tmp.name, mount_training=False))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_real_project_and_notifications_routes(self):
        project = self.client.post('/api/computer/team/projects', json={
            "title": "Fix current models",
            "objective": "Repair real system failures",
            "acceptance": "Actual failures reproduced and fixed with proof",
            "lead": "Being"
        })
        self.assertEqual(project.status_code, 200, project.text)
        project_id = project.json()['id']
        tasks = self.client.post('/api/computer/team/tasks', json={
            "project_id": project_id, "title": "Inspect state space",
            "acceptance": "Existing tool output verified",
            "owner": "Movement", "priority": 5
        })
        self.assertEqual(tasks.status_code, 200, tasks.text)
        task_id = tasks.json()['id']
        self.assertEqual(tasks.json()['owner'], "Movement")
        delegated = self.client.post('/api/computer/team/tasks/' + task_id + '/delegate',
                                     json={"actor": "Movement", "worker": "external-code-agent"})
        self.assertEqual(delegated.status_code, 200, delegated.text)
        self.assertEqual(delegated.json()['owner'], "Movement")
        status = self.client.get('/api/computer/team/state')
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json()['projects'][0]['lead'], "Being")
        events = self.client.get('/api/computer/team/notifications')
        self.assertEqual(events.status_code, 200)
        self.assertTrue(any(r['kind'] == 'delegation' for r in events.json()['notifications']))
        self.assertEqual(self.client.get('/computer/team_board.mjs').status_code, 200)
        sw = self.client.get('/computer/team_notifications_sw.js')
        self.assertEqual(sw.status_code, 200)
        self.assertEqual(sw.headers.get('service-worker-allowed'), '/')
        denied = self.client.post('/api/computer/team/tasks/' + task_id + '/state',
                                  json={"actor": "Being", "state": "verified",
                                        "evidence": {"kind": "artifact",
                                                     "relative_path": "not-real.apk"}})
        self.assertEqual(denied.status_code, 400)

    def test_isolated_cookie_profiles(self):
        first = self.client.post('/api/computer/team/projects', json={
            "title": "Private", "objective": "Owner only",
            "acceptance": "Evidence reviewed", "lead": "Design"
        })
        self.assertEqual(first.status_code, 200)
        with TestClient(self.client.app) as outsider:
            their_state = outsider.get('/api/computer/team/state')
            self.assertEqual(their_state.status_code, 200)
            self.assertEqual(their_state.json()['projects'], [])
            self.assertGreater(self.client.get('/api/computer/team/state').json()['unread'], 0)
            self.assertEqual(outsider.get('/api/computer/team/state').json()['unread'], 0)


if __name__ == '__main__':
    unittest.main()
