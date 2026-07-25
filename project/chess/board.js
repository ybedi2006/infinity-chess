const game = new Chess();
const boardEl = document.getElementById('board');
const files = ['a','b','c','d','e','f','g','h'];
let selectedSq = null;
let legalTargets = [];
let lastMove = null;
let playerColor = 'w';
let aiThinking = false;
let pendingPromotion = null;

// ---------- Multiplayer (Vs Friend Online) state ----------
// SUPABASE_URL / SUPABASE_ANON_KEY ab ../shared/config.js se aate hain (index.html
// unhe is file se PEHLE load karta hai) — kahin aur duplicate mat karna.
let gameMode = 'single'; // 'single' | 'online'
let myColor = 'w';       // in online mode: which side am I playing
let roomCode = null;
let sbClient = null;
let sbChannel = null;

const PIECE_UNICODE = {
  wp:'♙', wn:'♘', wb:'♗', wr:'♖', wq:'♕', wk:'♔',
  bp:'♟', bn:'♞', bb:'♝', br:'♜', bq:'♛', bk:'♚'
};

// ---------- Board rendering ----------
function squareId(file, rank){ return files[file] + rank; }

function renderBoard(){
  boardEl.innerHTML = '';
  for(let r=8; r>=1; r--){
    for(let f=0; f<8; f++){
      const sqName = squareId(f, r);
      const isLight = (f + r) % 2 === 0;
      const div = document.createElement('div');
      div.className = 'sq ' + (isLight ? 'light' : 'dark');
      div.dataset.sq = sqName;

      const piece = game.get(sqName);
      if(piece){
        const span = document.createElement('span');
        span.className = 'piece';
        span.textContent = PIECE_UNICODE[piece.color + piece.type];
        span.style.color = piece.color === 'w' ? '#f4ecdf' : '#1a1410';
        div.appendChild(span);
      }

      if(f === 0){
        const rc = document.createElement('span');
        rc.className = 'coord rank';
        rc.textContent = r;
        div.appendChild(rc);
      }
      if(r === 1){
        const fc = document.createElement('span');
        fc.className = 'coord file';
        fc.textContent = files[f];
        div.appendChild(fc);
      }

      if(selectedSq === sqName) div.classList.add('selected');
      if(lastMove && (lastMove.from === sqName || lastMove.to === sqName)) div.classList.add('lastmove');
      if(legalTargets.some(m => m.to === sqName)){
        div.classList.add('legal');
        const mv = legalTargets.find(m => m.to === sqName);
        if(mv.flags && mv.flags.includes('c')) div.classList.add('capture');
        if(piece) div.classList.add('capture');
      }
      if(piece && piece.type === 'k'){
        if(game.in_check() && piece.color === game.turn()){
          div.classList.add('check');
        }
      }

      div.addEventListener('click', onSquareClick);
      boardEl.appendChild(div);
    }
  }
}

function onSquareClick(e){
  if(aiThinking) return;
  if(game.turn() !== playerColor) return;
  if(game.game_over()) return;

  const sqName = e.currentTarget.dataset.sq;
  const piece = game.get(sqName);

  if(selectedSq){
    const move = legalTargets.find(m => m.to === sqName);
    if(move){
      attemptMove(selectedSq, sqName, move);
      return;
    }
    // reselect if clicking own piece
    if(piece && piece.color === playerColor){
      selectSquare(sqName);
    } else {
      selectedSq = null;
      legalTargets = [];
      renderBoard();
    }
    return;
  }

  if(piece && piece.color === playerColor){
    selectSquare(sqName);
  }
}

function selectSquare(sqName){
  selectedSq = sqName;
  legalTargets = game.moves({ square: sqName, verbose: true });
  renderBoard();
}

function attemptMove(from, to, moveInfo){
  const piece = game.get(from);
  const isPromotion = piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1');

  if(isPromotion){
    pendingPromotion = { from, to };
    showPromotionPicker(piece.color);
    return;
  }

  const move = game.move({ from, to, promotion: 'q' });
  finalizePlayerMove(move);
}

function showPromotionPicker(color){
  const overlay = document.getElementById('promoOverlay');
  const opts = document.getElementById('promoOpts');
  opts.innerHTML = '';
  const pieces = ['q','r','b','n'];
  pieces.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = PIECE_UNICODE[color + p];
    btn.style.color = color === 'w' ? '#f4ecdf' : '#1a1410';
    btn.style.background = color === 'w' ? '#3a322a' : '#eecf8f';
    btn.addEventListener('click', () => {
      overlay.classList.remove('show');
      const move = game.move({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: p });
      pendingPromotion = null;
      finalizePlayerMove(move);
    });
    opts.appendChild(btn);
  });
  overlay.classList.add('show');
}

function finalizePlayerMove(move){
  if(!move) return;
  selectedSq = null;
  legalTargets = [];
  lastMove = move;
  renderBoard();
  updateStatus();
  logMove(move);
  updateHealthBar();

  if(gameMode === 'online'){
    if(sbChannel){
      sbChannel.send({ type: 'broadcast', event: 'move', payload: {
        from: move.from, to: move.to, promotion: move.promotion || undefined
      }});
    }
    if(game.game_over()) announceResult();
    return;
  }

  if(game.game_over()){
    announceResult();
    return;
  }
  // AI's turn
  setTimeout(aiTurn, 350);
}

// ---------- Status / move list ----------
function updateStatus(){
  const turnTextEl = document.getElementById('turnText');
  const turnDot = document.getElementById('turnDot');
  const msg = document.getElementById('msg');

  if(game.game_over()){
    turnTextEl.textContent = 'Game khatam';
  } else if(game.turn() === playerColor){
    turnTextEl.textContent = 'Aapki chaal (White)';
    turnDot.className = 'turn-dot';
  } else {
    turnTextEl.textContent = 'Engine soch raha hai...';
    turnDot.className = 'turn-dot black';
  }

  if(game.in_check() && !game.game_over()){
    msg.textContent = 'Check!';
  } else {
    msg.textContent = '';
  }
}

function logMove(move){
  const list = document.getElementById('movelist');
  const history = game.history();
  list.innerHTML = '';
  for(let i=0; i<history.length; i+=2){
    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = (i/2 + 1) + '.';
    const w = document.createElement('div');
    w.textContent = history[i] || '';
    const b = document.createElement('div');
    b.textContent = history[i+1] || '';
    list.appendChild(num);
    list.appendChild(w);
    list.appendChild(b);
  }
  list.scrollTop = list.scrollHeight;
}

function announceResult(){
  const msg = document.getElementById('msg');
  if(game.in_checkmate()){
    const winner = game.turn() === 'w' ? 'Black (Engine)' : 'White (Aap)';
    msg.textContent = 'Checkmate! Jeetne wala: ' + winner;
  } else if(game.in_draw()){
    msg.textContent = 'Game draw ho gaya.';
  } else if(game.in_stalemate()){
    msg.textContent = 'Stalemate — draw.';
  }
  document.getElementById('turnText').textContent = 'Game khatam';
}

