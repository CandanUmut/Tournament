/*
Developer Notes
- Data model: state stores participants [{id,name,seed}], matches [{id,round,index,a,b,winner,status,time,location,notes,bestOf}], settings (title, format, seeding, bestOf, byeMode, thirdPlace, showSeeds, defaults, compact, zoom, version).
- Bracket computation: buildSingleElim in bracket.js pads to next power of two, adds BYEs, auto-advances BYE winners, then connects later rounds to prior winners. propagate() normalizes downstream winners when clears happen.
- Supabase sync: optional. configure(url,key) sets client; createRoom/joinRoom manage room_code. syncState debounces updates to the rooms table (last-write-wins). When supabase is missing, UI controls remain inert.
*/
import { qs, qsa, sanitizeNames, sampleNames, toast, applyTheme, coinFlip, downloadJson, copyText, clone, debounce, formatDate } from './utils.js';
import { saveState, loadState, clearState } from './storage.js';
import { createParticipants, buildSingleElim, applyWinner, clearMatch, clearAll, updateScore, describeRound, formatMatchesByRound, normalizeLinks } from './bracket.js';
import { exportPng, exportPdf } from './share.js';
import * as supa from './supabase.js';

const $ = qs;

const defaults = {
  title:'', format:'single', seeding:'as_entered', bestOf:1, thirdPlace:false, byeMode:'auto', showSeeds:true,
  names:[], participants:[], matches:[], rounds:0, version:1, compact:false, zoom:1,
  defaults:{ location:'', notes:'', time:'' },
};

let state = clone(defaults);
const history = { past:[], future:[] };
const syncRemote = debounce(()=>supa.syncState(state), 500);

const pushHistory = () => {
  history.past.push(clone(state));
  if(history.past.length>10) history.past.shift();
  history.future=[];
};

const restoreState = (snap) => {
  state = clone(snap);
  renderAll();
};

const undo = () => {
  if(!history.past.length) return;
  history.future.push(clone(state));
  restoreState(history.past.pop());
};
const redo = () => {
  if(!history.future.length) return;
  history.past.push(clone(state));
  restoreState(history.future.pop());
};

const buildStateFromInputs = () => {
  const names = sanitizeNames($('#names').value);
  const participants = createParticipants(names, $('#tSeeding').value);
  const structure = buildSingleElim(participants, {
    bestOf: Number($('#tBestOf').value),
    thirdPlace: $('#tThirdPlace').value==='on',
    byeMode: $('#tBye').value,
    defaults: { location: $('#defaultLocation').value, notes: $('#defaultNotes').value }
  });
  normalizeLinks(structure.matches);
  state = {
    ...state,
    title: $('#tTitle').value || 'Untitled event',
    format: $('#tFormat').value,
    seeding: $('#tSeeding').value,
    bestOf: Number($('#tBestOf').value),
    thirdPlace: $('#tThirdPlace').value==='on',
    byeMode: $('#tBye').value,
    showSeeds: $('#toggleSeeds').value==='on',
    participants,
    names,
    matches: structure.matches,
    rounds: structure.rounds,
    version: (state.version||1)+1,
  };
  pushHistory();
  renderAll();
  saveState(state);
};

const renderStats = () => {
  $('#statPlayers').textContent = state.participants.length;
  $('#statRounds').textContent = state.rounds;
  $('#statMatches').textContent = state.matches.length;
};

