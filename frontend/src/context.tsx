/** Loads the shared demo workspace directly; five-second polling preserves open forms and newer decisions. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DemoDataService, DemoState } from './types';
import { BackendService } from './backend-service';
interface Context { state: DemoState | null; loading: boolean; error: string; busy: boolean; notice: string; run: (action: (service: DemoDataService) => Promise<DemoState>, success?: string) => Promise<boolean>; reload: () => void; dismiss: () => void }
const Store = createContext<Context | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const service = useRef<DemoDataService>(new BackendService());
  const [state,setState]=useState<DemoState|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const locked=useRef(false), fetching=useRef(false),generation=useRef(0),mounted=useRef(false);
  const reload=useCallback(()=>{
    if(fetching.current||locked.current)return;
    fetching.current=true;const version=generation.current;
    service.current.load().then(next=>{if(mounted.current&&version===generation.current){setState(next);setError('');}})
      .catch(e=>{if(mounted.current&&version===generation.current)setError(e instanceof Error?e.message:'Backend records could not be loaded.');})
      .finally(()=>{fetching.current=false;if(mounted.current)setLoading(false);});
  },[]);
  useEffect(()=>{mounted.current=true;reload();const timer=setInterval(()=>{if(!document.hidden)reload();},5000);
    const visible=()=>{if(!document.hidden)reload();};document.addEventListener('visibilitychange',visible);
    return()=>{mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[reload]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);},[notice]);
  const run=async(action:(service:DemoDataService)=>Promise<DemoState>,success='Changes saved.')=>{
    if(locked.current)return false;locked.current=true;generation.current++;setBusy(true);setError('');
    try{const next=await action(service.current);if(mounted.current){setState(next);setNotice(success);}return true;}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'The change could not be saved.');return false;}
    finally{locked.current=false;if(mounted.current)setBusy(false);}
  };
  return <Store.Provider value={{state,loading,error,busy,notice,run,reload,dismiss:()=>{setError('');setNotice('');}}}>{children}</Store.Provider>;
}
export function useDemo(){const value=useContext(Store);if(!value)throw new Error('Missing dashboard provider.');return value;}
