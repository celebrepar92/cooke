
// Estado
const speakers = new Map(); // key -> {letter, name, role}
const segments = [];        // {letter, name, role, text}
let pendingEnter = false;
let activePlayer = null;    // 'video' | 'audio' | 'youtube'
let ytPlayer = null;        // YT.Player
let ytReady = false;
let fileObjectURL = null;   // cleanup
const STORAGE_KEY = 'divisor_proyecto_v2';

// Helpers DOM
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1500) }

// ---------- Autosave ----------
function saveState(){
  const data = {
    speakers: Array.from(speakers.values()),
    segments,
    remaining: $('#work')?.value || '',
    exportedAt: new Date().toISOString()
  };
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch{}
}
let saveTimer = null;
function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 400); }
window.addEventListener('beforeunload', saveState);

// ---------- Legend (recordatorio letras) ----------
function renderLegend(){
  const box = $('#legend'); if(!box) return;
  box.innerHTML = '';
  const list = Array.from(speakers.values()).sort((a,b)=> a.letter.localeCompare(b.letter));
  for(const s of list){
    const chip = document.createElement('div'); chip.className='chip';
    const init = document.createElement('span'); init.className='initial'; init.textContent = s.letter;
    const txt = document.createElement('span'); txt.textContent = s.letter==='E' ? 'Entrevistador' : `${s.name}${s.role? ' — '+s.role:''}`;
    chip.append(init, txt); box.appendChild(chip);
  }
}

// ---------- Speakers (tabla, letra fija) ----------
function upsertSpeaker(letter, name, role){
  const L = letter.toUpperCase();
  speakers.set(L, {letter:L, name:name.trim(), role: (L==='E'? '': (role||'').trim())});
  renderSpeakers(); renderLegend(); scheduleSave();
}
function removeSpeaker(letter){ speakers.delete(letter.toUpperCase()); renderSpeakers(); renderLegend(); scheduleSave(); }

function nextAvailableLetter(){
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l=> l!=='E' && !speakers.has(l));
  return letters[0] || null;
}

function renderSpeakers(){
  const tbody = $('#speakers-tbody');
  tbody.innerHTML = '';

  const entries = Array.from(speakers.values()).sort((a,b)=> a.letter==='E'?-1 : b.letter==='E'?1 : a.letter.localeCompare(b.letter));
  for(const s of entries){
    const tr = document.createElement('tr');

    // Letra (no editable)
    const tdL = document.createElement('td'); tdL.className='initial-cell'; tdL.textContent = s.letter;
    // Nombre
    const tdN = document.createElement('td'); const name = document.createElement('input'); name.type='text'; name.value = s.letter==='E'?'Entrevistador': s.name; name.placeholder='Nombre y apellido';
    if(s.letter==='E'){ name.disabled=true; name.title='Fijo' }
    name.addEventListener('input', ()=>{ s.name = s.letter==='E'?'Entrevistador': name.value; renderLegend(); scheduleSave(); });
    tdN.appendChild(name);
    // Cargo
    const tdR = document.createElement('td'); const role = document.createElement('input'); role.type='text'; role.value = s.letter==='E'?'': (s.role||''); role.placeholder='Cargo o descripción';
    if(s.letter==='E'){ role.value='(sin cargo)'; role.disabled=true }
    role.addEventListener('input', ()=>{ s.role = s.letter==='E'?'': role.value; renderLegend(); scheduleSave(); });
    tdR.appendChild(role);
    // Acciones
    const tdA = document.createElement('td');
    if(s.letter==='E'){
      const span = document.createElement('span'); span.className='muted'; span.textContent='Fijo'; tdA.appendChild(span);
    }else{
      const del = document.createElement('button'); del.className='btn btn--danger'; del.textContent='Quitar'; del.addEventListener('click', ()=> removeSpeaker(s.letter) );
      tdA.appendChild(del);
    }

    tr.append(tdL, tdN, tdR, tdA); tbody.appendChild(tr);
  }
}

// Default speaker
upsertSpeaker('E','Entrevistador','');

$('#add-speaker').addEventListener('click', ()=>{
  const L = nextAvailableLetter();
  if(!L){ toast('No hay más letras disponibles.'); return; }
  upsertSpeaker(L, 'Nombre', 'Cargo');
});

