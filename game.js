// === Prevent zoom ===
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());
document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, {passive: false});
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, {passive: false});
document.addEventListener('dblclick', e => e.preventDefault());

// === Constants ===
const COLS = 10;
const ROWS = 20;
const BLOCK = 24;
const NEXT_BLOCK = 18;

const COLORS = {
  I: '#00f0ff', O: '#ffdd00', T: '#aa00ff', S: '#00ff66',
  Z: '#ff3333', J: '#0066ff', L: '#ff8800',
};

const SHAPES = {
  I: [[0,0],[1,0],[2,0],[3,0]],
  O: [[0,0],[1,0],[0,1],[1,1]],
  T: [[0,0],[1,0],[2,0],[1,1]],
  S: [[1,0],[2,0],[0,1],[1,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]],
  J: [[0,0],[0,1],[1,1],[2,1]],
  L: [[2,0],[0,1],[1,1],[2,1]],
};

const PIECE_NAMES = Object.keys(SHAPES);
const POINTS = { 1: 100, 2: 300, 3: 500, 4: 800 };

// === High Scores ===
class HighScores {
  constructor() { this.key = 'tetris_highscores'; this.max = 5; }
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; } }
  add(score, lines, level) {
    const scores = this.get();
    const entry = { score, lines, level, date: Date.now() };
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, this.max);
    localStorage.setItem(this.key, JSON.stringify(top));
    return top.findIndex(e => e.date === entry.date) !== -1;
  }
  render() {
    const list = document.getElementById('score-list');
    const scores = this.get();
    list.innerHTML = '';
    if (scores.length === 0) {
      list.innerHTML = '<li style="color:#555">Aqui no ha jugado nadie</li>';
      return;
    }
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = `${i+1}. ${String(s.score).padStart(6,' ')}  Lv${s.level}  ${s.lines}L`;
      list.appendChild(li);
    });
  }
}

const highScores = new HighScores();

// === Sound Engine ===
class SoundEngine {
  constructor() { this.ctx = null; this.enabled = true; this.volume = 0.3; }
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  play(type) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    switch (type) {
      case 'move': this._tick(200, 0.04); break;
      case 'rotate': this._sweep(300, 500, 0.08); break;
      case 'softdrop': this._tick(150, 0.03); break;
      case 'harddrop': this._thud(); break;
      case 'lock': this._tick(100, 0.06); break;
      case 'clear1': this._clearLine(1); break;
      case 'clear2': this._clearLine(2); break;
      case 'clear3': this._clearLine(3); break;
      case 'clear4': this._tetris(); break;
      case 'garbage': this._rumble(); break;
      case 'levelup': this._levelUp(); break;
      case 'gameover': this._gameOver(); break;
      case 'countdown': this._beep(440, 0.15); break;
      case 'go': this._beep(880, 0.3); break;
      case 'pause': this._beep(330, 0.1); break;
    }
  }
  _tick(freq, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.value = this.volume * 0.3;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  _beep(freq, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.value = this.volume * 0.5;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  _sweep(f1, f2, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f1;
    o.frequency.linearRampToValueAtTime(f2, this.ctx.currentTime + dur);
    g.gain.value = this.volume * 0.3;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  _thud() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 80;
    o.frequency.exponentialRampToValueAtTime(30, t + 0.15);
    g.gain.value = this.volume * 0.6;
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(this.ctx.destination); o.start(); o.stop(t + 0.15);
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    const n = this.ctx.createBufferSource(), ng = this.ctx.createGain();
    n.buffer = buf; ng.gain.value = this.volume * 0.4;
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(ng).connect(this.ctx.destination); n.start();
  }
  _clearLine(count) {
    const t = this.ctx.currentTime, base = 400 + count * 100;
    for (let i = 0; i < count + 1; i++) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = base + i * 150;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(this.volume * 0.3, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.12);
      o.connect(g).connect(this.ctx.destination); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.15);
    }
  }
  _tetris() {
    const t = this.ctx.currentTime;
    [523,659,784,1047].forEach((f,i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'square'; o.frequency.value = f; g.gain.value = 0;
      g.gain.linearRampToValueAtTime(this.volume*0.4, t+i*0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t+i*0.07+0.2);
      o.connect(g).connect(this.ctx.destination); o.start(t+i*0.07); o.stop(t+i*0.07+0.25);
    });
  }
  _rumble() {
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random()*2-1;
    const n = this.ctx.createBufferSource(), g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=150;
    n.buffer=buf; g.gain.value=this.volume*0.5;
    g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    n.connect(f).connect(g).connect(this.ctx.destination); n.start();
  }
  _levelUp() {
    const t = this.ctx.currentTime;
    [440,554,659,880].forEach((f,i) => {
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.type='sine'; o.frequency.value=f; g.gain.value=0;
      g.gain.linearRampToValueAtTime(this.volume*0.35,t+i*0.1);
      g.gain.exponentialRampToValueAtTime(0.001,t+i*0.1+0.15);
      o.connect(g).connect(this.ctx.destination); o.start(t+i*0.1); o.stop(t+i*0.1+0.2);
    });
  }
  _gameOver() {
    const t = this.ctx.currentTime;
    [440,370,311,261].forEach((f,i) => {
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.type='sawtooth'; o.frequency.value=f; g.gain.value=0;
      g.gain.linearRampToValueAtTime(this.volume*0.3,t+i*0.2);
      g.gain.exponentialRampToValueAtTime(0.001,t+i*0.2+0.3);
      o.connect(g).connect(this.ctx.destination); o.start(t+i*0.2); o.stop(t+i*0.2+0.35);
    });
  }
}

