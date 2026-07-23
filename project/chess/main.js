// ---------- Controls ----------
document.getElementById('newBtn').addEventListener('click', () => {
  if(gameMode === 'online' && sbChannel){
    sbChannel.send({ type: 'broadcast', event: 'reset', payload: {} });
  }
  resetGameState();
});

document.getElementById('undoBtn').addEventListener('click', () => {
  if(aiThinking || gameMode === 'online') return;
  // undo AI move and player move together
  game.undo();
  game.undo();
  selectedSq = null;
  legalTargets = [];
  lastMove = null;
  renderBoard();
  updateStatus();
  updateHealthBar();
  logMove();
});

// ---------- Init ----------
renderBoard();
updateStatus();
updateHealthBar();
