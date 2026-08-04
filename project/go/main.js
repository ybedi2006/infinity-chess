// ============================================================
// GO — main.js
// UI wiring + the small rendering helpers (status text, move
// list, illegal-move flash, end-of-game result card) that the
// other files call into.
// ============================================================

let selectedSetupSize = 9;
let aiTurnToken = 0; // bumped every new game — stale AI timers check this before acting

function startNewGame(size){
  aiTurnToken++;
  boardSize = size;
  board = freshBoard(size);
  currentPlayer = BLACK;
  koPoint = null;
  passCount = 0;
  gameStarted = true;
  gameOver = false;
  history = [];
  moveLog = [];
  lastMove = null;
  capturedCount = { 1:0, 2:0 };

  document.getElementById('goResultOverlay').classList.remove('show');
  renderBoard();
  updateStatusUI();
  logMoveList();
  setMsg('');
}

function updateStatusUI(){
  const dot = document.getElementById('goTurnDot');
  const text = document.getElementById('goTurnText');
  dot.style.background = currentPlayer === BLACK ? '#111' : '#f4f0e6';
  dot.style.border = currentPlayer === BLACK ? '2px solid #444' : '2px solid #999';

  let suffix = '';
  if(mode === 'computer' && currentPlayer === BLACK) suffix = ' (Aap)';
  if(mode === 'online' && currentPlayer === myColor) suffix = ' (Aap)';
  text.textContent = (currentPlayer === BLACK ? 'Black' : 'White') + ' ki baari' + (gameOver ? ' — Game khatam' : suffix);

  document.getElementById('goCapturedBlack').textContent = capturedCount[BLACK];
  document.getElementById('goCapturedWhite').textContent = capturedCount[WHITE];

  document.getElementById('goPassBtn').style.display = canControl(currentPlayer) ? 'inline-block' : 'none';
  document.getElementById('goResignBtn').style.display = canControl(currentPlayer) ? 'inline-block' : 'none';
  document.getElementById('goUndoBtn').style.display = (mode === 'computer' && history.length > 0 && !gameOver) ? 'inline-block' : 'none';
}

function logMoveList(){
  const list = document.getElementById('goMoveList');
  list.innerHTML = '';
  moveLog.forEach((m,i) => {
    const row = document.createElement('div');
    row.className = 'move-row';
    const colorLabel = m.color === BLACK ? 'B' : 'W';
    if(m.pass){
      row.textContent = (i+1) + '. ' + colorLabel + ' — pass';
    } else {
      const colLetter = String.fromCharCode(65 + m.c + (m.c >= 8 ? 1 : 0)); // Go convention skips "I"
      row.textContent = (i+1) + '. ' + colorLabel + ' ' + colLetter + (boardSize - m.r) + (m.captured ? ' (+' + m.captured + ')' : '');
    }
    list.appendChild(row);
  });
  list.scrollTop = list.scrollHeight;
}

function setMsg(t){ document.getElementById('goMsg').textContent = t; }

function flashIllegal(reason){
  const map = { occupied:'Ye point already bhara hai.', ko:'Ko rule — abhi ye point khaali nahi rakh sakte.', suicide:'Illegal move — ye aapke hi group ko capture kar dega.' };
  setMsg(map[reason] || 'Illegal move.');
  setTimeout(() => { if(!gameOver) setMsg(''); }, 1800);
}

function showResult(title, scoreObj){
  document.getElementById('goResultTitle').textContent = title;
  const detail = document.getElementById('goResultDetail');
  if(scoreObj){
    detail.innerHTML = 'Black: ' + scoreObj.blackScore.toFixed(1) + ' (stones ' + scoreObj.blackStones + ' + territory ' + scoreObj.blackTerritory + ')<br>' +
      'White: ' + scoreObj.whiteScore.toFixed(1) + ' (stones ' + scoreObj.whiteStones + ' + territory ' + scoreObj.whiteTerritory + ' + komi ' + scoreObj.komi + ')';
  } else {
    detail.textContent = '';
  }
  document.getElementById('goResultOverlay').classList.add('show');
}

function setOnlineStatus(t){ document.getElementById('goOnlineConnStatus').textContent = t; }

// ---------- Mode / size controls ----------
document.getElementById('goModeComputer').addEventListener('click', () => {
  mode = 'computer'; myColor = BLACK;
  document.getElementById('goModeComputer').classList.add('active');
  document.getElementById('goModeFriend').classList.remove('active');
  document.getElementById('goOnlinePanel').style.display = 'none';
  document.getElementById('goSizeRow').style.display = 'flex';
  if(sbChannel){ sbChannel.unsubscribe(); sbChannel = null; }
  startNewGame(selectedSetupSize);
});

document.getElementById('goModeFriend').addEventListener('click', () => {
  mode = 'online';
  gameStarted = false;
  document.getElementById('goModeFriend').classList.add('active');
  document.getElementById('goModeComputer').classList.remove('active');
  document.getElementById('goOnlinePanel').style.display = 'block';
  document.getElementById('goSizeRow').style.display = 'none';
  document.getElementById('goOnlineSetup').style.display = 'flex';
  document.getElementById('goOnlineStatus').style.display = 'none';
  setMsg('Room banao ya kisi ke room me join karo.');
  if(!sbClient) initSupabase();
});

document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSetupSize = parseInt(btn.dataset.size, 10);
    startNewGame(selectedSetupSize);
  });
});

// ---------- Online room controls ----------
document.getElementById('goCreateRoomBtn').addEventListener('click', () => {
  const code = generateRoomCode();
  connectToRoom(code, BLACK, true);
});
document.getElementById('goJoinRoomBtn').addEventListener('click', () => {
  const code = document.getElementById('goJoinCodeInput').value.trim().toUpperCase();
  if(!code) return;
  connectToRoom(code, WHITE, false);
});
document.getElementById('goCopyRoomBtn').addEventListener('click', copyRoomCode);
document.getElementById('goStartGameBtn').addEventListener('click', () => {
  sbChannel.send({ type:'broadcast', event:'goStart', payload:{ size: selectedSetupSize } });
  startNewGame(selectedSetupSize);
});

// ---------- Game controls ----------
document.getElementById('goPassBtn').addEventListener('click', () => passTurn(currentPlayer));
document.getElementById('goResignBtn').addEventListener('click', () => resignGame(currentPlayer));
document.getElementById('goUndoBtn').addEventListener('click', undoMove);
document.getElementById('goNewBtn').addEventListener('click', () => {
  if(mode === 'online'){
    if(!iAmCreator){ setMsg('Sirf room creator naya game shuru kar sakta hai.'); return; }
    sbChannel.send({ type:'broadcast', event:'goStart', payload:{ size: boardSize } });
    startNewGame(boardSize);
    return;
  }
  startNewGame(selectedSetupSize);
});
document.getElementById('goResultCloseBtn').addEventListener('click', () => {
  document.getElementById('goResultOverlay').classList.remove('show');
});

// ---------- Init ----------
startNewGame(9);
