// ============================================================
// GO — ai.js
// Heuristic AI (no neural-net engine like KataGo is loadable via
// CDN — those need 100MB+ weight files). This plays sane, careful
// moves: takes captures, avoids self-atari, contests territory —
// solid for practice, but beatable by a strong human.
// ============================================================

function maybeTriggerAI(){
  if(gameOver) return;
  if(mode === 'computer' && currentPlayer === WHITE){
    const myToken = aiTurnToken;
    setTimeout(() => {
      if(myToken !== aiTurnToken) return; // a new game started since this was scheduled — abort
      aiTakeTurn();
    }, 500);
  }
}

function aiTakeTurn(){
  if(gameOver) return;
  const move = pickAiMove(WHITE);
  if(!move){
    passTurn(WHITE);
    return;
  }
  const result = tryMove(board, boardSize, koPoint, WHITE, move.r, move.c);
  if(!result.legal){ passTurn(WHITE); return; } // safety net
  commitMove(WHITE, move.r, move.c, result);
}

function pickAiMove(color){
  const opponent = color === BLACK ? WHITE : BLACK;
  const candidates = [];

  for(let r=0;r<boardSize;r++){
    for(let c=0;c<boardSize;c++){
      if(board[idx(r,c,boardSize)] !== EMPTY) continue;
      const result = tryMove(board, boardSize, koPoint, color, r, c);
      if(!result.legal) continue;

      let score = 0;
      score += result.captured.length * 15;

      const ownGroup = getGroup(result.newBoard, boardSize, r, c);
      const ownLibs = getLiberties(result.newBoard, boardSize, ownGroup).size;
      if(ownLibs === 1) score -= 9;
      else if(ownLibs === 2) score -= 2;

      neighbors(r,c,boardSize).forEach(([nr,nc]) => {
        if(result.newBoard[idx(nr,nc,boardSize)] === opponent){
          const g = getGroup(result.newBoard, boardSize, nr, nc);
          const libs = getLiberties(result.newBoard, boardSize, g).size;
          if(libs === 1) score += 7;
          else if(libs === 2) score += 2.5;
        }
      });

      const distEdge = Math.min(r, c, boardSize-1-r, boardSize-1-c);
      if(distEdge === 0) score -= 4;
      else if(distEdge === 1 || distEdge === 2) score += 3;
      else score += 1;

      neighbors(r,c,boardSize).forEach(([nr,nc]) => {
        if(board[idx(nr,nc,boardSize)] === color) score += 1.5;
        else if(board[idx(nr,nc,boardSize)] === opponent) score += 0.5;
      });

      score += Math.random() * 3;
      candidates.push({ r, c, score });
    }
  }

  if(candidates.length === 0) return null;
  candidates.sort((a,b) => b.score - a.score);

  // If the opponent just passed and nothing looks meaningfully useful, pass too.
  const lastLog = moveLog[moveLog.length-1];
  if(lastLog && lastLog.pass && candidates[0].score < 2){
    return null;
  }
  return candidates[0];
}