const sfx = new SoundEngine();

// === Music Engine ===
class MusicEngine {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.volume = 0.13;
    this.tempo = 144;
    this.nextNoteTime = 0;
    this.nextBassTime = 0;
    this.currentNote = 0;
    this.currentBass = 0;
    this.timerId = null;
    this.melody = [
      [659,1],[494,0.5],[523,0.5],[587,1],[523,0.5],[494,0.5],
      [440,1],[440,0.5],[523,0.5],[659,1],[587,0.5],[523,0.5],
      [494,1],[494,0.5],[523,0.5],[587,1],[659,1],
      [523,1],[440,1],[440,1],[0,0.5],
      [0,0.5],[587,1],[698,0.5],[880,1],[784,0.5],[698,0.5],
      [659,1.5],[523,0.5],[659,1],[587,0.5],[523,0.5],
      [494,1],[494,0.5],[523,0.5],[587,1],[659,1],
      [523,1],[440,1],[440,1],[0,1],
    ];
    this.bass = [
      [165,2],[131,2],[147,2],[131,2],
      [165,2],[131,2],[147,2],[131,2],
      [165,2],[131,2],[147,2],[131,2],
      [165,2],[131,2],[147,2],[131,2],
    ];
  }
  init(audioCtx) { this.ctx = audioCtx; }
  start() {
    if (!this.ctx || this.playing) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playing = true;
    this.currentNote = 0;
    this.currentBass = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.nextBassTime = this.ctx.currentTime + 0.1;
    this._schedule();
  }
  stop() {
    this.playing = false;
    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
  }
  _schedule() {
    if (!this.playing) return;
    const bl = 60 / this.tempo;
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      const [freq, beats] = this.melody[this.currentNote % this.melody.length];
      const dur = beats * bl;
      if (freq > 0) this._playNote(freq, this.nextNoteTime, dur * 0.8, 'square', this.volume);
      this.nextNoteTime += dur;
      this.currentNote++;
    }
    while (this.nextBassTime < this.ctx.currentTime + 0.2) {
      const [freq, beats] = this.bass[this.currentBass % this.bass.length];
      const dur = beats * bl;
      if (freq > 0) this._playNote(freq, this.nextBassTime, dur * 0.7, 'triangle', this.volume * 0.8);
      this.nextBassTime += dur;
      this.currentBass++;
    }
    this.timerId = setTimeout(() => this._schedule(), 50);
  }
  _playNote(freq, when, dur, type, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.setValueAtTime(vol * 0.7, when + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(when); o.stop(when + dur + 0.01);
  }
}

const music = new MusicEngine();

