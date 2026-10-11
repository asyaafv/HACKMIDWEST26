/** Main-dashboard authentication keeps local credentials and HTTPS CSRF exclusively in memory. */
import { useState } from 'react';
import { useDemo } from './context';
export function Connect() {
  const { authenticate } = useDemo();
  const [token,setToken] = useState(''), [username,setUsername] = useState(''), [password,setPassword] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  async function submit(local: boolean) {
    setBusy(true); setError('');
    try { await authenticate(local ? {token:token.trim()} : {username,password}); setPassword(''); setToken(''); }
    catch(e) { setError(e instanceof Error ? e.message : 'Connection failed.'); }
    finally { setBusy(false); }
  }
  return <main id="main-content" tabIndex={-1} className="page-main" style={{maxWidth:600,margin:'60px auto'}}><img src="/assets/gate-logo.png" alt="Gate" width={48}/><h1>Connect to Gate</h1><p>Your enterprise authorization dashboard uses scoped PostgreSQL records. No payments are executed.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {import.meta.env.DEV && <form onSubmit={e=>{e.preventDefault();void submit(true);}}><label className="field">Local access token<input aria-label="Local access token" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} required/></label><p>Use your private operator, finance or auditor token from backend/work/demo-credentials.json.</p><button className="button primary" disabled={busy}>Connect to backend</button></form>}
    <details open={!import.meta.env.DEV}><summary>Sign in with a human account</summary><p>Requires provisioned credentials and same-origin HTTPS.</p><form onSubmit={e=>{e.preventDefault();void submit(false);}}><label className="field">Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="button primary" disabled={busy}>Sign in</button></form></details>
  </main>;
}
