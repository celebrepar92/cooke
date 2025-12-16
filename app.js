// Estado
const speakers = new Map(); // key -> {letter, name, role}
const segments = [];        // {letter, name, role, text}
let context = '';           // Nuevo estado para el contexto
let pendingEnter = false;
let activePlayer = null;    // 'video' | 'audio' | 'youtube'
let ytPlayer = null;        // YT.Player
let ytReady = false;
let fileObjectURL = null;   // cleanup
const STORAGE_KEY = 'divisor_proyecto_v2';

// Helpers DOM
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
// Clases de toast: usa fondo P8-Yellow y texto P8-Black (remapeadas a Primary/BG)
const toast = msg => { 
  const t = $('#toast'); 
  t.textContent = msg; 
  // Aplicar clases PICO-8 para el toast (remapeadas en index.html)
  t.classList.add('bg-p8-yellow', 'text-p8-black', 'border-p8-red'); 
  t.classList.add('opacity-100', 'translate-y-[-4px]'); 
  setTimeout(()=>t.classList.remove('opacity-100', 'translate-y-[-4px]'), 1500) 
}

// ---------- Autosave ----------
function saveState(){
  const data = {
    context: $('#context')?.value || '', // Guardar el nuevo campo
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
    // TUI classes for chip (gap-1 for compactness)
    const chip = document.createElement('div'); chip.className='chip flex gap-1 items-center text-xs'; 
    const init = document.createElement('span'); init.className='initial font-bold text-xs'; init.textContent = s.letter;
    const txt = document.createElement('span'); txt.textContent = s.letter==='E' ? 'ENTREVISTADOR' : `${s.name}${s.role? ' — '+s.role:''}`;
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
    tr.className = 'hover:bg-[#111111] transition duration-100'; // Card hover (compact)

    // Letra (no editable) - text-text (White TUI mapped)
    const tdL = document.createElement('td'); tdL.className='border border-border p-2 font-bold text-sm bg-surface text-text'; tdL.textContent = s.letter;
    // Nombre - Input content: text-content (White TUI mapped)
    const tdN = document.createElement('td'); tdN.className='border border-border p-2 bg-surface';
    const name = document.createElement('input'); name.type='text'; name.value = s.letter==='E'?'ENTREVISTADOR': s.name.toUpperCase(); name.placeholder='NOMBRE Y APELLIDO';
    // TUI input classes (p-2 is compact)
    name.className = 'w-full bg-card text-content border border-border p-2 text-sm focus:ring-0 focus:border-primary';
    if(s.letter==='E'){ name.disabled=true; name.title='Fijo' }
    name.addEventListener('input', ()=>{ s.name = s.letter==='E'?'ENTREVISTADOR': name.value.toUpperCase(); renderLegend(); scheduleSave(); });
    tdN.appendChild(name);
    // Cargo - Input content: text-content (White TUI mapped)
    const tdR = document.createElement('td'); tdR.className='border border-border p-2 bg-surface';
    const role = document.createElement('input'); role.type='text'; role.value = s.letter==='E'?'': (s.role||'').toUpperCase(); role.placeholder='CARGO O DESCRIPCIÓN';
    // TUI input classes (p-2 is compact)
    role.className = 'w-full bg-card text-content border border-border p-2 text-sm focus:ring-0 focus:border-primary';
    if(s.letter==='E'){ role.value='(SIN CARGO)'; role.disabled=true }
    role.addEventListener('input', ()=>{ s.role = s.letter==='E'?'': role.value.toUpperCase(); renderLegend(); scheduleSave(); });
    tdR.appendChild(role);
    // Acciones
    const tdA = document.createElement('td'); tdA.className='border border-border p-2 bg-surface';
    if(s.letter==='E'){
      const span = document.createElement('span'); span.className='text-muted text-sm'; span.textContent='FIJO'; tdA.appendChild(span);
    }else{
      const del = document.createElement('button'); del.className='px-2 py-1 text-xs font-semibold btn btn-danger'; del.textContent='QUITAR'; del.addEventListener('click', ()=> removeSpeaker(s.letter) );
      tdA.appendChild(del);
    }

    tr.append(tdL, tdN, tdR, tdA); tbody.appendChild(tr);
  }
}