// === Piece ===
class Piece {
  constructor(type) {
    this.type = type;
    this.color = COLORS[type];
    this.blocks = SHAPES[type].map(([x,y])=>[x,y]);
    this.x = 3; this.y = 0;
  }
  rotated() {
    const cx = this.blocks.reduce((s,b)=>s+b[0],0)/this.blocks.length;
    const cy = this.blocks.reduce((s,b)=>s+b[1],0)/this.blocks.length;
    return this.blocks.map(([x,y])=>{
      return [Math.round(cx-(y-cy)), Math.round(cy+(x-cx))];
    });
  }
  getAbsolute(blocks) {
    return (blocks||this.blocks).map(([bx,by])=>[this.x+bx,this.y+by]);
  }
}

// === Board ===
class Board {
  constructor(canvasId, nextCanvasId, scoreId, linesId, levelId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.nextCanvas = document.getElementById(nextCanvasId);
    this.nextCtx = this.nextCanvas.getContext('2d');
    this.scoreEl = document.getElementById(scoreId);
    this.linesEl = document.getElementById(linesId);
    this.levelEl = document.getElementById(levelId);
    this.reset();
  }
  reset() {
    this.grid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
    this.score=0; this.lines=0; this.level=1;
    this.piece=null; this.nextPiece=null;
    this.gameOver=false; this.dropCounter=0;
    this.combo=0;
    this.updateStats();
  }
  getDropInterval() { return Math.max(100, 800-(this.level-1)*70); }
  spawn() {
    this.piece = this.nextPiece || new Piece(PIECE_NAMES[Math.floor(Math.random()*PIECE_NAMES.length)]);
    this.piece.x=3; this.piece.y=0;
    this.nextPiece = new Piece(PIECE_NAMES[Math.floor(Math.random()*PIECE_NAMES.length)]);
    if (!this.isValid(this.piece.blocks, this.piece.x, this.piece.y)) this.gameOver=true;
  }
  isValid(blocks,px,py) {
    return blocks.every(([bx,by])=>{
      const x=px+bx, y=py+by;
      return x>=0 && x<COLS && y<ROWS && (y<0 || !this.grid[y][x]);
    });
  }
  move(dx) {
    if (!this.piece||this.gameOver) return false;
    if (this.isValid(this.piece.blocks,this.piece.x+dx,this.piece.y)) { this.piece.x+=dx; return true; }
    return false;
  }
  rotate() {
    if (!this.piece||this.gameOver||this.piece.type==='O') return false;
    const rot = this.piece.rotated();
    for (const k of [0,-1,1,-2,2]) {
      if (this.isValid(rot,this.piece.x+k,this.piece.y)) { this.piece.blocks=rot; this.piece.x+=k; return true; }
    }
    return false;
  }
  softDrop() {
    if (!this.piece||this.gameOver) return 0;
    if (this.isValid(this.piece.blocks,this.piece.x,this.piece.y+1)) { this.piece.y++; this.score+=1; return 1; }
    this.lock(); return 2;
  }
  hardDrop() {
    if (!this.piece||this.gameOver) return;
    while (this.isValid(this.piece.blocks,this.piece.x,this.piece.y+1)) { this.piece.y++; this.score+=2; }
    this.lock();
  }
  getGhostY() {
    if (!this.piece) return 0;
    let gy=this.piece.y;
    while (this.isValid(this.piece.blocks,this.piece.x,gy+1)) gy++;
    return gy;
  }
  lock() {
    // Points for placing a piece
    this.score += 10 * this.level;
    for (const [x,y] of this.piece.getAbsolute()) {
      if (y>=0&&y<ROWS) this.grid[y][x]=this.piece.color;
    }
    const prevLv = this.level;
    const cl = this.clearLines();
    if (cl>0) sfx.play(cl===4?'clear4':'clear'+cl); else sfx.play('lock');
    if (this.level>prevLv) sfx.play('levelup');
    this.spawn();
  }
  clearLines() {
    let cleared=0;
    for (let y=ROWS-1;y>=0;y--) {
      if (this.grid[y].every(c=>c!==null)) {
        this.grid.splice(y,1); this.grid.unshift(Array(COLS).fill(null));
        cleared++; y++;
      }
    }
    if (cleared>0) {
      this.combo++;
      // Base line points + combo bonus (50 per combo after first)
      const comboBonus = this.combo > 1 ? 50 * (this.combo - 1) * this.level : 0;
      this.lines+=cleared; this.score+=POINTS[cleared]*this.level + comboBonus;
      this.level=Math.floor(this.lines/10)+1; this.updateStats();
    } else {
      this.combo = 0;
    }
    return cleared;
  }
  addGarbage(count) {
    if (this.gameOver) return;
    sfx.play('garbage');
    for (let i=0;i<count;i++) {
      this.grid.shift();
      const hole=Math.floor(Math.random()*COLS);
      const row=Array(COLS).fill('#666'); row[hole]=null;
      this.grid.push(row);
    }
    if (this.piece && !this.isValid(this.piece.blocks,this.piece.x,this.piece.y)) {
      this.piece.y=Math.max(0,this.piece.y-count);
      if (!this.isValid(this.piece.blocks,this.piece.x,this.piece.y)) this.gameOver=true;
    }
  }
  updateStats() {
    this.scoreEl.textContent=this.score;
    this.linesEl.textContent=this.lines;
    this.levelEl.textContent=this.level;
  }
  draw(dimmed) {
    const ctx=this.ctx;
    const cw=this.canvas.width, ch=this.canvas.height;
    const bw=cw/COLS, bh=ch/ROWS;
    ctx.clearRect(0,0,cw,ch);
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
      if (this.grid[y][x]) this.drawBlock(ctx,x,y,this.grid[y][x],bw,bh);
      else {
        ctx.fillStyle='#0d0d1a'; ctx.fillRect(x*bw,y*bh,bw,bh);
        ctx.strokeStyle='#1a1a2e'; ctx.strokeRect(x*bw,y*bh,bw,bh);
      }
    }
    if (this.piece && !this.gameOver) {
      const gy=this.getGhostY();
      for (const [bx,by] of this.piece.blocks) {
        const gx=this.piece.x+bx, gpy=gy+by;
        if (gpy>=0) {
          ctx.fillStyle='rgba(255,255,255,0.08)';
          ctx.fillRect(gx*bw+1,gpy*bh+1,bw-2,bh-2);
          ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
          ctx.strokeRect(gx*bw+1,gpy*bh+1,bw-2,bh-2);
        }
      }
      for (const [bx,by] of this.piece.blocks) {
        const px=this.piece.x+bx, py=this.piece.y+by;
        if (py>=0) this.drawBlock(ctx,px,py,this.piece.color,bw,bh);
      }
    }
    if (this.gameOver) {
      ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,cw,ch);
      ctx.fillStyle='#ff4444'; ctx.font='bold 20px sans-serif'; ctx.textAlign='center';
      ctx.fillText('GAME OVER',cw/2,ch/2);
    }
    if (dimmed) { ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,0,cw,ch); }
    this.updateStats(); this.drawNext();
  }
  drawBlock(ctx,x,y,color,bw,bh) {
    bw=bw||BLOCK; bh=bh||BLOCK;
    ctx.fillStyle=color; ctx.fillRect(x*bw+1,y*bh+1,bw-2,bh-2);
    ctx.fillStyle='rgba(255,255,255,0.2)';
    ctx.fillRect(x*bw+1,y*bh+1,bw-2,3); ctx.fillRect(x*bw+1,y*bh+1,3,bh-2);
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.fillRect(x*bw+1,y*bh+BLOCK-4,bw-2,3); ctx.fillRect(x*bw+BLOCK-4,y*bh+1,3,bh-2);
  }
  drawNext() {
    const ctx=this.nextCtx, c=this.nextCanvas;
    ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle='#111'; ctx.fillRect(0,0,c.width,c.height);
    if (!this.nextPiece) return;
    const bl=this.nextPiece.blocks;
    const minX=Math.min(...bl.map(b=>b[0])), maxX=Math.max(...bl.map(b=>b[0]));
    const minY=Math.min(...bl.map(b=>b[1])), maxY=Math.max(...bl.map(b=>b[1]));
    const ox=(c.width-(maxX-minX+1)*NEXT_BLOCK)/2, oy=(c.height-(maxY-minY+1)*NEXT_BLOCK)/2;
    for (const [bx,by] of bl) {
      const px=ox+(bx-minX)*NEXT_BLOCK, py=oy+(by-minY)*NEXT_BLOCK;
      ctx.fillStyle=this.nextPiece.color; ctx.fillRect(px+1,py+1,NEXT_BLOCK-2,NEXT_BLOCK-2);
      ctx.fillStyle='rgba(255,255,255,0.2)';
      ctx.fillRect(px+1,py+1,NEXT_BLOCK-2,2); ctx.fillRect(px+1,py+1,2,NEXT_BLOCK-2);
    }
  }
  cloneGrid() { return this.grid.map(r=>[...r]); }
}