// Toggle speakers panel
const toggleBtn = $('#toggle-speakers');
const speakersBody = $('#speakers-body');
toggleBtn.addEventListener('click', ()=>{
  const hidden = speakersBody.style.display === 'none';
  speakersBody.style.display = hidden ? '' : 'none';
  toggleBtn.textContent = hidden ? 'Ocultar' : 'Mostrar';
  toggleBtn.setAttribute('aria-expanded', String(hidden));
});

// ---------- Media ----------
const drop = $('#dropzone');
const fileInput = $('#file-media');
const v = $('#video'); const a = $('#audio'); const wrap = $('#player-wrap'); const ytHolder = $('#yt-holder');

function clearActiveMedia(){
  if(activePlayer==='video'){ v.pause(); v.removeAttribute('src'); v.load(); }
  if(activePlayer==='audio'){ a.pause(); a.removeAttribute('src'); a.load(); }
  if(activePlayer==='youtube' && ytPlayer){ try{ ytPlayer.stopVideo(); }catch(e){} }
  if(fileObjectURL){ URL.revokeObjectURL(fileObjectURL); fileObjectURL=null; }
  activePlayer = null; wrap.hidden = true; v.style.display='none'; a.style.display='none'; ytHolder.style.display='none';
}

function setSpeed(rate){
  if(activePlayer==='video'){ v.playbackRate = rate }
  else if(activePlayer==='audio'){ a.playbackRate = rate }
  else if(activePlayer==='youtube' && ytPlayer && ytReady){ try{ ytPlayer.setPlaybackRate(rate); }catch(e){} }
}

function setPlayPause(){
  if(activePlayer==='video'){ if(v.paused) v.play(); else v.pause(); }
  else if(activePlayer==='audio'){ if(a.paused) a.play(); else a.pause(); }
  else if(activePlayer==='youtube' && ytPlayer){ const s = ytPlayer.getPlayerState?.(); if(s!==1) ytPlayer.playVideo(); else ytPlayer.pauseVideo(); }
  else{ toast('No hay medio cargado.'); }
}

function loadMediaFile(file){
  const url = URL.createObjectURL(file); fileObjectURL = url;
  wrap.hidden=false; if(file.type.startsWith('video')){
    v.src = url; v.style.display='block'; a.style.display='none'; ytHolder.style.display='none'; activePlayer='video';
  }else if(file.type.startsWith('audio')){
    a.src = url; a.style.display='block'; v.style.display='none'; ytHolder.style.display='none'; activePlayer='audio';
  }else{ toast('Tipo no soportado.'); return; }
  setSpeed(parseFloat($('#speed').value || '1'));
  scheduleSave();
}

fileInput.addEventListener('change', e=>{ const f = e.target.files[0]; if(f) loadMediaFile(f); e.target.value=''; });
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('drag') }));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('drag') }));
drop.addEventListener('drop', e=>{ const file = e.dataTransfer.files?.[0]; if(file) loadMediaFile(file); });

// YouTube
window.onYouTubeIframeAPIReady = ()=>{ ytReady = true };
function parseYouTubeId(url){
  try{
    const u = new URL(url);
    if(u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if(u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/embed\/([\w-]{6,})/); if(m) return m[1];
  }catch(e){} return null;
}
$('#load-yt').addEventListener('click', ()=>{
  const url = $('#yt-url').value.trim(); const id = parseYouTubeId(url);
  if(!id){ toast('Enlace inválido.'); return; }
  wrap.hidden=false; v.style.display='none'; a.style.display='none'; ytHolder.style.display='block';
  if(ytPlayer){ ytPlayer.loadVideoById(id); }
  else{
    ytPlayer = new YT.Player('yt-player', { videoId:id, playerVars:{ rel:0, modestbranding:1 }, events:{ onReady: ()=>{ ytReady=true; setSpeed(parseFloat($('#speed').value||'1')); } }});
  }
  activePlayer='youtube'; scheduleSave();
});
$('#playpause').addEventListener('click', setPlayPause);
$('#speed').addEventListener('change', e=> setSpeed(parseFloat(e.target.value)) );

// ---------- Editor: Enter + letra ----------
const work = $('#work');
function createSegmentFromCaret(letter){
  const L = letter.toUpperCase();
  if(!speakers.has(L)){ toast(`No hay entrevistado con la letra ${L}.`); return; }
  const s = speakers.get(L);
  const pos = work.selectionStart;
  let text = work.value;
  let prev = text.slice(0, pos).trim();
  let rest = text.slice(pos).replace(/^\s+/,''); // limpia espacios iniciales
  if(!prev){ toast('No hay texto antes del cursor.'); return; }

  // UI: agrega bloque al listado inferior
  const seg = document.createElement('div'); seg.className='segment';
  const h = document.createElement('div'); h.className='seg-h';
  const initial = document.createElement('span'); initial.className='initial'; initial.textContent = s.letter;
  const nm = document.createElement('span'); nm.className='name'; nm.textContent = s.letter==='E' ? 'Entrevistador' : s.name;
  const rl = document.createElement('span'); rl.className='role'; rl.textContent = s.letter==='E' ? '' : (s.role? ` — ${s.role}`: '');
  h.append(initial,nm,rl);
  const ta = document.createElement('textarea'); ta.readOnly = true; ta.value = prev; // inmodificable
  seg.append(h,ta);
  $('#segments').appendChild(seg);
  $('#segments-scroll').scrollTop = $('#segments-scroll').scrollHeight + 9999;

  // estado
  segments.push({letter:s.letter, name:(s.letter==='E'?'Entrevistador': s.name), role:(s.letter==='E'? '': s.role||''), text: prev});

  // Resto vuelve al editor
  work.value = rest;
  work.setSelectionRange(0,0); work.focus();
  scheduleSave();
}

work.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    e.preventDefault(); pendingEnter = true; toast('Presioná la letra del entrevistado…'); return;
  }
  if(pendingEnter && /^[a-zA-Z]$/.test(e.key)){
    e.preventDefault(); createSegmentFromCaret(e.key); pendingEnter=false; return;
  }
  if(pendingEnter){ pendingEnter=false; }
  scheduleSave();
});

