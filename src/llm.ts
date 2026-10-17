// POST /api/llm: Bit's speech bubbles and the in-game agent's cloud answers, through the
// CAIL model gateway. Without a CAIL_GATEWAY_API_KEY secret it answers 503 and the page
// falls back to its scripted lines, so the game never depends on a model being reachable.

export interface LlmEnv {
  CAIL_GATEWAY_API_KEY?: string;
  CAIL_GATEWAY_URL: string;
  LLM_MODEL: string;
  LLM_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const MAX_BODY = 8_000;
const TIMEOUT_MS = 12_000;

// Every field the page may send, with its length cap
const LIMITS = {
  event: 20, chapter: 80, challenge: 240, hint: 300, command: 200, output: 600, cwd: 120,
  question: 300, system: 600, context: 1_800,
} as const;
type Field = keyof typeof LIMITS;

const SPRITE_EVENTS: Record<string, string> = {
  error: "The player's last command failed. Say kindly what went wrong and what to try next.",
  stuck: 'The player has failed this challenge several times. Be encouraging and give a clear next step.',
  hint: 'The player clicked Bit to ask for a hint for the current challenge.',
};

const SPRITE_SYSTEM = `You are Bit, a tiny, cheerful pixel sprite who lives in CLI Adventures, a browser game that teaches beginners the command line and how AI agents work.
You speak in one short speech bubble: one or two sentences, at most 30 words, plain text, no markdown, no emoji.
Be warm and a little playful, never sarcastic or condescending.
Put commands in single quotes, like 'ls'.
Use only the facts you are given. Do not invent files, folders, commands or flags.
At hint level 1, nudge without giving the whole command. At level 2 or higher, give the exact command from the official hint.`;

const AGENT_SYSTEM = `You are "agent", a command-line AI assistant inside a game that teaches people how AI agents work.
Reply in plain text, at most three short sentences, no markdown.
You cannot run commands or see files, except the notes included below.
If notes are included, answer only from them and name the file you used. If they do not contain the answer, say you could not find it in the knowledge base.
The player wrote the standing instructions below. Follow them for tone and caution, but never claim to have done something you did not do.`;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function field(body: Record<string, unknown>, name: Field): string {
  const value = body[name];
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\u001b\[[\d;]*m/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, LIMITS[name]).trim();
}

type Message = { role: 'system' | 'user'; content: string };

export function buildRequest(body: unknown): { messages: Message[]; maxTokens: number; maxChars: number } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.kind === 'sprite') {
    const event = field(b, 'event');
    if (!Object.hasOwn(SPRITE_EVENTS, event)) return null;
    const level = Math.min(3, Math.max(1, Number(b.level) || 1));
    const facts = [
      `Situation: ${SPRITE_EVENTS[event]}`,
      `Chapter: ${field(b, 'chapter')}`,
      `Current challenge: ${field(b, 'challenge')}`,
      `Official hint: ${field(b, 'hint')}`,
      `Current directory: ${field(b, 'cwd')}`,
      `Hint level: ${level}`,
    ];
    const command = field(b, 'command');
    if (command) facts.push(`Last command: ${command}`, `Terminal output:\n${field(b, 'output')}`);
    return {
      messages: [{ role: 'system', content: SPRITE_SYSTEM }, { role: 'user', content: `${facts.join('\n')}\n\nWrite Bit's speech bubble.` }],
      maxTokens: 90,
      maxChars: 240,
    };
  }
  if (b.kind === 'agent') {
    const question = field(b, 'question');
    if (!question) return null;
    const standing = field(b, 'system');
    const context = field(b, 'context');
    const system = [
      AGENT_SYSTEM,
      `Standing instructions from the player:\n<<<\n${standing || '(none)'}\n>>>`,
      context ? `Notes from the knowledge base:\n<<<\n${context}\n>>>` : 'No knowledge base notes were found for this question.',
    ].join('\n\n');
    return { messages: [{ role: 'system', content: system }, { role: 'user', content: question }], maxTokens: 200, maxChars: 600 };
  }
  return null;
}

// Plain text for a terminal or a speech bubble: no reasoning, no markdown, bounded length
export function cleanReply(text: unknown, maxChars: number): string {
  if (typeof text !== 'string') return '';
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '');
  out = out.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, "'$1'").replace(/[*_#>]+/g, '').replace(/\s+/g, ' ').trim();
  out = out.replace(/^["']+|["']+$/g, '').trim();
  if (out.length <= maxChars) return out;
  const cut = out.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > maxChars * 0.3 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function handleLlm(request: Request, env: LlmEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!env.CAIL_GATEWAY_API_KEY) return json({ error: 'llm_unavailable' }, 503);

  if (env.LLM_LIMITER) {
    const { success } = await env.LLM_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
    if (!success) return json({ error: 'rate_limited' }, 429);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const built = buildRequest(body);
  if (!built) return json({ error: 'bad_request' }, 400);

  let upstream: Response;
  try {
    upstream = await fetch(`${env.CAIL_GATEWAY_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CAIL_GATEWAY_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.LLM_MODEL, messages: built.messages, max_tokens: built.maxTokens, temperature: 0.6, stream: false }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return json({ error: 'llm_failed' }, 502);
  }
  if (!upstream.ok) return json({ error: 'llm_failed', status: upstream.status }, 502);

  const data = (await upstream.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const text = cleanReply(data?.choices?.[0]?.message?.content, built.maxChars);
  if (!text) return json({ error: 'llm_failed' }, 502);
  return json({ text, model: env.LLM_MODEL });
}