const renderBracket = () => {
  const container = $('#bracket');
  container.innerHTML='';
  $('#emptyState').style.display = state.matches.length ? 'none' : 'block';
  container.style.transform = `scale(${state.zoom || 1})`;
  if(!state.matches.length) return;
  const grouped = formatMatchesByRound(state.matches);
  grouped.forEach(([roundNum, matches])=>{
    const roundEl = document.createElement('div');
    roundEl.className='round';
    const heading = document.createElement('h3');
    heading.textContent = describeRound(Number(roundNum), state.rounds);
    roundEl.appendChild(heading);
    matches.forEach(m=>{
      const match = document.createElement('div');
      match.className='match';
      match.dataset.id=m.id;
      match.dataset.status=m.status;
      const meta = document.createElement('div');
      meta.className='match__meta';
      const status = document.createElement('span');
      status.className='status ' + (m.status==='completed'?'complete': m.status==='pending'?'pending':'empty');
      status.textContent = m.status==='completed'?'Completed': m.status==='pending'?'In progress':'Not started';
      meta.append(status);
      const bo = document.createElement('span');
      bo.textContent = `Bo${m.bestOf || state.bestOf}`;
      meta.append(bo);
      match.append(meta);

      const slotEl = (slot, side) => {
        const el = document.createElement('div');
        el.className='slot';
        if(slot){
          el.innerHTML = `<div><div class="name">${slot.name||'TBD'}</div>${state.showSeeds && slot.seed?`<div class="seed">Seed ${slot.seed}</div>`:''}</div>`;
        } else {
          el.innerHTML = '<div class="name">TBD</div>';
        }
        if(m.winner===slot?.id) el.classList.add('win');
        if(m.winner && m.winner!==slot?.id) el.classList.add('lose');
        const score = document.createElement('input');
        score.className='score'; score.type='number'; score.min='0'; score.max='999'; score.value=slot?.score??'';
        score.addEventListener('change', ()=>{ updateScore(state.matches, m.id, side, score.value ? Number(score.value) : null); saveState(state); });
        const controls = document.createElement('div'); controls.className='controls';
        const winBtn = document.createElement('button'); winBtn.className='win'; winBtn.textContent='Win';
        winBtn.addEventListener('click', ()=>{ pushHistory(); applyWinner(state.matches, m.id, side); saveState(state); renderAll(); });
        const clearBtn = document.createElement('button'); clearBtn.className='clear'; clearBtn.textContent='Clear';
        clearBtn.addEventListener('click', ()=>{ pushHistory(); clearMatch(state.matches, m.id); saveState(state); renderAll(); });
        controls.append(winBtn, clearBtn);
        el.append(score, controls);
        return el;
      };

      match.append(slotEl(m.a,'a'));
      match.append(slotEl(m.b,'b'));

      const details = document.createElement('div'); details.className='match__details';
      const time = document.createElement('input'); time.placeholder='Time'; time.type='datetime-local'; time.value=m.time||'';
      time.addEventListener('change', ()=>{ m.time=time.value; saveState(state); });
      const loc = document.createElement('input'); loc.placeholder='Location'; loc.value=m.location||state.defaults.location||'';
      loc.addEventListener('change', ()=>{ m.location=loc.value; saveState(state); });
      const notes = document.createElement('input'); notes.placeholder='Notes'; notes.value=m.notes||state.defaults.notes||'';
      notes.addEventListener('change', ()=>{ m.notes=notes.value; saveState(state); });
      const coin = document.createElement('button'); coin.textContent='Flip coin'; coin.className='btn ghost';
      coin.addEventListener('click', ()=>{ toast(`Coin: ${coinFlip()}`); });
      details.append(time, loc, notes, coin);
      match.append(details);
      roundEl.append(match);
    });
    container.append(roundEl);
  });
};

const renderInputs = () => {
  $('#tTitle').value = state.title;
  $('#tFormat').value = state.format;
  $('#tSeeding').value = state.seeding;
  $('#tBestOf').value = state.bestOf;
  $('#tThirdPlace').value = state.thirdPlace ? 'on' : 'off';
  $('#tBye').value = state.byeMode || 'auto';
  $('#toggleSeeds').value = state.showSeeds ? 'on' : 'off';
  $('#names').value = state.names.join('\n');
  $('#viewTitle').textContent = state.title || 'Bracket';
  $('#viewMeta').textContent = state.matches.length ? `${formatDate()} • ${state.participants.length} entrants` : 'Add names and generate a bracket.';
  $('#defaultLocation').value = state.defaults.location || '';
  $('#defaultNotes').value = state.defaults.notes || '';
};

const renderAll = () => {
  applyTheme($('#themeSelect').value);
  document.body.classList.toggle('compact', state.compact);
  renderStats();
  renderInputs();
  renderBracket();
  syncRemote();
};

const importJson = async () => {
  const input = document.createElement('input'); input.type='file'; input.accept='application/json';
  input.onchange = () => {
    const file = input.files?.[0];
    if(!file) return;
    file.text().then(txt=>{
      try {
        const data = JSON.parse(txt);
        pushHistory();
        state = { ...state, ...data };
        renderAll(); saveState(state);
      } catch(e){ toast('Import failed'); }
    });
  };
  input.click();
};

