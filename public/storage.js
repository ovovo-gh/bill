import { newData, validateData } from './model.js';
import { decrypt } from './crypto.js';
export const STORE = 'asset-list-data';
export async function loadLocal(store=localStorage) {
  const raw=store.getItem(STORE);
  if(raw){const saved=JSON.parse(raw);if(!Number.isSafeInteger(saved.version)||saved.version<1)throw new Error('保存版本无效');return {data:validateData(saved.data),version:saved.version};}
  // Preserve first-version local data during the switch to a static-only app.
  const old=store.getItem('yuyou-vault');
  if(old){const cfg=JSON.parse(store.getItem('yuyou-config')||'{}');const data=validateData(await decrypt(JSON.parse(old).payload,cfg.key));saveLocal(data,0,store);return {data,version:1};}
  return {data:newData(),version:0};
}
export function saveLocal(data,expectedVersion,store=localStorage) {
  validateData(data);
  const raw=store.getItem(STORE), current=raw?JSON.parse(raw).version:0;
  if(current!==expectedVersion)throw new Error('账本已在另一标签页更新，请刷新页面后继续');
  const version=current+1;
  store.setItem(STORE,JSON.stringify({data,version}));
  return version;
}
