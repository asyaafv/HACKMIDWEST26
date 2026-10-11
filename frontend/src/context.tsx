/** Dashboard state is loaded from authenticated REST; browser fixtures are never a fallback. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DemoDataService, DemoState } from './types';
import { BackendService, api } from './backend-service';

interface Context { authenticated: boolean; authenticate: (input: { token?: string; username?: string; password?: string }) => Promise<void>; disconnect: () => Promise<void>; state: DemoState | null; loading: boolean; error: string; busy: boolean; notice: string; run: (action: (service: DemoDataService) => Promise<DemoState>, success?: string) => Promise<boolean>; reload: () => void; dismiss: () => void }
const Store = createContext<Context | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const service = useRef<DemoDataService | null>(null);
  if (!service.current) service.current = new BackendService();
  const [authenticated, setAuthenticated] = useState(false);
  const [state, setState] = useState<DemoState | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const locked = useRef(false);
  const reload = useCallback(() => { setLoading(true); service.current!.load().then(setState).then(() => setError('')).catch(e => setError(e instanceof Error ? e.message : 'Backend records could not be loaded.')).finally(() => setLoading(false)); }, []);
  const authenticate = async (input: { token?: string; username?: string; password?: string }) => {
    api.clear();
    if (input.token) api.token = input.token;
    else { const response = await api.call<{csrfToken:string}>('/auth/login', {username:input.username,password:input.password}); api.csrf = response.csrfToken; }
    try { const next = await service.current!.load(); setState(next); setAuthenticated(true); setLoading(false); setError(''); }
    catch (e) { api.clear(); throw e; }
  };
  const disconnect = async () => {
    if (!api.token) await api.call('/auth/logout', {});
    api.clear(); service.current = new BackendService(); setState(null); setAuthenticated(false); setLoading(false);
  };
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  const run = async (action: (service: DemoDataService) => Promise<DemoState>, success = 'Changes saved.') => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError('');
    try { setState(await action(service.current!)); setNotice(success); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'The change could not be saved. Try again.'); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  return <Store.Provider value={{ authenticated, authenticate, disconnect, state, loading, error, busy, notice, run, reload, dismiss: () => { setError(''); setNotice(''); } }}>{children}</Store.Provider>;
}
export function useDemo() { const value = useContext(Store); if (!value) throw new Error('Missing demo provider.'); return value; }