// Default speaker
upsertSpeaker('E','ENTREVISTADOR','');

$('#add-speaker').addEventListener('click', ()=>{
  const L = nextAvailableLetter();
  if(!L){ toast('NO HAY MÁS LETRAS DISPONIBLES.'); return; }
  upsertSpeaker(L, 'NOMBRE', 'CARGO');
});

// ---------- Panel Speakers / Context / Hide All Logic ----------
const toggleBtn = $('#toggle-speakers');
const speakersBody = $('#speakers-body');
const contextBody = $('#context-body');
const toggleContextBtn = $('#toggle-context');
const hideAllBtn = $('#hide-all');

// Initial state for Context (hidden by default)
let contextHidden = true; 
// Initial state for Speakers (visible by default)
let speakersHidden = false;

function updateHideAllButton(){
  const allHidden = contextHidden && speakersHidden;
  hideAllBtn.textContent = allHidden ? 'MOSTRAR TODO' : 'OCULTAR';
}

// Toggle speakers panel
toggleBtn.addEventListener('click', ()=>{
  speakersHidden = !speakersHidden;
  speakersBody.style.display = speakersHidden ? 'none' : '';
  toggleBtn.textContent = speakersHidden ? 'MOSTRAR' : 'OCULTAR';
  toggleBtn.setAttribute('aria-expanded', String(!speakersHidden));
  updateHideAllButton();
});

// Toggle context panel
toggleContextBtn.addEventListener('click', ()=>{
  contextHidden = !contextHidden;
  contextBody.style.display = contextHidden ? 'none' : '';
  toggleContextBtn.textContent = contextHidden ? 'MOSTRAR' : 'OCULTAR';
  toggleContextBtn.setAttribute('aria-expanded', String(!contextHidden));
  updateHideAllButton();
});

// Hide All / Show All logic
hideAllBtn.addEventListener('click', ()=>{
  const currentState = contextHidden && speakersHidden;
  const newState = !currentState;
  const display = newState ? 'none' : '';
  const btnText = newState ? 'MOSTRAR' : 'OCULTAR';
  const ariaExpanded = String(!newState);
  
  // Speakers
  speakersHidden = newState;
  speakersBody.style.display = display;
  toggleBtn.textContent = btnText;
  toggleBtn.setAttribute('aria-expanded', ariaExpanded);

  // Context
  contextHidden = newState;
  contextBody.style.display = display;
  toggleContextBtn.textContent = btnText;
  toggleContextBtn.setAttribute('aria-expanded', ariaExpanded);

  updateHideAllButton();
});


// Context input save
const contextTextarea = $('#context');
contextTextarea.addEventListener('input', scheduleSave);


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
  else{ toast('NO HAY MEDIO CARGADO.'); }
}

function loadMediaFile(file){
  const url = URL.createObjectURL(file); fileObjectURL = url;
  wrap.hidden=false; if(file.type.startsWith('video')){
    v.src = url; v.style.display='block'; a.style.display='none'; ytHolder.style.display='none'; activePlayer='video';
  }else if(file.type.startsWith('audio')){
    a.src = url; a.style.display='block'; v.style.display='none'; ytHolder.style.display='none'; activePlayer='audio';
  }else{ toast('TIPO NO SOPORTADO.'); return; }
  setSpeed(parseFloat($('#speed').value || '1'));
  scheduleSave();
}

fileInput.addEventListener('change', e=>{ const f = e.target.files[0]; if(f) loadMediaFile(f); e.target.value=''; });
// Classes updated for drag/drop (using border color)
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('outline-border') }));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('outline-border') }));
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
  if(!id){ toast('ENLACE INVÁLIDO.'); return; }
  wrap.hidden=false; v.style.display='none'; a.style.display='none'; ytHolder.style.display='block';
  if(ytPlayer){ ytPlayer.loadVideoById(id); }
  else{
    ytPlayer = new YT.Player('yt-player', { videoId:id, playerVars:{ rel:0, modestbranding:1 }, events:{ onReady: ()=>{ ytReady=true; setSpeed(parseFloat($('#speed').value||'1')); } }});
  }
  activePlayer='youtube'; scheduleSave();
});
$('#playpause').addEventListener('click', setPlayPause);
$('#speed').addEventListener('change', e=> setSpeed(parseFloat(e.target.value)) );

