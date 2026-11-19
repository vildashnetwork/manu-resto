import React, { useState } from 'react';
import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import { Brand } from './ui.jsx';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState('');
  function submit(event) { event.preventDefault(); if (password === '123456') onLogin(); else setError('Incorrect password. Try again.'); }
  return <main className="login"><section className="login-hero"><Brand /><div><span className="eyebrow">RESTAURANT MANAGEMENT, MADE SIMPLE</span><h1>More time for<br />the <em>good stuff.</em></h1><p>Sales, customers and stock in one happy place. So you can spend more time doing what you love.</p></div><small>Made for the people who make every meal matter ✳</small></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><span className="login-badge"><UtensilsCrossed size={21} /></span><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your restaurant</h2><p>Your dashboard is ready when you are.</p><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} placeholder="Enter your password" autoComplete="current-password" />{error && <span className="error-text">{error}</span>}<button className="button login-button" type="submit">Continue <ChevronRight size={17} /></button><small>Private workspace · Demo password configured</small></form></section></main>;
}
