import { nextPow2, uid } from './utils.js';

export const createParticipants = (names, seeding='as_entered') => {
  const list = names.map((name,i)=>({ id:uid(), name, seed:i+1 }));
  if(seeding==='random'){
    for(let i=list.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [list[i],list[j]]=[list[j],list[i]];
    }
    list.forEach((p,i)=>p.seed=i+1);
  }
  return list;
};

const createMatch = (round, index, a, b, defaults={}) => ({
  id:uid(),
  round,
  index,
  a: a ? { ...a, score:null } : null,
  b: b ? { ...b, score:null } : null,
  winner:null,
  status:'empty',
  time: defaults.time || '',
  location: defaults.location || '',
  notes: defaults.notes || '',
  bestOf: defaults.bestOf || 1,
  auto:false,
});

export const buildSingleElim = (participants, opts) => {
  const size = nextPow2(participants.length);
  const byesNeeded = size - participants.length;
  const filled = [...participants];
  const byeLabel = opts.byeMode==='end' ? 'BYE' : 'BYE';
  for(let i=0;i<byesNeeded;i++){ filled.push({ id: `bye-${i}`, name: byeLabel, seed: participants.length + i + 1, bye:true }); }

  const rounds = Math.log2(size);
  const matches = [];
  let current = [];
  for(let i=0;i<size;i+=2){
    const m = createMatch(1, i/2, filled[i], filled[i+1], { ...opts.defaults, bestOf: opts.bestOf });
    if(m.a?.bye || m.b?.bye){
      const winner = m.a?.bye ? m.b : m.a;
      m.winner = winner?.id || null;
      m.winnerName = winner?.name || 'BYE';
      m.auto = true;
      m.status = 'completed';
    }
    current.push(m);
    matches.push(m);
  }
  for(let r=2;r<=rounds;r++){
    const prev = current;
    current = [];
    for(let i=0;i<prev.length;i+=2){
      const m = createMatch(r, i/2, { id: prev[i].id, placeholder:true }, { id: prev[i+1].id, placeholder:true }, { ...opts.defaults, bestOf: opts.bestOf });
      current.push(m);
      matches.push(m);
    }
  }
  if(opts.thirdPlace && size>2){
    const lastRound = rounds;
    const losers = createMatch(lastRound, '3rd', { id:'loser-upper', placeholder:true }, { id:'loser-lower', placeholder:true }, { ...opts.defaults, bestOf: opts.bestOf });
    losers.round = rounds; // show with finals
    matches.push(losers);
  }
  return { rounds, size, matches };
};

const propagate = (matches) => {
  const map = new Map(matches.map(m=>[m.id,m]));
  const byRound = matches.reduce((acc,m)=>{
    (acc[m.round] = acc[m.round] || []).push(m);
    return acc;
  },{});
  const maxRound = Math.max(...matches.map(m=>m.round));
  for(let r=2;r<=maxRound;r++){
    const prevRound = byRound[r-1] || [];
    const curRound = byRound[r] || [];
    curRound.forEach((m,i)=>{
      const sourceA = prevRound[i*2];
      const sourceB = prevRound[i*2+1];
      if(sourceA){
        m.a = { id: sourceA.winner || sourceA.id, name: resolveName(sourceA, map) };
      }
      if(sourceB){
        m.b = { id: sourceB.winner || sourceB.id, name: resolveName(sourceB, map) };
      }
      if(m.winner && m.winner!==m.a?.id && m.winner!==m.b?.id){
        m.winner = null; m.status = 'pending';
      }
    });
  }
};

export const normalizeLinks = (matches) => propagate(matches);

const resolveName = (match, map) => {
  if(match.winner){
    const contestant = match.winner===match.a?.id ? match.a : match.b;
    return contestant?.name || 'TBD';
  }
  if(match.a?.placeholder && map.has(match.a.id)) return map.get(match.a.id).winnerName || 'TBD';
  if(match.b?.placeholder && map.has(match.b.id)) return map.get(match.b.id).winnerName || 'TBD';
  return match.a?.name || match.b?.name || 'TBD';
};

export const applyWinner = (matches, matchId, side) => {
  const target = matches.find(m=>m.id===matchId);
  if(!target) return;
  const winner = side==='a' ? target.a : target.b;
  if(!winner) return;
  target.winner = winner.id;
  target.status = 'completed';
  target.winnerName = winner.name;
  propagate(matches);
};

export const clearMatch = (matches, matchId) => {
  const target = matches.find(m=>m.id===matchId);
  if(!target) return;
  target.winner=null; target.status= target.a||target.b ? 'pending':'empty'; target.winnerName='';
  target.a && (target.a.score=null); target.b && (target.b.score=null);
  propagate(matches);
};

export const clearAll = (matches) => {
  matches.forEach(m=>{ m.winner=null; m.status=m.a||m.b?'pending':'empty'; m.winnerName=''; if(m.a) m.a.score=null; if(m.b) m.b.score=null; });
  propagate(matches);
};

export const updateScore = (matches, matchId, side, value) => {
  const target = matches.find(m=>m.id===matchId);
  if(!target) return;
  const slot = side==='a'?target.a:target.b;
  if(!slot) return;
  slot.score = value;
};

export const describeRound = (r, total) => {
  if(r===total) return 'Final';
  if(r===total-1) return 'Semifinal';
  return `Round ${r}`;
};

export const formatMatchesByRound = (matches) => {
  const grouped = {};
  matches.forEach(m=>{
    (grouped[m.round] = grouped[m.round] || []).push(m);
  });
  Object.values(grouped).forEach(list=>list.sort((a,b)=>a.index>b.index?1:-1));
  return Object.entries(grouped).sort((a,b)=>Number(a[0])-Number(b[0]));
};
