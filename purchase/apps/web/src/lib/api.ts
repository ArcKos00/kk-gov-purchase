import type {
  AnalyticsDashboard, AnalyticsQuery, AuditEntry, AuditQuery, ChangePasswordInput, ContractDetails, ContractInput,
  ContractSearch, ContractSummary, DeliveryInput, LoginInput, Me, Page, SearchEntity, SearchResults, ShortfallInput,
  UserCreateInput, UserInfo, UserUpdateInput, ValidationErrorBody,
} from '@kk-gov-purchase/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Помилки полів: "items.0.quantity" → текст; "_" — загальна */
    readonly errors: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Викликається, коли сервер відповів 401 (сесія скінчилась) — AuthProvider перекидає на вхід. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  let res: Response;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, 'Немає зв’язку з сервером. Перевірте мережу і спробуйте ще раз.');
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 422) {
      const v = data as ValidationErrorBody;
      throw new ApiError(422, v.message, v.errors);
    }
    if (res.status === 401 && !url.startsWith('/auth/')) onUnauthorized?.();
    if (res.status === 413) throw new ApiError(413, 'Файл завеликий.');
    if (res.status === 403) throw new ApiError(403, typeof data?.message === 'string' ? data.message : 'Недостатньо прав.');
    const message = typeof data?.message === 'string' ? data.message : 'Не вдалося виконати запит.';
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** Query string з об'єкта: порожні значення пропускаються. */
export const qs = (params: object) => {
  const s = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return s ? `?${s}` : '';
};

export const api = {
  // --- автентифікація ---
  me: () => request<Me>('GET', '/auth/me'),
  login: (input: LoginInput) => request<Me>('POST', '/auth/login', input),
  logout: () => request<void>('POST', '/auth/logout'),
  changePassword: (input: ChangePasswordInput) => request<void>('PUT', '/auth/password', input),

  // --- договори ---
  search: (f: ContractSearch) => request<Page<ContractSummary>>('GET', `/contracts${qs(f)}`),
  get: (id: number) => request<ContractDetails>('GET', `/contracts/${id}`),
  history: (id: number) => request<AuditEntry[]>('GET', `/contracts/${id}/history`),
  counterparties: () => request<string[]>('GET', '/contracts/counterparties'),
  create: (input: ContractInput) => request<ContractDetails>('POST', '/contracts', input),
  update: (id: number, input: ContractInput) => request<ContractDetails>('PUT', `/contracts/${id}`, input),
  remove: (id: number) => request<void>('DELETE', `/contracts/${id}`),
  setFile: (id: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<ContractDetails>('PUT', `/contracts/${id}/file`, fd);
  },
  removeFile: (id: number) => request<ContractDetails>('DELETE', `/contracts/${id}/file`),
  updateShortfall: (id: number, input: ShortfallInput) =>
    request<ContractDetails>('PUT', `/contracts/${id}/shortfall`, input),
  addDelivery: (id: number, input: DeliveryInput, file?: File | null) => {
    const fd = new FormData();
    fd.append('data', JSON.stringify(input));
    if (file) fd.append('file', file);
    return request<ContractDetails>('POST', `/contracts/${id}/deliveries`, fd);
  },
  removeDelivery: (id: number) => request<{ contractId: number }>('DELETE', `/deliveries/${id}`),
  fileUrl: (id: number) => `/api/files/${id}`,

  // --- пошук і аналітика ---
  globalSearch: (q: string, limit = 5, entities?: SearchEntity[]) =>
    request<SearchResults>('GET', `/search${qs({ q, limit, entities: entities?.join(',') })}`),
  analytics: (q: AnalyticsQuery) => request<AnalyticsDashboard>('GET', `/analytics${qs(q)}`),

  // --- адміністрування ---
  users: () => request<UserInfo[]>('GET', '/users'),
  createUser: (input: UserCreateInput) => request<UserInfo>('POST', '/users', input),
  updateUser: (id: number, input: UserUpdateInput) => request<UserInfo>('PATCH', `/users/${id}`, input),
  resetPassword: (id: number, password: string) => request<UserInfo>('PUT', `/users/${id}/password`, { password }),
  audit: (q: AuditQuery) => request<Page<AuditEntry>>('GET', `/audit${qs(q)}`),
};
