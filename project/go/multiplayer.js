// ============================================================
// GO — multiplayer.js
// Same Supabase realtime-broadcast pattern used by Chess/Ludo.
// Room creator plays Black, the person who joins plays White.
// ============================================================

function initSupabase(){
  if(typeof supabase === 'undefined') return false;
  try{ sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return true; }
  catch(e){ return false; }
}

function generateRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for(let i=0;i<5;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function broadcastIfNeeded(payload){
  if(mode === 'online' && sbChannel) sbChannel.send({ type:'broadcast', event:'goAction', payload });
}

function applyRemoteAction(payload){
  if(payload.type === 'place'){
    const color = payload.color === 'b' ? BLACK : WHITE;
    const result = tryMove(board, boardSize, koPoint, color, payload.r, payload.c);
    if(!result.legal) return; // should never happen if both sides agree on state
    commitMove(color, payload.r, payload.c, result);
  } else if(payload.type === 'pass'){
    const color = payload.color === 'b' ? BLACK : WHITE;
    history.push({ board: board.slice(), ko: koPoint, current: currentPlayer, passCount, lastMove, capturedCount: {...capturedCount} });
    moveLog.push({ color, pass:true });
    passCount++;
    koPoint = null;
    currentPlayer = (color === BLACK) ? WHITE : BLACK;
    if(passCount >= 2){ endGame(); return; }
    updateStatusUI();
    logMoveList();
  } else if(payload.type === 'resign'){
    gameOver = true;
    const color = payload.color === 'b' ? BLACK : WHITE;
    const winner = color === BLACK ? 'White' : 'Black';
    showResult(winner + ' jeet gaya (resign)', null);
    updateStatusUI();
  }
}

function connectToRoom(code, seatColor, creator){
  if(!sbClient){ setOnlineStatus('Supabase ready nahi hai.'); return; }
  roomCode = code; myColor = seatColor; iAmCreator = creator;

  document.getElementById('goOnlineSetup').style.display = 'none';
  document.getElementById('goOnlineStatus').style.display = 'flex';
  document.getElementById('goRoomCodeDisplay').textContent = 'Room: ' + code + ' (Aap: ' + (seatColor===BLACK?'Black':'White') + ')';
  if(creator) document.getElementById('goStartGameBtn').style.display = 'inline-block';
  setOnlineStatus('Connect ho raha hai...');

  sbChannel = sbClient.channel('go-room-' + code, { config: { broadcast: { self:false } } });

  sbChannel.on('broadcast', { event:'goAction' }, (msg) => applyRemoteAction(msg.payload));
  sbChannel.on('broadcast', { event:'goStart' }, (msg) => {
    startNewGame(msg.payload.size);
    setOnlineStatus('✓ Connected — khelna shuru karo!');
  });

  sbChannel.subscribe((status) => {
    if(status === 'SUBSCRIBED') setOnlineStatus('✓ Connected' + (creator ? ' — size chuno aur Start dabao' : ' — creator ke start karne ka wait karo'));
    else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setOnlineStatus('Connection fail hui, dobara try karo.');
  });
}

function copyRoomCode(){
  if(roomCode) navigator.clipboard.writeText(roomCode);
}
