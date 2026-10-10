import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DemoDataService, DemoState } from './types';
import { LocalDemoService } from './service';

interface Context { state: DemoState | null; loading: boolean; error: string; busy: boolean; notice: string; run: (action: (service: DemoDataService) => Promise<DemoState>, success?: string) => Promise<boolean>; reload: () => void; dismiss: () => void }
const Store = createContext<Context | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const service = useRef<DemoDataService | null>(null);
  if (!service.current) service.current = new LocalDemoService({ getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) });
  const [state, setState] = useState<DemoState | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const locked = useRef(false);
  const reload = useCallback(() => { setLoading(true); service.current!.load().then(setState).then(() => setError('')).catch(e => setError(e instanceof Error ? e.message : 'The demo could not be loaded.')).finally(() => setLoading(false)); }, []);
  useEffect(reload, [reload]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  const run = async (action: (service: DemoDataService) => Promise<DemoState>, success = 'Changes saved.') => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError('');
    try { setState(await action(service.current!)); setNotice(success); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'The change could not be saved. Try again.'); return false; }
    finally { locked.current = false; setBusy(false); }
  };
  return <Store.Provider value={{ state, loading, error, busy, notice, run, reload, dismiss: () => { setError(''); setNotice(''); } }}>{children}</Store.Provider>;
}
export function useDemo() { const value = useContext(Store); if (!value) throw new Error('Missing demo provider.'); return value; }
