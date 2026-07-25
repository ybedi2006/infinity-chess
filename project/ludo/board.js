// ---------- Verified board data (programmatically generated & checked for adjacency) ----------
const RING = [[6,1],[6,2],[6,3],[6,4],[6,5],[6,6],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[8,8],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const RING_LEN = RING.length; // 56
const ENTRY_OFFSET = { red:0, green:14, yellow:28, blue:42 };
const HOME_COLUMN = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
};
const SAFE_RING_INDICES = new Set([0,8,14,22,28,36,42,50]);
const YARD_SLOTS = {
  red:    [[1,1],[1,4],[4,1],[4,4]],
  green:  [[1,10],[1,13],[4,10],[4,13]],
  yellow: [[10,10],[10,13],[13,10],[13,13]],
  blue:   [[10,1],[10,4],[13,1],[13,4]]
};
const COLORS = ['red','green','yellow','blue'];
const COLOR_HEX = { red:'#e05252', green:'#4caf7d', yellow:'#e8c14c', blue:'#4f8fdb' };
const COLOR_LABEL = { red:'Red', green:'Green', yellow:'Yellow', blue:'Blue' };
// Board rotation needed so each color's yard visually lands at bottom-left (facing the player)
const ROTATION_FOR_COLOR = { blue:0, yellow:90, green:180, red:270 };
function applyBoardOrientation(){
  const el = document.getElementById('lBoard');
  if(!el) return;
  el.classList.remove('rot-0','rot-90','rot-180','rot-270');
  el.classList.add('rot-' + ROTATION_FOR_COLOR[myColor]);
}
const LAST_COMMON_STEP = 54;   // s=0..54 => on ring (55 cells)
const FINISH_STEP = 61;        // s=55..60 => home column (6 cells); 61 = finished

let tokens = {};
let seats = { red:'human', green:'bot', yellow:'bot', blue:'bot' };
let currentTurn = 'red';
let diceValue = null;
let consecutiveSixes = 0;
let awaitingMove = false;
let gameOver = false;

let mode = 'computer';
let myColor = 'red';
let roomCode = null;
let sbClient = null;
let sbChannel = null;
let iAmCreator = false;

// SUPABASE_URL / SUPABASE_ANON_KEY ab ../shared/config.js se aate hain

function freshTokens(){
  const t = {};
  COLORS.forEach(c => { t[c] = [-1,-1,-1,-1]; });
  return t;
}

const cellEls = [];
const ringIndexAt = {};
RING.forEach((rc,i) => { ringIndexAt[rc[0]+'_'+rc[1]] = i; });
const homeColAt = {};
COLORS.forEach(color => { HOME_COLUMN[color].forEach((rc,idx) => { homeColAt[rc[0]+'_'+rc[1]] = {color, idx}; }); });
const yardSlotAt = {};
COLORS.forEach(color => { YARD_SLOTS[color].forEach((rc,idx) => { yardSlotAt[rc[0]+'_'+rc[1]] = {color, idx}; }); });

function inYardRegion(r,c){
  if(r<=5 && c<=5) return 'red';
  if(r<=5 && c>=9) return 'green';
  if(r>=9 && c>=9) return 'yellow';
  if(r>=9 && c<=5) return 'blue';
  return null;
}

function buildBoardDOM(){
  const boardEl = document.getElementById('lBoard');
  boardEl.innerHTML = '';
  for(let r=0;r<15;r++){
    cellEls.push([]);
    for(let c=0;c<15;c++){
      const div = document.createElement('div');
      div.className = 'lcell';
      const key = r+'_'+c;
      const yard = inYardRegion(r,c);
      if(yard && !(r===7 && c===7)){
        div.classList.add('yard-'+yard);
        if(yardSlotAt[key]){
          const box = document.createElement('div'); box.className='token-dots'; div.appendChild(box);
        }
      } else if(r===7 && c===7){
        div.classList.add('center');
      } else if(homeColAt[key]){
        div.classList.add('home-'+homeColAt[key].color);
        const box = document.createElement('div'); box.className='token-dots'; div.appendChild(box);
      } else if(ringIndexAt[key] !== undefined){
        const idx = ringIndexAt[key];
        if(SAFE_RING_INDICES.has(idx)) div.classList.add('safe');
        for(const col of COLORS){ if(ENTRY_OFFSET[col] === idx) div.classList.add('entry-'+col); }
        const box = document.createElement('div'); box.className='token-dots'; div.appendChild(box);
      }
      boardEl.appendChild(div);
      cellEls[r][c] = div;
    }
  }
}

function stepToCoord(color, step){
  if(step <= LAST_COMMON_STEP){
    const idx = (ENTRY_OFFSET[color] + step) % RING_LEN;
    return RING[idx];
  }
  if(step < FINISH_STEP){
    return HOME_COLUMN[color][step - LAST_COMMON_STEP - 1];
  }
  return [7,7];
}

function renderTokens(){
  document.querySelectorAll('.token-dots').forEach(el => { el.innerHTML=''; el.classList.remove('multi'); });
  const groups = {};
  COLORS.forEach(color => {
    tokens[color].forEach((step, i) => {
      let r,c;
      if(step === -1){ [r,c] = YARD_SLOTS[color][i]; }
      else { [r,c] = stepToCoord(color, step); }
      const key = r+'_'+c;
      if(!groups[key]) groups[key] = [];
      groups[key].push({color, idx:i, step});
    });
  });
  const legal = (awaitingMove && !gameOver) ? getLegalMoves(currentTurn, diceValue) : [];
  const legalSet = new Set(legal);

  Object.keys(groups).forEach(key => {
    const [r,c] = key.split('_').map(Number);
    const cell = cellEls[r][c];
    let box = cell.querySelector('.token-dots');
    if(!box){ box = document.createElement('div'); box.className='token-dots'; cell.appendChild(box); }
    const list = groups[key];
    if(list.length > 1) box.classList.add('multi');
    list.forEach(item => {
      const dot = document.createElement('div');
      dot.className = 'token';
      dot.style.background = COLOR_HEX[item.color];
      if(item.color === currentTurn && legalSet.has(item.idx) && canControl(currentTurn)){
        dot.classList.add('movable');
        dot.addEventListener('click', () => onTokenClick(item.color, item.idx));
      }
      box.appendChild(dot);
    });
  });
}