// ---------- Segmentos: Editar y cambiar orador ----------

// Genera las opciones para el select de oradores
function getSpeakerSelectOptions(currentLetter) {
  let options = '';
  const list = Array.from(speakers.values()).sort((a,b)=> a.letter.localeCompare(b.letter));
  for(const s of list){
    const selected = s.letter === currentLetter ? 'selected' : '';
    options += `<option value="${s.letter}" ${selected}>${s.letter} - ${s.name} ${s.role? ' ('+s.role+')': ''}</option>`;
  }
  return options;
}

// Actualiza el segmento en el array y en la UI tras un cambio de letra/texto
function updateSegment(index, newLetter, newText){
  if(index < 0 || index >= segments.length) return;
  const s = speakers.get(newLetter.toUpperCase());
  if(!s){ toast('LETRA DE ORADOR NO ENCONTRADA.'); return; }

  segments[index] = {
    letter: s.letter,
    name: s.letter==='E'?'ENTREVISTADOR': s.name.toUpperCase(),
    role: s.letter==='E'? '': s.role||'',
    text: newText,
  };

  // Re-renderizar el encabezado del segmento
  const segDiv = $$('#segments .segment')[index];
  if(segDiv){
    const h = segDiv.querySelector('.seg-h');
    const initialSpan = h.querySelector('.initial');
    const nameSpan = h.querySelector('.name');
    const roleSpan = h.querySelector('.role');
    
    initialSpan.textContent = s.letter;
    nameSpan.textContent = s.letter==='E'?'ENTREVISTADOR': s.name;
    roleSpan.textContent = s.letter==='E'?'': (s.role? ` — ${s.role}`:'');
    
    // Asegurar que el select refleje el nuevo valor
    const speakerSelect = h.querySelector('.speaker-select');
    if(speakerSelect) speakerSelect.value = s.letter;
    
    // Si se actualiza el texto (p.ej. desde un JSON/TXT cargado)
    const ta = segDiv.querySelector('textarea');
    if(ta) ta.value = newText;
  }
  scheduleSave();
}

// Función para renderizar un segmento (usada en creación y carga)
function renderSegment(seg, index){
  // TUI classes for segment: 'panel' is removed, relying on #segments .segment CSS
  const segDiv = document.createElement('div'); segDiv.className='segment border-border p-3 mb-2.5';

  const h = document.createElement('div'); h.className='seg-h flex items-center gap-2 text-sm text-text mb-2';

  // Speaker Initial and Name/Role
  const initial = document.createElement('span'); initial.className='initial font-bold text-xs'; initial.textContent = seg.letter;
  const nm = document.createElement('span'); nm.className='name font-bold text-content'; nm.textContent = seg.name; 
  const rl = document.createElement('span'); rl.className='role text-muted text-sm'; rl.textContent = seg.role? ` — ${seg.role}`: '';
  h.append(initial, nm, rl);

  // Speaker Change Select
  const speakerSelect = document.createElement('select');
  // TUI select classes (compact p-1, text-xs)
  speakerSelect.className='speaker-select bg-card border border-border text-xs p-1 ml-auto text-content';
  speakerSelect.innerHTML = getSpeakerSelectOptions(seg.letter);
  speakerSelect.setAttribute('data-index', index);
  speakerSelect.addEventListener('change', (e)=>{
    const newLetter = e.target.value;
    const currentText = segDiv.querySelector('textarea').value;
    updateSegment(index, newLetter, currentText);
  });
  h.appendChild(speakerSelect);

  // Editable Textarea
  const ta = document.createElement('textarea');
  // TUI textarea classes (compact p-2)
  ta.className = 'w-full min-h-[68px] resize-y bg-card border border-border p-2 text-sm text-content focus:ring-0 focus:border-primary';
  ta.value = seg.text;
  ta.setAttribute('data-index', index);
  ta.addEventListener('input', (e)=>{
    // Actualiza el texto directamente en el array de estado
    segments[index].text = e.target.value;
    scheduleSave();
  });

  segDiv.append(h, ta);
  $('#segments').appendChild(segDiv);
}

