import {useState} from 'react';
import {useOS} from '@/hooks/useOSStore';
import * as Icons from 'lucide-react';
import type {LucideProps} from 'lucide-react';
export default function MobileHome(){
 const {state,dispatch}=useOS();const [query,setQuery]=useState('');
 const apps=state.apps.filter(app=>(app.name+' '+app.category).toLowerCase().includes(query.toLowerCase()));
 return <section className="computer-mobile-home" aria-label="Your app hub">
  <header><h1>Your computer</h1><p>All your apps, in one place.</p><input aria-label="Find an app" placeholder="Find an app…" value={query} onChange={e=>setQuery(e.target.value)} /></header>
  <div className="computer-mobile-grid">{apps.map(app=>{const Icon=Icons[app.icon as keyof typeof Icons] as React.ComponentType<LucideProps>;return <button key={app.id} aria-label={'Open '+app.name} onClick={()=>dispatch({type:'OPEN_WINDOW',appId:app.id})}><span>{Icon?<Icon size={28}/>:<Icons.AppWindow size={28}/>}</span><b>{app.name}</b></button>;})}</div>
  <nav className="computer-mobile-homebar"><button onClick={()=>dispatch({type:'OPEN_WINDOW',appId:'settings'})}>Customize background & layout</button><button onClick={()=>dispatch({type:'MINIMIZE_ALL'})}>Home</button></nav>
 </section>;
}
