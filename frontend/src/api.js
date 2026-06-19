const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('リクエストがタイムアウトしました。しばらく待って再試行してください。');
    }
    throw new Error('サーバーに接続できません。');
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.detail || `リクエストに失敗しました (${res.status})`);
  }
  return data;
}

export const auth = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username, password) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me'),
  updateLine: (line_user_id) =>
    request('/auth/line', { method: 'PUT', body: JSON.stringify({ line_user_id }) }),
  changePassword: (current_password, new_password) =>
    request('/auth/password', { method: 'PUT', body: JSON.stringify({ current_password, new_password }) }),
};

export const memos = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/memos${qs ? `?${qs}` : ''}`);
  },
  create: (data) => request('/memos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/memos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/memos/${id}`, { method: 'DELETE' }),
};

export const allergyLunch = {
  listMonths: () => request('/allergy-lunch/months'),
  get: (yearMonth) => request(`/allergy-lunch/${yearMonth}`),
  save: (yearMonth, data) =>
    request(`/allergy-lunch/${yearMonth}`, { method: 'PUT', body: JSON.stringify(data) }),
  saveImage: (yearMonth, slot, data) =>
    request(`/allergy-lunch/${yearMonth}/images/${slot}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const subscriptions = {
  list: () => request('/subscriptions'),
  create: (data) => request('/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/subscriptions/${id}`, { method: 'DELETE' }),
  detect: (transactions) =>
    request('/subscriptions/detect', { method: 'POST', body: JSON.stringify({ transactions }) }),
};