// ---------- Export / Import ----------
function download(name, content, mime){
  const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(new Blob([content], {type:mime})); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 800);
}

// TXT: ahora imprime "Nombre (Cargo): texto"
function toTxt(){
  const lines = [];
  // encabezado con mapa de letras
  lines.push('# Mapa de letras');
  for(const s of Array.from(speakers.values()).sort((a,b)=> a.letter.localeCompare(b.letter))){
    const label = s.letter==='E' ? 'Entrevistador' : `${s.name}${s.role? ' — '+s.role:''}`;
    lines.push(`${s.letter} = ${label}`);
  }
  lines.push('');
  lines.push('# Diálogo');
  for(const seg of segments){
    const label = seg.letter==='E' ? 'Entrevistador' : `${seg.name}${seg.role? ' ('+seg.role+')':''}`;
    lines.push(`${label}:`);
    lines.push(seg.text.trim());
    lines.push('---');
  }
  lines.push('');
  lines.push('# Restante');
  lines.push(($('#work').value||'').trim());
  return lines.join('\n');
}

$('#export-json').addEventListener('click', ()=>{
  const data = { speakers: Array.from(speakers.values()), segments, remaining: $('#work').value, exportedAt: new Date().toISOString() };
  download('dialogo.json', JSON.stringify(data, null, 2), 'application/json');
});
$('#export-txt').addEventListener('click', ()=>{
  download('dialogo.txt', toTxt(), 'text/plain');
});

$('#import-any').addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return; const text = await file.text();
  if(file.name.endsWith('.json')){ try{ loadProjectFromJSON(JSON.parse(text)); toast('JSON importado.'); }catch{ toast('JSON inválido.'); } }
  else{ try{ loadProjectFromTXT(text); toast('TXT importado.'); }catch{ toast('TXT inválido.'); } }
  e.target.value='';
});

