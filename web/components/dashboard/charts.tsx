'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExternalLink, WifiOff } from 'lucide-react';
import type { Candle, Stock } from '@/lib/types';
import { emaSeries } from '@/lib/analysis/indicators';
import { compact, number } from '@/lib/format';

const tooltipStyle={background:'#121c2c',border:'1px solid #2a3950',borderRadius:12,color:'#e6edf7',fontSize:12};
function useMounted() {const [mounted,set]=useState(false);useEffect(()=>set(true),[]);return mounted;}
export function Sparkline({candles,positive=true}:{candles:Candle[];positive?:boolean}) {
  const id=useId().replace(/:/g,''),mounted=useMounted();
  if(!mounted)return <span className="spark-placeholder"/>;
  return <div className="sparkline" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" initialDimension={{width:85,height:29}}><AreaChart data={candles.slice(-30)}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={positive?'#65e9bd':'#f38a9b'} stopOpacity={0.18}/><stop offset="1" stopColor={positive?'#65e9bd':'#f38a9b'} stopOpacity={0}/></linearGradient></defs><YAxis domain={['dataMin','dataMax']} hide/><Area type="monotone" dataKey="close" stroke={positive?'#65e9bd':'#f38a9b'} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>;
}
export function PriceChart({candles,range=66,showEma=false,small=false}:{candles:Candle[];range?:number;showEma?:boolean;small?:boolean}) {
  const mounted=useMounted(),id=useId().replace(/:/g,'');
  const rows=useMemo(()=>{
    const ema=emaSeries(candles.map(c=>c.close),20);
    return candles.map((c,i)=>({...c,ema20:ema[i],displayDate:new Date(`${c.time}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})})).slice(-range);
  },[candles,range]);
  if(!mounted)return <div className="chart-skeleton"/>;
  if(!rows.length)return <div className="empty-compact">No observed price history is available for this instrument.</div>;
  return <div className={`price-chart ${small?'small':''}`} role="img" aria-label={`Daily price and volume chart, ${rows[0]?.time} to ${rows.at(-1)?.time}; latest ${number(rows.at(-1)?.close,2)}`}>
    <ResponsiveContainer width="100%" height="100%" initialDimension={{width:600,height:214}}><ComposedChart data={rows} margin={{top:12,right:2,left:5,bottom:0}}>
      <defs><linearGradient id={`price-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#66e6c0" stopOpacity={0.23}/><stop offset="0.9" stopColor="#66e6c0" stopOpacity={0.015}/></linearGradient></defs>
      <CartesianGrid stroke="#b3c9ef" strokeOpacity={0.065} vertical={false}/>
      <XAxis dataKey="displayDate" axisLine={false} tickLine={false} minTickGap={45} tick={{fill:'#7788a5',fontSize:10}} dy={8}/>
      <YAxis yAxisId="price" orientation="right" domain={['auto','auto']} tickCount={5} axisLine={false} tickLine={false} tick={{fill:'#7788a5',fontSize:10}} width={62} tickFormatter={v=>number(v)}/>
      <YAxis yAxisId="volume" hide domain={[0,(max:number)=>max*6]}/>
      <Tooltip contentStyle={tooltipStyle} labelStyle={{color:'#9caec9'}} formatter={(value, key)=>[key==='volume'?compact(Number(value)):number(Number(value),2),key==='close'?'Price':key==='ema20'?'EMA 20':'Volume']}/>
      <Bar yAxisId="volume" dataKey="volume" fill="#455e6b" opacity={0.32} radius={[2,2,0,0]} isAnimationActive={false}/>
      <Area yAxisId="price" type="monotone" dataKey="close" stroke="#6ce7c0" strokeWidth={2} fill={`url(#price-${id})`} isAnimationActive={false}/>
      {showEma&&<Line yAxisId="price" type="monotone" dataKey="ema20" stroke="#b5a2ff" strokeWidth={1.2} dot={false} isAnimationActive={false}/>}
    </ComposedChart></ResponsiveContainer>
  </div>;
}
export function FlowChart({stocks}:{stocks:Stock[]}) {
  const mounted=useMounted();
  const rows=useMemo(()=>{
    const dates=[...new Set(stocks.flatMap(s=>s.flowSource&&!s.flowSource.stale?s.foreignFlows.map(f=>f.date):[]))].sort().slice(-5);
    return dates.map(date=>({date:new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}),net:stocks.reduce((sum,s)=>sum+(s.flowSource&&!s.flowSource.stale?s.foreignFlows.filter(f=>f.date===date).reduce((a,f)=>a+f.buy-f.sell,0):0),0)/1e9}));
  },[stocks]);
  if(!rows.length)return <div className="empty-compact">No verified foreign flow feed connected.</div>;
  return <div className="flow-chart" role="img" aria-label="Five-session aggregate foreign net trading in IDR billions">{mounted&&<ResponsiveContainer width="100%" height="100%" initialDimension={{width:400,height:172}}><BarChart data={rows} margin={{top:12,right:4,left:-30,bottom:0}}><CartesianGrid stroke="#b3c9ef" strokeOpacity={0.06} vertical={false}/><XAxis dataKey="date" tick={{fill:'#8090aa',fontSize:10}} tickLine={false} axisLine={false}/><YAxis tick={{fill:'#8090aa',fontSize:10}} tickFormatter={v=>`${v}B`} tickLine={false} axisLine={false}/><Tooltip contentStyle={tooltipStyle} formatter={v=>[`${number(Number(v),1)}B IDR`,'Net foreign']}/><Bar dataKey="net" radius={[4,4,0,0]} maxBarSize={42} isAnimationActive={false}>{rows.map(row=><Cell key={row.date} fill={row.net>=0?'#63dcb4':'#ef8599'} fillOpacity={0.65}/>)}</Bar></BarChart></ResponsiveContainer>}</div>;
}
export function TradingViewChart({symbol}:{symbol:string}) {
  const container=useRef<HTMLDivElement>(null),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  useEffect(()=>{
    const target=container.current;if(!target)return;
    setStatus('loading');target.replaceChildren();
    const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.height='100%';target.appendChild(widget);
    const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;
    script.textContent=JSON.stringify({autosize:true,symbol:`IDX:${symbol==='IHSG'?'COMPOSITE':symbol}`,interval:'D',timezone:'Asia/Jakarta',theme:'dark',style:'1',locale:'en',backgroundColor:'#0e1726',gridColor:'rgba(135,159,191,0.06)',allow_symbol_change:false,hide_side_toolbar:true,withdateranges:true,save_image:false,calendar:false,support_host:'https://www.tradingview.com'});
    script.onerror=()=>setStatus('error');target.appendChild(script);
    // An iframe appearing confirms embedding, not the exchange's data entitlement.
    const observer=new MutationObserver(()=>{if(target.querySelector('iframe'))setStatus('ready');});observer.observe(target,{childList:true,subtree:true});
    const timeout=setTimeout(()=>{if(!target.querySelector('iframe'))setStatus('error');},12000);
    return ()=>{observer.disconnect();clearTimeout(timeout);script.onerror=null;target.replaceChildren();};
  },[symbol]);
  const link=`https://www.tradingview.com/symbols/IDX-${symbol==='IHSG'?'COMPOSITE':symbol}/`;
  return <div className="tradingview-wrap"><div ref={container} className="tradingview-widget-container" style={{height:360}}/>{status!=='ready'&&<div className="widget-status">{status==='loading'?<span className="spinner"/>:<WifiOff size={18}/>}<p>{status==='loading'?'Connecting to TradingView…':'Embedded data is unavailable or restricted.'}</p><a href={link} target="_blank" rel="noopener noreferrer">Open chart <ExternalLink size={13}/></a></div>}<div className="tv-credit"><a href={link} target="_blank" rel="noopener noreferrer">{symbol} chart by TradingView <ExternalLink size={11}/></a><span>Exchange delay and symbol restrictions apply. Separate feed.</span></div></div>;
}
