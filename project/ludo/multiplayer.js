function initSupabase(){
  if(typeof supabase === 'undefined') return false;
  try{ sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return true; } catch(e){ return false; }
}
function generateRoomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s=''; for(let i=0;i<5;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function broadcastIfNeeded(payload){
  if(mode==='online' && sbChannel) sbChannel.send({ type:'broadcast', event:'ludoAction', payload });
}
function applyRemoteAction(payload){
  const { color, dice, tokenIndex, captured, bonus, forfeitThree } = payload;
  diceValue = dice;
  if(dice===6) consecutiveSixes++; else consecutiveSixes=0;
  if(tokenIndex === null || tokenIndex === undefined){
    setMsg(forfeitThree ? 'Lagatar 3 six — turn khatam!' : 'Koi chaal possible nahi.');
    finishTurnSegment(false);
    return;
  }
  const oldStep = tokens[color][tokenIndex];
  const newStep = (oldStep===-1)?0:oldStep+dice;
  tokens[color][tokenIndex] = newStep;
  (captured||[]).forEach(cap => { tokens[cap.color][cap.idx] = -1; });
  awaitingMove = false;
  renderTokens();
  let msg = COLOR_LABEL[color] + ' ne chaal chali.';
  if(captured && captured.length){ msg += ' capture ho gaya!'; }
  setMsg(msg);
  if(colorFinished(color)){
    gameOver = true;
    setMsg('🎉 ' + COLOR_LABEL[color] + ' JEET GAYA!');
    updateStatusUI();
    return;
  }
  finishTurnSegment(bonus);
}

function connectToRoom(code, seatColor, creator){
  if(!sbClient){ setOnlineStatus('Supabase ready nahi hai.'); return; }
  roomCode = code; myColor = seatColor; iAmCreator = creator;
  document.getElementById('lOnlineSetup').style.display='none';
  document.getElementById('lOnlineStatus').style.display='flex';
  document.getElementById('lRoomCodeDisplay').textContent = 'Room: '+code+' (Aap: '+COLOR_LABEL[seatColor]+')';
  if(creator) document.getElementById('lStartGameBtn').style.display='inline-block';
  setOnlineStatus('Connect ho raha hai...');

  sbChannel = sbClient.channel('ludo-room-'+code, { config:{ broadcast:{ self:false }, presence:{ key: seatColor } } });
  sbChannel.on('broadcast', {event:'ludoAction'}, (msg) => applyRemoteAction(msg.payload));
  sbChannel.on('broadcast', {event:'ludoStart'}, (msg) => {
    seats = msg.payload.seats;
    tokens = freshTokens();
    currentTurn='red'; gameOver=false; awaitingMove=false; diceValue=null; consecutiveSixes=0;
    renderTokens(); updateStatusUI(); setMsg('Game shuru!');
    maybeAutoAdvance();
  });
  sbChannel.on('broadcast', {event:'ludoReset'}, () => {
    tokens = freshTokens();
    currentTurn='red'; gameOver=false; awaitingMove=false; diceValue=null; consecutiveSixes=0;
    renderTokens(); updateStatusUI(); setMsg('');
  });
  sbChannel.on('presence', {event:'sync'}, () => {
    const state = sbChannel.presenceState();
    renderSeatList(Object.keys(state));
  });
  sbChannel.subscribe(async (status) => {
    if(status==='SUBSCRIBED'){ setOnlineStatus('✓ Connected'); await sbChannel.track({ color: seatColor }); }
  });
}

function renderSeatList(joinedColors){
  const box = document.getElementById('lSeatList');
  box.innerHTML = '';
  COLORS.forEach(c => {
    const chip = document.createElement('span');
    chip.className='seat-chip';
    chip.style.borderColor = COLOR_HEX[c];
    chip.textContent = COLOR_LABEL[c] + ': ' + (joinedColors.includes(c) ? 'Joined' : 'khaali');
    box.appendChild(chip);
  });
}
function setOnlineStatus(t){ document.getElementById('lOnlineConnStatus').textContent = t; }
