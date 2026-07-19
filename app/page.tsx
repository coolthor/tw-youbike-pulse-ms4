'use client';
import { useEffect, useMemo, useState } from 'react';

type Station = { id:string; name:string; area:string; address:string; total:number; bikes:number; docks:number; updatedAt:string; level:'ok'|'warn'|'bad'; label:string; };
type Payload = { source:string; fetchedAt:string; count:number; summary:{problem:number;noBike:number;noDock:number;ok:number}; stations:Station[] };

export default function Page(){
 const [data,setData]=useState<Payload|null>(null); const [err,setErr]=useState('');
 const [q,setQ]=useState(''); const [area,setArea]=useState('全部'); const [mode,setMode]=useState('問題優先');
 useEffect(()=>{let live=true; async function load(){try{const r=await fetch('/api/youbike',{cache:'no-store'}); if(!r.ok) throw new Error(String(r.status)); const j=await r.json(); if(live)setData(j)}catch(e){if(live)setErr(String(e))}} load(); const t=setInterval(load,60000); return()=>{live=false; clearInterval(t)}},[]);
 const areas=useMemo(()=>['全部',...Array.from(new Set((data?.stations||[]).map(s=>s.area))).sort((a,b)=>a.localeCompare(b,'zh-Hant'))],[data]);
 const stations=useMemo(()=>{let xs=(data?.stations||[]).filter(s=>(area==='全部'||s.area===area)&&(`${s.name} ${s.address}`.includes(q))); if(mode==='只看問題') xs=xs.filter(s=>s.level!=='ok'); if(mode==='可借車多') xs=[...xs].sort((a,b)=>b.bikes-a.bikes); if(mode==='可還位多') xs=[...xs].sort((a,b)=>b.docks-a.docks); return xs.slice(0,80)},[data,q,area,mode]);
 if(err) return <main><div className="error">資料讀取失敗：{err}</div></main>;
 return <main><section className="hero"><div className="eyebrow">Taipei real-time open data lab</div><h1 className="title">台北 YouBike<br/>即時雷達</h1><p className="subtitle">用免 API key 的台北市 YouBike 2.0 即時資料，找出「無車可借、無位可還、供需偏斜」站點。這是給 MS4 這類快模型測試 agent 產品力的 Vercel 小專案。</p></section>
 {!data?<div className="loading">載入即時站點中…</div>:<><section className="toolbar"><input placeholder="搜尋站名或地址" value={q} onChange={e=>setQ(e.target.value)}/><select value={area} onChange={e=>setArea(e.target.value)}>{areas.map(a=><option key={a}>{a}</option>)}</select><select value={mode} onChange={e=>setMode(e.target.value)}>{['問題優先','只看問題','可借車多','可還位多'].map(m=><option key={m}>{m}</option>)}</select></section><section className="grid"><Metric n={data.count} label="即時站點"/><Metric n={data.summary.problem} label="需注意站點"/><Metric n={data.summary.noBike} label="無車可借"/><Metric n={data.summary.noDock} label="無位可還"/></section><section className="stations">{stations.map(s=><article className="station" key={s.id}><div className="stationHead"><div><div className="name">{s.name}</div><div className="area">{s.area}｜{s.address}</div></div><span className={`pill ${s.level}`}>{s.label}</span></div><div className="bars"><div><div className="label">可借 {s.bikes} / {s.total}</div><div className="bar"><i style={{width:`${s.total?Math.round(s.bikes/s.total*100):0}%`}}/></div></div><div><div className="label">可還 {s.docks} / {s.total}</div><div className="bar"><i style={{width:`${s.total?Math.round(s.docks/s.total*100):0}%`}}/></div></div></div><div className="meta"><span>更新：{s.updatedAt}</span><span>ID：{s.id}</span></div></article>)}</section><p className="footer">資料來源：台北市 YouBike 2.0 即時公開 JSON；每 60 秒自動重抓。Fetched: {new Date(data.fetchedAt).toLocaleString('zh-TW')}</p></>}
 </main>
}
function Metric({n,label}:{n:number;label:string}){return <div className="card"><div className="metric">{n.toLocaleString()}</div><div className="label">{label}</div></div>}
