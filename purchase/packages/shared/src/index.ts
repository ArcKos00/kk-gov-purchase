/** Спільні типи API між apps/api і apps/web. Лише типи: імпортуються через `import type`. */

// ===================== Загальні конвенції =====================

/** Сторінка списку: усі списки з пагінацією повертають саме таку обгортку. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type SortDir = 'asc' | 'desc';

/** Тіло відповіді 422: помилки за шляхом поля ("items.0.quantity"); ключ "_" — загальна. */
export interface ValidationErrorBody {
  statusCode: 422;
  message: string;
  errors: Record<string, string>;
}

/** Так/ні фільтр (у адресі сторінки — `yes` / `no`, порожньо — байдуже). */
export type YesNo = 'yes' | 'no';

// ===================== Договори =====================

export type ContractStatus = 'waiting' | 'partial' | 'overdue' | 'completed';

export interface FileInfo {
  id: number;
  name: string;
  size: number;
}

/** Найменування договору з порахованими "отримано" та "очікуємо". */
export interface OrderItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  /** Ціна за одиницю, грн (необов'язкова) */
  price: number | null;
  /** quantity × price; null, якщо ціну не вказано */
  amount: number | null;
  received: number;
  cancelled: number;
  cancelReason: string | null;
  pending: number;
}

export interface Totals {
  quantity: number;
  received: number;
  cancelled: number;
  pending: number;
  /** Сума договору (за найменуваннями з ціною), грн; null — у жодного найменування немає ціни */
  amount: number | null;
  receivedAmount: number | null;
  pendingAmount: number | null;
  cancelledAmount: number | null;
}

export interface ContractSummary {
  id: number;
  number: string;
  counterparty: string;
  contractDate: string;
  expectedDeliveryDate: string | null;
  status: ContractStatus;
  totals: Totals;
  items: OrderItem[];
  hasFile: boolean;
  deliveriesCount: number;
  lastDeliveryDate: string | null;
}

export interface DeliveryLine {
  orderItemId: number;
  quantity: number;
}

export interface Delivery {
  id: number;
  date: string;
  invoiceNumber: string;
  notes: string | null;
  file: FileInfo | null;
  lines: DeliveryLine[];
}

export interface ContractDetails extends ContractSummary {
  notes: string | null;
  file: FileInfo | null;
  deliveries: Delivery[];
}

export interface ContractItemInput {
  id?: number;
  name: string;
  unit: string;
  quantity: number;
  price?: number | null;
}

export interface ContractInput {
  number: string;
  counterparty: string;
  contractDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  items: ContractItemInput[];
}

export interface ShortfallItemInput {
  orderItemId: number;
  cancelled: number;
  cancelReason: string | null;
}

export interface ShortfallInput {
  expectedDeliveryDate: string | null;
  items: ShortfallItemInput[];
}

export interface DeliveryInput {
  date: string;
  invoiceNumber: string;
  notes: string | null;
  lines: DeliveryLine[];
}

/**
 * Фільтр договорів. Спільний для списку договорів, аналітики й експорту:
 * однакові параметри дають однаковий набір договорів.
 * Числа й дати — рядки, як в адресі сторінки (`?status=partial,overdue&amountMin=1000`).
 */
export interface ContractFilter {
  /** Повнотекстовий пошук: усі слова в будь-якому порядку, по всіх полях договору, найменувань, поставок і файлів */
  q?: string;
  number?: string;
  counterparty?: string;
  item?: string;
  /** Дата договору */
  dateFrom?: string;
  dateTo?: string;
  /** Орієнтовна дата поставки */
  expectedFrom?: string;
  expectedTo?: string;
  /** Є поставка в цьому періоді */
  deliveryFrom?: string;
  deliveryTo?: string;
  /** Один або кілька станів через кому */
  status?: string;
  hasFile?: YesNo;
  hasShortfall?: YesNo;
  hasDeliveries?: YesNo;
  amountMin?: string;
  amountMax?: string;
  quantityMin?: string;
  quantityMax?: string;
}

export type ContractSort =
  | 'relevance' | 'contractDate' | 'number' | 'counterparty' | 'expectedDeliveryDate'
  | 'quantity' | 'pending' | 'amount' | 'progress' | 'status' | 'lastDeliveryDate';

export interface ContractSearch extends ContractFilter {
  sort?: ContractSort;
  dir?: SortDir;
  page?: string;
  pageSize?: string;
}

// ===================== Глобальний пошук =====================