// ---------- Editor: Enter + letra ----------
const work = $('#work');
function createSegmentFromCaret(letter){
  const L = letter.toUpperCase();
  if(!speakers.has(L)){ toast(`NO HAY ENTREVISTADO CON LA LETRA ${L}.`); return; }
  const s = speakers.get(L);
  const pos = work.selectionStart;
  let text = work.value;
  let prev = text.slice(0, pos).trim();
  let rest = text.slice(pos).replace(/^\s+/,''); // limpia espacios iniciales
  if(!prev){ toast('NO HAY TEXTO ANTES DEL CURSOR.'); return; }

  // estado
  const newSegment = {letter:s.letter, name:(s.letter==='E'?'ENTREVISTADOR': s.name.toUpperCase()), role:(s.letter==='E'? '': s.role||''), text: prev};
  segments.push(newSegment);
  const newIndex = segments.length - 1;

  // UI: agrega bloque al listado inferior
  renderSegment(newSegment, newIndex);
  $('#segments-scroll').scrollTop = $('#segments-scroll').scrollHeight + 9999;

  // Resto vuelve al editor
  work.value = rest;
  work.setSelectionRange(0,0); work.focus();
  scheduleSave();
}

work.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    e.preventDefault(); pendingEnter = true; toast('PRESIONÁ LA LETRA DEL ENTREVISTADO…'); return;
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

// TXT: ahora imprime Contexto, luego Mapa, luego Diálogo, y Restante
function toTxt(){
  const lines = [];

  // 1. Contexto
  lines.push('# CONTEXTO DE LA ENTREVISTA');
  lines.push(($('#context').value||'').trim());
  lines.push('');

  // 2. Mapa de letras
  lines.push('# MAPA DE LETRAS');
  for(const s of Array.from(speakers.values()).sort((a,b)=> a.letter.localeCompare(b.letter))){
    const label = s.letter==='E' ? 'ENTREVISTADOR' : `${s.name.toUpperCase()}${s.role? ' — '+s.role.toUpperCase():''}`;
    lines.push(`${s.letter} = ${label}`);
  }
  lines.push('');

  // 3. Diálogo
  lines.push('# DIÁLOGO');
  for(const seg of segments){
    const label = seg.letter==='E' ? 'ENTREVISTADOR' : `${seg.name}${seg.role? ' ('+seg.role+')':''}`;
    lines.push(`${label.toUpperCase()}:`);
    lines.push(seg.text.trim());
    lines.push('---');
  }
  lines.push('');

  // 4. Restante
  lines.push('# RESTANTE');
  lines.push(($('#work').value||'').trim());
  return lines.join('\n');
}

// Botón para Copiar TXT al portapapeles
$('#copy-txt').addEventListener('click', ()=>{
  const content = toTxt();
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(content).then(()=>{
      toast('COPIADO AL PORTAPAPELES.');
    }).catch(err => {
      console.error('Error al copiar: ', err);
      toast('NO SE PUDO COPIAR.');
    });
  } else {
    // Fallback: usar textarea temporal para el portapapeles (menos ideal)
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = content;
    document.body.appendChild(tempTextArea);
    tempTextArea.focus();
    tempTextArea.select();
    try {
      document.execCommand('copy');
      toast('COPIADO AL PORTAPAPELES.');
    } catch (err) {
      toast('NO SE PUDO COPIAR. SELECCIONA MANUALMENTE.');
    }
    document.body.removeChild(tempTextArea);
  }
});

// Botón para Descargar TXT
$('#export-txt').addEventListener('click', ()=>{
  download('dialogo.txt', toTxt(), 'text/plain');
});

$('#import-any').addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return; const text = await file.text();
  if(file.name.endsWith('.json')){ try{ loadProjectFromJSON(JSON.parse(text)); toast('JSON IMPORTADO.'); }catch{ toast('JSON INVÁLIDO.'); } }
  else{ try{ loadProjectFromTXT(text); toast('TXT IMPORTADO.'); }catch{ toast('TXT INVÁLIDO.'); } }
  e.target.value='';
});

