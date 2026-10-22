export class McpToolBroker {
  #tools = new Map();
  constructor({authorize=async()=>true, ledger=async()=>{}}={}) { this.authorize=authorize; this.ledger=ledger; }
  register({name, description='', inputSchema={type:'object'}, handler}) {
    if (!name || typeof handler !== 'function') throw new Error('tool name and handler required');
    this.#tools.set(name,{name,description,inputSchema,handler});
  }
  descriptors() { return [...this.#tools.values()].map(({handler,...d})=>d); }
  async call({actor='synthia', provider='synthia', name, input={}}) {
    const tool=this.#tools.get(name); if(!tool) throw new Error(`Unknown MCP tool ${name}`);
    const allowed=await this.authorize({actor,provider,tool:name,input});
    if(!allowed) throw new Error(`Tool call denied: ${name}`);
    const startedAt=new Date().toISOString();
    try { const output=await tool.handler(input,{actor,provider}); await this.ledger({tool_name:name,input,output,status:'ok',actor,provider,startedAt}); return output; }
    catch(error){ await this.ledger({tool_name:name,input,status:'error',error:String(error),actor,provider,startedAt}); throw error; }
  }
}
