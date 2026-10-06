"""Credential-free checks; never import generated app code into this process."""
import ast
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
for folder in ['Modelmaker-repair', 'scripts', 'tests']:
    for file in (ROOT / folder).rglob('*.py'):
        ast.parse(file.read_text(), filename=str(file))
for file in (ROOT / 'human-design/dist').glob('*.mjs'):
    subprocess.run(['node', '--check', str(file)], check=True, timeout=30)
subprocess.run(['python', '-m', 'unittest', 'discover', '-s', str(ROOT / 'tests'), '-v'], check=True, timeout=60)
engine_check = ROOT / 'human-design/check-engine.mjs'
if engine_check.exists():
    subprocess.run(['node', str(engine_check)], check=True, timeout=30)
print('Python syntax, JavaScript syntax, approval controls, and chart engine checks passed.')
