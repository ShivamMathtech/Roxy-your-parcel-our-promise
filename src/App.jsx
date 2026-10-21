import React,{useEffect,useState} from 'react';
import { LayoutDashboard,Package,MapPin,Plus,Calculator,MessageCircle,Settings,Bell,LogOut,ArrowUpRight,ChevronDown,Users,ShieldCheck,CheckCircle2,X,Menu } from 'lucide-react';
import { AppContext,api,go,Logo,Button,LoadState } from './lib.jsx';
import Auth from './Auth.jsx';
import {Dashboard,Shipments,Tracking,Notifications,AdminOverview} from './Pages.jsx';
import Booking from './Booking.jsx';
import Shipment from './Shipment.jsx';
import {Addresses,Account,Support} from './Account.jsx';
const links=[['/dashboard','Overview',LayoutDashboard],['/shipments','My parcels',Package],['/track','Track a parcel',MapPin],['/calculator','Calculate delivery',Calculator],['/addresses','Address book',MapPin]];
export default function App(){
  const [user,setUser]=useState(null),[catalog,setCatalog]=useState(null),[ready,setReady]=useState(false),[initError,setInitError]=useState(''),[route,setRoute]=useState(window.location.hash.slice(1)||'/dashboard'),[revision,setRevision]=useState(0),[toasts,setToasts]=useState([]),[menu,setMenu]=useState(false),[unread,setUnread]=useState(0);
  const toast=(message,type='success')=>{const id=Date.now()+Math.random();setToasts(t=>[...t.slice(-2),{id,message,type}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),5000);};
  const refresh=()=>setRevision(n=>n+1);
  useEffect(()=>{const fn=()=>{setRoute(window.location.hash.slice(1)||'/dashboard');setMenu(false);window.scrollTo(0,0);};window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);
  useEffect(()=>{Promise.all([api('/catalog'),api('/auth/me').catch(()=>null)]).then(([c,session])=>{setCatalog(c);setUser(session?.user||null);}).catch(e=>setInitError(e.message)).finally(()=>setReady(true));},[]);
  useEffect(()=>{if(!user){setUnread(0);return;}let active=true;const load=()=>api('/notifications').then(d=>{if(active)setUnread(d.items.filter(n=>!n.read).length);}).catch(()=>{});load();const interval=setInterval(load,30000);return()=>{active=false;clearInterval(interval);};},[user?.id,revision]);
  const pathname=route.split('?')[0];
  const context={user,setUser,catalog,toast,refresh,revision};
  async function logout(){try{await api('/auth/logout',{method:'POST',body:{}});setUser(null);go('/login');}catch(e){toast(e.message,'error');}}
  let content;
  if(!ready) content=<div className="boot"><Logo/><LoadState loading/></div>;
  else if(initError) content=<div className="boot"><Logo/><LoadState error={initError} retry={()=>window.location.reload()}/></div>;
  else if(!user&&pathname==='/track') content=<div className="public-track"><header><Logo/><a className="btn secondary" href="#/login">Sign in <ArrowUpRight size={16}/></a></header><Tracking/></div>;
  else if(!user) content=<Auth key={pathname} mode={pathname.slice(1)}/>;
  else {
    let page;
    if(['/dashboard','/login','/signup','/forgot','/reset','/'].includes(pathname))page=<Dashboard/>;
    else if(pathname==='/shipments') page=<Shipments/>;
    else if(pathname==='/book') page=<Booking/>;
    else if(pathname==='/calculator') page=<Booking calculator/>;
    else if(pathname.startsWith('/shipment/')) page=<Shipment key={pathname} id={pathname.split('/')[2]}/>;
    else if(pathname==='/track')page=<Tracking/>;
    else if(pathname==='/addresses')page=<Addresses/>;
    else if(pathname==='/account')page=<Account/>;
    else if(pathname==='/support')page=<Support/>;
    else if(pathname==='/notifications')page=<Notifications/>;
    else if(pathname==='/operations'&&user.role==='admin')page=<AdminOverview/>;
    else page=<div className="empty"><h1>We couldn’t find that page.</h1><a href="#/dashboard" className="btn primary">Back to overview</a></div>;
    content=<div className="app-shell">{menu&&<button aria-label="Close navigation" className="sidebar-shade" onClick={()=>setMenu(false)}/>}
      <aside className={'sidebar '+(menu?'open':'')}><Logo/><div className="workspace-chip"><span className="workspace-avatar">{user.role==='admin'?<ShieldCheck size={19}/>:user.name[0]}</span><div><strong>{user.role==='admin'?'Operations workspace':'Personal workspace'}</strong><small>{user.role==='admin'?'Roxy administration':'Your everyday deliveries'}</small></div><ChevronDown size={13}/></div>
      <p className="nav-label">WORKSPACE</p><nav>{links.filter(l=>user.role!=='admin'||!['/calculator','/addresses'].includes(l[0])).map(([url,label,Icon])=><a key={url} href={'#'+url} className={pathname===url?'active':''}><Icon size={19}/><span>{user.role==='admin'&&url==='/shipments'?'All parcels':label}</span>{url==='/dashboard'&&<span className="active-dot"/>}</a>)}{user.role==='admin'&&<a href="#/operations" className={pathname==='/operations'?'active':''}><Users size={19}/> Customers & activity</a>}</nav>
      <p className="nav-label second">HERE TO HELP</p><nav><a href="#/support" className={pathname==='/support'?'active':''}><MessageCircle size={19}/> {user.role==='admin'?'Support inbox':'Help & support'}</a><a href="#/account" className={pathname==='/account'?'active':''}><Settings size={19}/> Account & settings</a></nav>
      <div className="sidebar-bottom"><div className="sidebar-promo"><span className="tiny-box"><Package size={23}/></span><strong>A little care.<br/>Every delivery.</strong><p>Your next good thing starts here.</p><button onClick={()=>go(user.role==='admin'?'/shipments':'/book')}>{user.role==='admin'?'Manage parcels':'Send something'} <ArrowUpRight size={15}/></button></div><button className="sidebar-user" onClick={()=>go('/account')}><span className="avatar">{user.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><div><strong>{user.name}</strong><small>{user.role==='admin'?'Administrator':'Personal account'}</small></div></button><button className="logout" onClick={logout}><LogOut size={15}/> Sign out</button></div></aside>
      <div className="workspace"><header className="topbar"><div className="topbar-left"><button className="icon-btn menu-toggle" aria-label="Open navigation" onClick={()=>setMenu(true)}><Menu size={22}/></button><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{links.find(l=>l[0]===pathname)?.[1]||({'/book':'New delivery','/account':'Account','/support':'Support','/notifications':'Updates','/operations':'Operations'}[pathname])||'Parcel details'}</strong></div><div className="topbar-right"><span className="service-online"><i/> {catalog.demo_mode?'Local demo':'Roxy workspace'}</span><button className="icon-btn notification-btn" aria-label={`Notifications, ${unread} unread`} onClick={()=>go('/notifications')}><Bell size={20}/>{unread>0&&<span>{unread>9?'9+':unread}</span>}</button><span className="header-line"/><button className="avatar small" aria-label="My account" onClick={()=>go('/account')}>{user.name[0]}</button></div></header>
      <main className="main-content" key={pathname}>{page}</main><footer className="workspace-footer"><span>roxy. <span>Thoughtfully delivered.</span></span><span>{catalog.demo_mode?'Demo workspace · No real dispatch':'Parcel management workspace'}</span></footer>
      <nav className="mobile-nav"><a href="#/dashboard" className={pathname==='/dashboard'?'active':''}><LayoutDashboard size={21}/><span>Home</span></a><a href="#/shipments" className={pathname==='/shipments'?'active':''}><Package size={21}/><span>Parcels</span></a>{user.role!=='admin'&&<a href="#/book" className="mobile-add" aria-label="Book a parcel"><Plus size={26}/></a>}<a href="#/track"><MapPin size={21}/><span>Track</span></a><a href="#/account"><Settings size={21}/><span>Account</span></a></nav></div></div>;
  }
  return <AppContext.Provider value={context}>{content}<div className="toast-stack" aria-live="polite">{toasts.map(t=><div key={t.id} className={'toast '+t.type}><CheckCircle2 size={19}/><span>{t.message}</span><button aria-label="Dismiss message" onClick={()=>setToasts(v=>v.filter(x=>x.id!==t.id))}><X size={16}/></button></div>)}</div></AppContext.Provider>;
}
