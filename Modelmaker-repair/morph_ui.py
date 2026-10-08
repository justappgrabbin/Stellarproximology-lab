"""Isolated local neural morph mode; does not alter Modelmaker's text trainer."""
import html
from pathlib import Path
import gradio as gr

def build_morph_tab():
    path = Path(__file__).parent / 'morph-studio' / 'morph-standalone.html'
    with gr.Tab('Neural Morph · ONNX'):
        gr.Markdown('## Local neural image training\nTrain from aligned source/target image examples. Images and weight updates stay in your browser. Export trained ONNX weights and the preprocessing manifest. This compact training foundation is not yet a photorealistic avatar or game-world engine.')
        if not path.is_file():
            gr.Markdown('Morph Studio files are missing. Deploy the complete updated Modelmaker-repair directory, including morph-studio/.')
            return
        document = html.escape(path.read_text(encoding='utf-8'), quote=True)
        gr.HTML(f'<iframe title="Modelmaker Morph Studio" srcdoc="{document}" sandbox="allow-scripts allow-downloads" style="width:100%;height:1550px;border:0;border-radius:12px"></iframe>')
        gr.File(value=str(path), label='Download standalone Morph Studio (open locally in your browser)', interactive=False)
