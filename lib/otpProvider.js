const ENV_BASE_URL = process.env.OTP_PROVIDER_BASE_URL || 'https://dehuyzotp.shop';
const ENV_API_KEY = process.env.OTP_PROVIDER_API_KEY || '';

const DEFAULT_CONFIG = {
  baseUrl: ENV_BASE_URL,
  apiKey: ENV_API_KEY,
  authMode: 'bearer',
  apiKeyHeader: 'x-api-key',
  endpoints: {
    services: '/api/services',
    balance: '/api/balance',
    order: '/api/rent',
    check: '/api/sms/{token}',
    retry: '/api/rent/{token}/retry',
    orderStatus: '/api/order/{id}',
    orderAction: '/api/order/{id}'
  }
};

function normalizeConfig(override = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...override,
    endpoints: {
      ...DEFAULT_CONFIG.endpoints,
      ...(override.endpoints || {})
    }
  };
}

function ensureApiKey(config) {
  if (!config.apiKey || !String(config.apiKey).trim()) {
    throw new Error('API key wajib diisi untuk koneksi ke provider.');
  }
}

function buildHeaders(config) {
  const authMode = config.authMode || 'bearer';
  const headers = { 'Content-Type': 'application/json' };

  if (authMode === 'none') return headers;

  if (authMode === 'x-api-key') {
    headers[config.apiKeyHeader || 'x-api-key'] = config.apiKey;
    return headers;
  }

  headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

function interpolatePath(pathTemplate, params = {}) {
  let out = pathTemplate || '';
  Object.entries(params).forEach(([key, value]) => {
    out = out.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
  });
  return out;
}

function buildUrl(baseUrl, path, query = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${root}${cleanPath}`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function toJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeProviderError(status, bodyText = '', attempt = '') {
  const raw = String(bodyText || '');
  const lower = raw.toLowerCase();

  if (lower.includes('<!doctype html') || lower.includes('<html')) {
    return `Provider mengembalikan halaman HTML (bukan JSON API). Pastikan base URL dan endpoint API benar. (${attempt})`;
  }

  if (/saldo|balance|insufficient|not enough|low balance|out of funds/.test(lower)) {
    return `Saldo provider tidak cukup. Silakan top up saldo, lalu coba lagi. (${attempt})`;
  }

  if (/invalid api|api key|unauthorized|forbidden|401|403|token/.test(lower) || status === 401 || status === 403) {
    return `API key tidak valid / tidak diizinkan. Cek kembali API key provider kamu. (${attempt})`;
  }

  if (status === 404 || /not found/.test(lower)) {
    return `Endpoint provider tidak ditemukan (404). Cek path endpoint. (${attempt})`;
  }

  if (status === 405) {
    return `Method endpoint tidak sesuai (405). Cek method HTTP pada endpoint. (${attempt})`;
  }

  return `Request provider gagal (${status}). ${raw ? `Detail: ${raw.slice(0, 240)}` : ''} (${attempt})`;
}

async function providerRequest(config, { path, method = 'GET', body, query, attempt = '' }) {
  const url = buildUrl(config.baseUrl, path, query);

  const response = await fetch(url, {
    method,
    headers: buildHeaders(config),
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body || {}),
    cache: 'no-store'
  });

  const rawText = await response.text();
  const parsed = toJsonOrText(rawText);

  if (!response.ok) {
    throw new Error(normalizeProviderError(response.status, rawText, attempt || `${method} ${path}`));
  }

  return parsed;
}

function findServicesArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.services)) return raw.services;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

function mapService(item, index) {
  const id = item?.id ?? item?.service_id ?? item?.code ?? index + 1;
  const name = item?.name ?? item?.service_name ?? item?.service ?? `Service ${index + 1}`;
  return { id: String(id), name: String(name) };
}

function normalizeOtpState(state, otp) {
  const value = String(state || '').toLowerCase();

  if (otp) return 'RECEIVED';
  if (value === 'success' || value === 'received' || value === 'done') return 'RECEIVED';
  if (value === 'cancel' || value === 'cancelled' || value === 'failed' || value === 'expired') return 'FAILED';
  if (value === 'pending' || value === 'waiting' || value === 'processing') return 'WAITING';
  return 'WAITING';
}

function toDetected(config) {
  return {
    baseUrl: config.baseUrl,
    authMode: config.authMode,
    apiKeyHeader: config.apiKeyHeader,
    endpoints: config.endpoints
  };
}

export async function fetchServices(providerConfig = {}) {
  const config = normalizeConfig(providerConfig);
  ensureApiKey(config);

  const raw = await providerRequest(config, {
    path: config.endpoints.services,
    method: 'GET',
    attempt: 'GET /api/services'
  });

  const services = findServicesArray(raw).map(mapService);

  return {
    success: true,
    services,
    detected: toDetected(config),
    raw
  };
}

export async function fetchBalance(providerConfig = {}) {
  const config = normalizeConfig(providerConfig);
  ensureApiKey(config);

  const raw = await providerRequest(config, {
    path: config.endpoints.balance,
    method: 'GET',
    attempt: 'GET /api/balance'
  });

  return {
    success: true,
    balance: Number(raw?.balance ?? 0),
    reserved: Number(raw?.reserved ?? 0),
    available: Number(raw?.available ?? (Number(raw?.balance ?? 0) - Number(raw?.reserved ?? 0))),
    detected: toDetected(config),
    raw
  };
}

export async function orderNumber(serviceId, providerConfig = {}) {
  const config = normalizeConfig(providerConfig);
  ensureApiKey(config);

  const raw = await providerRequest(config, {
    path: config.endpoints.order,
    method: 'POST',
    body: { service_id: Number(serviceId) || serviceId },
    attempt: 'POST /api/rent'
  });

  return {
    success: true,
    order_id: raw?.order_id ?? null,
    token: raw?.token ?? null,
    number: raw?.phone ?? raw?.number ?? null,
    phone: raw?.phone ?? raw?.number ?? null,
    service_id: serviceId,
    status: 'PENDING_OTP',
    expires_at: raw?.expires_at ?? null,
    detected: toDetected(config),
    raw
  };
}

export async function checkOTP(token, providerConfig = {}, timeout = 60) {
  const config = normalizeConfig(providerConfig);
  ensureApiKey(config);

  if (!token) {
    throw new Error('token wajib diisi untuk cek OTP.');
  }

  const path = interpolatePath(config.endpoints.check, { token });
  const raw = await providerRequest(config, {
    path,
    method: 'GET',
    query: { timeout: Math.min(120, Math.max(1, Number(timeout) || 60)) },
    attempt: 'GET /api/sms/{token}'
  });

  const otp = raw?.otp ?? null;
  const status = normalizeOtpState(raw?.state, otp);

  return {
    success: true,
    token,
    status,
    otp_code: otp,
    message: raw?.message || (otp ? 'OTP berhasil diterima.' : 'OTP belum masuk, silakan tunggu.'),
    detected: toDetected(config),
    raw
  };
}

export async function retryOTP(token, providerConfig = {}) {
  const config = normalizeConfig(providerConfig);
  ensureApiKey(config);

  if (!token) {
    throw new Error('token wajib diisi untuk retry OTP.');
  }

  const path = interpolatePath(config.endpoints.retry, { token });
  const raw = await providerRequest(config, {
    path,
    method: 'POST',
    body: {},
    attempt: 'POST /api/rent/{token}/retry'
  });

  return {
    success: true,
    order_id: raw?.order_id ?? null,
    token: raw?.token ?? token,
    number: raw?.phone ?? raw?.number ?? null,
    phone: raw?.phone ?? raw?.number ?? null,
    expires_at: raw?.expires_at ?? null,
    status: 'PENDING_OTP',
    detected: toDetected(config),
    raw
  };
}

export async function getOrderStatus(orderRef, providerConfig = {}) {
  const config = normalizeConfig(providerConfig);
  ensureApiKey(config);

  if (!orderRef) {
    throw new Error('order id / token wajib diisi untuk cek status order.');
  }

  const path = interpolatePath(config.endpoints.orderStatus, { id: orderRef });
  const raw = await providerRequest(config, {
    path,
    method: 'GET',
    attempt: 'GET /api/order/{id}'
  });

  const otp = raw?.otp ?? null;
  const status = normalizeOtpState(raw?.state, otp);

  return {
    success: true,
    order_id: raw?.order_id ?? null,
    token: raw?.token ?? null,
    number: raw?.phone ?? raw?.number ?? null,
    service_id: raw?.service_id ?? null,
    service: raw?.service ?? null,
    price: raw?.price ?? null,
    status,
    otp_code: otp,
    state: raw?.state ?? null,
    expires_at: raw?.expires_at ?? null,
    created_at: raw?.created_at ?? null,
    detected: toDetected(config),
    raw
  };
}

export async function updateOrderAction(orderRef, action, providerConfig = {}) {
  const config = normalizeConfig(providerConfig);
  ensureApiKey(config);

  if (!orderRef) {
    throw new Error('order id / token wajib diisi untuk action order.');
  }

  const normalizedAction = String(action || '').toLowerCase();
  if (!['done', 'cancel'].includes(normalizedAction)) {
    throw new Error('action harus done atau cancel.');
  }

  const path = interpolatePath(config.endpoints.orderAction, { id: orderRef });
  const raw = await providerRequest(config, {
    path,
    method: 'POST',
    body: { action: normalizedAction },
    attempt: 'POST /api/order/{id}'
  });

  return {
    success: true,
    ok: Boolean(raw?.ok ?? true),
    action: raw?.action ?? normalizedAction,
    order_id: raw?.order_id ?? null,
    token: raw?.token ?? null,
    number: raw?.phone ?? raw?.number ?? null,
    service: raw?.service ?? null,
    price: raw?.price ?? null,
    refunded: raw?.refunded ?? 0,
    state: raw?.state ?? null,
    detected: toDetected(config),
    raw
  };
}
