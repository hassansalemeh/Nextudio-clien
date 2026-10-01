// Same address as the page (empty by default): the API lives next to the website, so no host name is hard-coded.
const API_URL = import.meta.env.VITE_API_URL ?? ''

function withBody(method: string, body?: unknown): RequestInit {
  if (body === undefined) return { method }
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, init)
}

export function apiGet(path: string) {
  return apiFetch(path)
}

export function apiPost(path: string, body?: unknown) {
  return apiFetch(path, withBody('POST', body))
}

export function apiPut(path: string, body?: unknown) {
  return apiFetch(path, withBody('PUT', body))
}

export function apiPatch(path: string, body?: unknown) {
  return apiFetch(path, withBody('PATCH', body))
}

export function apiDelete(path: string) {
  return apiFetch(path, { method: 'DELETE' })
}
