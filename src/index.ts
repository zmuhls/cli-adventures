import { handleLlm } from './llm';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/llm') return handleLlm(request, env);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405, headers:{allow:'GET, HEAD'}});
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return Response.json({ok:true, status:'ok', project:'cli-adventures', release:env.RELEASE}, {headers:{'cache-control':'no-store'}});
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    return new Response(response.body, {status:response.status, statusText:response.statusText, headers});
  },
};
