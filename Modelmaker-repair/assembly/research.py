"""Server adapters for the preserved Research Mesh intake/retrieval contracts."""
from __future__ import annotations
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree

AGENT = 'Modelmaker-Research/0.1 (+local research client)'
def fetch(url):
    with urlopen(Request(url,headers={'User-Agent':AGENT}),timeout=15) as response:
        return response.read(2_000_000).decode('utf-8')
def search_arxiv(query, transport=fetch):
    xml=transport('https://export.arxiv.org/api/query?'+urlencode({'search_query':'all:'+query,'max_results':5}))
    tree=ElementTree.fromstring(xml);ns={'a':'http://www.w3.org/2005/Atom'}
    return [{'title':' '.join(e.findtext('a:title','',ns).split()),'text':' '.join(e.findtext('a:summary','',ns).split()),
             'source':e.findtext('a:id','',ns),'provider':'arXiv','kind':'retrieved-abstract'} for e in tree.findall('a:entry',ns)]
def search_pubmed(query, transport=fetch):
    base='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'
    found=json.loads(transport(base+'esearch.fcgi?'+urlencode({'db':'pubmed','retmode':'json','retmax':5,'term':query})))
    ids=found.get('esearchresult',{}).get('idlist',[])
    if not ids:return []
    data=json.loads(transport(base+'esummary.fcgi?'+urlencode({'db':'pubmed','retmode':'json','id':','.join(ids)})))
    return [{'title':data['result'][i].get('title',''),'text':data['result'][i].get('title','')+' '+data['result'][i].get('pubdate',''),
             'source':'https://pubmed.ncbi.nlm.nih.gov/'+i+'/','provider':'PubMed','kind':'retrieved-bibliographic-record'} for i in ids if i in data.get('result',{})]

def research(runtime,query,providers=('local','arxiv','pubmed'),transport=fetch):
    if not query.strip() or len(query)>1000:raise ValueError('Research query must contain 1..1000 characters')
    unknown=set(providers)-{'local','arxiv','pubmed'}
    if unknown:raise ValueError('Unsupported providers: '+', '.join(sorted(unknown)))
    evidence=runtime.retrieve(query) if 'local' in providers else []
    errors=[]
    project=runtime.tool('research-browser',{'operation':'create','title':query,'question':query})['output']
    project_id=project.get('project',{}).get('id') or project.get('id')
    for provider,search in [('arxiv',search_arxiv),('pubmed',search_pubmed)]:
        if provider not in providers:continue
        try:
            for item in search(query,transport):
                doc,_=runtime.register(item['text'],item['title'],item['source'],item['kind'])
                runtime.tool('research-browser',{'operation':'source','projectId':project_id,
                    'source':{'url':item['source'],'title':item['title'],'excerpt':item['text'],'capturedBy':item['provider']}})
                evidence.append({**item,'document_id':doc})
        except Exception as exc:errors.append({'provider':provider,'error':str(exc)})
    result={'query':query,'project_id':project_id,'evidence':evidence,'errors':errors,
        'status':'partial' if errors else 'complete','policy':'retrieved records retain sources; candidate interpretations are not verified conclusions'}
    runtime.event('research',result)
    return result
