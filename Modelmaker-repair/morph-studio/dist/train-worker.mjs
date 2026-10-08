import {ImageField,features,descriptor,rng} from './neural.mjs';
self.onmessage=async({data})=>{try{
  const {pairs,size,hidden,epochs,seed}=data;
  if(pairs.length<2)throw Error('Add at least two independent image pairs');
  const model=new ImageField(hidden,seed),random=rng(seed),training=pairs.slice(0,-1),held=pairs.at(-1);
  const ds=training.map(p=>descriptor(p.source,size)),hd=descriptor(held.source,size);
  const score=()=>{let loss=0;for(let p=0;p<size*size;p++){const out=model.forward(features(held.source,size,p,held.condition,hd)).out;for(let c=0;c<3;c++)loss+=(out[c]-held.target[p*3+c])**2;}return loss/(size*size*3);};
  const baseline=score(),history=[];
  for(let e=0;e<epochs;e++){
    let loss=0;const batches=16,batchSize=32;
    for(let b=0;b<batches;b++){const samples=[];for(let k=0;k<batchSize;k++){const i=Math.floor(random()*training.length),p=Math.floor(random()*size*size),pair=training[i];samples.push({x:features(pair.source,size,p,pair.condition,ds[i]),y:pair.target.subarray(p*3,p*3+3)});}loss+=model.batch(samples);}
    const val=score();if(!Number.isFinite(val))throw Error('Training diverged');history.push({epoch:e+1,train:loss/batches,validation:val});
    self.postMessage({type:'progress',...history.at(-1),epochs,baseline});
    await new Promise(r=>setTimeout(r,0));
  }
  self.postMessage({type:'done',model:model.save(),history,baseline,size,heldOut:held.name});
}catch(e){self.postMessage({type:'error',message:e.message});}};