// === AI ===
class TetrisAI {
  constructor(diff) {
    this.targetMove=null; this.moveTimer=0; this.thinkTimer=0;
    this.hasThought=false; this._lastPiece=null; this._rotDone=0;
    const configs = {
      easy:   {w:{lines:1,holes:-1,height:-0.2,bump:-0.1,well:0.2},  md:400,td:900,mc:0.40},
      medium: {w:{lines:4,holes:-4,height:-0.7,bump:-0.4,well:0.7},  md:150,td:350,mc:0.10},
      hard:   {w:{lines:8,holes:-10,height:-1.5,bump:-0.8,well:2},   md:50, td:80, mc:0},
    };
    const c = configs[diff];
    this.w=c.w; this.moveDelay=c.md; this.thinkDelay=c.td; this.mistakeChance=c.mc;
  }
  _rots(piece) {
    const r=[piece.blocks.map(([x,y])=>[x,y])];
    if (piece.type==='O') return r;
    let cur=piece.blocks.map(([x,y])=>[x,y]);
    const mx='ISZ'.includes(piece.type)?2:4;
    for (let i=1;i<mx;i++) {
      const cx=cur.reduce((s,b)=>s+b[0],0)/cur.length;
      const cy=cur.reduce((s,b)=>s+b[1],0)/cur.length;
      cur=cur.map(([x,y])=>[Math.round(cx-(y-cy)),Math.round(cy+(x-cx))]);
      r.push(cur.map(([x,y])=>[x,y]));
    }
    return r;
  }
  _valid(g,bl,px,py) {
    return bl.every(([bx,by])=>{const x=px+bx,y=py+by; return x>=0&&x<COLS&&y<ROWS&&(y<0||!g[y][x]);});
  }
  _sim(grid,blocks,px) {
    const g=grid.map(r=>[...r]); let dy=0;
    while(this._valid(g,blocks,px,dy+1)) dy++;
    for(const[bx,by]of blocks){const x=px+bx,y=dy+by;if(y>=0&&y<ROWS&&x>=0&&x<COLS)g[y][x]='#fff';}
    let cl=0;
    for(let y=ROWS-1;y>=0;y--){if(g[y].every(c=>c!==null)){g.splice(y,1);g.unshift(Array(COLS).fill(null));cl++;y++;}}
    return {grid:g,cl};
  }
  _eval(g,cl) {
    const w=this.w; let s=cl*w.lines;
    const h=[];
    for(let x=0;x<COLS;x++){let hh=0;for(let y=0;y<ROWS;y++){if(g[y][x]){hh=ROWS-y;break;}}h.push(hh);}
    s+=h.reduce((a,b)=>a+b,0)*w.height;
    let holes=0;
    for(let x=0;x<COLS;x++){let f=false;for(let y=0;y<ROWS;y++){if(g[y][x])f=true;else if(f)holes++;}}
    s+=holes*w.holes;
    let bump=0;for(let x=0;x<COLS-1;x++)bump+=Math.abs(h[x]-h[x+1]);s+=bump*w.bump;
    for(let x=0;x<COLS;x++){const l=x>0?h[x-1]:20,r=x<COLS-1?h[x+1]:20,d=Math.min(l,r)-h[x];if(d>0&&d<=4)s+=d*w.well;}
    return s;
  }
  findBest(board) {
    if(!board.piece||board.gameOver) return null;
    const grid=board.cloneGrid(), rots=this._rots(board.piece);
    let bs=-Infinity, bm=null;
    for(let r=0;r<rots.length;r++){
      const bl=rots[r], mnx=Math.min(...bl.map(b=>b[0])), mxx=Math.max(...bl.map(b=>b[0]));
      for(let px=-mnx;px<COLS-mxx;px++){
        if(!this._valid(grid,bl,px,0)) continue;
        const res=this._sim(grid,bl,px), sc=this._eval(res.grid,res.cl);
        if(sc>bs){bs=sc;bm={rotation:r,targetX:px};}
      }
    }
    if(bm&&this.mistakeChance>0&&Math.random()<this.mistakeChance){
      const bl=rots[0],mnx=Math.min(...bl.map(b=>b[0])),mxx=Math.max(...bl.map(b=>b[0]));
      const rx=Math.floor(Math.random()*(COLS-mxx+mnx))-mnx;
      if(this._valid(grid,bl,rx,0)) bm={rotation:0,targetX:rx};
    }
    return bm;
  }
  update(board,dt) {
    if(!board.piece||board.gameOver) return;
    if(board.piece!==this._lastPiece){
      this._lastPiece=board.piece; this.targetMove=null; this.hasThought=false;
      this.thinkTimer=0; this.moveTimer=0; this._rotDone=0;
    }
    if(!this.hasThought){
      this.thinkTimer+=dt;
      if(this.thinkTimer>=this.thinkDelay){this.targetMove=this.findBest(board);this.hasThought=true;this.moveTimer=0;this._rotDone=0;}
      return;
    }
    if(!this.targetMove) return;
    this.moveTimer+=dt; if(this.moveTimer<this.moveDelay) return; this.moveTimer=0;
    if(this._rotDone<this.targetMove.rotation){board.rotate();this._rotDone++;return;}
    if(board.piece.x<this.targetMove.targetX){board.move(1);return;}
    if(board.piece.x>this.targetMove.targetX){board.move(-1);return;}
    board.hardDrop(); this.targetMove=null;
  }
}

