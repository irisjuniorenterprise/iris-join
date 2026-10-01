// tests/helpers/http.ts
//
// Fabrique de requêtes pour appeler directement les handlers des routes API
// (GET/POST/... exportés par app/api/**/route.ts) sans démarrer Next.

type Options = {
  method?: string;
  /** Corps JSON (sera sérialisé). */
  body?: unknown;
  /** Corps brut (prioritaire sur `body`) — pour tester un JSON invalide. */
  rawBody?: string;
  /** false = aucune en-tête Authorization. */
  auth?: boolean;
  token?: string;
  headers?: Record<string, string>;
};

export function makeRequest(path: string, options: Options = {}): Request {
  const { method = 'GET', body, rawBody, auth = true, token = 'test-token', headers = {} } = options;
  const finalHeaders: Record<string, string> = { ...headers };
  if (auth) finalHeaders.authorization = `Bearer ${token}`;

  let payload: string | undefined;
  if (rawBody !== undefined) {
    payload = rawBody;
    finalHeaders['content-type'] = 'application/json';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    finalHeaders['content-type'] = 'application/json';
  }

  return new Request(`http://localhost${path}`, { method, headers: finalHeaders, body: payload });
}

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