function clearSegmentsUI(){ $('#segments').innerHTML=''; segments.length = 0; }
function loadProjectFromJSON(data){
  // Cargar Contexto
  context = data.context || '';
  $('#context').value = context;

  speakers.clear(); upsertSpeaker('E','ENTREVISTADOR','');
  for(const s of (data.speakers||[])){
    if(!s.letter || s.letter==='E') continue; upsertSpeaker(s.letter, s.name||('INVITADO '+s.letter), s.role||'');
  }
  
  clearSegmentsUI();
  if(Array.isArray(data.segments)){
    for(let i=0; i < data.segments.length; i++){
      const s = data.segments[i];
      const L = (s.letter||'').toUpperCase(); 
      // Asegurar que el orador exista
      if(!speakers.has(L)){
        const name = s.name|| (L==='E'?'ENTREVISTADOR': 'INVITADO '+L);
        const role = L==='E'? '' : (s.role||'');
        upsertSpeaker(L, name, role);
      }
      
      const speakerData = speakers.get(L);
      const name = speakerData.name;
      const role = speakerData.role;

      const newSegment = {letter:L, name, role, text: s.text||''};
      segments.push(newSegment);
      renderSegment(newSegment, i);
    }
  }
  $('#work').value = data.remaining||''; renderSpeakers(); renderLegend(); scheduleSave();
  
  // Después de cargar el estado, forzar que el Contexto esté oculto si no se cargó un estado que lo muestre (esto es opcional, pero mantiene el comportamiento por defecto)
  contextHidden = true; // El estado cargado tiene prioridad, pero si no existe, se mantiene la lógica
  contextBody.style.display = 'none';
  toggleContextBtn.textContent = 'MOSTRAR';
  toggleContextBtn.setAttribute('aria-expanded', 'false');
  updateHideAllButton();
}
function loadProjectFromTXT(txt){
  const sections = { context:'', map:'', dialog:'', remaining:'' }; let cur = '';
  for(const line of txt.split(/\r?\n/)){
    if(line.trim()==='# CONTEXTO DE LA ENTREVISTA'){ cur='context'; continue }
    if(line.trim()==='# MAPA DE LETRAS'){ cur='map'; continue }
    if(line.trim()==='# DIÁLOGO'){ cur='dialog'; continue }
    if(line.trim()==='# RESTANTE'){ cur='remaining'; continue }
    if(cur) sections[cur] += line + '\n';
  }
  
  // 1. Contexto
  context = sections.context.trim();
  $('#context').value = context;

  // 2. Reconstruir speakers a partir del mapa si existe
  speakers.clear(); upsertSpeaker('E','ENTREVISTADOR','');
  const mapLines = sections.map.split(/\r?\n/).filter(Boolean);
  for(const L of mapLines){
    const m = L.match(/^([A-Z])\s*=\s*(.+)$/); if(!m) continue;
    const letter = m[1].toUpperCase(); if(letter==='E'){ continue; }
    const rest = m[2].trim();
    let name = rest; let role = '';
    const roleMatch = rest.match(/\s*—\s*(.+)$/); // Buscar el formato 'Nombre — Cargo'
    if(roleMatch){ role = roleMatch[1].trim(); name = rest.replace(/\s*—\s*.*$/,'').trim(); }
    upsertSpeaker(letter, name.toUpperCase(), role.toUpperCase());
  }
  
  // 3. Dialog
  clearSegmentsUI();
  const blocks = sections.dialog.split(/\n---\s*/).map(b=>b.trim()).filter(Boolean);
  for(let i=0; i < blocks.length; i++){
    const b = blocks[i];
    const lines = b.split(/\r?\n/).filter(Boolean);
    if(!lines.length) continue;
    const header = lines.shift(); // Ej: Nombre (Cargo):
    const m = header.match(/^(.+?):\s*$/);
    let name = 'INVITADO'; let role=''; let letter='';
    let newSpeakerAdded = false;

    if(m){ // intentar mapear por nombre a una letra conocida
      const label = m[1].trim();
      // comprobar si es Entrevistador
      if(label.toLowerCase().startsWith('entrevistador')) { letter = 'E'; name = 'ENTREVISTADOR'; role=''; }
      else{
        // buscar en speakers por nombre + (cargo) o solo nombre
        const found = Array.from(speakers.values()).find(s => label === `${s.name}${s.role? ' ('+s.role+')':''}` || label === s.name);
        if(found){ letter = found.letter; name = found.name; role = found.role; }
        else{ // asignar nueva letra si hay
          const L = nextAvailableLetter(); letter = L||'Z';
          // intentar separar cargo si viene entre paréntesis (formato de exportación)
          const rm = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
          if(rm){ name = rm[1].trim(); role = rm[2].trim(); } else { name = label; role=''; }
          upsertSpeaker(letter, name.toUpperCase(), role.toUpperCase());
          newSpeakerAdded = true;
        }
      }
    }
    
    // Si se añadió un nuevo orador, necesitamos obtener los datos actualizados
    if(newSpeakerAdded || letter){
      const speakerData = speakers.get(letter);
      name = speakerData.name.toUpperCase();
      role = speakerData.role.toUpperCase();
    }

    const text = lines.join('\n');
    const newSegment = {letter, name, role, text};
    segments.push(newSegment);
    renderSegment(newSegment, i);
  }
  $('#work').value = sections.remaining.trim(); renderSpeakers(); renderLegend(); scheduleSave();
  
  // Después de cargar el estado, forzar que el Contexto esté oculto
  contextHidden = true;
  contextBody.style.display = 'none';
  toggleContextBtn.textContent = 'MOSTRAR';
  toggleContextBtn.setAttribute('aria-expanded', 'false');
  updateHideAllButton();
}


