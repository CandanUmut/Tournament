const KEY = 'tournament_v2_state';

export const saveState = (state) => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){ /* ignore */ }
};

export const loadState = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
};

export const clearState = () => {
  try { localStorage.removeItem(KEY); } catch(e){}
};
