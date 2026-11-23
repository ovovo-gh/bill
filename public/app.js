import { CURRENCIES, CATEGORIES, TRANSACTION_CATEGORIES, amountToMinor, major, totals, monthlyTotals, newData, validateData, sortAccountsByAmount } from './model.js';
import { loadLocal, saveLocal } from './storage.js';
import { icon, accountIcon } from './icons.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = (value, currency = 'CNY') => new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: currency === 'JPY' ? 0 : 2, maximumFractionDigits: currency === 'JPY' ? 0 : 2 }).format(value);
const stamp = at => new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const localDate = (date = new Date()) => { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); };
const currentMonth = () => localDate().slice(0, 7);
const monthLabel = month => new Date(`${month}-01T00:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
const transactionDateLabel = date => new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

let data = newData(), rates = {}, busy = false, ready = false, hidden = false;
let view = 'accounts', category = '全部', sortOrder = 'desc', historyLimit = 40, transactionLimit = 40, storageVersion = 0, summaryMonth = currentMonth();
let toastTimer;

function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000); }
function confirmAction(title, message, ok = '确认') {
  return new Promise(resolve => {
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    $('#confirm-ok').textContent = ok;
    const dialog = $('#confirm-dialog');
    const finish = value => { dialog.close(); resolve(value); };
    $('#confirm-ok').onclick = () => finish(true);
    $('#confirm-cancel').onclick = () => finish(false);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    dialog.showModal();
  });
}
const display = (value, currency = 'CNY') => hidden ? '••••••' : money(value, currency);
function status(text) { $('#local-status').textContent = text || '自动保存到此浏览器'; }
function empty(title, copy, add = false) { return `<div class="empty"><div class="empty-symbol" aria-hidden="true">${icon('wallet')}</div><h3>${title}</h3><p>${copy}</p>${add ? '<button class="primary" data-add>＋ 添加第一个账户</button>' : ''}</div>`; }

function card(account) {
  const fx = rates[account.currency], value = major(account.amount, account.currency);
  const equivalent = account.archived ? '已归档 · 不计入合计' : account.currency === 'CNY' ? (account.kind === 'debt' ? '计入总负债' : '计入总资产') : fx ? `≈ ${display(value * fx.rate)} · 参考估值` : '等待汇率';
  const actions = account.archived
    ? `<span class="card-actions"><button data-restore="${esc(account.id)}">恢复账户</button><button class="danger-button" data-delete-account="${esc(account.id)}">删除</button></span>`
    : `<button data-archive="${esc(account.id)}">归档</button>`;
  return `<article class="account-card${account.archived ? ' is-archived' : ''}"><div class="card-top"><span class="account-icon ${['blue', 'green', 'orange', 'purple', 'rose'].includes(account.color) ? account.color : 'blue'}">${icon(accountIcon(account))}</span><div class="card-heading"><h3 class="card-name">${esc(account.name)}</h3><div class="card-category">${esc(account.category)} · ${account.currency}${account.archived ? ' · 已归档' : ''}</div></div><button class="card-edit" data-edit="${esc(account.id)}" aria-label="${account.archived ? '编辑已归档账户' : '修改' + esc(account.name)}">${icon('edit')}</button></div><div class="card-balance ${account.kind === 'debt' ? 'debt' : ''}">${account.kind === 'debt' ? '− ' : ''}${display(value, account.currency)}</div><div class="card-converted">${equivalent}</div>${account.note ? `<p class="card-note">${esc(account.note)}</p>` : ''}<div class="card-bottom"><span>${esc(stamp(account.updatedAt))} 更新</span>${actions}</div></article>`;
}

function transactionRow(transaction) {
  const native = major(transaction.amount, transaction.currency);
  const fx = transaction.currency === 'CNY' ? 1 : rates[transaction.currency]?.rate;
  const equivalent = transaction.currency === 'CNY' ? '' : fx ? `≈ ${display(native * fx)}` : '待汇率';
  return `<article class="transaction-row ${transaction.type}"><div class="transaction-main"><span class="transaction-mark">${transaction.type === 'income' ? '＋' : '−'}</span><div><h3>${esc(transaction.category)} <span class="transaction-type">${transaction.type === 'income' ? '收入' : '支出'}</span></h3><p>${esc(transactionDateLabel(transaction.date))}${transaction.note ? ` · ${esc(transaction.note)}` : ''}</p></div></div><div class="transaction-amount"><strong>${transaction.type === 'income' ? '+' : '−'}${display(native, transaction.currency)}</strong><small>${equivalent || esc(CURRENCIES[transaction.currency])}</small></div><div class="transaction-actions"><button data-edit-transaction="${esc(transaction.id)}">编辑</button><button class="danger-button" data-delete-transaction="${esc(transaction.id)}">删除</button></div></article>`;
}

function renderMonthlySummary() {
  const summary = $('#monthly-summary');
  summary.hidden = view !== 'accounts';
  if (view !== 'accounts') return;
  const result = monthlyTotals(data.transactions, rates, summaryMonth);
  const blocked = result.missing.length > 0;
  const value = amount => blocked ? '待汇率' : display(amount);
  const count = data.transactions.filter(transaction => transaction.date.startsWith(summaryMonth)).length;
  $('#summary-month').value = summaryMonth;
  $('#summary-month-label').textContent = monthLabel(summaryMonth);
  $('#monthly-expense').textContent = value(result.expense);
  $('#monthly-income').textContent = value(result.income);
  $('#monthly-balance').textContent = value(result.balance);
  $('#monthly-count').textContent = count ? `${count} 笔记录` : '还没有收支记录';
  $('#monthly-note').textContent = blocked ? `缺少 ${result.missing.join('、')} 汇率，外币记录暂不计入月度合计。` : '按记录中的币种折合人民币统计。';
}

function render() {
  const sum = totals(data.accounts, rates);
  $('#net-value').textContent = sum.missing.length ? '待获取汇率' : display(sum.net);
  $('#assets-value').textContent = sum.missing.length ? '暂无法合计' : display(sum.assets);
  $('#debt-value').textContent = sum.missing.length ? '暂无法合计' : display(sum.debt);
  $('#account-count').textContent = data.accounts.filter(account => !account.archived).length;
  $('#transaction-count').textContent = data.transactions.length;
  $('#rate-notice').hidden = !sum.missing.length;
  $('#rate-notice').textContent = `尚未取得 ${sum.missing.join('、')} 汇率，资产合计暂不显示，避免漏算。请点击“更新汇率”。`;
  $('#categories').innerHTML = [...new Set([...CATEGORIES, ...data.accounts.map(account => account.category)])].map(value => `<option value="${esc(value)}"></option>`).join('');
  $('#transaction-categories').innerHTML = [...new Set([...TRANSACTION_CATEGORIES, ...data.transactions.map(transaction => transaction.category)])].map(value => `<option value="${esc(value)}"></option>`).join('');
  document.querySelectorAll('[data-view]').forEach(element => { element.classList.toggle('active', element.dataset.view === view); element.setAttribute('aria-current', element.dataset.view === view ? 'page' : 'false'); });
  const accountView = view === 'accounts' || view === 'archived';
  const cats = ['全部', ...new Set(data.accounts.filter(account => account.archived === (view === 'archived')).map(account => account.category))];
  if (!cats.includes(category)) category = '全部';
  $('#filters').hidden = !accountView;
  $('#sort-control').hidden = !accountView;
  $('#filters').innerHTML = cats.map(value => `<button data-category="${esc(value)}" class="${value === category ? 'selected' : ''}">${esc(value)}</button>`).join('');
  $('#sort-order').value = sortOrder;
  const search = $('#search').value.trim().toLowerCase();
  renderMonthlySummary();

  if (view === 'history') {
    const rows = data.history.filter(history => (history.name + ' ' + history.note).toLowerCase().includes(search)).slice().reverse();
    $('#content').innerHTML = rows.length ? `<div class="history-list">${rows.slice(0, historyLimit).map(history => `<article class="history-row"><div><h3>${esc(history.name)} <span class="card-category">${esc(history.action)}</span></h3><p>${esc(stamp(history.at))}${history.note ? ' · ' + esc(history.note) : ''}</p></div><div class="history-money">${history.before === null ? '—' : display(major(history.before, history.currency), history.currency)} → ${display(major(history.after, history.currency), history.currency)}<small>${esc(CURRENCIES[history.currency])}</small></div></article>`).join('')}</div>${rows.length > historyLimit ? '<button id="load-more" class="secondary load-more">显示更多历史</button>' : ''}` : empty('还没有修改记录', '新增账户、修改余额和归档操作会记录在这里。');
  } else if (view === 'transactions') {
    const rows = data.transactions.filter(transaction => (transaction.category + ' ' + transaction.note + ' ' + transaction.date).toLowerCase().includes(search)).slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    $('#content').innerHTML = rows.length ? `<div class="transactions-list">${rows.slice(0, transactionLimit).map(transactionRow).join('')}</div>${rows.length > transactionLimit ? '<button id="load-more-transactions" class="secondary load-more">显示更多记录</button>' : ''}` : empty('还没有收支记录', '点击“记一笔”，记录收入或支出。', false);
  } else {
    const accounts = sortAccountsByAmount(data.accounts.filter(account => account.archived === (view === 'archived') && (category === '全部' || account.category === category) && (account.name + ' ' + account.note).toLowerCase().includes(search)), rates, sortOrder);
    $('#content').innerHTML = accounts.length ? `<div class="cards">${accounts.map(card).join('')}${view === 'accounts' ? '<button class="add-card" data-add><span class="plus-circle">＋</span>添加一个账户</button>' : ''}</div>` : empty(search ? '没有找到匹配账户' : view === 'archived' ? '暂无归档账户' : '从第一个账户开始', search ? '试试其他名称或备注。' : view === 'archived' ? '归档账户会保留历史，也可以编辑或永久删除。' : '添加微信、银行卡或外币零钱，随时知道钱在哪里。', !search && view === 'accounts');
  }
  status();
}

async function commit(next) {
  if (!ready) throw new Error('账本已在另一标签页更新，请刷新页面后继续');
  if (busy) throw new Error('正在保存，请稍后');
  busy = true;
  try { validateData(next); storageVersion = saveLocal(next, storageVersion); data = next; render(); } finally { busy = false; }
}
function historyEntry(account, action, before, note = '') { return { id: crypto.randomUUID(), accountId: account.id, name: account.name, currency: account.currency, before, after: account.amount, action, note, at: new Date().toISOString() }; }

function openAccount(id) {
  if (!ready) { toast('请刷新页面，等待账本加载完成'); return; }
  const form = $('#account-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  const account = data.accounts.find(item => item.id === id);
  form.elements.id.value = account?.id || '';
  for (const name of ['name', 'kind', 'currency', 'category', 'color', 'note']) form.elements[name].value = account?.[name] || ({ kind: 'asset', currency: 'CNY', category: '支付软件', color: 'blue' }[name] || '');
  form.elements.amount.value = account ? major(account.amount, account.currency) : '';
  form.elements.currency.disabled = !!account;
  $('#account-title').textContent = account ? (account.archived ? '编辑已归档账户' : '修改账户') : '添加账户';
  $('#change-note-label').hidden = !account;
  updateAmountLabel(); $('#account-dialog').showModal();
}
function updateAmountLabel() { $('#amount-label').firstChild.textContent = $('#account-form').elements.kind.value === 'debt' ? '当前欠款（输入正数）' : '当前余额'; }

$('#account-form').elements.kind.onchange = updateAmountLabel;
$('#account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('[type=submit]'); button.disabled = true;
  try {
    const old = data.accounts.find(account => account.id === form.elements.id.value);
    const account = { id: old?.id || crypto.randomUUID(), name: form.elements.name.value.trim(), kind: form.elements.kind.value, currency: form.elements.currency.value, amount: amountToMinor(form.elements.amount.value, form.elements.currency.value), category: form.elements.category.value.trim(), color: form.elements.color.value, note: form.elements.note.value.trim(), archived: old?.archived === true, updatedAt: new Date().toISOString() };
    if (!account.name || !account.category) throw new Error('请填写账户名称和分类');
    const next = structuredClone(data);
    if (old) next.accounts[next.accounts.findIndex(item => item.id === old.id)] = account; else next.accounts.push(account);
    next.history.push(historyEntry(account, old ? '修改' : '新增', old?.amount ?? null, form.elements.changeNote.value.trim()));
    await commit(next); $('#account-dialog').close(); toast(old?.archived ? '已归档账户余额已更新' : '账户已保存');
  } catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});

async function archive(id, restore = false) {
  const account = data.accounts.find(item => item.id === id); if (!account) return;
  if (!await confirmAction(restore ? '恢复账户' : '归档账户', restore ? `恢复“${account.name}”并重新计入合计。` : `“${account.name}”将不再计入合计，历史保留，之后可随时恢复。`, restore ? '恢复' : '归档')) return;
  try { const next = structuredClone(data), target = next.accounts.find(item => item.id === id); target.archived = !restore; target.updatedAt = new Date().toISOString(); next.history.push(historyEntry(target, restore ? '恢复' : '归档', target.amount)); await commit(next); toast(restore ? '账户已恢复' : '账户已归档'); } catch (error) { toast(error.message); }
}

async function deleteArchived(id) {
  const account = data.accounts.find(item => item.id === id); if (!account?.archived) return;
  if (!await confirmAction('永久删除归档账户', `永久删除“${account.name}”？账户余额和卡片会被移除，但修改历史仍会保留。`, '永久删除')) return;
  try { const next = structuredClone(data); next.accounts = next.accounts.filter(item => item.id !== id); next.history.push(historyEntry(account, '删除', account.amount, '归档账户已永久删除')); await commit(next); toast('归档账户已删除'); } catch (error) { toast(error.message); }
}

function openTransaction(id) {
  if (!ready) { toast('请刷新页面，等待账本加载完成'); return; }
  const form = $('#transaction-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  const transaction = data.transactions.find(item => item.id === id);
  form.elements.id.value = transaction?.id || '';
  form.elements.type.value = transaction?.type || 'expense';
  form.elements.amount.value = transaction ? major(transaction.amount, transaction.currency) : '';
  form.elements.currency.value = transaction?.currency || 'CNY';
  form.elements.date.value = transaction?.date || localDate();
  form.elements.category.value = transaction?.category || '其他';
  form.elements.note.value = transaction?.note || '';
  $('#transaction-title').textContent = transaction ? '编辑收支记录' : '记一笔';
  $('#transaction-dialog').showModal();
}

$('#transaction-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('[type=submit]'); button.disabled = true;
  try {
    const old = data.transactions.find(transaction => transaction.id === form.elements.id.value);
    const date = form.elements.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请选择有效日期');
    const transaction = { id: old?.id || crypto.randomUUID(), type: form.elements.type.value, amount: amountToMinor(form.elements.amount.value, form.elements.currency.value), currency: form.elements.currency.value, date, category: form.elements.category.value.trim(), note: form.elements.note.value.trim(), createdAt: old?.createdAt || new Date().toISOString() };
    if (!transaction.category) throw new Error('请填写收支分类');
    const next = structuredClone(data);
    if (old) next.transactions[next.transactions.findIndex(item => item.id === old.id)] = transaction; else next.transactions.push(transaction);
    await commit(next); $('#transaction-dialog').close(); toast(old ? '收支记录已更新' : '收支记录已保存');
  } catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; }
});

async function deleteTransaction(id) {
  const transaction = data.transactions.find(item => item.id === id); if (!transaction) return;
  if (!await confirmAction('删除收支记录', `删除这笔${transaction.type === 'income' ? '收入' : '支出'}记录？`, '删除记录')) return;
  try { const next = structuredClone(data); next.transactions = next.transactions.filter(item => item.id !== id); await commit(next); toast('收支记录已删除'); } catch (error) { toast(error.message); }
}

const RATE_CURRENCIES = ['HKD', 'JPY', 'EUR'];
const RATE_SOURCES = [
  { name: 'Frankfurter', url: 'https://api.frankfurter.dev/v2/rates?base=CNY&quotes=HKD,JPY,EUR' },
  { name: 'Frankfurter 备用接口', url: 'https://api.frankfurter.dev/v1/latest?base=CNY&symbols=HKD,JPY,EUR' },
  { name: 'ExchangeRate API', url: 'https://open.er-api.com/v6/latest/CNY' }
];
async function fetchJSON(url) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try { const response = await fetch(url, { cache: 'no-store', signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json(); } finally { clearTimeout(timer); }
}
function parseRates(payload, source) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(payload?.date) ? payload.date : localDate();
  const next = {};
  if (Array.isArray(payload)) {
    for (const row of payload) if (RATE_CURRENCIES.includes(row.quote) && row.base === 'CNY' && Number.isFinite(Number(row.rate)) && Number(row.rate) > 0) next[row.quote] = { rate: 1 / Number(row.rate), date: row.date || date, source };
  } else if (payload?.rates && typeof payload.rates === 'object') {
    for (const currency of RATE_CURRENCIES) if (Number.isFinite(Number(payload.rates[currency])) && Number(payload.rates[currency]) > 0) next[currency] = { rate: 1 / Number(payload.rates[currency]), date, source };
  }
  if (RATE_CURRENCIES.some(currency => !next[currency])) throw new Error('汇率数据不完整');
  return next;
}
async function refreshRates() {
  const button = $('#refresh-rates'); button.disabled = true; button.textContent = '正在更新…';
  let lastError;
  try {
    for (const source of RATE_SOURCES) {
      try {
        const next = parseRates(await fetchJSON(source.url), source.name);
        localStorage.setItem('yuyou-rates', JSON.stringify(next)); rates = next; rateCaption(); render(); toast(`汇率已更新 · ${source.name}`); return;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('没有可用的汇率来源');
  } catch (error) { rateCaption(true); toast(Object.keys(rates).length ? '汇率更新失败，继续使用上次参考汇率' : '暂时无法获取汇率，请检查网络后重试'); } finally { button.disabled = false; button.textContent = '更新汇率 ↻'; }
}
function rateCaption(failed = false) {
  const dates = Object.values(rates).map(rate => rate.date).sort(), sources = [...new Set(Object.values(rates).map(rate => rate.source).filter(Boolean))];
  $('#rates-caption').textContent = dates.length ? `${failed ? '更新失败 · 使用缓存 · ' : ''}参考汇率 ${dates[0]}${dates.at(-1) !== dates[0] ? ' 至 ' + dates.at(-1) : ''} · ${sources[0] || 'Frankfurter'}` : '汇率未获取 · 外币合计等待更新';
}

async function exportBackup() {
  if (!ready) throw new Error('账本未就绪');
  const backup = { format: 'asset-list-v1', exportedAt: new Date().toISOString(), data };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `资产清单-备份-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#export-button').onclick = () => exportBackup().then(() => toast('备份已导出')).catch(error => toast(error.message));
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('备份文件过大');
    const backup = JSON.parse(await file.text()); if (backup.format !== 'asset-list-v1') throw new Error('请选择资产清单导出的备份文件');
    const next = validateData(backup.data);
    if (!await confirmAction('恢复备份', `用备份中的 ${next.accounts.length} 个账户和 ${next.transactions.length} 笔收支记录替换当前账本。当前账本将先自动导出备份。`, '备份并恢复')) return;
    await exportBackup(); await commit(next); $('#settings-dialog').close(); toast('备份已恢复');
  } catch (error) { toast(error.message); } finally { event.target.value = ''; }
};

