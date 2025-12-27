export const qs = (sel, ctx=document) => ctx.querySelector(sel);
export const qsa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
export const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2);
export const debounce = (fn, wait=250) => {
  let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), wait); };
};
export const clone = (obj) => JSON.parse(JSON.stringify(obj));

export const toast = (msg) => {
  const el = qs('#toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 2200);
};

export const sanitizeNames = (text) => {
  const lines = text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
  const seen = new Set();
  const cleaned = [];
  for(const name of lines){
    const key = name.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    cleaned.push(name);
  }
  return cleaned;
};

export const nextPow2 = (n) => 2**Math.ceil(Math.log2(Math.max(1,n)));
export const chunk = (arr, size) => {
  const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out;
};

export const sampleNames = () => `Alice\nBob\nCharlie\nDana\nEvan\nFiona\nGabe\nHazel\nIvy\nJack\nKira\nLiam\nMara\nNoel\nOmar\nPia`;

export const coinFlip = () => Math.random() < 0.5 ? 'Heads' : 'Tails';

export const applyTheme = (theme) => {
  document.body.classList.remove('theme-light','theme-contrast');
  if(theme==='light') document.body.classList.add('theme-light');
  if(theme==='contrast') document.body.classList.add('theme-contrast');
};

export const formatDate = () => new Date().toLocaleDateString();

export const downloadJson = (data, filename='tournament.json') => {
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
};

export const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch(e){ toast('Copy failed'); }
};
