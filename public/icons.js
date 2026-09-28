const paths={
 wallet:'<path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7"/><path d="M20 12h-5v4h5"/><circle cx="16.5" cy="14" r=".5"/>',
 bank:'<path d="m3 8 9-5 9 5H3Zm1 13h16M6 11v6m6-6v6m6-6v6M3 18h18"/>',
 card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
 cash:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 12h.01M19 12h.01"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 18h2"/>',
 edit:'<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14l-1 7Z"/>',
};
export function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.wallet}</svg>`;}
export function accountIcon(a){if(a.kind==='debt'||a.category==='校园卡')return 'card';if(a.category==='银行卡')return 'bank';if(a.category==='现金')return 'cash';if(a.category==='支付软件')return 'phone';return 'wallet';}
