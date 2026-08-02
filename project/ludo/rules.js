function getLegalMoves(color, dice){
  if(dice == null) return [];
  const moves = [];
  tokens[color].forEach((step, i) => {
    if(step === -1){ if(dice === 6) moves.push(i); }
    else if(step < FINISH_STEP){ if(step + dice <= FINISH_STEP) moves.push(i); }
  });
  return moves;
}

function applyMove(color, tokenIndex, dice){
  const oldStep = tokens[color][tokenIndex];
  let newStep = (oldStep === -1) ? 0 : oldStep + dice;
  tokens[color][tokenIndex] = newStep;
  const captured = [];
  if(newStep <= LAST_COMMON_STEP){
    const idx = (ENTRY_OFFSET[color] + newStep) % RING_LEN;
    if(!SAFE_RING_INDICES.has(idx)){
      COLORS.forEach(other => {
        if(other === color) return;
        tokens[other].forEach((s2, j) => {
          if(s2 >= 0 && s2 <= LAST_COMMON_STEP){
            const idx2 = (ENTRY_OFFSET[other] + s2) % RING_LEN;
            if(idx2 === idx){ tokens[other][j] = -1; captured.push({color:other, idx:j}); }
          }
        });
      });
    }
  }
  const reachedHome = (newStep === FINISH_STEP);
  const bonus = (dice === 6 && consecutiveSixes < 3) || captured.length > 0 || reachedHome;
  return { captured, bonus, reachedHome };
}

function colorFinished(color){ return tokens[color].every(s => s === FINISH_STEP); }
function nextColor(color){ const i = COLORS.indexOf(color); return COLORS[(i+1) % 4]; }

function canControl(color){
  if(mode === 'computer') return color === 'red' && seats[color] === 'human';
  if(seats[color] === 'human') return color === myColor;
  if(seats[color] === 'bot') return iAmCreator;
  return false;
}

function setMsg(t){ document.getElementById('lMsg').textContent = t; }

function updateStatusUI(){
  document.getElementById('lTurnDot').style.background = COLOR_HEX[currentTurn];
  let suffix = '';
  if(mode==='online' && currentTurn===myColor) suffix=' (Aap)';
  if(mode==='computer' && currentTurn==='red') suffix=' (Aap)';
  document.getElementById('lTurnText').textContent = COLOR_LABEL[currentTurn] + ' ki baari' + suffix;
  renderDiceFace(diceValue);
  positionDiceIndicator();
  document.getElementById('lRollBtn').style.display = (canControl(currentTurn) && !awaitingMove && !gameOver) ? 'inline-block' : 'none';

  const list = document.getElementById('lPlayerList');
  list.innerHTML = '';
  COLORS.forEach(color => {
    const row = document.createElement('div');
    row.className = 'player-row' + (color===currentTurn ? ' current' : '');
    const finishedCount = tokens[color].filter(s=>s===FINISH_STEP).length;
    row.innerHTML = '<span class="dot" style="background:'+COLOR_HEX[color]+'"></span> ' +
      COLOR_LABEL[color] + ' — ' + seats[color] + ' (' + finishedCount + '/4 ghar)';
    list.appendChild(row);
  });
}

function rollDice(){
  if(gameOver || awaitingMove) return;
  if(!canControl(currentTurn)) return;
  const dice = 1 + Math.floor(Math.random()*6);
  processRoll(currentTurn, dice);
}

function processRoll(color, dice){
  diceValue = dice;
  animateDiceRoll();
  if(dice === 6) consecutiveSixes++; else consecutiveSixes = 0;
  const threeInRow = (dice === 6 && consecutiveSixes >= 3);
  const legal = threeInRow ? [] : getLegalMoves(color, dice);

  if(legal.length === 0){
    setMsg(threeInRow ? 'Lagatar 3 six — turn khatam!' : 'Koi chaal possible nahi.');
    broadcastIfNeeded({ color, dice, tokenIndex:null, captured:[], bonus:false, forfeitThree:threeInRow });
    finishTurnSegment(false);
    return;
  }

  if(seats[color] === 'bot'){
    awaitingMove = true;
    renderTokens();
    updateStatusUI();
    setMsg('Sochte hue...');
    setTimeout(() => { doMove(color, pickBotMove(color, dice, legal), dice); }, 500);
    return;
  }

  // For a human (or remote human) seat: only ask them to pick when there's a REAL choice.
  // Rolling a 6 with two+ tokens still in the yard isn't a real choice — the tokens are
  // interchangeable until they leave the yard — so just bring one out automatically.
  const allInterchangeable = legal.every(i => tokens[color][i] === -1);
  if(legal.length === 1 || allInterchangeable){
    renderTokens();
    updateStatusUI();
    setMsg(legal.length === 1 ? 'Sirf ek hi chaal possible thi — apne aap chal gaya.' : 'Yard se token nikla — apne aap chal gaya.');
    setTimeout(() => { doMove(color, legal[0], dice); }, 400);
    return;
  }

  awaitingMove = true;
  renderTokens();
  updateStatusUI();
}

function pickBotMove(color, dice, legal){
  let best = legal[0], bestScore = -1;
  legal.forEach(i => {
    const step = tokens[color][i];
    let score = (step === -1) ? 0.5 : step;
    const sim = (step===-1)?0:step+dice;
    if(sim <= LAST_COMMON_STEP){
      const idx = (ENTRY_OFFSET[color]+sim)%RING_LEN;
      if(!SAFE_RING_INDICES.has(idx)){
        COLORS.forEach(o => { if(o!==color){ tokens[o].forEach(s2=>{ if(s2>=0 && s2<=LAST_COMMON_STEP && (ENTRY_OFFSET[o]+s2)%RING_LEN===idx) score += 100; }); } });
      }
    }
    if(score > bestScore){ bestScore = score; best = i; }
  });
  return best;
}

function doMove(color, tokenIndex, dice){
  const result = applyMove(color, tokenIndex, dice);
  awaitingMove = false;
  renderTokens();

  let msg = COLOR_LABEL[color] + ' ne chaal chali.';
  if(result.captured.length){ msg += ' ' + result.captured.map(x=>COLOR_LABEL[x.color]).join(', ') + ' capture ho gaya!'; }
  if(result.reachedHome){ msg += ' Ek token ghar pahunch gaya!'; }
  setMsg(msg);

  broadcastIfNeeded({ color, dice, tokenIndex, captured: result.captured, bonus: result.bonus, forfeitThree:false });

  if(colorFinished(color)){
    gameOver = true;
    setMsg('🎉 ' + COLOR_LABEL[color] + ' JEET GAYA!');
    updateStatusUI();
    celebrateWin(color);
    return;
  }
  finishTurnSegment(result.bonus);
}

function finishTurnSegment(bonus){
  diceValue = null;
  if(!bonus){ consecutiveSixes = 0; currentTurn = nextColor(currentTurn); }
  updateStatusUI();
  maybeAutoAdvance();
}

function maybeAutoAdvance(){
  if(gameOver) return;
  const shouldAutoRoll = (mode==='computer' && seats[currentTurn]==='bot') ||
                          (mode==='online' && seats[currentTurn]==='bot' && iAmCreator);
  if(shouldAutoRoll){
    setTimeout(() => { const dice = 1+Math.floor(Math.random()*6); processRoll(currentTurn, dice); }, 550);
  }
}

function onTokenClick(color, idx){
  if(!awaitingMove || color !== currentTurn) return;
  if(!canControl(currentTurn)) return;
  doMove(color, idx, diceValue);
}
