import React, { createContext, useContext, useEffect, useState } from 'react';
import { Package, ChevronRight, X, LoaderCircle, MapPin, Check, Circle, ArrowUpRight, Home } from 'lucide-react';
export const AppContext=createContext(null);
export const useApp=()=>useContext(AppContext);
export const money=paise=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((paise||0)/100);
export const date=value=>value?new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—';
export const time=value=>new Date(value).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
export const labels={booked:'Pickup scheduled',picked_up:'Picked up',in_transit:'In transit',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled'};
export const stages=['booked','picked_up','in_transit','out_for_delivery','delivered'];
export const go=path=>{window.location.hash=path;};
export async function api(path,options={}) {
  let response;
  try {response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},body:options.body?JSON.stringify(options.body):undefined});}
  catch {throw new Error('Cannot reach Roxy. Check that the server is running.');}
  const data=await response.json().catch(()=>({error:'Unexpected server response.'}));
  if(!response.ok) throw new Error(data.error||'Something went wrong.');return data;
}
export function useData(path,poll=0) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const app=useApp();
  useEffect(()=>{let active=true;
    if(!path){setData(null);setLoading(false);return;}
    setLoading(true);setError('');
    const load=()=>api(path).then(d=>{if(active){setData(d);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    load();const interval=poll?setInterval(load,poll):null;return()=>{active=false;clearInterval(interval);};
  },[path,revision,app?.revision,poll]);
  return {data,error,loading,reload:()=>setRevision(n=>n+1),setData};
}
export function Logo({light=false}) {return <a className={'logo '+(light?'light':'')} href="#/dashboard" aria-label="Roxy home"><span className="logo-symbol"><Home size={24}/><Package size={12}/></span><span>roxy<span className="logo-dot">.</span></span></a>;}
export function Button({children,variant='primary',busy=false,className='',...props}) {return <button className={'btn '+variant+' '+className} {...props} disabled={busy||props.disabled}>{busy?<LoaderCircle size={17} className="spin"/>:null}{children}</button>;}
export function Status({status}) {return <span className={'status '+status}><i/>{labels[status]||status}</span>;}
export function Empty({title='Nothing here yet',description='Your updates will appear here.',action}) {return <div className="empty"><span className="empty-icon"><Package size={32}/></span><h3>{title}</h3><p>{description}</p>{action}</div>;}
export function LoadState({loading,error,retry}) {if(error)return <div className="error-box" role="alert"><p>{error}</p><Button variant="secondary" onClick={retry}>Try again</Button></div>;if(loading)return <div className="loading" aria-label="Loading"><LoaderCircle className="spin" size={26}/> Getting things ready…</div>;return null;}
export function Modal({title,children,onClose,wide=false}) {
  useEffect(()=>{const old=document.activeElement;const listener=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',listener);document.body.style.overflow='hidden';
    const box=document.querySelector('[role="dialog"]');box?.focus();
    const trap=e=>{if(e.key!=='Tab')return;const nodes=[...box.querySelectorAll('button:not(:disabled),input,select,textarea,a,[tabindex="0"]')];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===box)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};box?.addEventListener('keydown',trap);
    return()=>{document.removeEventListener('keydown',listener);box?.removeEventListener('keydown',trap);document.body.style.overflow='';old?.focus();};},[]);
  return <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={'modal '+(wide?'wide':'')}><header><h2>{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}
export function Field({label,children,required=false,hint}) {return <label className="field"><span>{label}{required&&<b> *</b>}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function PageTitle({eyebrow,title,description,children}) {return <div className="page-title"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{children}</div>;}
export function ParcelTable({shipments,admin=false}) {return <div className="table-scroll"><table className="parcel-table"><thead><tr><th>Parcel details</th><th>Route</th><th>Status</th><th>Delivery fee</th><th aria-label="Open parcel"/></tr></thead><tbody>{shipments.map(s=><tr key={s.id} onClick={()=>go('/shipment/'+s.id)}><td><div className="table-parcel"><span className={'parcel-icon '+s.parcel.type}><Package size={21}/></span><div><button className="text-button" onClick={e=>{e.stopPropagation();go('/shipment/'+s.id);}}>{s.parcel.description}</button><small>{s.tracking}</small></div></div></td><td><div className="route-cell">{s.pickup.city}<ChevronRight size={13}/>{s.drop.city}</div><small>{date(s.created_at)}</small></td><td><Status status={s.status}/></td><td className="price-cell">{money(s.total_paise)}<small>{s.payment_method==='demo'?'Demo checkout':'Pay on delivery'}</small></td><td><ChevronRight size={18}/></td></tr>)}</tbody></table></div>;}
export function RouteMap({from='Dehradun',to='Delhi',status='in_transit',compact=false}) {
  const progress=Math.max(0,stages.indexOf(status));
  return <div className={'route-map '+(compact?'compact':'')}><svg viewBox="0 0 620 310" role="img" aria-label={`Illustrated route from ${from} to ${to}. Not a live GPS map.`}>
    <rect width="620" height="310" fill="#f2f4f1"/>
    <g fill="#e4eadf"><path d="M20 22h140v85H20zM410 0h105v90H410zM444 214h176v96H444zM204 148h92v88h-92zM0 204h105v106H0z"/></g>
    <g stroke="#fff" strokeWidth="17" fill="none"><path d="M-20 143 654 85M152-20 94 340M353-20 305 340M552-20 483 340M-10 267 630 203"/><path d="m-20 10 670 300" strokeWidth="10"/></g>
    <g stroke="#dfe4de" strokeWidth="2" fill="none"><path d="M-20 143 654 85M152-20 94 340M353-20 305 340M552-20 483 340M-10 267 630 203"/></g>
    <path d="M210-10c-15 77 16 86-3 151s-49 104-35 179" stroke="#d4e7ed" strokeWidth="28" fill="none"/>
    <path d="m120 125 206-18-17 119 187-17" stroke="#ff3549" strokeWidth="4" strokeDasharray="7 7" fill="none" strokeLinecap="round"/>
    <g fill="#ff3549"><circle cx="120" cy="125" r="11"/><circle cx="496" cy="209" r="12"/></g><g fill="#fff"><circle cx="120" cy="125" r="4"/><circle cx="496" cy="209" r="4"/></g>
    <g transform={progress>=3?'translate(455 212)':progress>=2?'translate(314 190)':'translate(145 122)'}><circle r="24" fill="#ff3549" opacity=".13"/><rect x="-17" y="-15" width="34" height="29" rx="9" fill="#ff3549"/><path d="M-10-6H3v13h-13zM3-2h5l4 5v4H3" fill="none" stroke="white" strokeWidth="2"/><circle cx="-5" cy="9" r="3" fill="white"/><circle cx="8" cy="9" r="3" fill="white"/></g>
    <g fontFamily="Arial,sans-serif" fontSize="12" fontWeight="700" fill="#53625d"><text x="102" y="98">{from.toUpperCase()}</text><text x="457" y="250">{to.toUpperCase()}</text></g>
  </svg><span className="map-label"><MapPin size={12}/> Route illustration · no live GPS</span></div>;
}
export function DeliveryArt({variant='hero'}) {return <svg className={'delivery-art '+variant} viewBox="0 0 520 320" aria-hidden="true"><defs><linearGradient id="box" x2="1" y2="1"><stop stopColor="#fbd5b6"/><stop offset="1" stopColor="#e9ab83"/></linearGradient></defs><circle cx="273" cy="154" r="132" fill="#fff" opacity=".12"/><circle cx="273" cy="154" r="103" fill="#fff" opacity=".09"/><path d="M36 268h452" stroke="#fff" strokeWidth="2" opacity=".35"/><g transform="translate(61 74)"><rect x="0" y="36" width="241" height="135" rx="16" fill="#fff"/><path d="M241 76h68l48 50v45H241z" fill="#fbe7e7"/><path d="M252 86h49l32 37h-81z" fill="#243845"/><rect x="11" y="143" width="348" height="25" rx="7" fill="#e6e8ea"/><circle cx="65" cy="173" r="28" fill="#26323d"/><circle cx="65" cy="173" r="13" fill="#cbd5d8"/><circle cx="294" cy="173" r="28" fill="#26323d"/><circle cx="294" cy="173" r="13" fill="#cbd5d8"/><text x="70" y="113" fontFamily="Arial,sans-serif" fontWeight="800" fontSize="49" fill="#ff3549">roxy.</text><path d="M25 61h38M25 72h25" stroke="#ff3549" strokeWidth="4" strokeLinecap="round"/></g><g transform="translate(354 168)"><path d="m0 15 46-20 49 22-47 23z" fill="#fce3c9"/><path d="M0 15v60l48 24V40z" fill="url(#box)"/><path d="M48 40v59l47-24V17z" fill="#e4a177"/><path d="m21 5 49 23v23l-16 7V35L8 13z" fill="#f5caa4"/><path d="m62 68 17-9" stroke="#a46b49" strokeWidth="3"/></g><g transform="translate(352 32)"><path d="M29 0C13 0 0 13 0 29c0 21 29 45 29 45s29-24 29-45C58 13 45 0 29 0z" fill="#fff"/><circle cx="29" cy="28" r="11" fill="#ff3549"/></g><path d="m18 153 24-7M27 177l17-1M453 136l27 9M460 113l20-8" stroke="#fff" opacity=".5" strokeWidth="4" strokeLinecap="round"/></svg>;}
