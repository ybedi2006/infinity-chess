// ============================================================
// GO — rules.js
// Legal-move checking (suicide + simplified ko rule), captures,
// turn flow (place / pass / resign), and end-game area scoring.
// ============================================================

// Pure: does NOT mutate global state. Returns {legal, reason, newBoard, captured, newKo}
function tryMove(bd, size, ko, color, r, c){
  if(bd[idx(r,c,size)] !== EMPTY) return { legal:false, reason:'occupied' };
  if(ko && ko.r === r && ko.c === c) return { legal:false, reason:'ko' };

  const trial = bd.slice();
  trial[idx(r,c,size)] = color;
  const opponent = color === BLACK ? WHITE : BLACK;

  const captured = [];
  const checked = new Set();
  neighbors(r,c,size).forEach(([nr,nc]) => {
    if(trial[idx(nr,nc,size)] !== opponent) return;
    const key = nr*size+nc;
    if(checked.has(key)) return;
    const group = getGroup(trial, size, nr, nc);
    group.forEach(([gr,gc]) => checked.add(gr*size+gc));
    const libs = getLiberties(trial, size, group);
    if(libs.size === 0){
      group.forEach(([gr,gc]) => { trial[idx(gr,gc,size)] = EMPTY; captured.push([gr,gc]); });
    }
  });

  const ownGroup = getGroup(trial, size, r, c);
  const ownLibs = getLiberties(trial, size, ownGroup);
  if(ownLibs.size === 0){
    return { legal:false, reason:'suicide' };
  }

  let newKo = null;
  if(captured.length === 1 && ownGroup.length === 1 && ownLibs.size === 1){
    newKo = { r:captured[0][0], c:captured[0][1] };
  }

  return { legal:true, newBoard:trial, captured, newKo };
}

function canControl(color){
  if(!gameStarted || gameOver) return false;
  if(mode === 'computer') return color === BLACK; // human is always Black vs computer
  return color === myColor; // online: only your own color
}

// ---------- Turn flow ----------
function onIntersectionClick(r,c){
  if(!canControl(currentPlayer)) return;
  attemptHumanMove(r,c);
}

function attemptHumanMove(r,c){
  const result = tryMove(board, boardSize, koPoint, currentPlayer, r, c);
  if(!result.legal){
    flashIllegal(result.reason);
    return;
  }
  commitMove(currentPlayer, r, c, result);
  broadcastIfNeeded({ type:'place', color: currentPlayer===BLACK?'b':'w', r, c });
}

function commitMove(color, r, c, result){
  history.push({ board: board.slice(), ko: koPoint, current: currentPlayer, passCount, lastMove, capturedCount: {...capturedCount} });

  board = result.newBoard;
  koPoint = result.newKo;
  if(result.captured.length){
    capturedCount[color] += result.captured.length;
  }
  lastMove = { r, c };
  passCount = 0;
  moveLog.push({ color, r, c, captured: result.captured.length });

  currentPlayer = (color === BLACK) ? WHITE : BLACK;
  renderBoard();
  updateStatusUI();
  logMoveList();

  maybeTriggerAI();
}

function passTurn(color){
  if(!canControl(color) && !(mode==='online' && seatIsBotDriver(color))) return;
  history.push({ board: board.slice(), ko: koPoint, current: currentPlayer, passCount, lastMove, capturedCount: {...capturedCount} });
  moveLog.push({ color, pass:true });
  passCount++;
  koPoint = null;
  currentPlayer = (color === BLACK) ? WHITE : BLACK;

  broadcastIfNeeded({ type:'pass', color: color===BLACK?'b':'w' });

  if(passCount >= 2){
    endGame();
    return;
  }
  updateStatusUI();
  logMoveList();
  maybeTriggerAI();
}

function resignGame(color){
  if(!canControl(color)) return;
  gameOver = true;
  const winner = color === BLACK ? 'White' : 'Black';
  showResult(winner + ' jeet gaya (resign)', null);
  broadcastIfNeeded({ type:'resign', color: color===BLACK?'b':'w' });
  updateStatusUI();
}

function seatIsBotDriver(color){
  // used only in online mode when a seat is unfilled and the creator drives it — not used for 1v1 Go, kept for symmetry
  return false;
}

// ---------- Scoring (Chinese-style area scoring: stones + surrounded territory + komi) ----------
const KOMI = 7.5;

function computeScore(){
  const size = boardSize;
  const visited = new Array(size*size).fill(false);
  let blackStones=0, whiteStones=0, blackTerritory=0, whiteTerritory=0;

  for(let i=0;i<size*size;i++){
    if(board[i]===BLACK) blackStones++;
    else if(board[i]===WHITE) whiteStones++;
  }

  for(let r=0;r<size;r++){
    for(let c=0;c<size;c++){
      const i = idx(r,c,size);
      if(board[i] !== EMPTY || visited[i]) continue;
      const region = [];
      const stack = [[r,c]];
      const borders = new Set();
      visited[i] = true;
      while(stack.length){
        const [cr,cc] = stack.pop();
        region.push([cr,cc]);
        neighbors(cr,cc,size).forEach(([nr,nc]) => {
          const ni = idx(nr,nc,size);
          if(board[ni] === EMPTY){
            if(!visited[ni]){ visited[ni]=true; stack.push([nr,nc]); }
          } else {
            borders.add(board[ni]);
          }
        });
      }
      if(borders.size === 1){
        const owner = [...borders][0];
        if(owner === BLACK) blackTerritory += region.length;
        else whiteTerritory += region.length;
      }
    }
  }

  const blackScore = blackStones + blackTerritory;
  const whiteScore = whiteStones + whiteTerritory + KOMI;
  return { blackScore, whiteScore, blackTerritory, whiteTerritory, blackStones, whiteStones, komi:KOMI };
}

function endGame(){
  gameOver = true;
  const s = computeScore();
  const winner = s.blackScore > s.whiteScore ? 'Black' : 'White';
  const margin = Math.abs(s.blackScore - s.whiteScore).toFixed(1);
  showResult(winner + ' jeeta (' + margin + ' points se)', s);
  updateStatusUI();
}

function undoMove(){
  if(mode === 'online' || history.length === 0) return;
  const prev = history.pop();
  board = prev.board;
  koPoint = prev.ko;
  currentPlayer = prev.current;
  passCount = prev.passCount;
  lastMove = prev.lastMove;
  capturedCount = prev.capturedCount;
  moveLog.pop();
  gameOver = false;
  renderBoard();
  updateStatusUI();
  logMoveList();
}