document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-close')) button.closest('dialog').close();
  if (button.hasAttribute('data-add')) openAccount();
  if (button.hasAttribute('data-record')) openTransaction();
  if (button.dataset.edit) openAccount(button.dataset.edit);
  if (button.dataset.archive) void archive(button.dataset.archive);
  if (button.dataset.restore) void archive(button.dataset.restore, true);
  if (button.dataset.deleteAccount) void deleteArchived(button.dataset.deleteAccount);
  if (button.dataset.editTransaction) openTransaction(button.dataset.editTransaction);
  if (button.dataset.deleteTransaction) void deleteTransaction(button.dataset.deleteTransaction);
  if (button.dataset.view) { view = button.dataset.view; category = '全部'; historyLimit = 40; transactionLimit = 40; render(); }
  if (button.dataset.category) { category = button.dataset.category; render(); }
  if (button.id === 'load-more') { historyLimit += 40; render(); }
  if (button.id === 'load-more-transactions') { transactionLimit += 40; render(); }
});

$('#search').oninput = () => render();
$('#sort-order').onchange = event => { sortOrder = event.target.value; render(); };
$('#summary-month').onchange = event => { summaryMonth = event.target.value || currentMonth(); renderMonthlySummary(); };
$('#add-button').onclick = () => openAccount();
$('#record-button').onclick = () => openTransaction();
$('#settings-button').onclick = () => $('#settings-dialog').showModal();
$('#refresh-rates').onclick = refreshRates;
$('#privacy-button').onclick = () => { hidden = !hidden; $('#privacy-button').setAttribute('aria-label', hidden ? '显示金额' : '隐藏金额'); render(); };
$('#today').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

async function init() {
  try {
    const saved = await loadLocal(); data = saved.data; storageVersion = saved.version;
    try { const cached = JSON.parse(localStorage.getItem('yuyou-rates') || '{}'); for (const currency of RATE_CURRENCIES) if (Number.isFinite(cached[currency]?.rate) && cached[currency].rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(cached[currency].date)) rates[currency] = cached[currency]; } catch { /* ignore invalid rate cache */ }
    ready = true; render(); rateCaption(); void refreshRates();
  } catch (error) { toast('无法读取账本：' + error.message); $('#add-button').disabled = true; status('账本未能加载 · 请保留本机数据'); }
}
window.addEventListener('storage', event => { if (event.key === 'asset-list-data') { ready = false; status('另一标签页更新了账本，请刷新页面后继续'); $('#add-button').disabled = true; } });

const context = document.modelContext;
if (context?.registerTool) {
  try {
    Promise.resolve(context.registerTool({ name: 'start_account_creation', title: '打开添加账户', description: '打开添加账户表单，尚不保存任何账户。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) { if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('不接受参数'); if (!ready) throw new Error('账本未就绪'); openAccount(); return { formOpen: true }; } })).catch(() => {});
  } catch { /* optional model context */ }
}
void init();
