// ============================================================
// GO — board.js
// Board state, SVG rendering, and core group/liberty math.
// (Rules/legality/scoring live in rules.js; AI lives in ai.js.)
// ============================================================

const EMPTY = 0, BLACK = 1, WHITE = 2;

let boardSize = 9;          // 9 | 13 | 19 — chosen at setup
let board = [];              // flat array, length boardSize*boardSize
let currentPlayer = BLACK;   // BLACK moves first
let koPoint = null;          // {r,c} or null — single point banned this turn only
let passCount = 0;           // consecutive passes; 2 in a row ends the game
let gameStarted = false;
let gameOver = false;
let history = [];            // snapshots for undo (single-player only)
let moveLog = [];            // for the on-screen move list
let lastMove = null;         // {r,c} of the most recently placed stone (for the marker)
let capturedCount = { 1:0, 2:0 }; // stones captured BY black / BY white

let mode = 'computer';       // 'computer' | 'online'
let myColor = BLACK;         // which color the local human controls (online mode)
let roomCode = null;
let sbClient = null;
let sbChannel = null;
let iAmCreator = false;

function freshBoard(size){
  return new Array(size*size).fill(EMPTY);
}

function idx(r,c,size){ return r*size + c; }

function neighbors(r,c,size){
  const out = [];
  if(r>0) out.push([r-1,c]);
  if(r<size-1) out.push([r+1,c]);
  if(c>0) out.push([r,c-1]);
  if(c<size-1) out.push([r,c+1]);
  return out;
}

function getGroup(bd, size, r, c){
  const color = bd[idx(r,c,size)];
  if(color === EMPTY) return null;
  const visited = new Set();
  const stack = [[r,c]];
  const group = [];
  while(stack.length){
    const [cr,cc] = stack.pop();
    const key = cr*size+cc;
    if(visited.has(key)) continue;
    visited.add(key);
    group.push([cr,cc]);
    neighbors(cr,cc,size).forEach(([nr,nc]) => {
      if(bd[idx(nr,nc,size)] === color && !visited.has(nr*size+nc)) stack.push([nr,nc]);
    });
  }
  return group;
}

function getLiberties(bd, size, group){
  const libs = new Set();
  group.forEach(([r,c]) => {
    neighbors(r,c,size).forEach(([nr,nc]) => {
      if(bd[idx(nr,nc,size)] === EMPTY) libs.add(nr*size+nc);
    });
  });
  return libs;
}

// ---------- SVG board rendering ----------
const CELL = 34;
const MARGIN = 26;

function svgSize(size){ return MARGIN*2 + (size-1)*CELL; }

function starPoints(size){
  if(size === 9)  return [[2,2],[2,6],[6,2],[6,6],[4,4]];
  if(size === 13) return [[3,3],[3,9],[9,3],[9,9],[6,6]];
  return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]]; // 19
}

function px(n){ return MARGIN + n*CELL; }

function buildBoardSVG(){
  const s = svgSize(boardSize);
  let svg = `<svg viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg" id="goSvg">`;
  svg += `<rect x="0" y="0" width="${s}" height="${s}" rx="6" fill="var(--board-wood)"/>`;

  // grid lines
  for(let i=0;i<boardSize;i++){
    const p = px(i);
    svg += `<line x1="${MARGIN}" y1="${p}" x2="${px(boardSize-1)}" y2="${p}" stroke="var(--grid-line)" stroke-width="1.2"/>`;
    svg += `<line x1="${p}" y1="${MARGIN}" x2="${p}" y2="${px(boardSize-1)}" stroke="var(--grid-line)" stroke-width="1.2"/>`;
  }
  // star points
  starPoints(boardSize).forEach(([r,c]) => {
    svg += `<circle cx="${px(c)}" cy="${px(r)}" r="3" fill="var(--grid-line)"/>`;
  });

  // stones
  for(let r=0;r<boardSize;r++){
    for(let c=0;c<boardSize;c++){
      const v = board[idx(r,c,boardSize)];
      if(v === EMPTY) continue;
      const cx = px(c), cy = px(r);
      const isBlack = v === BLACK;
      svg += `<circle cx="${cx}" cy="${cy}" r="${CELL*0.46}" fill="${isBlack ? 'url(#blackStone)' : 'url(#whiteStone)'}" stroke="${isBlack ? '#000' : '#8a8a8a'}" stroke-width="0.6"/>`;
      if(lastMove && lastMove.r===r && lastMove.c===c){
        svg += `<circle cx="${cx}" cy="${cy}" r="${CELL*0.16}" fill="none" stroke="${isBlack?'#fff':'#c0392b'}" stroke-width="1.6"/>`;
      }
    }
  }

  // hover preview stone (updated via JS, starts hidden)
  svg += `<circle id="previewStone" cx="0" cy="0" r="${CELL*0.46}" fill="var(--preview-fill)" opacity="0" pointer-events="none"/>`;

  // click targets
  for(let r=0;r<boardSize;r++){
    for(let c=0;c<boardSize;c++){
      const cx = px(c), cy = px(r);
      svg += `<rect x="${cx-CELL/2}" y="${cy-CELL/2}" width="${CELL}" height="${CELL}" fill="transparent" data-r="${r}" data-c="${c}" class="goHit"/>`;
    }
  }

  svg += `<defs>
    <radialGradient id="blackStone" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#5a5a5a"/><stop offset="100%" stop-color="#050505"/>
    </radialGradient>
    <radialGradient id="whiteStone" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#d6d0c4"/>
    </radialGradient>
  </defs>`;
  svg += `</svg>`;
  return svg;
}

function renderBoard(){
  const container = document.getElementById('goBoardWrap');
  container.innerHTML = buildBoardSVG();
  wireHitTargets();
}

function wireHitTargets(){
  const svg = document.getElementById('goSvg');
  const preview = document.getElementById('previewStone');
  svg.querySelectorAll('.goHit').forEach(hit => {
    const r = parseInt(hit.dataset.r,10), c = parseInt(hit.dataset.c,10);
    hit.addEventListener('mouseenter', () => {
      if(!canControl(currentPlayer) || gameOver || board[idx(r,c,boardSize)] !== EMPTY) return;
      preview.setAttribute('cx', px(c));
      preview.setAttribute('cy', px(r));
      preview.setAttribute('fill', currentPlayer===BLACK ? '#000' : '#fff');
      preview.setAttribute('opacity', '0.35');
    });
    hit.addEventListener('mouseleave', () => { preview.setAttribute('opacity','0'); });
    hit.addEventListener('click', () => onIntersectionClick(r,c));
  });
}
