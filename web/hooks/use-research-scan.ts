'use client';
import { useEffect,useRef,useState } from 'react';
import { z } from 'zod';
export function useResearchScan(enabled:boolean,due:number,onUpdate:()=>void){
  const remaining=useRef(due),update=useRef(onUpdate),[state,setState]=useState({running:false,remaining:due,error:null as string|null});
  useEffect(()=>{remaining.current=due;},[due]);useEffect(()=>{update.current=onUpdate;},[onUpdate]);
  useEffect(()=>{
    if(!enabled)return;let active=true,busy=false,count=0,delay=5000,blockedUntil=0,timer:ReturnType<typeof setTimeout>,controller:AbortController|null=null;
    async function run(){
      if(!active||busy)return;clearTimeout(timer);if(blockedUntil>Date.now()){timer=setTimeout(()=>void run(),blockedUntil-Date.now());return;}
      if(document.visibilityState!=='visible'||!navigator.onLine||remaining.current===0){timer=setTimeout(()=>void run(),60000);return;}
      busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),45000);setState(s=>({...s,running:true,error:null}));
      try{const response=await fetch('/api/research/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:8}),signal:controller.signal});if(!response.ok)throw new Error();const result=z.object({remaining:z.number().int().min(0).max(1500),rateLimited:z.boolean().optional(),retryAfterSeconds:z.number().nonnegative().optional()}).parse(await response.json());delay=result.rateLimited?Math.max(60000,(result.retryAfterSeconds??3600)*1000):5000;if(result.rateLimited)blockedUntil=Date.now()+delay;remaining.current=result.remaining;if(active)setState({running:result.remaining>0&&!result.rateLimited,remaining:result.remaining,error:result.rateLimited?'Source rate limit; automatic scanning is paused until the retry window.':null});if(++count%3===0||result.remaining===0)update.current();if(result.remaining===0)await fetch('/api/research/daily',{method:'POST',signal:controller.signal});}
      catch{delay=60000;if(active)setState(s=>({...s,running:false,error:'Automatic scan will retry. Stored observations remain visible.'}));}
      finally{clearTimeout(timeout);busy=false;if(active)timer=setTimeout(()=>void run(),remaining.current?delay:60000);}
    }
    const resume=()=>{if(document.visibilityState==='visible'&&!busy)void run();};document.addEventListener('visibilitychange',resume);timer=setTimeout(()=>void run(),1500);
    return ()=>{active=false;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',resume);};
  },[enabled]);return state;
}
