import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLocal, saveLocal, STORE } from '../public/storage.js';
import { newData } from '../public/model.js';
import { encrypt, generateKey } from '../public/crypto.js';
function store(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};}
test('本地保存和刷新读取保持账户与历史，拒绝过期标签页覆盖',async()=>{const s=store(),d=newData();assert.deepEqual(await loadLocal(s),{data:d,version:0});assert.equal(saveLocal(d,0,s),1);assert.deepEqual(await loadLocal(s),{data:d,version:1});assert.throws(()=>saveLocal(d,0,s),/另一标签页/);});
test('旧版本机数据可迁移，旧缓存保持可恢复',async()=>{const s=store(),key=generateKey(),d=newData();s.setItem('yuyou-config',JSON.stringify({key}));s.setItem('yuyou-vault',JSON.stringify({payload:await encrypt(d,key)}));assert.deepEqual(await loadLocal(s),{data:d,version:1});assert.ok(s.getItem('yuyou-vault'));assert.ok(s.getItem(STORE));});
test('缓存损坏和磁盘写入失败不会被静默覆盖为空账本',async()=>{const s=store();s.setItem(STORE,'bad json');await assert.rejects(()=>loadLocal(s));assert.equal(s.getItem(STORE),'bad json');assert.throws(()=>saveLocal(newData(),0,{getItem:()=>null,setItem:()=>{throw new Error('QuotaExceeded');}}),/QuotaExceeded/);});
