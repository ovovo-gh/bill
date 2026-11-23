export const CURRENCIES = { CNY: '人民币', HKD: '港币', JPY: '日元', EUR: '欧元' };
export const CATEGORIES = ['支付软件', '银行卡', '校园卡', '现金', '信用卡', '其他'];
export function amountToMinor(value, currency) {
  const text = String(value).trim();
  const digits = currency === 'JPY' ? 0 : 2;
  if (!Object.hasOwn(CURRENCIES, currency) || !(digits ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(text)) throw new Error(digits ? '请输入非负金额，最多两位小数' : '日元金额请输入非负整数');
  const [whole, fraction = ''] = text.split('.');
  const n = Number(whole) * (digits ? 100 : 1) + Number(digits ? fraction.padEnd(2, '0') : 0);
  if (!Number.isSafeInteger(n) || n > 1e13) throw new Error('金额过大');
  return n;
}
export const major = (minor, currency) => minor / (currency === 'JPY' ? 1 : 100);
export function accountComparableAmount(account, rates = {}) {
  const native = major(account.amount, account.currency);
  const rate = account.currency === 'CNY' ? 1 : rates[account.currency]?.rate;
  const converted = rate > 0 ? native * rate : native;
  return account.kind === 'debt' ? -converted : converted;
}
export function sortAccountsByAmount(accounts, rates = {}, order = 'desc') {
  const direction = order === 'asc' ? 1 : -1;
  return accounts
    .map((account, index) => ({ account, index }))
    .sort((a, b) => {
      const difference = accountComparableAmount(a.account, rates) - accountComparableAmount(b.account, rates);
      return difference === 0 ? a.index - b.index : difference * direction;
    })
    .map(({ account }) => account);
}
export function totals(accounts, rates) {
  let assets = 0, debt = 0; const missing = new Set();
  for (const a of accounts.filter(a => !a.archived)) {
    const rate = a.currency === 'CNY' ? 1 : rates[a.currency]?.rate;
    if (!(rate > 0)) { if (a.amount) missing.add(a.currency); continue; }
    const cny = Math.round(major(a.amount, a.currency) * rate * 100);
    if (a.kind === 'debt') debt += cny; else assets += cny;
  }
  return { assets: assets / 100, debt: debt / 100, net: (assets - debt) / 100, missing: [...missing] };
}
export function monthlyHistoryTotals(history, accounts, rates, month) {
  let income = 0, expense = 0, changes = 0; const missing = new Set();
  const accountKinds = new Map((accounts || []).map(account => [account.id, account.kind]));
  for (const entry of history || []) {
    const at = new Date(entry.at);
    const entryMonth = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
    if (entryMonth !== month) continue;
    const kind = entry.kind || accountKinds.get(entry.accountId) || 'asset';
    if (entry.action === '删除') {
      if (!entry.after) continue;
      const rate = entry.currency === 'CNY' ? 1 : rates[entry.currency]?.rate;
      changes += 1;
      if (!(rate > 0)) { missing.add(entry.currency); continue; }
      const cny = Math.round(major(entry.after, entry.currency) * rate * 100);
      if (kind === 'debt') income += cny; else expense += cny;
      continue;
    }
    if (entry.action !== '修改' || entry.before === null) continue;
    const delta = entry.after - entry.before;
    if (!delta) continue;
    if (kind === 'debt' && delta < 0) continue;
    changes += 1;
    const rate = entry.currency === 'CNY' ? 1 : rates[entry.currency]?.rate;
    if (!(rate > 0)) { missing.add(entry.currency); continue; }
    const cny = Math.round(major(Math.abs(delta), entry.currency) * rate * 100);
    if (kind === 'debt' || delta < 0) expense += cny; else income += cny;
  }
  return { income: income / 100, expense: expense / 100, balance: (income - expense) / 100, changes, missing: [...missing] };
}
export function validateData(data) {
  if (data?.schema !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.history)) throw new Error('账本格式无效');
  if (!Array.isArray(data.transactions)) data.transactions = [];
  const ids = new Set();
  for (const a of data.accounts) {
    if (typeof a.id !== 'string' || ids.has(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 40 || typeof a.category !== 'string' || a.category.length > 30 || typeof a.note !== 'string' || a.note.length > 200 || !Object.hasOwn(CURRENCIES, a.currency) || !['asset','debt'].includes(a.kind) || !Number.isSafeInteger(a.amount) || a.amount < 0 || a.amount > 1e13 || typeof a.archived !== 'boolean' || !Number.isFinite(Date.parse(a.updatedAt))) throw new Error('账户数据无效');
    ids.add(a.id);
  }
  for (const h of data.history) if (typeof h.id !== 'string' || typeof h.name !== 'string' || typeof h.action !== 'string' || (h.kind !== undefined && !['asset', 'debt'].includes(h.kind)) || (h.archived !== undefined && typeof h.archived !== 'boolean') || !Object.hasOwn(CURRENCIES,h.currency) || !Number.isSafeInteger(h.after) || h.after < 0 || !(h.before === null || Number.isSafeInteger(h.before)) || !Number.isFinite(Date.parse(h.at)) || typeof h.note !== 'string') throw new Error('历史数据无效');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const t of data.transactions) if (typeof t.id !== 'string' || !['income', 'expense'].includes(t.type) || !Object.hasOwn(CURRENCIES, t.currency) || !Number.isSafeInteger(t.amount) || t.amount < 0 || t.amount > 1e13 || typeof t.category !== 'string' || !t.category.trim() || t.category.length > 30 || typeof t.note !== 'string' || t.note.length > 200 || !datePattern.test(t.date) || !Number.isFinite(Date.parse(`${t.date}T00:00:00`)) || !Number.isFinite(Date.parse(t.createdAt))) throw new Error('收支记录无效');
  return data;
}
export function newData() { return { schema: 1, accounts: [], history: [], transactions: [] }; }
