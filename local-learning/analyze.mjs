import {readFile,writeFile} from 'node:fs/promises';
import {runPipeline} from '../human-design/dist/swarm-pipeline.mjs';
const [requestPath,reportPath,primitivePath,restoredPath]=process.argv.slice(2);
if(!requestPath||!restoredPath)throw Error('Use fixed request and output paths.');
const input=JSON.parse(await readFile(requestPath,'utf8'));
const {report,primitive,rebuilt}=await runPipeline(input);
await writeFile(reportPath,JSON.stringify(report,null,2));
await writeFile(primitivePath,JSON.stringify(primitive));
await writeFile(restoredPath,rebuilt);
