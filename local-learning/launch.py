"""Open the on-computer app; optionally use a standalone pywebview window."""
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import urlopen
import webbrowser

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:8765'
COMPUTER='--computer' in sys.argv
OPEN_URL=URL+'/computer/' if COMPUTER else URL

def main():
    process=None
    try:
        # Reuse only a verified Synthia local service already on this port.
        import json
        def ready():
            try:
                with urlopen(URL+'/api/local/status',timeout=1) as r: return json.load(r).get('local') is True
            except Exception: return False
        if not ready():
            process=subprocess.Popen([sys.executable,str(ROOT/'local-learning/service.py')],cwd=ROOT)
            deadline=time.monotonic()+10
            while not ready():
                if process.poll() is not None: raise RuntimeError('Local service could not start. Inspect the message above.')
                if time.monotonic()>deadline: raise RuntimeError('Local service startup timed out.')
                time.sleep(.15)
        try:
            import webview
        except ImportError:
            webbrowser.open(OPEN_URL)
            print('Synthia opened in your browser. Keep this window open. Press Ctrl+C to stop.')
            if process: process.wait()
        else:
            webview.create_window('Synthia Computer' if COMPUTER else 'Synthia Human Design',OPEN_URL,width=1440,height=900,min_size=(800,600))
            webview.start()
    except KeyboardInterrupt: pass
    finally:
        if process and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill()

if __name__=='__main__': main()