function clearSegmentsUI(){ $('#segments').innerHTML=''; segments.length = 0; }
function loadProjectFromJSON(data){
  speakers.clear(); upsertSpeaker('E','Entrevistador','');
  for(const s of (data.speakers||[])){
    if(!s.letter || s.letter==='E') continue; upsertSpeaker(s.letter, s.name||('Invitado '+s.letter), s.role||'');
  }
  clearSegmentsUI();
  if(Array.isArray(data.segments)){
    for(const s of data.segments){
      const L = (s.letter||'').toUpperCase(); const name=s.name|| (L==='E'?'Entrevistador': 'Invitado '+L); const role = L==='E'? '' : (s.role||'');
      segments.push({letter:L, name, role, text: s.text||''});
      const seg = document.createElement('div'); seg.className='segment';
      const h = document.createElement('div'); h.className='seg-h';
      h.innerHTML = `<span class="initial">${L}</span><span class="name">${name}</span><span class="role">${L==='E'?'': (role? ' — '+role:'')}</span>`;
      const ta = document.createElement('textarea'); ta.readOnly=true; ta.value=s.text||''; seg.append(h,ta); $('#segments').appendChild(seg);
    }
  }
  $('#work').value = data.remaining||''; renderSpeakers(); renderLegend(); scheduleSave();
}
function loadProjectFromTXT(txt){
  const sections = { map:'', dialog:'', remaining:'' }; let cur = 'map';
  for(const line of txt.split(/\r?\n/)){
    if(line.trim()==='# Mapa de letras'){ cur='map'; continue }
    if(line.trim()==='# Diálogo'){ cur='dialog'; continue }
    if(line.trim()==='# Restante'){ cur='remaining'; continue }
    sections[cur] += line + '\n';
  }
  // reconstruir speakers a partir del mapa si existe, si no mantener los que vengan en dialog
  speakers.clear(); upsertSpeaker('E','Entrevistador','');
  const mapLines = sections.map.split(/\r?\n/).filter(Boolean);
  const usedLetters = new Set(['E']);
  for(const L of mapLines){
    const m = L.match(/^([A-Z])\s*=\s*(.+)$/); if(!m) continue;
    const letter = m[1].toUpperCase(); if(letter==='E'){ continue; }
    const rest = m[2].trim();
    let name = rest; let role = '';
    const roleMatch = rest.match(/\(([^)]+)\)$/);
    if(roleMatch){ role = roleMatch[1]; name = rest.replace(/\s*\([^)]*\)\s*$/,'').trim(); }
    upsertSpeaker(letter, name, role);
    usedLetters.add(letter);
  }
  // Dialog
  clearSegmentsUI();
  const blocks = sections.dialog.split(/\n---\s*/).map(b=>b.trim()).filter(Boolean);
  for(const b of blocks){
    const lines = b.split(/\r?\n/).filter(Boolean);
    if(!lines.length) continue;
    const header = lines.shift(); // Ej: Nombre (Cargo):
    const m = header.match(/^(.+?):\s*$/);
    let name = 'Invitado'; let role=''; let letter='';
    if(m){ // intentar mapear por nombre a una letra conocida
      const label = m[1].trim();
      // comprobar si es Entrevistador
      if(label.toLowerCase().startsWith('entrevistador')) { letter = 'E'; name = 'Entrevistador'; role=''; }
      else{
        // buscar en speakers por name
        const found = Array.from(speakers.values()).find(s => label === `${s.name}${s.role? ' ('+s.role+')':''}` || label === s.name);
        if(found){ letter = found.letter; name = found.name; role = found.role; }
        else{ // asignar nueva letra si hay
          const L = nextAvailableLetter(); letter = L||'Z';
          // intentar separar cargo si viene entre paréntesis
          const rm = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
          if(rm){ name = rm[1].trim(); role = rm[2].trim(); } else { name = label; role=''; }
          upsertSpeaker(letter, name, role);
        }
      }
    }
    const text = lines.join('\n');
    segments.push({letter, name, role, text});
    const seg = document.createElement('div'); seg.className='segment';
    const h = document.createElement('div'); h.className='seg-h'; h.innerHTML = `<span class="initial">${letter}</span><span class="name">${name}</span><span class="role">${letter==='E'?'': (role? ' — '+role:'')}</span>`;
    const ta = document.createElement('textarea'); ta.readOnly=true; ta.value=text; seg.append(h,ta); $('#segments').appendChild(seg);
  }
  $('#work').value = sections.remaining.trim(); renderSpeakers(); renderLegend(); scheduleSave();
}

// Cargar estado previo si existe
(function loadFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    loadProjectFromJSON(data);
    toast('Proyecto restaurado automáticamente.');
  }catch{}
})();

// Eliminar todo
$('#clear-all').addEventListener('click', ()=>{
  if(!confirm('¿Eliminar todo? Esto borrará bloques, editor y medios.')) return;
  $('#segments').innerHTML=''; segments.length = 0;
  $('#work').value=''; $('#yt-url').value=''; clearActiveMedia();
  // reset speakers a solo entrevistador
  speakers.clear(); upsertSpeaker('E','Entrevistador','');
  renderLegend();
  scheduleSave();
  toast('Proyecto vaciado.');
});

// Barra espaciadora: play/pause si no estás escribiendo (o con Shift+Space siempre)
addEventListener('keydown', (e)=>{
  const isForm = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
  if(e.code==='Space' && (!isForm || e.shiftKey)){
    e.preventDefault(); setPlayPause();
  }
});
