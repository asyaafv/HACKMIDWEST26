/** Temporary console assets remain unavailable regardless of deployment settings. */
import { it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import type { DB } from '../src/db.js';
it('has no backend console routes or assets', async () => {
 const app = createApp({} as DB);
 for (const url of ['/dev-console','/dev-console/console.js','/dev-console/client.js','/dev-console/style.css']) expect((await app.inject(url)).statusCode).toBe(404);
 await app.close();
});
