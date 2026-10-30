'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketData } from '@/lib/types';
import { marketWireSchema } from '@/lib/wire-schema';

export function useMarket(initialData: MarketData | null) {
  const [data,setData]=useState(initialData),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(!initialData),[refreshing,setRefreshing]=useState(false);
  const requestRef=useRef<AbortController|null>(null),refreshRef=useRef<()=>void>(()=>{});
  const refresh=useCallback(()=>refreshRef.current(),[]);
  useEffect(()=>{
    let active=true,failures=0,timer:ReturnType<typeof setTimeout>;
    async function poll() {
      clearTimeout(timer);requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;
      if(active)setRefreshing(true);
      const timeout=setTimeout(()=>controller.abort(),30000);
      try {
        const response=await fetch('/api/market',{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error(`Market service returned ${response.status}`);
        const next=marketWireSchema.parse(await response.json()) as MarketData;
        if(active && requestRef.current===controller) {setData(next);setError(null);failures=0;}
      }catch {
        if(active && requestRef.current===controller) {failures++;setError('Connection interrupted. Last snapshot retained; retrying automatically.');}
      }finally {
        clearTimeout(timeout);
        if(active && requestRef.current===controller) {
          setLoading(false);setRefreshing(false);
          timer=setTimeout(()=>{if(document.visibilityState==='visible')void poll();},failures?Math.min(300000,15000*2**Math.min(failures-1,5))+Math.random()*2000:60000);
        }
      }
    }
    refreshRef.current=()=>void poll();
    const onVisible=()=>{if(document.visibilityState==='visible')void poll();};
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
    if(!initialData)void poll();else timer=setTimeout(()=>void poll(),60000);
    return ()=>{active=false;clearTimeout(timer);requestRef.current?.abort();document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);};
  },[initialData]);
  return {data,error,loading,refreshing,refresh};
}