export type SearchEntity = 'contract' | 'item' | 'delivery' | 'file' | 'counterparty';

export interface SearchHit {
  entity: SearchEntity;
  /** id сутності (для контрагента — 0) */
  id: number;
  /** Договір, на сторінку якого веде результат (для контрагента — null) */
  contractId: number | null;
  title: string;
  subtitle: string;
  /** Додатковий текст, у якому теж міг знайтися збіг (примітки, причина недопоставки…) */
  extra: string | null;
  date: string | null;
}

export interface SearchGroup {
  entity: SearchEntity;
  total: number;
  hits: SearchHit[];
}

export interface SearchResults {
  q: string;
  groups: SearchGroup[];
}

// ===================== Аналітика =====================

export type Granularity = 'month' | 'quarter' | 'year';

export interface AnalyticsQuery extends ContractFilter {
  granularity?: Granularity;
}

export interface Kpis {
  contracts: number;
  amount: number;
  receivedAmount: number;
  pendingAmount: number;
  cancelledAmount: number;
  quantity: number;
  received: number;
  pending: number;
  cancelled: number;
  /** Частка отриманого від замовленого (за кількістю), 0..1 */
  receivedShare: number;
  overdue: number;
  overdueAmount: number;
  withShortfall: number;
  completed: number;
  deliveries: number;
  /** Частка поставок, що прийшли не пізніше орієнтовної дати, 0..1 (null — поставок немає) */
  onTimeShare: number | null;
  counterparties: number;
}

export interface StatusStat {
  status: ContractStatus;
  contracts: number;
  amount: number;
  pending: number;
}

export interface CounterpartyStat {
  counterparty: string;
  contracts: number;
  amount: number;
  receivedAmount: number;
  pendingAmount: number;
  quantity: number;
  received: number;
  pending: number;
  cancelled: number;
  overdue: number;
}

export interface PeriodStat {
  /** Початок періоду, YYYY-MM-DD */
  period: string;
  contracts: number;
  amount: number;
  /** Поставки за цей період (за датою поставки) */
  deliveries: number;
  receivedQuantity: number;
  receivedAmount: number;
  onTime: number;
  late: number;
}

export interface ItemStat {
  name: string;
  unit: string;
  contracts: number;
  quantity: number;
  received: number;
  cancelled: number;
  pending: number;
  amount: number;
}

export interface OverdueContract {
  id: number;
  number: string;
  counterparty: string;
  expectedDeliveryDate: string;
  daysOverdue: number;
  pending: number;
  pendingAmount: number;
}

export interface Timeliness {
  deliveries: number;
  onTime: number;
  late: number;
  /** Без орієнтовної дати — не оцінюються */
  noDeadline: number;
  avgDelayDays: number | null;
  overdueContracts: OverdueContract[];
}

export interface AnalyticsDashboard {
  kpis: Kpis;
  byStatus: StatusStat[];
  byCounterparty: CounterpartyStat[];
  byPeriod: PeriodStat[];
  topItems: ItemStat[];
  timeliness: Timeliness;
}

// ===================== Користувачі й автентифікація =====================

export type Role = 'admin' | 'editor' | 'viewer';

export interface UserInfo {
  id: number;
  login: string;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}

export type Me = Pick<UserInfo, 'id' | 'login' | 'fullName' | 'role'>;

export interface LoginInput {
  login: string;
  password: string;
}

export interface UserCreateInput {
  login: string;
  fullName: string;
  role: Role;
  password: string;
}

export interface UserUpdateInput {
  fullName?: string;
  role?: Role;
  active?: boolean;
}

export interface PasswordResetInput {
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// ===================== Журнал дій =====================

export type AuditAction = 'login' | 'login_failed' | 'logout' | 'insert' | 'update' | 'delete';

/** Таблиця, якої стосується зміна */
export type AuditEntity = 'contracts' | 'order_items' | 'deliveries' | 'delivery_lines' | 'files' | 'users';

export interface AuditChange {
  from?: unknown;
  to?: unknown;
}

export interface AuditEntry {
  id: number;
  at: string;
  action: AuditAction;
  entity: AuditEntity | null;
  entityId: number | null;
  contractId: number | null;
  user: { id: number; login: string; fullName: string } | null;
  /** Логін, яким намагалися увійти (для login_failed) або знімок логіна користувача */
  login: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  changes: Record<string, AuditChange> | null;
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  entity?: string;
  contractId?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}

// ===================== Сервіс =====================

export interface Health {
  status: 'ok' | 'error';
  db: 'ok' | 'error';
}
