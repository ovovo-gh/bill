const encoder = new TextEncoder();
const b64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export const generateKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export const validKey = key => /^[a-f0-9]{64}$/.test(key);
export async function hash(text) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))), b => b.toString(16).padStart(2, '0')).join(''); }
async function aes(key) { return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode('encryption:' + key)), 'AES-GCM', false, ['encrypt','decrypt']); }
export async function identity(key) { return { id: await hash('vault:' + key), token: await hash('auth:' + key) }; }
export async function encrypt(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), encoder.encode(JSON.stringify(data)));
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) };
}
export async function decrypt(payload, key) {
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(payload.iv) }, await aes(key), bytes(payload.ciphertext))));
}
