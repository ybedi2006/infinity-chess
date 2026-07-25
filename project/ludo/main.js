document.getElementById('lModeComputer').addEventListener('click', () => {
  mode='computer'; myColor='red';
  applyBoardOrientation();
  document.getElementById('lModeComputer').classList.add('active');
  document.getElementById('lModeFriend').classList.remove('active');
  document.getElementById('lOnlinePanel').style.display='none';
  if(sbChannel){ sbChannel.unsubscribe(); sbChannel=null; }
  seats = {red:'human', green:'bot', yellow:'bot', blue:'bot'};
  resetGame();
});
document.getElementById('lModeFriend').addEventListener('click', () => {
  mode='online';
  document.getElementById('lModeFriend').classList.add('active');
  document.getElementById('lModeComputer').classList.remove('active');
  document.getElementById('lOnlinePanel').style.display='block';
  document.getElementById('lOnlineSetup').style.display='flex';
  document.getElementById('lOnlineStatus').style.display='none';
  if(!sbClient) initSupabase();
});
document.getElementById('lCreateRoomBtn').addEventListener('click', () => {
  const code = generateRoomCode();
  seats = {red:'human', green:'bot', yellow:'bot', blue:'bot'};
  connectToRoom(code, 'red', true);
});
document.getElementById('lJoinRoomBtn').addEventListener('click', () => {
  const code = document.getElementById('lJoinCodeInput').value.trim().toUpperCase();
  if(!code) return;
  connectToRoom(code, 'green', false);
});
document.getElementById('lCopyRoomBtn').addEventListener('click', () => { if(roomCode) navigator.clipboard.writeText(roomCode); });
document.getElementById('lStartGameBtn').addEventListener('click', () => {
  sbChannel.send({ type:'broadcast', event:'ludoStart', payload:{ seats } });
  tokens = freshTokens();
  currentTurn='red'; gameOver=false; awaitingMove=false; diceValue=null; consecutiveSixes=0;
  renderTokens(); updateStatusUI(); setMsg('Game shuru!');
  maybeAutoAdvance();
});
document.getElementById('lRollBtn').addEventListener('click', rollDice);
document.getElementById('lNewBtn').addEventListener('click', () => {
  if(mode==='online' && sbChannel) sbChannel.send({type:'broadcast', event:'ludoReset', payload:{}});
  resetGame();
});

function resetGame(){
  tokens = freshTokens();
  currentTurn='red'; gameOver=false; awaitingMove=false; diceValue=null; consecutiveSixes=0;
  renderTokens(); updateStatusUI(); setMsg('');
  maybeAutoAdvance();
}

tokens = freshTokens();
buildBoardDOM();
applyBoardOrientation();
renderTokens();
updateStatusUI();