// === Key normalization ===
function normalizeKey(e) {
  const map = {
    'KeyA':'a','KeyD':'d','KeyS':'s','KeyW':'w','KeyQ':'q',
    'ArrowLeft':'arrowleft','ArrowRight':'arrowright','ArrowDown':'arrowdown','ArrowUp':'arrowup',
    'Space':'space','Escape':'escape',
  };
  return map[e.code] || e.key.toLowerCase();
}

// === Landscape lock ===
function tryLockLandscape() {
  const sl = screen.orientation;
  if (sl && sl.lock) {
    sl.lock('landscape').catch(()=>{});
  }
}

// === Difficulty map (UI label -> internal key) ===
const DIFF_MAP = { easy: 'easy', medium: 'medium', hard: 'hard' };

// === Game Controller ===
class Game {
  constructor() {
    this.board1 = new Board('board1','next1','score1','lines1','level1');
    this.board2 = new Board('board2','next2','score2','lines2','level2');
    this.running=false; this.paused=false; this.gameActive=false;
    this.lastTime=0; this.keys={}; this.keyTimers={};
    this.aiDifficulty='medium'; this.ai=null;
    highScores.render();
    this.setupUI();
    this.setupInput();
    this.setupTouch();
    this.resizeBoards();
    window.addEventListener('resize', () => this.resizeBoards());
  }

