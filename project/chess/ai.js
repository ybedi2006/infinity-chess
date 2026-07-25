// ---------- Evaluation / health bar ----------
const PIECE_VALUES = { p:100, n:320, b:330, r:500, q:900, k:0 };

// Simple piece-square tables (white perspective; mirrored for black)
const PST = {
  p:[0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
     5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
     5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n:[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
     -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
     -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b:[-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
     -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
     -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r:[0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5,
     -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
     -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q:[-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
     -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
     -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k:[-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
     20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
};

function sqIndex(square){
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  return (8 - rank) * 8 + file;
}

function evaluateBoard(chessInstance){
  let score = 0;
  const board = chessInstance.board();
  for(let r=0; r<8; r++){
    for(let f=0; f<8; f++){
      const piece = board[r][f];
      if(!piece) continue;
      const idx = piece.color === 'w' ? (r*8+f) : ((7-r)*8+f);
      let val = PIECE_VALUES[piece.type] + (PST[piece.type][idx] || 0);
      score += piece.color === 'w' ? val : -val;
    }
  }
  // mobility bonus
  const mobility = chessInstance.moves().length;
  score += chessInstance.turn() === 'w' ? mobility * 2 : -mobility * 2;
  return score;
}

function updateHealthBar(overrideEvalPawns, mateInWhitePerspective){
  let evalPawns;
  if(typeof overrideEvalPawns === 'number' && !Number.isNaN(overrideEvalPawns)){
    evalPawns = overrideEvalPawns;
  } else {
    evalPawns = evaluateBoard(game) / 100; // fast static fallback (positive = white better)
  }
  const clamped = Math.max(-10, Math.min(10, evalPawns));
  const whitePct = 50 + clamped * 5; // each pawn ~5%
  document.getElementById('healthFill').style.height = whitePct + '%';

  if(typeof mateInWhitePerspective === 'number'){
    document.getElementById('whiteEvalLabel').textContent = mateInWhitePerspective >= 0 ? ('M' + mateInWhitePerspective) : ('-M' + Math.abs(mateInWhitePerspective));
    document.getElementById('blackEvalLabel').textContent = mateInWhitePerspective <= 0 ? ('M' + Math.abs(mateInWhitePerspective)) : ('-M' + mateInWhitePerspective);
    document.getElementById('healthFill').style.height = (mateInWhitePerspective > 0 ? '100%' : '0%');
    return;
  }

  document.getElementById('whiteEvalLabel').textContent = (evalPawns >= 0 ? '+' : '') + evalPawns.toFixed(1);
  document.getElementById('blackEvalLabel').textContent = (evalPawns <= 0 ? '+' : '') + (-evalPawns).toFixed(1);

  if(game.in_checkmate()){
    document.getElementById('healthFill').style.height = (game.turn() === 'w' ? '0%' : '100%');
  }
}

// ---------- AI (iterative deepening negamax + alpha-beta + quiescence) ----------
// Ye engine sirf jeetne ke liye khelta hai: har move se pehle time-budget ke andar
// jitni gehrai tak ho sake calculation karta hai, tactics miss na ho isliye
// quiescence search use karta hai (sirf capture chains tab tak explore karta hai
// jab tak position "shaant" na ho jaaye), aur checkmate ko sabse zyada priority deta hai.

const MATE_SCORE = 1000000;
const DIFFICULTY = {
  easy:   { timeMs: 400,  maxDepth: 3 },
  medium: { timeMs: 1200, maxDepth: 5 },
  hard:   { timeMs: 2800, maxDepth: 7 },
  brutal: { timeMs: 5500, maxDepth: 9 }
};

let nodesSearched = 0;
let searchDeadline = 0;

function mvvLva(move){
  // Most Valuable Victim - Least Valuable Attacker: capture ordering
  if(!move.flags.includes('c') && !move.flags.includes('e')) return 0;
  const victimType = move.captured || 'p'; // 'e' = en passant captures a pawn
  const victimVal = PIECE_VALUES[victimType] || 100;
  const attackerVal = PIECE_VALUES[move.piece] || 0;
  return victimVal * 10 - attackerVal;
}

function orderMoves(moves, pvMove){
  return moves.slice().sort((a,b) => {
    if(pvMove){
      const aPv = (a.from === pvMove.from && a.to === pvMove.to) ? 1 : 0;
      const bPv = (b.from === pvMove.from && b.to === pvMove.to) ? 1 : 0;
      if(aPv !== bPv) return bPv - aPv;
    }
    const aPromo = a.flags.includes('p') ? 800 : 0;
    const bPromo = b.flags.includes('p') ? 800 : 0;
    const aScore = mvvLva(a) + aPromo;
    const bScore = mvvLva(b) + bPromo;
    return bScore - aScore;
  });
}

// Quiescence: sirf captures ko aage explore karo taaki "horizon effect" se
// (jaise ek chaal ke baad hi piece hang hona) engine dhoka na khaaye.
function quiescence(chessInstance, alpha, beta, colorMultiplier, qDepth){
  nodesSearched++;
  const standPat = colorMultiplier * evaluateBoard(chessInstance);
  if(qDepth <= 0) return standPat;
  if(standPat >= beta) return beta;
  if(standPat > alpha) alpha = standPat;

  const captures = orderMoves(
    chessInstance.moves({ verbose: true }).filter(m => m.flags.includes('c') || m.flags.includes('e'))
  );

  for(const m of captures){
    chessInstance.move(m);
    const score = -quiescence(chessInstance, -beta, -alpha, -colorMultiplier, qDepth - 1);
    chessInstance.undo();
    if(score >= beta) return beta;
    if(score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(chessInstance, depth, alpha, beta, colorMultiplier, ply){
  nodesSearched++;

  if(chessInstance.in_checkmate()){
    return -MATE_SCORE + ply; // jitni jaldi mate utna behtar/bura
  }
  if(chessInstance.in_draw() || chessInstance.in_stalemate() || chessInstance.in_threefold_repetition()){
    return 0;
  }
  if(performance.now() > searchDeadline){
    return colorMultiplier * evaluateBoard(chessInstance);
  }
  if(depth === 0){
    return quiescence(chessInstance, alpha, beta, colorMultiplier, 4);
  }

  const moves = orderMoves(chessInstance.moves({ verbose: true }));
  let best = -Infinity;
  for(const m of moves){
    chessInstance.move(m);
    const score = -negamax(chessInstance, depth - 1, -beta, -alpha, -colorMultiplier, ply + 1);
    chessInstance.undo();
    if(score > best) best = score;
    if(best > alpha) alpha = best;
    if(alpha >= beta) break; // beta cutoff
    if(performance.now() > searchDeadline) break;
  }
  return best;
}

// Iterative deepening: depth 1 se shuru karke time khatam hone tak gehra hote jao.
// Har iteration ka best move agli iteration me sabse pehle try hota hai (better pruning).
function findBestMove(chessInstance, difficultyKey){
  const cfg = DIFFICULTY[difficultyKey] || DIFFICULTY.medium;
  searchDeadline = performance.now() + cfg.timeMs;
  nodesSearched = 0;

  const colorMultiplier = chessInstance.turn() === 'w' ? 1 : -1;
  let bestMove = null;
  let bestScore = -Infinity;
  let scored = [];
  let depthReached = 0;

  for(let depth = 1; depth <= cfg.maxDepth; depth++){
    if(performance.now() > searchDeadline) break;

    let moves = orderMoves(chessInstance.moves({ verbose: true }), bestMove);
    let alpha = -Infinity, beta = Infinity;
    let iterBest = null;
    let iterBestScore = -Infinity;
    const iterScored = [];
    let timedOut = false;

    for(const m of moves){
      chessInstance.move(m);
      const score = -negamax(chessInstance, depth - 1, -beta, -alpha, -colorMultiplier, 1);
      chessInstance.undo();

      if(performance.now() > searchDeadline){ timedOut = true; }

      iterScored.push({ move: m, score });
      if(score > iterBestScore){
        iterBestScore = score;
        iterBest = m;
      }
      if(score > alpha) alpha = score;
      if(timedOut) break;
    }

    if(!timedOut || iterBest){
      if(iterBest){
        bestMove = iterBest;
        bestScore = iterBestScore;
        scored = iterScored;
        depthReached = depth;
      }
    }
    // agar checkmate mil gaya to aur gehra jaane ki zaroorat nahi
    if(bestScore >= MATE_SCORE - 100) break;
    if(timedOut) break;
  }

  scored.sort((a,b) => b.score - a.score);
  return { bestMove, bestScore, scored, depthReached, nodes: nodesSearched };
}

// ---------- Stockfish (world-class engine, C++ compiled to WebAssembly) ----------
// Ye Anthropic/Claude ki engine nahi hai — ye duniya ki sabse strong open-source
// chess engines me se ek hai, jo lichess.org aur chess.com bhi use karte hain.
// Agar kisi wajah se (network/browser) load na ho paaye, to neeche wala apna
// custom JS engine (iterative deepening + quiescence) automatically fallback ban jaata hai.

let sfWorker = null;
let sfReady = false;
let sfFailed = false;

const SF_DIFFICULTY = {
  easy:   { elo: 1100, movetime: 500,  limitStrength: true  },
  medium: { elo: 1600, movetime: 900,  limitStrength: true  },
  hard:   { elo: 2400, movetime: 1800, limitStrength: true  },
  brutal: { elo: 0,    movetime: 4000, limitStrength: false } // full strength, no cap
};

function setEngineStatus(text){
  const el = document.getElementById('engineStatus');
  if(el) el.textContent = text;
}

function initStockfish(){
  const SF_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/';
  try{
    // Browsers block `new Worker(crossOriginUrl)` in many setups. Workaround:
    // create a tiny same-origin (blob) worker whose only job is to importScripts()
    // the real engine — importScripts is not blocked by this restriction.
    // Module.locateFile makes sure the .wasm binary is fetched from the same CDN
    // folder instead of relative to the blob: URL.
    const bootstrap =
      "self.Module = { locateFile: function(path){ return '" + SF_BASE + "' + path; } };\n" +
      "importScripts('" + SF_BASE + "stockfish.wasm.js');";
    const blob = new Blob([bootstrap], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    sfWorker = new Worker(blobUrl);
  } catch(e){
    sfFailed = true;
    setEngineStatus('Local engine sakriya (fallback)');
    return;
  }
  sfWorker.onerror = function(){
    sfFailed = true;
    sfReady = false;
    setEngineStatus('Local engine sakriya (fallback)');
  };
  sfWorker.onmessage = function(e){
    const line = e.data;
    if(typeof line !== 'string') return;
    if(line === 'uciok'){
      sfWorker.postMessage('isready');
    } else if(line === 'readyok' && !sfReady){
      sfReady = true;
      setEngineStatus('Stockfish (world-class) sakriya');
    }
  };
  sfWorker.postMessage('uci');
  setTimeout(() => {
    if(!sfReady){
      sfFailed = true;
      setEngineStatus('Local engine sakriya (fallback)');
    }
  }, 5000);
}
initStockfish();

function stockfishGo(fen, cfg){
  return new Promise((resolve) => {
    let lastScoreCp = null;
    let lastScoreMate = null;
    const listener = (e) => {
      const line = e.data;
      if(typeof line !== 'string') return;
      if(line.startsWith('info') && line.includes(' score ')){
        const mateMatch = line.match(/score mate (-?\d+)/);
        const cpMatch = line.match(/score cp (-?\d+)/);
        if(mateMatch){ lastScoreMate = parseInt(mateMatch[1], 10); lastScoreCp = null; }
        else if(cpMatch){ lastScoreCp = parseInt(cpMatch[1], 10); lastScoreMate = null; }
      }
      if(line.startsWith('bestmove')){
        sfWorker.removeEventListener('message', listener);
        const parts = line.split(' ');
        resolve({ bestmove: parts[1], scoreCp: lastScoreCp, scoreMate: lastScoreMate });
      }
    };
    sfWorker.addEventListener('message', listener);
    sfWorker.postMessage('setoption name UCI_LimitStrength value ' + (cfg.limitStrength ? 'true' : 'false'));
    if(cfg.limitStrength){
      sfWorker.postMessage('setoption name UCI_Elo value ' + cfg.elo);
    }
    sfWorker.postMessage('position fen ' + fen);
    sfWorker.postMessage('go movetime ' + cfg.movetime);
  });
}

async function aiTurn(){
  if(game.game_over()) return;
  aiThinking = true;
  document.getElementById('thinking').style.display = 'flex';
  updateStatus();

  const difficultyKey = document.getElementById('depthSelect').value;
  const turnAtSearch = game.turn(); // 'w' or 'b' — jiski taraf se engine soch raha hai

  if(sfReady && !sfFailed){
    try{
      const cfg = SF_DIFFICULTY[difficultyKey] || SF_DIFFICULTY.medium;
      const result = await stockfishGo(game.fen(), cfg);
      document.getElementById('thinking').style.display = 'none';
      aiThinking = false;

      if(!result.bestmove || result.bestmove === '(none)'){
        updateStatus();
        return;
      }
      const from = result.bestmove.slice(0,2);
      const to = result.bestmove.slice(2,4);
      const promotion = result.bestmove.length > 4 ? result.bestmove.slice(4,5) : 'q';
      const move = game.move({ from, to, promotion });
      if(!move){ updateStatus(); return; }

      lastMove = move;
      renderBoard();
      updateStatus();
      logMove(move);

      // health bar ko real Stockfish evaluation se update karo (white perspective me convert)
      if(result.scoreMate !== null){
        const mateWhite = turnAtSearch === 'w' ? result.scoreMate : -result.scoreMate;
        updateHealthBar(mateWhite > 0 ? 10 : -10, mateWhite);
      } else if(result.scoreCp !== null){
        const cpWhite = turnAtSearch === 'w' ? result.scoreCp : -result.scoreCp;
        updateHealthBar(cpWhite / 100);
      } else {
        updateHealthBar();
      }

      showAnalysisStockfish(move, result, turnAtSearch);

      if(game.game_over()) announceResult();
    } catch(err){
      sfFailed = true;
      document.getElementById('thinking').style.display = 'none';
      aiThinking = false;
      setEngineStatus('Local engine sakriya (fallback)');
      aiTurnFallback();
    }
    return;
  }

  aiTurnFallback();
}

// Fallback: custom JS engine (iterative deepening + quiescence), tab chalta hai
// jab Stockfish load na ho paaye (offline/network block).
function aiTurnFallback(){
  document.getElementById('thinking').style.display = 'flex';
  setTimeout(() => {
    const difficultyKey = document.getElementById('depthSelect').value;
    const result = findBestMove(game, difficultyKey);
    document.getElementById('thinking').style.display = 'none';
    aiThinking = false;

    if(!result.bestMove){
      updateStatus();
      return;
    }

    const move = game.move(result.bestMove);
    lastMove = move;
    renderBoard();
    updateStatus();
    logMove(move);
    updateHealthBar();
    showAnalysis(result);

    if(game.game_over()){
      announceResult();
    }
  }, 40);
}

function showAnalysisStockfish(move, result, turnAtSearch){
  const box = document.getElementById('analysisBox');
  let scoreLabel;
  if(result.scoreMate !== null){
    scoreLabel = 'Mate in ' + Math.abs(result.scoreMate);
  } else if(result.scoreCp !== null){
    const cpWhite = turnAtSearch === 'w' ? result.scoreCp : -result.scoreCp;
    scoreLabel = (cpWhite >= 0 ? '+' : '') + (cpWhite/100).toFixed(2);
  } else {
    scoreLabel = 'N/A';
  }
  let html = '<b>Stockfish</b> ne poori tarah gehraai se analysis kiya.<br>';
  html += 'Chuni gayi chaal: <b>' + move.san + '</b><br>';
  html += 'Position eval (White ki taraf se): <b>' + scoreLabel + '</b>';
  box.innerHTML = html;
}

function showAnalysis(result){
  const box = document.getElementById('analysisBox');
  const top = result.scored.slice(0, 4);
  const totalConsidered = result.scored.length;
  let html = '<b>' + result.nodes.toLocaleString('en-IN') + '</b> positions check ki gayi (depth ' + result.depthReached + ' tak).<br>';
  html += 'Chuni gayi chaal: <b>' + result.bestMove.san + '</b><br><br>';
  html += 'Top vikalp:<br>';
  top.forEach(s => {
    let label = s.score >= MATE_SCORE - 1000 ? 'Mate!' : (s.score/100).toFixed(2);
    html += '&nbsp;&nbsp;• ' + s.move.san + ' (score ' + label + ')<br>';
  });
  box.innerHTML = html;
}

