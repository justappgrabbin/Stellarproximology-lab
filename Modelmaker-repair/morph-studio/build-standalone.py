"""Build the same no-provider trainer into one downloadable HTML file."""
import json, re
from pathlib import Path
root = Path(__file__).parent
dist = root / 'dist'
neural = re.sub(r'^export ', '', (dist/'neural.mjs').read_text(), flags=re.M)
onnx = re.sub(r'^import .*\n|^export ', '', (dist/'onnx.mjs').read_text(), flags=re.M)
worker = re.sub(r'^import .*\n', '', (dist/'train-worker.mjs').read_text(), flags=re.M)
app = re.sub(r'^import .*\n', '', (dist/'app.mjs').read_text(), flags=re.M)
app = app.replace("new Worker('train-worker.mjs',{type:'module'})", "new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'})))")
app = re.sub(r"if\('serviceWorker'.*", '', app)
procedural = re.sub(r'^import .*\n|^export ', '', (dist/'procedural.mjs').read_text(), flags=re.M)
script = neural + '\n' + procedural + '\n' + onnx + '\nconst WORKER_SOURCE=' + json.dumps(neural+'\n'+worker) + ';\n' + app
html = (dist/'index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+(dist/'style.css').read_text()+'</style>')
html = html.replace('<script type="module" src="app.mjs"></script>', '<script>'+script.replace('</script','<\\/script')+'</script>')
(root/'morph-standalone.html').write_text(html)