  resizeBoards() {
    // On mobile landscape, canvas dimensions are set by CSS (height: calc(...), width: auto)
    // We need to sync the internal resolution to the displayed size for crisp rendering
    const boards = [this.board1, this.board2];
    for (const b of boards) {
      const rect = b.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Only resize if CSS is controlling the size (mobile)
        const cssW = Math.round(rect.width);
        const cssH = Math.round(rect.height);
        if (b.canvas.width !== cssW || b.canvas.height !== cssH) {
          b.canvas.width = cssW;
          b.canvas.height = cssH;
        }
      }
    }
  }

  setupUI() {
    document.getElementById('btn-start').addEventListener('click',()=>this.startGame());
    document.getElementById('btn-restart').addEventListener('click',()=>this.startGame());
    document.getElementById('btn-menu').addEventListener('click',()=>this.goToMenu());

    document.querySelectorAll('.diff-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected'); this.aiDifficulty=btn.dataset.diff;
      });
    });

    // Pause button
    document.getElementById('pause-btn').addEventListener('click', (e) => {
      e.preventDefault();
      if (this.gameActive && !this.board1.gameOver && !this.board2.gameOver) {
        this.togglePause();
      }
    });

    // Restart button (during game)
    document.getElementById('restart-btn').addEventListener('click', (e) => {
      e.preventDefault();
      if (this.gameActive) {
        music.stop();
        this.running = false;
        this.paused = false;
        this.startGame();
      }
    });

    // Menu button (during game)
    document.getElementById('menu-btn').addEventListener('click', (e) => {
      e.preventDefault();
      if (this.gameActive) {
        this.goToMenu();
      }
    });
  }

  setupInput() {
    this.DAS_DELAY=170; this.DAS_RATE=50;
    document.addEventListener('keydown',(e)=>{
      const key=normalizeKey(e);
      if((key==='space'||key==='escape')&&this.gameActive){
        e.preventDefault();
        if(this.board1.gameOver||this.board2.gameOver) return;
        this.togglePause(); return;
      }
      if(!this.running||this.paused) return;
      const gk=['a','d','s','w','q','arrowleft','arrowright','arrowdown','arrowup'];
      if(gk.includes(key)) e.preventDefault();
      if(this.keys[key]) return; this.keys[key]=true;
      this.handleKeyAction(key);
      if(['a','d','arrowleft','arrowright'].includes(key)){
        this.keyTimers[key]=setTimeout(()=>{
          this.keyTimers[key+'_r']=setInterval(()=>{if(this.keys[key])this.handleKeyAction(key);},this.DAS_RATE);
        },this.DAS_DELAY);
      }
      if(['s','arrowdown'].includes(key)){
        this.keyTimers[key]=setInterval(()=>{if(this.keys[key])this.handleKeyAction(key);},this.DAS_RATE);
      }
    });
    document.addEventListener('keyup',(e)=>{
      const key=normalizeKey(e); this.keys[key]=false;
      clearTimeout(this.keyTimers[key]); clearInterval(this.keyTimers[key]); clearInterval(this.keyTimers[key+'_r']);
    });
  }

  setupTouch() {
    const target = document.getElementById('board1');
    if (!target) return;

    let startX=0, startY=0, startTime=0, moved=false;
    let swipeMoveAccum = 0;
    let dropCooldown = false;

    const SWIPE_CELL = 40;          // px per horizontal cell move
    const SWIPE_DOWN_THRESHOLD = 120; // px to trigger hard drop (much higher)
    const DROP_COOLDOWN_MS = 400;    // cooldown after hard drop

    target.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      startTime = Date.now(); moved = false; swipeMoveAccum = 0;
    }, {passive: false});

    target.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.running || this.paused) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // Horizontal swipe: move piece per SWIPE_CELL px
      const cellsMoved = Math.floor(Math.abs(dx) / SWIPE_CELL);
      if (cellsMoved > swipeMoveAccum) {
        const dir = dx > 0 ? 1 : -1;
        const count = cellsMoved - swipeMoveAccum;
        for (let i = 0; i < count; i++) {
          if (this.board1.move(dir)) sfx.play('move');
        }
        swipeMoveAccum = cellsMoved;
        moved = true;
      }

      // Downward swipe for hard drop (with cooldown)
      if (!dropCooldown && dy > SWIPE_DOWN_THRESHOLD && Math.abs(dx) < dy * 0.4) {
        sfx.play('harddrop');
        this.board1.hardDrop();
        startY = t.clientY;
        moved = true;
        dropCooldown = true;
        setTimeout(() => { dropCooldown = false; }, DROP_COOLDOWN_MS);
      }
    }, {passive: false});

    target.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!this.running) {
        if (this.paused && this.gameActive) { this.togglePause(); }
        return;
      }
      const elapsed = Date.now() - startTime;
      if (!moved && elapsed < 300) {
        if (this.board1.rotate()) sfx.play('rotate');
      }
    }, {passive: false});

    // Tap anywhere when paused to unpause
    const gameScreen = document.getElementById('game-screen');
    gameScreen.addEventListener('touchstart', (e) => {
      if (this.paused && this.gameActive && e.target !== target) {
        e.preventDefault();
        this.togglePause();
      }
    }, {passive: false});
  }

  handleKeyAction(key) {
    // All controls go to board1 (player), board2 is AI-controlled
    switch(key){
      case 'a':case 'arrowleft': if(this.board1.move(-1)) sfx.play('move'); break;
      case 'd':case 'arrowright': if(this.board1.move(1)) sfx.play('move'); break;
      case 's':case 'arrowdown': {const r=this.board1.softDrop();if(r===1)sfx.play('softdrop');} break;
      case 'w':case 'arrowup': if(this.board1.rotate()) sfx.play('rotate'); break;
      case 'q': sfx.play('harddrop'); this.board1.hardDrop(); break;
    }
  }

  togglePause() {
    if(this.paused){
      this.paused=false; this.running=true;
      document.getElementById('pause-overlay').classList.add('hidden');
      music.start();
      this.lastTime=performance.now();
      requestAnimationFrame((t)=>this.loop(t));
    } else {
      this.paused=true; this.running=false;
      sfx.play('pause'); music.stop();
      document.getElementById('pause-overlay').classList.remove('hidden');
      this.board1.draw(true); this.board2.draw(true);
      for(const k in this.keys) this.keys[k]=false;
      for(const k in this.keyTimers){clearTimeout(this.keyTimers[k]);clearInterval(this.keyTimers[k]);}
      this.keyTimers={};
    }
  }

  goToMenu() {
    this.running=false; this.paused=false; this.gameActive=false;
    music.stop();
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    highScores.render();
  }

  startGame() {
    sfx.init();
    music.init(sfx.ctx);
    tryLockLandscape();

    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('game-over-msg').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');

    this.board1.reset(); this.board2.reset();
    this.running=false; this.paused=false; this.gameActive=true;
    this.ai = new TetrisAI(this.aiDifficulty);

    this.resizeBoards();

    this.countdown(3, ()=>{
      this.board1.spawn(); this.board2.spawn();
      this.running=true; this.lastTime=performance.now();
      this.board1.dropCounter=0; this.board2.dropCounter=0;
      music.start();
      requestAnimationFrame((t)=>this.loop(t));
    });
  }

  countdown(n, callback) {
    const el=document.getElementById('countdown');
    el.classList.remove('hidden');
    let count=n; el.textContent=count; sfx.play('countdown');
    const tick=setInterval(()=>{
      count--;
      if(count>0){el.textContent=count;sfx.play('countdown');}
      else if(count===0){el.textContent='GO!';sfx.play('go');}
      else{el.classList.add('hidden');clearInterval(tick);callback();}
    },700);
  }

  loop(time) {
    if(!this.running) return;
    const dt=time-this.lastTime; this.lastTime=time;
    this.update(this.board1,dt); this.update(this.board2,dt);
    if(this.ai) this.ai.update(this.board2,dt);
    this.board1.draw(false); this.board2.draw(false);
    if(this.board1.gameOver||this.board2.gameOver){
      this.running=false; music.stop(); sfx.play('gameover');
      this.showGameOver(); return;
    }
    requestAnimationFrame((t)=>this.loop(t));
  }

  update(board,dt) {
    if(board.gameOver||!board.piece) return;
    board.dropCounter+=dt;
    if(board.dropCounter>=board.getDropInterval()){
      board.dropCounter=0;
      if(board.isValid(board.piece.blocks,board.piece.x,board.piece.y+1)) board.piece.y++;
      else {
        const prev=board.lines; board.lock();
        const cl=board.lines-prev;
        if(cl>=2){const opp=board===this.board1?this.board2:this.board1;opp.addGarbage(cl-1);}
      }
    }
  }

  showGameOver() {
    this.gameActive=false;
    const msg=document.getElementById('game-over-msg');
    const winner=document.getElementById('winner-text');
    const fs=document.getElementById('final-scores');
    const nh=document.getElementById('new-highscore');

    // Difficulty labels
    const diffLabels = { easy: 'R2-D2', medium: 'RoboCop', hard: 'T-800' };
    const aiName = diffLabels[this.aiDifficulty] || 'IA';

    if(this.board1.gameOver&&this.board2.gameOver) winner.textContent='Tablas, nadie gano!';
    else if(this.board1.gameOver) winner.textContent='Huy que chafa, '+aiName+' te gano!';
    else winner.textContent='Eres un regon, le ganaste a '+aiName+'!';

    fs.innerHTML=
      `Tu: <span class="score-val">${this.board1.score}</span> pts | ${this.board1.lines} lineas | Nv${this.board1.level}<br>`+
      `${aiName}: <span class="score-val">${this.board2.score}</span> pts | ${this.board2.lines} lineas | Nv${this.board2.level}`;

    const isNew = highScores.add(this.board1.score, this.board1.lines, this.board1.level);
    nh.classList.toggle('hidden',!isNew);
    msg.classList.remove('hidden');
  }
}

const game = new Game();
