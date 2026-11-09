import { handleAccount, isAccountRoute, type AccountEnv } from './account.ts';
import { handleLlm } from './llm.ts';

// Service bindings are typed by what this Worker calls on them
type Bindings = Omit<Env, 'IDENTITY' | 'WORK_ACCOUNTS'> & AccountEnv;

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/llm') return handleLlm(request, env);
    if (isAccountRoute(url.pathname)) return handleAccount(request, env);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405, headers:{allow:'GET, HEAD'}});
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      // Enrolls this Worker in the My work directory; the game is healthy either way
      const registered = await env.WORK_ACCOUNTS?.register().then(() => true, () => false) ?? false;
      return Response.json({ok:true, status:'ok', project:'cli-adventures', release:env.RELEASE, accounts:registered}, {headers:{'cache-control':'no-store'}});
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    return new Response(response.body, {status:response.status, statusText:response.statusText, headers});
  },
};
