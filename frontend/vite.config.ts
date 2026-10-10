/** Local same-origin proxy forwards REST/MCP to the launcher-selected backend port. */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  const target = process.env.GATE_API_URL || 'http://127.0.0.1:8000';
  return { plugins: [react()], server: { proxy: {
    '/v1': { target, changeOrigin: true },
    '/mcp': { target, changeOrigin: true },
    '/health': { target, changeOrigin: true },
  } } };
});
