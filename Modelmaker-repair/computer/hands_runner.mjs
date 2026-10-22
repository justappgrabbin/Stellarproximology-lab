import readline from 'node:readline';
import {mkdir} from 'node:fs/promises';
import {SoloBrowserHand} from '../vendor/computer58/src/solo/browser-hand-adapter.mjs';
import {AndroidHandBridge} from '../vendor/computer58/src/solo/android-hand-adapter.mjs';
import {McpToolBroker} from '../vendor/computer58/vendor/synthia-codex-provider-runtime-v0.1.1/synthia-codex-provider-runtime/src/mcp-tool-broker.mjs';
import {getContainerStatus,runContainerCommand} from '../vendor/computer58/linuxContainerService.ts';
const directory=process.argv[2];await mkdir(directory,{recursive:true});
const browser=new SoloBrowserHand({persistenceDir:directory,width:1280,height:800});
const android=new AndroidHandBridge();
const broker=new McpToolBroker({authorize:async({actor})=>actor==='user',ledger:async()=>{}});
const schema={type:'object'};
function register(name,description,handler){broker.register({name,description,inputSchema:schema,handler});}
function requireBrowser(){if(process.env.MODELMAKER_CONTAINER!=='1'&&process.env.MODELMAKER_HOST_BROWSER!=='1')throw Error('Browser hands run in the Linux computer; host browser is disabled');}
register('browser.status','Inspect the existing 5.8 browser hand',()=>browser.status());
register('browser.open','Navigate the computer browser',async({url})=>{requireBrowser();const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error('Use HTTP or HTTPS');return browser.navigate(u.href);});
register('browser.preview','Load supplied HTML in the computer browser',async({html,width=1280,height=800})=>{requireBrowser();if(typeof html!=='string'||html.length>2000000)throw Error('HTML must be under 2 MB');if(![390,768,1280].includes(Number(width)))throw Error('Choose phone, tablet or desktop width');browser.executor.viewport={width:Number(width),height:Math.min(1000,Math.max(400,Number(height)))};return browser.loadHTML(html);});
register('browser.inspect','Inspect page and screenshot',async()=>{requireBrowser();return browser.bundle();});
register('browser.click','Click visible text',async({text})=>{requireBrowser();return browser.clickText(text);});
register('browser.fill','Fill explicitly supplied form values',async({values})=>{requireBrowser();return browser.fillFields(values);});
register('browser.submit','Submit a prepared form only when explicitly confirmed',async({confirmed=false})=>{requireBrowser();return browser.submit({confirmed});});
for(const op of ['back','forward','reload'])register('browser.'+op,'Browser '+op,async()=>{requireBrowser();return browser[op]();});
register('android.status','Check the existing Android accessibility bridge',()=>android.status());
register('android.command','Send an explicit device command to the configured Android bridge',({command})=>android.command(command));
register('terminal.status','Inspect the reused Linux container service',()=>getContainerStatus());
register('terminal.exec','Run an explicit command inside the Linux computer',async({command})=>{
 if(process.env.MODELMAKER_CONTAINER!=='1')throw Error('Terminal requires the Linux container');
 if(typeof command!=='string'||!command.trim()||command.length>16000)throw Error('Provide a command under 16000 characters');
 // Keep the donor service and add an inner process-group timeout for descendants.
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
 return runContainerCommand('timeout -k 2 20 bash -lc '+quote(command));
});
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){try{const request=JSON.parse(line);let result;
 if(request.operation==='catalog')result=broker.descriptors();
 else if(request.operation==='invoke')result=await broker.call({actor:'user',provider:'computer-ui',name:request.tool,input:request.input??{}});
 else throw Error('Unknown hands operation');
 process.stdout.write(JSON.stringify({ok:true,result})+'\n');
 }catch(e){process.stdout.write(JSON.stringify({ok:false,error:String(e.message??e)})+'\n');}}
await browser.close();
