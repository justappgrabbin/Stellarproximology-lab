"""Local stdio MCP toolbox for the model and the reused computer hands."""
import atexit
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from mcp.server.fastmcp import FastMCP
from assembly.runtime import Assembly
from assembly.desktop_server import ComputerHands
from assembly import self_edit
from assembly.intake import read_document
mcp=FastMCP('modelmaker-klein')
runtime=Assembly(user=os.getenv('MODELMAKER_USER','mcp-local'))
hands=ComputerHands(runtime.directory/'computer-workspace'/runtime.user)
atexit.register(runtime.close);atexit.register(hands.close)
@mcp.tool()
def ask(message:str)->dict:
    """Ask the loaded local model with retrieved passages and Klein analysis."""
    return runtime.respond(message)
@mcp.tool()
def load_checkpoint(path:str)->dict:
    """Load an explicitly selected local model checkpoint for CPU inference."""
    return runtime.load_model(path)
@mcp.tool()
def study_text(text:str,title:str='MCP source')->dict:
    """Learn patterns from supplied source text and retain passages for retrieval."""
    return runtime.study(text,title=title,source='mcp-user-supplied')
@mcp.tool()
def retrieve(query:str)->list:
    """Retrieve source passages from this local user's library."""
    return runtime.retrieve(query)
@mcp.tool()
def klein_tools()->list:
    """List the actually registered Klein tool implementations."""
    return runtime.bridge.request('catalog',user=runtime.user)
@mcp.tool()
def klein_call(tool:str,arguments:dict)->dict:
    """Invoke a registered Klein tool with explicit arguments."""
    return runtime.tool(tool,arguments)
@mcp.tool()
def watch()->dict:
    """Read the local learning and tool-failure watcher."""
    return runtime.watch()
@mcp.tool()
def computer_tools()->list:
    """List the reused computer hand capabilities and their descriptors."""
    return hands.request('catalog')
@mcp.tool()
def computer_call(tool:str,arguments:dict,execute:bool=False)->dict:
    """Propose a computer action. Set execute only for an explicitly authorized operation."""
    if not execute:return {'status':'proposal','tool':tool,'arguments':arguments}
    return hands.call(tool,arguments)
@mcp.tool()
def propose_edit(file:str,replacement:str)->dict:
    """Create a reviewable self-edit diff without changing source files."""
    return self_edit.propose(runtime,file,replacement)
@mcp.tool()
def apply_reviewed_edit(proposal_id:str,reviewed:bool=False)->dict:
    """Apply an explicitly reviewed diff, run checks, and roll back failed edits."""
    if not reviewed:raise ValueError('Review the proposed diff before applying it')
    return self_edit.apply(runtime,proposal_id)
@mcp.tool()
def clarify(original:str,interpretation:str)->dict:
    """Propose a clarification without presenting it as the user's confirmed intent."""
    return runtime.propose_clarification(original,interpretation)
@mcp.tool()
def confirm_clarification(proposal_id:str,accepted:bool)->dict:
    """Record the user's decision on a proposed clarification."""
    return runtime.confirm_clarification(proposal_id,accepted)
if __name__=='__main__':mcp.run(transport='stdio')
