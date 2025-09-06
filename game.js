(() => {
  // --- Canvas + UI ---
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const spinBtn = document.getElementById('spinBtn');
  const betUp = document.getElementById('betUp');
  const betDown = document.getElementById('betDown');
  const turbo = document.getElementById('turbo');
  const ui = {
    bal: document.getElementById('bal'),
    bet: document.getElementById('bet'),
    win: document.getElementById('win'),
  };

  function resizeCanvas() {
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = Math.floor(displayW * DPR);
    canvas.height = Math.floor(displayH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();

  function setOverlay(show, contentHtml) {
    if (typeof contentHtml === 'string') {
      overlay.querySelector('.panel').innerHTML = contentHtml;
    }
    overlay.classList.toggle('show', !!show);
  }

  // --- Slot Model ---
  const REELS = 5;
  const ROWS = 3;
  const VIEW = REELS * ROWS;

  // Symbols
  const S = {
    T10: '10', J: 'J', Q: 'Q', K: 'K', A: 'A',
    P1: 'P1', P2: 'P2', P3: 'P3',
    WILD: 'WILD',
    HAT: 'HAT', // bonus/hold symbol
  };

  // Paytable: pays for 3,4,5 at 1-credit bet (multiplied by bet)
  const PAY = {
    [S.A]: [5, 15, 60],
    [S.K]: [5, 15, 50],
    [S.Q]: [4, 12, 40],
    [S.J]: [4, 10, 30],
    [S.T10]: [3, 8, 25],
    [S.P1]: [10, 40, 150],
    [S.P2]: [12, 50, 200],
    [S.P3]: [15, 60, 250],
    [S.WILD]: [0, 0, 0], // wild does not pay by itself in this simplified model
  };

  // 25 fixed lines (rows 0..2)
  const L = [
    [1,1,1,1,1],
    [0,0,0,0,0],
    [2,2,2,2,2],
    [0,1,2,1,0],
    [2,1,0,1,2],
    [0,0,1,0,0],
    [2,2,1,2,2],
    [1,0,1,2,1],
    [1,2,1,0,1],
    [0,1,1,1,0],
    [2,1,1,1,2],
    [1,1,0,1,1],
    [1,1,2,1,1],
    [0,1,0,1,0],
    [2,1,2,1,2],
    [0,2,2,2,0],
    [2,0,0,0,2],
    [0,2,1,2,0],
    [2,0,1,0,2],
    [1,0,0,0,1],
    [1,2,2,2,1],
    [0,1,2,2,2],
    [2,1,0,0,0],
    [0,0,2,0,0],
    [2,2,0,2,2],
  ];

  // Reel strips (simplified)
  const REEL_STRIPS = [
    [S.T10,S.J,S.Q,S.K,S.A,S.P1,S.P2,S.P3,S.WILD,S.T10,S.Q,S.HAT,S.K,S.A,S.P1,S.J,S.WILD,S.T10,S.HAT,S.Q,S.K,S.A,S.P2,S.J],
    [S.J,S.Q,S.K,S.A,S.P1,S.WILD,S.T10,S.Q,S.K,S.P2,S.HAT,S.A,S.P3,S.J,S.WILD,S.T10,S.Q,S.K,S.A,S.P1,S.J,S.HAT],
    [S.T10,S.Q,S.K,S.A,S.P2,S.WILD,S.T10,S.Q,S.K,S.A,S.P1,S.P3,S.J,S.WILD,S.T10,S.Q,S.K,S.A,S.P2,S.J,S.HAT],
    [S.T10,S.J,S.Q,S.K,S.A,S.P1,S.P2,S.WILD,S.T10,S.Q,S.K,S.A,S.P3,S.J,S.WILD,S.T10,S.Q,S.K,S.A,S.P2,S.J,S.HAT],
    [S.T10,S.Q,S.K,S.A,S.P1,S.P2,S.P3,S.WILD,S.T10,S.Q,S.K,S.A,S.P1,S.J,S.WILD,S.T10,S.Q,S.K,S.A,S.P2,S.J,S.HAT],
  ];

  // State
  const state = {
    screen: 'title', // 'title' | 'base' | 'respins' | 'sum'
    balance: 1000,
    bet: 1,
    lastWin: 0,
    grid: Array(VIEW).fill(S.T10),
    spinning: false,
    spinProgress: 0,
    hatCount: 0,
    // Respins feature
    feature: null, // { tiles: number[15] (0 empty, 1 straw, 2 wood, 3 brick), left: number, prizes: number[] }
  };

  function updateUI() {
    ui.bal.textContent = state.balance.toString();
    ui.bet.textContent = state.bet.toString();
    ui.win.textContent = state.lastWin.toString();
  }
  updateUI();

  startBtn.addEventListener('click', () => setOverlay(false));
  betUp.addEventListener('click', () => { if (!state.spinning) { state.bet = Math.min(50, state.bet + 1); updateUI(); } });
  betDown.addEventListener('click', () => { if (!state.spinning) { state.bet = Math.max(1, state.bet - 1); updateUI(); } });
  spinBtn.addEventListener('click', spin);

  // --- Spin Flow ---
  function spin() {
    if (state.spinning) return;
    if (state.balance < state.bet) return;
    state.balance -= state.bet;
    state.lastWin = 0;
    updateUI();
    state.spinning = true;
    state.spinProgress = 0;

    // Pick stop indices
    const stops = REEL_STRIPS.map(strip => Math.floor(Math.random() * strip.length));

    // Build visible grid
    const out = [];
    let hats = 0;
    for (let r = 0; r < REELS; r++) {
      const strip = REEL_STRIPS[r];
      const s0 = stops[r];
      for (let row = 0; row < ROWS; row++) {
        const sym = strip[(s0 + row) % strip.length];
        out.push(sym);
        if (sym === S.HAT) hats++;
      }
    }
    state.grid = out; // 15 symbols row-major by reel
    state.hatCount = hats;

    // Fake spin animation timing
    const spinTime = turbo.checked ? 350 : 900;
    const t0 = performance.now();
    const step = (now) => {
      state.spinProgress = Math.min(1, (now - t0) / spinTime);
      if (state.spinProgress < 1) {
        requestAnimationFrame(step);
      } else {
        state.spinning = false;
        finishSpin();
      }
      render();
    };
    requestAnimationFrame(step);
  }

  function finishSpin() {
    // Evaluate lines
    const win = evaluateWin(state.grid) * state.bet;
    state.lastWin = win;
    state.balance += win;
    updateUI();

    // Check feature
    if (state.hatCount >= 6) startRespins();
  }

  function evaluateWin(grid) {
    let total = 0;
    for (let li = 0; li < L.length; li++) {
      const line = L[li];
      // Get first reel symbol at the line row
      let firstSym = symAt(grid, 0, line[0]);
      // Determine base symbol (skip wild)
      let target = (firstSym === S.WILD) ? null : firstSym;
      let count = 0;
      for (let r = 0; r < REELS; r++) {
        const sym = symAt(grid, r, line[r]);
        if (target == null) {
          if (sym !== S.WILD) target = sym; // lock first non-wild
        }
        if (sym === target || sym === S.WILD) {
          count++;
        } else {
          break;
        }
      }
      if (target && count >= 3 && PAY[target]) {
        const pays = PAY[target];
        const tier = count - 3; // 0,1,2 for 3,4,5
        total += pays[tier];
      }
    }
    return total;
  }

  function symAt(grid, reel, row) {
    return grid[reel * ROWS + row];
  }

  // --- Respins Feature ---
  function startRespins() {
    const tiles = Array(VIEW).fill(0);
    // Seed tiles where hats landed
    for (let i = 0; i < VIEW; i++) if (state.grid[i] === S.HAT) tiles[i] = 1;
    state.feature = { tiles, left: 3, prizes: [] };
    state.screen = 'respins';
    setOverlay(true, `
      <div class="panel">
        <h1>Respins!</h1>
        <p>Hats stick and upgrade to better houses.</p>
        <button id="goFeature" class="btn primary">Start</button>
      </div>
    `);
    document.getElementById('goFeature').addEventListener('click', () => {
      setOverlay(false);
      runRespins();
    });
  }

  function runRespins() {
    // Loop with timed ticks to simulate respins
    const tickTime = turbo.checked ? 350 : 800;
    const timer = setInterval(() => {
      if (!state.feature) { clearInterval(timer); return; }
      const f = state.feature;
      // Try to land 1-3 new hats depending on empties
      const empties = [];
      for (let i = 0; i < VIEW; i++) if (f.tiles[i] === 0) empties.push(i);
      const toLand = Math.min(3, Math.max(1, Math.floor(Math.random() * 3)));
      let landed = 0;
      for (let k = 0; k < toLand && empties.length; k++) {
        if (Math.random() < 0.45) {
          const idx = empties.splice(Math.floor(Math.random() * empties.length), 1)[0];
          f.tiles[idx] = 1; // straw
          landed++;
        }
      }
      // Chance to upgrade some existing tiles
      for (let i = 0; i < VIEW; i++) {
        if (f.tiles[i] > 0 && Math.random() < 0.25) f.tiles[i] = Math.min(3, f.tiles[i] + 1);
      }
      // Reset spins if landed
      if (landed > 0) f.left = 3; else f.left--;
      render();
      if (f.left <= 0 || f.tiles.every(v => v > 0)) {
        clearInterval(timer);
        endRespins();
      }
    }, tickTime);
  }

  function endRespins() {
    if (!state.feature) return;
    const f = state.feature;
    // Reveal prizes based on tile level and bet
    let total = 0;
    const prizes = [];
    for (let i = 0; i < VIEW; i++) {
      const lvl = f.tiles[i];
      if (lvl === 0) { prizes[i] = 0; continue; }
      let mult = 0;
      if (lvl === 1) mult = randInt(2, 10);
      if (lvl === 2) mult = randInt(5, 25);
      if (lvl === 3) {
        // Brick has a small chance for jackpots
        const roll = Math.random();
        if (roll < 0.02) mult = 500; // Major
        else if (roll < 0.05) mult = 200; // Minor
        else if (roll < 0.12) mult = 75; // Mini
        else mult = randInt(10, 50);
      }
      const prize = mult * state.bet;
      prizes[i] = prize; total += prize;
    }
    f.prizes = prizes;
    state.lastWin = total;
    state.balance += total;
    updateUI();
    state.screen = 'sum';
    setOverlay(true, `
      <div class="panel">
        <h1>Feature Win</h1>
        <p>You won <strong>${total}</strong> credits.</p>
        <button id="backBase" class="btn">Back to Game</button>
      </div>
    `);
    document.getElementById('backBase').addEventListener('click', () => {
      state.screen = 'base';
      state.feature = null;
      setOverlay(false);
      render();
    });
  }

  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  // --- Render ---
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function render() {
    const w = canvas.width / DPR;
    const h = canvas.height / DPR;
    ctx.clearRect(0, 0, w, h);

    // Background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Reel window
    const pad = 24;
    const cellW = (w - pad * 2) / REELS;
    const cellH = (h - pad * 2) / ROWS;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, cellW * REELS, cellH * ROWS);

    // Draw cells
    for (let r = 0; r < REELS; r++) {
      for (let row = 0; row < ROWS; row++) {
        const x = pad + r * cellW;
        const y = pad + row * cellH;
        // Cell background with subtle spin blur effect
        const blur = state.spinning ? (1 - easeOutCubic(state.spinProgress)) * 0.4 : 0;
        ctx.fillStyle = `rgba(255,255,255,${0.03 + blur * 0.3})`;
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

        const sym = symAt(state.grid, r, row);
        drawSymbol(sym, x, y, cellW, cellH);
      }
    }

    // If in feature, overlay house levels
    if (state.feature) {
      const f = state.feature;
      for (let r = 0; r < REELS; r++) {
        for (let row = 0; row < ROWS; row++) {
          const idx = r * ROWS + row;
          const lvl = f.tiles[idx];
          if (lvl > 0) drawHouseOverlay(lvl, pad + r * cellW, pad + row * cellH, cellW, cellH);
        }
      }
    }
  }

  function drawSymbol(sym, x, y, w, h) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(h * 0.38)}px Fredoka, sans-serif`;

    let color = '#eee';
    if (sym === S.WILD) color = '#06d6a0';
    else if (sym === S.HAT) color = '#ffd166';
    else if (sym === S.P1) color = '#ef476f';
    else if (sym === S.P2) color = '#8ecae6';
    else if (sym === S.P3) color = '#ff9e00';
    else color = '#f2f2f2';

    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.fillText(shortLabel(sym), 0, 0);
    ctx.restore();
  }

  function shortLabel(sym) {
    switch (sym) {
      case S.WILD: return 'W';
      case S.HAT: return 'H';
      case S.P1: return 'P1';
      case S.P2: return 'P2';
      case S.P3: return 'P3';
      default: return sym;
    }
  }

  function drawHouseOverlay(lvl, x, y, w, h) {
    ctx.save();
    const colors = ['transparent', '#e6c8a4', '#caa87a', '#a86a5b'];
    ctx.fillStyle = colors[lvl];
    ctx.globalAlpha = 0.35 + 0.1 * lvl;
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.floor(h * 0.22)}px Fredoka, sans-serif`;
    const label = lvl === 1 ? 'STRAW' : lvl === 2 ? 'WOOD' : 'BRICK';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x + w / 2, y + h - 10);
    ctx.restore();
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
})();
