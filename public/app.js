import { CURRENCIES, CATEGORIES, amountToMinor, major, totals, newData, validateData } from './model.js';
import { loadLocal, saveLocal } from './storage.js';
import { icon, accountIcon } from './icons.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value, currency='CNY') => new Intl.NumberFormat('zh-CN',{style:'currency',currency,minimumFractionDigits:currency==='JPY'?0:2,maximumFractionDigits:currency==='JPY'?0:2}).format(value);
const stamp = at => new Date(at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
let data=newData(),rates={},busy=false,ready=false,hidden=false,view='accounts',category='全部',historyLimit=40,storageVersion=0;
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
function confirmAction(title,message,ok='确认'){return new Promise(resolve=>{$('#confirm-title').textContent=title;$('#confirm-message').textContent=message;$('#confirm-ok').textContent=ok;const d=$('#confirm-dialog');const finish=value=>{d.close();resolve(value);};$('#confirm-ok').onclick=()=>finish(true);$('#confirm-cancel').onclick=()=>finish(false);d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();});}
const display=(n,c='CNY')=>hidden?'••••••':money(n,c);
function status(text){$('#local-status').textContent=text||'自动保存到此浏览器';}
function empty(title,copy,add=false){return `<div class="empty"><div class="empty-symbol" aria-hidden="true">${icon('wallet')}</div><h3>${title}</h3><p>${copy}</p>${add?'<button class="primary" data-add>＋ 添加第一个账户</button>':''}</div>`;}
function card(a){const fx=rates[a.currency],value=major(a.amount,a.currency);const equivalent=a.archived?'已归档 · 不计入合计':a.currency==='CNY'?(a.kind==='debt'?'计入总负债':'计入总资产'):fx?`≈ ${display(value*fx.rate)} · 参考估值`:'等待汇率';return `<article class="account-card"><div class="card-top"><span class="account-icon ${['blue','green','orange','purple','rose'].includes(a.color)?a.color:'blue'}">${icon(accountIcon(a))}</span><div class="card-heading"><h3 class="card-name">${esc(a.name)}</h3><div class="card-category">${esc(a.category)} · ${a.currency}</div></div>${!a.archived?`<button class="card-edit" data-edit="${esc(a.id)}" aria-label="修改${esc(a.name)}">${icon('edit')}</button>`:''}</div><div class="card-balance ${a.kind==='debt'?'debt':''}">${a.kind==='debt'?'− ':''}${display(value,a.currency)}</div><div class="card-converted">${equivalent}</div>${a.note?`<p class="card-note">${esc(a.note)}</p>`:''}<div class="card-bottom"><span>${esc(stamp(a.updatedAt))} 更新</span><button data-${a.archived?'restore':'archive'}="${esc(a.id)}">${a.archived?'恢复账户':'归档'}</button></div></article>`;}
function render(){
 const sum=totals(data.accounts,rates);$('#net-value').textContent=sum.missing.length?'待获取汇率':display(sum.net);$('#assets-value').textContent=sum.missing.length?'暂无法合计':display(sum.assets);$('#debt-value').textContent=sum.missing.length?'暂无法合计':display(sum.debt);$('#account-count').textContent=data.accounts.filter(a=>!a.archived).length;
 $('#rate-notice').hidden=!sum.missing.length;$('#rate-notice').textContent=`尚未取得 ${sum.missing.join('、')} 汇率，合计暂不显示，避免漏算。请点击“更新汇率”。`;
 $('#categories').innerHTML=[...new Set([...CATEGORIES,...data.accounts.map(a=>a.category)])].map(c=>`<option value="${esc(c)}"></option>`).join('');
 document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
 const cats=['全部',...new Set(data.accounts.filter(a=>a.archived===(view==='archived')).map(a=>a.category))];if(!cats.includes(category))category='全部';$('#filters').hidden=view==='history';$('#filters').innerHTML=cats.map(c=>`<button data-category="${esc(c)}" class="${c===category?'selected':''}">${esc(c)}</button>`).join('');
 const search=$('#search').value.trim().toLowerCase();
 if(view==='history'){const rows=data.history.filter(h=>(h.name+' '+h.note).toLowerCase().includes(search)).slice().reverse();$('#content').innerHTML=rows.length?`<div class="history-list">${rows.slice(0,historyLimit).map(h=>`<article class="history-row"><div><h3>${esc(h.name)} <span class="card-category">${esc(h.action)}</span></h3><p>${esc(stamp(h.at))}${h.note?' · '+esc(h.note):''}</p></div><div class="history-money">${h.before===null?'—':display(major(h.before,h.currency),h.currency)} → ${display(major(h.after,h.currency),h.currency)}<small>${esc(CURRENCIES[h.currency])}</small></div></article>`).join('')}</div>${rows.length>historyLimit?'<button id="load-more" class="secondary load-more">显示更多历史</button>':''}`:empty('还没有修改记录','新增账户、修改余额和归档操作会记录在这里。');}
 else{const accounts=data.accounts.filter(a=>a.archived===(view==='archived')&&(category==='全部'||a.category===category)&&(a.name+' '+a.note).toLowerCase().includes(search));$('#content').innerHTML=accounts.length?`<div class="cards">${accounts.map(card).join('')}${view==='accounts'?'<button class="add-card" data-add><span class="plus-circle">＋</span>添加一个账户</button>':''}</div>`:empty(search?'没有找到匹配账户':view==='archived'?'暂无归档账户':'从第一个账户开始',search?'试试其他名称或备注。':view==='archived'?'归档账户会保留历史，并从资产合计中移除。':'添加微信、银行卡或外币零钱，随时知道钱在哪里。',!search&&view==='accounts');}status();
}
async function commit(next){
 if(!ready)throw new Error('账本已在另一标签页更新，请刷新页面后继续');
 if(busy)throw new Error('正在保存，请稍后');
 busy=true;
 try{validateData(next);storageVersion=saveLocal(next,storageVersion);data=next;render();}finally{busy=false;}
}
function historyEntry(a,action,before,note=''){return{id:crypto.randomUUID(),accountId:a.id,name:a.name,currency:a.currency,before,after:a.amount,action,note,at:new Date().toISOString()};}
function openAccount(id){if(!ready){toast('请刷新页面，等待账本加载完成');return;}const f=$('#account-form');f.reset();f.querySelector('.form-error').textContent='';const a=data.accounts.find(a=>a.id===id);f.elements.id.value=a?.id||'';for(const name of ['name','kind','currency','category','color','note'])f.elements[name].value=a?.[name]||({kind:'asset',currency:'CNY',category:'支付软件',color:'blue'}[name]||'');f.elements.amount.value=a?major(a.amount,a.currency):'';f.elements.currency.disabled=!!a;$('#account-title').textContent=a?'修改账户':'添加账户';$('#change-note-label').hidden=!a;updateAmountLabel();$('#account-dialog').showModal();}
function updateAmountLabel(){$('#amount-label').firstChild.textContent=$('#account-form').elements.kind.value==='debt'?'当前欠款（输入正数）':'当前余额';}
$('#account-form').elements.kind.onchange=updateAmountLabel;
$('#account-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,button=f.querySelector('[type=submit]');button.disabled=true;try{const old=data.accounts.find(a=>a.id===f.elements.id.value);if(old?.archived)throw new Error('该账户已归档，请关闭后重试');const a={id:old?.id||crypto.randomUUID(),name:f.elements.name.value.trim(),kind:f.elements.kind.value,currency:f.elements.currency.value,amount:amountToMinor(f.elements.amount.value,f.elements.currency.value),category:f.elements.category.value.trim(),color:f.elements.color.value,note:f.elements.note.value.trim(),archived:false,updatedAt:new Date().toISOString()};if(!a.name||!a.category)throw new Error('请填写账户名称和分类');const next=structuredClone(data);if(old)next.accounts[next.accounts.findIndex(x=>x.id===old.id)]=a;else next.accounts.push(a);next.history.push(historyEntry(a,old?'修改':'新增',old?.amount??null,f.elements.changeNote.value.trim()));await commit(next);$('#account-dialog').close();toast('账户已保存');}catch(err){f.querySelector('.form-error').textContent=err.message;}finally{button.disabled=false;}});
async function archive(id,restore=false){const a=data.accounts.find(a=>a.id===id);if(!a)return;if(!await confirmAction(restore?'恢复账户':'归档账户',restore?`恢复“${a.name}”并重新计入合计。`:`“${a.name}”将不再计入合计，历史保留，之后可随时恢复。`,restore?'恢复':'归档'))return;try{const next=structuredClone(data),target=next.accounts.find(x=>x.id===id);target.archived=!restore;target.updatedAt=new Date().toISOString();next.history.push(historyEntry(target,restore?'恢复':'归档',target.amount));await commit(next);toast(restore?'账户已恢复':'账户已归档');}catch(e){toast(e.message);}}
async function refreshRates(){const button=$('#refresh-rates');button.disabled=true;button.textContent='正在更新…';try{const res=await fetch('https://api.frankfurter.dev/v2/rates?base=CNY&quotes=HKD,JPY,EUR',{signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error();const rows=await res.json(),next={};for(const row of rows)if(['HKD','JPY','EUR'].includes(row.quote)&&row.base==='CNY'&&Number.isFinite(row.rate)&&row.rate>0&&/^\d{4}-\d{2}-\d{2}$/.test(row.date))next[row.quote]={rate:1/row.rate,date:row.date};if(Object.keys(next).length!==3)throw new Error();localStorage.setItem('yuyou-rates',JSON.stringify(next));rates=next;rateCaption();render();}catch{rateCaption(true);toast(Object.keys(rates).length?'汇率更新失败，继续使用上次参考汇率':'暂时无法获取汇率，请稍后重试');}finally{button.disabled=false;button.textContent='更新汇率 ↻';}}
function rateCaption(failed=false){const dates=Object.values(rates).map(x=>x.date).sort();$('#rates-caption').textContent=dates.length?`${failed?'更新失败 · 使用缓存 · ':''}参考汇率 ${dates[0]}${dates.at(-1)!==dates[0]?' 至 '+dates.at(-1):''} · Frankfurter`:'汇率未获取 · 外币合计等待更新';}
async function exportBackup(){
 if(!ready)throw new Error('账本未就绪');
 const backup={format:'asset-list-v1',exportedAt:new Date().toISOString(),data};
 const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=`资产清单-备份-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#export-button').onclick=()=>exportBackup().then(()=>toast('备份已导出')).catch(e=>toast(e.message));
$('#import-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>5_000_000)throw new Error('备份文件过大');
  const backup=JSON.parse(await file.text());
  if(backup.format!=='asset-list-v1')throw new Error('请选择资产清单导出的备份文件');
  const next=validateData(backup.data);
  if(!await confirmAction('恢复备份',`用备份中的 ${next.accounts.length} 个账户替换当前账本。当前账本将先自动导出备份。`,'备份并恢复'))return;
  await exportBackup();await commit(next);$('#settings-dialog').close();toast('备份已恢复');
 }catch(err){toast(err.message);}finally{e.target.value='';}
};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-close'))b.closest('dialog').close();if(b.hasAttribute('data-add'))openAccount();if(b.dataset.edit)openAccount(b.dataset.edit);if(b.dataset.archive)void archive(b.dataset.archive);if(b.dataset.restore)void archive(b.dataset.restore,true);if(b.dataset.view){view=b.dataset.view;category='全部';historyLimit=40;render();}if(b.dataset.category){category=b.dataset.category;render();}if(b.id==='load-more'){historyLimit+=40;render();}});
$('#search').oninput=()=>render();$('#add-button').onclick=()=>openAccount();$('#settings-button').onclick=()=>$('#settings-dialog').showModal();$('#refresh-rates').onclick=refreshRates;$('#privacy-button').onclick=()=>{hidden=!hidden;$('#privacy-button').setAttribute('aria-label',hidden?'显示金额':'隐藏金额');render();};
$('#today').textContent=new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});
async function init(){
 try{
  const saved=await loadLocal();data=saved.data;storageVersion=saved.version;
  try{const cached=JSON.parse(localStorage.getItem('yuyou-rates')||'{}');for(const c of ['HKD','JPY','EUR'])if(Number.isFinite(cached[c]?.rate)&&cached[c].rate>0&&/^\d{4}-\d{2}-\d{2}$/.test(cached[c].date))rates[c]=cached[c];}catch{}
  ready=true;render();rateCaption();void refreshRates();
 }catch(err){toast('无法读取账本：'+err.message);$('#add-button').disabled=true;status('账本未能加载 · 请保留本机数据');}
}
window.addEventListener('storage',e=>{if(e.key==='asset-list-data'){ready=false;status('另一标签页更新了账本，请刷新页面后继续');$('#add-button').disabled=true;}});
const context=document.modelContext;if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'start_account_creation',title:'打开添加账户',description:'打开添加账户表单，尚不保存任何账户。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('不接受参数');if(!ready)throw new Error('账本未就绪');openAccount();return{formOpen:true};}})).catch(()=>{});}catch{}}
void init();
