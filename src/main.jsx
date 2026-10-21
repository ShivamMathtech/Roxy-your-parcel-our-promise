import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
class ErrorBoundary extends React.Component {constructor(p){super(p);this.state={error:false};}static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<main className="fatal"><h1>Let’s get you back on track.</h1><p>Roxy encountered a page error. Your saved parcels are safe.</p><button onClick={()=>window.location.reload()}>Reload Roxy</button></main>:this.props.children;}}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
