from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile
import json

def read_document(path):
    path=Path(path)
    if path.stat().st_size>32*1024*1024:raise ValueError('Document exceeds 32 MiB intake limit')
    if path.suffix.lower()=='.pdf':
        from pypdf import PdfReader
        pages=[f'[Page {i+1}]\n{page.extract_text() or ""}' for i,page in enumerate(PdfReader(path).pages)]
        text='\n\n'.join(pages)
        if not any(len(p.split('\n',1)[-1].strip()) for p in pages):raise ValueError('PDF contains no extractable text; OCR is not configured')
        return text
    if path.suffix.lower()=='.docx':
        with ZipFile(path) as z:
            info=z.getinfo('word/document.xml')
            if info.file_size>32*1024*1024:raise ValueError('Expanded document exceeds intake limit')
            root=ElementTree.fromstring(z.read(info))
        return '\n'.join(''.join(n.itertext()) for n in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
    if path.suffix.lower() not in {'.txt','.md','.json','.jsonl','.py','.js','.mjs','.ts','.html','.css','.csv'}:raise ValueError('Unsupported text document type')
    text=path.read_text(encoding='utf-8')
    if path.suffix.lower()=='.json':return json.dumps(json.loads(text),ensure_ascii=False,indent=2)
    return text
