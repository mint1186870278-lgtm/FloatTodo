import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({command}) => ({
  plugins: [react(), {name:'desktop-csp', transformIndexHtml(html) {
    return command === 'serve'
      ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
      : html.replace("connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173", "connect-src 'self'");
  }}],
  optimizeDeps: {entries:['index.html']},
  base: './', server: { host: '127.0.0.1', port: 5173, strictPort: true,
    watch:{ignored:['**/artifacts/**','**/release/**','**/.cache/**','**/FloatTodo-V11-Reference-Fix/**']} }
}));
