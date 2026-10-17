// POST /api/decide: Clef-flash, a decision model, sorts a failed command into the kind of
// mistake it is, so Bit can answer real bash errors as precisely as the simulator's own.
// It never writes text and never decides whether a challenge is done. Without a backend,
// or when it is unsure, the answer is 'other' and Bit says its general line.
import { json, sameOrigin, type LlmEnv } from './llm.ts';

export interface DecideEnv extends Pick<LlmEnv, 'LLM_LIMITER'> {
  // Workers AI, the default backend
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  CLEF_MODEL: string;
  // Or any SystemOne server (e.g. Clef-flash on the lab's own GPU via SGLang): POST <url>
  CLEF_URL?: string;
  CLEF_API_KEY?: string;
}

const MAX_BODY = 4_000;
const TIMEOUT_MS = 4_000;
const MIN_CONFIDENCE = 0.6;

// Option ids match Bit's scripted lines in static/sprite.js
export const MISTAKES: Record<string, string> = {
  typo: 'The command name is misspelled or mistyped',
  not_found: 'A file or folder name is wrong or does not exist where the player is',
  not_dir: 'The player tried to go into or list a file as if it were a folder',
  is_dir: 'The player tried to read or edit a folder as if it were a file',
  file_as_command: 'The player typed a file name as if it were a command',
  dir_as_command: 'The player typed a folder name as if it were a command',
  missing_arg: 'The command is missing the name or argument it needs',
  permission: 'Permission was denied',
  syntax: 'A quote, bracket or symbol is missing or unbalanced',
  wrong_command: 'The command is real but does not do what the challenge asks',
  other: 'None of the above, or not enough information to tell',
};

const LIMITS = { command: 200, output: 600, cwd: 120, challenge: 240 } as const;

export function buildDecision(body: unknown, model: string): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const state: Record<string, string> = {};
  for (const [name, max] of Object.entries(LIMITS)) {
    const value = b[name];
    state[name] = typeof value === 'string' ? value.slice(0, max) : '';
  }
  if (!state.command.trim()) return null;
  return {
    model,
    state: { situation: 'A beginner typed a command in a bash terminal while learning the command line, and it failed.', ...state },
    questions: {
      mistake: { type: 'choice', instructions: 'What kind of mistake did the player make?', criteria: MISTAKES },
    },
  };
}

// Workers AI wraps the SystemOne answer in { result }; a SystemOne server does not
export function readDecision(data: unknown): { kind: string; confidence: number } {
  const root = (data && typeof data === 'object' && 'result' in data ? (data as { result: unknown }).result : data) as
    { answers?: { mistake?: { choice?: unknown; confidence?: unknown } } } | null;
  const answer = root?.answers?.mistake;
  const kind = typeof answer?.choice === 'string' && Object.hasOwn(MISTAKES, answer.choice) ? answer.choice : 'other';
  const confidence = typeof answer?.confidence === 'number' ? answer.confidence : 0;
  return confidence >= MIN_CONFIDENCE ? { kind, confidence } : { kind: 'other', confidence };
}

export async function handleDecide(request: Request, env: DecideEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!env.CLEF_URL && !env.AI) return json({ error: 'decide_unavailable' }, 503);

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

  try {
    let data: unknown;
    if (env.CLEF_URL) {
      const input = buildDecision(body, env.CLEF_MODEL);
      if (!input) return json({ error: 'bad_request' }, 400);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (env.CLEF_API_KEY) headers.authorization = `Bearer ${env.CLEF_API_KEY}`;
      const upstream = await fetch(env.CLEF_URL, { method: 'POST', headers, body: JSON.stringify(input), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!upstream.ok) return json({ error: 'decide_failed', status: upstream.status }, 502);
      data = await upstream.json();
    } else {
      // Workers AI names the model in the path and as a short selector in the body
      const input = buildDecision(body, env.CLEF_MODEL.split('/').pop() ?? env.CLEF_MODEL);
      if (!input) return json({ error: 'bad_request' }, 400);
      data = await Promise.race([
        env.AI!.run(env.CLEF_MODEL, input),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
      ]);
    }
    return json({ ...readDecision(data), model: env.CLEF_MODEL });
  } catch {
    return json({ error: 'decide_failed' }, 502);
  }
}
