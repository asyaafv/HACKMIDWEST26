/** Development assets must stay private even when shared API routes are enabled. */
import { it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import type { DB } from '../src/db.js';
it('requires explicit local serving, rejects remote clients and Host rebinding', async()=>{
 const db={} as DB;
 const disabled=createApp(db); expect((await disabled.inject('/dev-console')).statusCode).toBe(404);await disabled.close();
 const enabled=createApp(db,{devConsole:true,browserHosts:['localhost:8000']});
 const local=await enabled.inject({url:'/dev-console',headers:{host:'localhost:8000'},remoteAddress:'127.0.0.1'});
 expect(local.statusCode).toBe(200);expect(local.headers['content-security-policy']).toContain("frame-ancestors 'none'");expect(local.body).toContain('SANDBOX');
 expect((await enabled.inject({url:'/dev-console',headers:{host:'localhost:8000'},remoteAddress:'10.0.0.1'})).statusCode).toBe(403);
 expect((await enabled.inject({url:'/dev-console',headers:{host:'evil.invalid'},remoteAddress:'127.0.0.1'})).statusCode).toBe(403);
 await enabled.close();
 expect(()=>configuration({DATABASE_URL:'postgres://local/gate',DEV_CONSOLE:'true',HOST:'0.0.0.0'})).toThrow();
 expect(()=>configuration({DATABASE_URL:'postgres://local/gate',DEV_CONSOLE:'true',NODE_ENV:'production'})).toThrow();
});