// Cargar estado previo si existe
(function loadFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    loadProjectFromJSON(data);
    toast('PROYECTO RESTAURADO AUTOMÁTICAMENTE.');
    
    // Al cargar, ajusta el estado de los paneles si no se forzó en loadProjectFromJSON
    if(speakersBody.style.display !== 'none'){
        speakersHidden = false;
        toggleBtn.textContent = 'OCULTAR';
        toggleBtn.setAttribute('aria-expanded', 'true');
    } else {
        speakersHidden = true;
        toggleBtn.textContent = 'MOSTRAR';
        toggleBtn.setAttribute('aria-expanded', 'false');
    }
    
    // El contexto está oculto por defecto en el HTML, pero si JSON lo tenía en un estado anterior, ajustamos.
    contextHidden = contextBody.style.display === 'none';
    
    updateHideAllButton();

  }catch{}
})();

// Eliminar todo
$('#clear-all').addEventListener('click', ()=>{
  if(!confirm('¿ELIMINAR TODO? ESTO BORRARÁ BLOQUES, EDITOR, CONTEXTO Y MEDIOS.')) return;
  $('#segments').innerHTML=''; segments.length = 0;
  $('#work').value=''; $('#yt-url').value=''; $('#context').value=''; clearActiveMedia();
  // reset speakers a solo entrevistador
  speakers.clear(); upsertSpeaker('E','ENTREVISTADOR','');
  renderLegend();
  scheduleSave();
  
  // Resetear estados visuales
  speakersHidden = false; // El panel se queda visible por defecto en UI
  speakersBody.style.display = '';
  toggleBtn.textContent = 'OCULTAR';
  toggleBtn.setAttribute('aria-expanded', 'true');
  
  contextHidden = true; // El panel se queda oculto por defecto en UI
  contextBody.style.display = 'none';
  toggleContextBtn.textContent = 'MOSTRAR';
  toggleContextBtn.setAttribute('aria-expanded', 'false');

  updateHideAllButton();
  toast('PROYECTO VACIADO.');
});

// Barra espaciadora: play/pause si no estás escribiendo (o con Shift+Space siempre)
addEventListener('keydown', (e)=>{
  const isForm = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
  if(e.code==='Space' && (!isForm || e.shiftKey)){
    e.preventDefault(); setPlayPause();
  }
});