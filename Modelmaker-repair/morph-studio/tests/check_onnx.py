"""Independent ONNX schema and inference check. pip install onnx onnxruntime numpy."""
import json
import numpy as np
import onnx
import onnxruntime as ort
model = onnx.load('/tmp/modelmaker-test.onnx')
onnx.checker.check_model(model, full_check=True)
fixture = json.load(open('/tmp/modelmaker-test.json'))
session = ort.InferenceSession('/tmp/modelmaker-test.onnx', providers=['CPUExecutionProvider'])
actual = session.run(None, {'features': np.array([fixture['x']], dtype=np.float32)})[0][0]
np.testing.assert_allclose(actual, fixture['rgb'], rtol=1e-5, atol=1e-6)
print('ONNX schema valid; ONNX Runtime output matches local neural inference.')
