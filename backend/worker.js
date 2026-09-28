// The service only stores encrypted vaults. Master keys and plaintext never leave the browser.
const MAX_BODY = 900_000;
const hex64 = value => /^[a-f0-9]{64}$/.test(value || '');
async function digest(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2,'0')).join(''); }
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || 'https://ovovo-gh.github.io').split(',');
    const headers = {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if (origin && !allowed.includes(origin)) return new Response('{"error":"Origin denied"}', {status:403,headers});
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'86400'}});
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return respond({ok:true});
    const match = url.pathname.match(/^\/v1\/vault\/([a-f0-9]{64})$/);
    if (!match) return respond({error:'Not found'},404);
    if (!['GET','PUT'].includes(request.method)) return respond({error:'Method not allowed'},405);
    const token = request.headers.get('Authorization')?.replace(/^Bearer /,'');
    if (!hex64(token)) return respond({error:'Unauthorized'},401);
    const id = match[1], tokenHash = await digest(token);
    try {
      const existing = await env.DB.prepare('SELECT token_hash, revision, iv, ciphertext FROM vaults WHERE id = ?').bind(id).first();
      if (existing && existing.token_hash !== tokenHash) return respond({error:'Unauthorized'},401);
      if (request.method === 'GET') return existing ? respond({revision:existing.revision,iv:existing.iv,ciphertext:existing.ciphertext}) : respond({error:'Not found'},404);
      if (Number(request.headers.get('Content-Length')) > MAX_BODY) return respond({error:'Too large'},413);
      // Bound streamed input, including requests without a Content-Length header.
      const reader = request.body?.getReader(); if (!reader) return respond({error:'Body required'},400);
      let size=0; const chunks=[];
      while(true){ const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return respond({error:'Too large'},413);}chunks.push(value); }
      const all = new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(all));}catch{return respond({error:'Invalid JSON'},400);}
      if (!Number.isSafeInteger(body.revision) || body.revision<0 || typeof body.iv!=='string' || !/^[A-Za-z0-9+/]{16}$/.test(body.iv) || typeof body.ciphertext!=='string' || body.ciphertext.length<24 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.ciphertext)) return respond({error:'Invalid payload'},400);
      if (!existing) {
        if (body.revision !== 0) return respond({error:'Conflict'},409);
        const result = await env.DB.prepare('INSERT OR IGNORE INTO vaults (id, token_hash, revision, iv, ciphertext, updated_at) VALUES (?, ?, 1, ?, ?, ?)').bind(id,tokenHash,body.iv,body.ciphertext,new Date().toISOString()).run();
        return result.meta.changes === 1 ? respond({revision:1}) : respond({error:'Conflict'},409);
      }
      const result = await env.DB.prepare('UPDATE vaults SET revision = revision + 1, iv = ?, ciphertext = ?, updated_at = ? WHERE id = ? AND token_hash = ? AND revision = ?').bind(body.iv,body.ciphertext,new Date().toISOString(),id,tokenHash,body.revision).run();
      return result.meta.changes === 1 ? respond({revision:body.revision+1}) : respond({error:'Conflict'},409);
    } catch { return respond({error:'Service unavailable'},503); }
  }
};