const initTabs = () => {
  qsa('.tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      qsa('.tab').forEach(t=>t.classList.remove('is-active'));
      qsa('.panel').forEach(p=>p.classList.add('is-hidden'));
      tab.classList.add('is-active');
      qs(`.panel[data-panel="${tab.dataset.tab}"]`).classList.remove('is-hidden');
    });
  });
};

const setupEvents = () => {
  $('#btnGenerate').addEventListener('click', ()=>{
    const names = sanitizeNames($('#names').value);
    if(names.length<2) return toast('Need at least 2 participants');
    if(names.length>256) toast('Large bracket — compact view recommended');
    buildStateFromInputs();
  });
  $('#btnRegen').addEventListener('click', ()=>{
    if(!confirm('Regenerate bracket? This will clear results.')) return;
    buildStateFromInputs();
  });
  $('#btnReset').addEventListener('click', ()=>{
    if(!confirm('Reset everything?')) return;
    clearState(); state = clone(defaults); renderAll();
  });
  $('#btnLoadSample').addEventListener('click', ()=>{ $('#names').value = sampleNames(); toast('Sample loaded'); });
  $('#btnExport').addEventListener('click', ()=> downloadJson(state));
  $('#btnCopy').addEventListener('click', ()=> copyText(JSON.stringify(state)) );
  $('#btnImport').addEventListener('click', importJson);
  $('#btnPrint').addEventListener('click', ()=>window.print());
  $('#btnClearResults').addEventListener('click', ()=>{ pushHistory(); clearAll(state.matches); renderAll(); saveState(state); });
  $('#btnCoin').addEventListener('click', ()=> toast(coinFlip()));
  $('#btnShuffle').addEventListener('click', ()=>{ $('#tSeeding').value='random'; toast('Seeding will randomize on next generation'); });
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnCompact').addEventListener('click', ()=>{ state.compact=!state.compact; renderAll(); saveState(state); });
  $('#btnZoomIn').addEventListener('click', ()=>{ state.zoom=Math.min((state.zoom||1)+0.1,2); renderAll(); });
  $('#btnZoomOut').addEventListener('click', ()=>{ state.zoom=Math.max((state.zoom||1)-0.1,0.5); renderAll(); });
  $('#themeSelect').addEventListener('change', ()=>{ applyTheme($('#themeSelect').value); });
  $('#btnExportPng').addEventListener('click', ()=> exportPng($('#bracket'), state.title||'tournament'));
  $('#btnExportPdf').addEventListener('click', ()=> exportPdf($('#bracket'), state.title||'tournament'));
  $('#btnCopyRoom').addEventListener('click', ()=>{
    if(!supa.getRoom()) return toast('No room');
    copyText(`${location.href.split('#')[0]}#room=${supa.getRoom()}`);
  });
  $('#searchInput').addEventListener('input', debounce(()=>{
    const q = $('#searchInput').value.toLowerCase();
    qsa('.match').forEach(m=>{
      const has = qsa('.name', m).some(n=>n.textContent.toLowerCase().includes(q));
      m.style.opacity = q ? (has?1:0.3) : 1;
    });
  }, 200));
  $('#btnCreateRoom').addEventListener('click', async ()=>{
    try{
      supa.configure($('#sbUrl').value, $('#sbKey').value);
      const res = await supa.createRoom(state.title || 'Bracket', state);
      toast(`Room ${res.room} created`);
      $('#roomStatus').textContent = `Room ${res.room} active`;
    }catch(e){ toast('Room creation failed'); }
  });
  $('#btnJoinRoom').addEventListener('click', async ()=>{
    try{
      supa.configure($('#sbUrl').value, $('#sbKey').value);
      const data = await supa.joinRoom($('#roomCode').value.trim());
      if(data){ state = { ...state, ...data }; renderAll(); toast('Room joined'); }
    }catch(e){ toast('Join failed'); }
  });
  $('#btnLeaveRoom').addEventListener('click', ()=>{ supa.leaveRoom(); toast('Disconnected'); });
};

const hydrate = () => {
  const saved = loadState();
  if(saved){ state = { ...state, ...saved }; }
  renderAll();
};

initTabs();
setupEvents();
hydrate();
