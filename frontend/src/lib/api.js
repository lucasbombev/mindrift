const TOKEN_KEY = 'drift.accessToken';

let accessToken = readStoredToken();
let refreshPromise = null;

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(status, message, code = 'erro') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function hasAccessToken() {
  return Boolean(accessToken);
}

export function setAccessToken(token) {
  accessToken = token || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* modo privado */
  }
  window.dispatchEvent(new CustomEvent('drift:token', { detail: token || null }));
}

export function clearAccessToken() {
  setAccessToken(null);
}

async function parseResponse(res) {
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      payload?.erro?.mensagem ||
      (res.status === 429
        ? 'Muitas tentativas. Aguarde um pouco.'
        : 'Não foi possível concluir a operação.');
    throw new ApiError(res.status, message, payload?.erro?.codigo || 'erro');
  }
  return payload;
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          clearAccessToken();
          document.cookie = 'drift_has_session=; Max-Age=0; path=/';
          return null;
        }
        const data = await res.json();
        if (data?.accessToken) setAccessToken(data.accessToken);
        return data;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function notifySessionExpired() {
  clearAccessToken();
  window.dispatchEvent(new Event('drift:sessao-expirada'));
}

export async function request(path, { method = 'GET', body, headers = {}, retryAuth = true } = {}) {
  const isForm = body instanceof FormData;
  const buildHeaders = () => {
    const h = { ...headers };
    if (!isForm && body !== undefined) h['Content-Type'] = 'application/json';
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  };

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: buildHeaders(),
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique se o notebook está ligado e na mesma rede Wi-Fi.');
  }

  if (res.status === 401 && retryAuth && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      try {
        res = await fetch(`/api${path}`, {
          method,
          credentials: 'include',
          headers: buildHeaders(),
          body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        });
      } catch {
        throw new ApiError(0, 'Sem conexão com o servidor.');
      }
    } else {
      notifySessionExpired();
    }
  }

  return parseResponse(res);
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, body, options) => request(path, { ...options, method: 'DELETE', body }),
};

export async function downloadAuthenticated(path, filename) {
  const res = await fetch(`/api${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    let message = 'Não foi possível baixar o arquivo.';
    try {
      const data = await res.json();
      message = data?.erro?.mensagem || message;
    } catch {
      /* noop */
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
