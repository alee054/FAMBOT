import { tg } from './telegram';

export class ApiError extends Error {}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  const res = await fetch('/api' + path, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'tma ' + (tg?.initData ?? ''),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* risposta senza corpo */
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Errore ${res.status}`);
  }
  return data as T;
}
