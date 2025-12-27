import { toast } from './utils.js';

let client = null;
let currentRoom = null;
let ownerToken = null;

export const configure = (url, key) => {
  if(!url || !key){ client=null; return; }
  client = window.supabase ? window.supabase.createClient(url, key) : null;
};

export const hasClient = () => !!client;
export const getRoom = () => currentRoom;

export const createRoom = async (title, state) => {
  if(!client) throw new Error('Supabase not configured');
  ownerToken = crypto.randomUUID();
  const code = Math.random().toString(36).slice(2,8);
  const { error, data } = await client.from('rooms').insert({ room_code: code, title, format: state.format, state_json: state, owner_token_hash: await hash(ownerToken), version: state.version || 1 }).select().single();
  if(error) throw error;
  currentRoom = data.room_code;
  localStorage.setItem('t_room_owner', ownerToken);
  toast('Room created');
  return { room: data.room_code, ownerToken };
};

export const joinRoom = async (code) => {
  if(!client) throw new Error('Supabase not configured');
  const { data, error } = await client.from('rooms').select('*').eq('room_code', code).single();
  if(error) throw error;
  currentRoom = data.room_code;
  return data.state_json;
};

export const leaveRoom = () => { currentRoom=null; };

export const syncState = async (state) => {
  if(!client || !currentRoom) return;
  const token = ownerToken || localStorage.getItem('t_room_owner');
  const hashToken = token ? await hash(token) : '';
  await client.from('rooms').update({ state_json: state, version: (state.version||1)+1 }).eq('room_code', currentRoom).eq('owner_token_hash', hashToken);
};

export const subscribeRoom = (code, onUpdate) => {
  if(!client) return null;
  return client.channel(`room-${code}`).on('postgres_changes', { event:'UPDATE', schema:'public', table:'rooms', filter:`room_code=eq.${code}` }, (payload)=>{
    onUpdate(payload.new.state_json);
  }).subscribe();
};

async function hash(str){
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
