// ---------- Multiplayer (Vs Friend Online) ----------
function initSupabase(){
  if(typeof supabase === 'undefined') return false;
  if(!SUPABASE_URL.startsWith('http')) return false;
  try{
    sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch(e){
    return false;
  }
}

function generateRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i=0;i<5;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

function setOnlineStatusText(text){
  document.getElementById('onlineConnStatus').textContent = text;
}

function connectToRoom(code, asColor){
  if(!sbClient){
    setOnlineStatusText('Supabase set up nahi hai — pehle SUPABASE_URL/ANON_KEY daalo.');
    return;
  }
  roomCode = code;
  myColor = asColor;
  playerColor = asColor;

  document.getElementById('onlineSetup').style.display = 'none';
  document.getElementById('onlineStatus').style.display = 'flex';
  document.getElementById('roomCodeDisplay').textContent = 'Room: ' + code + ' (Aap: ' + (asColor==='w' ? 'White' : 'Black') + ')';
  setOnlineStatusText('Connect ho raha hai...');

  sbChannel = sbClient.channel('chess-room-' + code, { config: { broadcast: { self: false } } });

  sbChannel.on('broadcast', { event: 'move' }, (msg) => {
    const p = msg.payload;
    const move = game.move({ from: p.from, to: p.to, promotion: p.promotion || 'q' });
    if(!move) return;
    lastMove = move;
    renderBoard();
    updateStatus();
    logMove(move);
    updateHealthBar();
    if(game.game_over()) announceResult();
  });

  sbChannel.on('broadcast', { event: 'reset' }, () => {
    resetGameState();
  });

  sbChannel.subscribe((status) => {
    if(status === 'SUBSCRIBED'){
      setOnlineStatusText('✓ Connected — khelna shuru karo!');
    } else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
      setOnlineStatusText('Connection fail hui, dobara try karo.');
    }
  });

  resetGameState();
}

function resetGameState(){
  game.reset();
  selectedSq = null;
  legalTargets = [];
  lastMove = null;
  aiThinking = false;
  document.getElementById('thinking').style.display = 'none';
  document.getElementById('analysisBox').textContent = 'Game shuru karo — har chaal ke baad yahan engine ki soch dikhegi.';
  document.getElementById('movelist').innerHTML = '';
  renderBoard();
  updateStatus();
  updateHealthBar();
}

document.getElementById('modeVsComputer').addEventListener('click', () => {
  gameMode = 'single';
  playerColor = 'w';
  document.getElementById('modeVsComputer').classList.add('active');
  document.getElementById('modeVsFriend').classList.remove('active');
  document.getElementById('onlinePanel').style.display = 'none';
  document.getElementById('undoBtn').style.display = 'inline-block';
  if(sbChannel){ sbChannel.unsubscribe(); sbChannel = null; }
  resetGameState();
});

document.getElementById('modeVsFriend').addEventListener('click', () => {
  gameMode = 'online';
  document.getElementById('modeVsFriend').classList.add('active');
  document.getElementById('modeVsComputer').classList.remove('active');
  document.getElementById('onlinePanel').style.display = 'block';
  document.getElementById('undoBtn').style.display = 'none'; // undo would desync the two players
  document.getElementById('onlineSetup').style.display = 'flex';
  document.getElementById('onlineStatus').style.display = 'none';
  if(!sbClient) initSupabase();
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
  const code = generateRoomCode();
  connectToRoom(code, 'w');
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if(!code){ return; }
  connectToRoom(code, 'b');
});

document.getElementById('copyRoomBtn').addEventListener('click', () => {
  if(roomCode){
    navigator.clipboard.writeText(roomCode).then(() => {
      const btn = document.getElementById('copyRoomBtn');
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1200);
    });
  }
});

