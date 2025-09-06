(() => {
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    level: document.getElementById('level'),
    time: document.getElementById('time'),
    target: document.getElementById('target'),
    size: document.getElementById('size'),
    score: document.getElementById('score'),
  };
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');

  // Game state
  const state = {
    screen: 'title', // 'title' | 'play' | 'between' | 'gameover'
    level: 1,
    score: 0,
    roundTime: 12, // seconds
    timeLeft: 12,
    target: 60,  // balloon size target (arbitrary units)
    size: 0,     // current size units
    lastKey: null,
    lastPumpAt: 0,
    pumpCooldown: 80, // ms between valid pumps
    leakRate: 0, // per second, increases with level
    decay: 0.0, // passive decay towards 0
    playing: false,
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

  function resetForLevel(lvl) {
    state.level = lvl;
    state.size = 0;
    state.roundTime = 10 + Math.max(0, 3 - Math.floor((lvl-1)/2)); // slight help early on
    state.timeLeft = state.roundTime;
    state.target = 55 + (lvl - 1) * 10;
    state.leakRate = Math.min(8, (lvl - 1) * 1.4);
    state.decay = 0.1 + (lvl - 1) * 0.05;
    state.pumpCooldown = Math.max(60, 90 - (lvl - 1) * 5);
    state.lastKey = null;
    state.lastPumpAt = 0;
    state.playing = true;
    updateUI();
  }

  function updateUI() {
    ui.level.textContent = String(state.level);
    ui.time.textContent = state.timeLeft.toFixed(1);
    ui.target.textContent = String(Math.round(state.target));
    ui.size.textContent = String(Math.round(state.size));
    ui.score.textContent = String(Math.round(state.score));
  }

  // Input handling: alternate Z/X or Left/Right or tap left/right
  const keyMap = {
    'z': 'L', 'Z': 'L', 'ArrowLeft': 'L', 'a': 'L', 'A': 'L',
    'x': 'R', 'X': 'R', 'ArrowRight': 'R', 'l': 'R', 'L': 'R'
  };

  function pump(side) {
    const now = performance.now();
    if (!state.playing) return;
    if (now - state.lastPumpAt < state.pumpCooldown) return;
    if (state.lastKey === side) return; // must alternate sides
    state.lastKey = side;
    state.lastPumpAt = now;

    // Pump strength has a base plus a tiny bonus for good rhythm
    const strength = 3.4 + Math.random() * 0.4;
    state.size += strength;

    // small haptic via CSS? Not needed; keep it simple.
  }

  window.addEventListener('keydown', (e) => {
    const side = keyMap[e.key];
    if (side) {
      e.preventDefault();
      pump(side);
    }
    if (state.screen !== 'play' && (e.key === ' ' || e.key === 'Enter')) {
      startGame();
    }
  });

  // Touch: left/right half taps
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length) {
      const rect = canvas.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      pump(x < rect.width / 2 ? 'L' : 'R');
    }
  }, { passive: true });

  startBtn.addEventListener('click', startGame);

  function startGame() {
    state.score = 0;
    state.screen = 'play';
    setOverlay(false);
    resetForLevel(1);
  }

  function nextScreenWin() {
    state.playing = false;
    state.screen = 'between';
    state.score += Math.round(50 + state.timeLeft * 10 + state.level * 15);
    setOverlay(true, `
      <div class="panel">
        <h1>Nice Puff!</h1>
        <p>You reached the target size.</p>
        <p>Score now: <strong>${state.score}</strong></p>
        <button class="btn" id="nextBtn">Next Level</button>
      </div>
    `);
    document.getElementById('nextBtn').addEventListener('click', () => {
      setOverlay(false);
      state.screen = 'play';
      resetForLevel(state.level + 1);
    });
  }

  function nextScreenLose() {
    state.playing = false;
    state.screen = 'gameover';
    setOverlay(true, `
      <div class="panel">
        <h1>Out of Puff!</h1>
        <p>You reached size <strong>${Math.round(state.size)}</strong> but needed <strong>${Math.round(state.target)}</strong>.</p>
        <p>Final Score: <strong>${state.score}</strong></p>
        <button class="btn" id="restartBtn">Try Again</button>
      </div>
    `);
    document.getElementById('restartBtn').addEventListener('click', () => {
      startGame();
    });
  }

  // Main loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (state.screen === 'play') {
      state.timeLeft -= dt;

      // Leaks and gentle decay to simulate the challenge
      state.size -= state.leakRate * dt;
      state.size -= state.decay * dt * (state.size / 100);
      state.size = Math.max(0, state.size);

      if (state.size >= state.target) {
        nextScreenWin();
      } else if (state.timeLeft <= 0) {
        nextScreenLose();
      }

      updateUI();
    }

    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function render() {
    const w = canvas.width / DPR;
    const h = canvas.height / DPR;
    ctx.clearRect(0, 0, w, h);

    // Backdrop
    drawBackdrop(w, h);

    // Ground
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, h - 40, w, 40);

    // Balloon at center
    const base = 40;
    const scale = 3.2; // pixels per size unit
    const radius = base + Math.max(0, state.size) * (scale / 6);
    const cx = w * 0.5;
    const cy = h * 0.56;

    drawBalloon(cx, cy, radius);

    // Target marker
    const targetR = base + state.target * (scale / 6);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, targetR * 1.0, targetR * 0.86, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Instruction hints
    if (state.screen !== 'play') {
      drawHint(w, h);
    }
  }

  function drawBackdrop(w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.04)');
    g.addColorStop(1, 'rgba(255,255,255,0.01)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Soft circles
    for (let i = 0; i < 6; i++) {
      const x = (i * 123) % w;
      const y = (i * 89) % h;
      const r = 40 + (i * 25);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${0.018 + i*0.006})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBalloon(cx, cy, r) {
    const rx = r * 1.0;
    const ry = r * 0.86;
    ctx.save();

    // Body gradient
    const grad = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, r * 0.2, cx, cy, r * 1.2);
    grad.addColorStop(0, '#ff6b8a');
    grad.addColorStop(1, '#c94561');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shine
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.35, cy - ry * 0.35, rx * 0.25, ry * 0.22, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Knot
    ctx.fillStyle = '#9e2f48';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + ry * 0.95);
    ctx.lineTo(cx + 6, cy + ry * 0.95);
    ctx.lineTo(cx, cy + ry * 1.08);
    ctx.closePath();
    ctx.fill();

    // String
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + ry * 1.08);
    const segs = 10;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const x = cx + Math.sin((performance.now()/200 + i) * 0.8) * 3 * (1 - t);
      const y = cy + ry * 1.08 + t * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawHint(w, h) {
    ctx.save();
    ctx.translate(w * 0.5, h * 0.85);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '16px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Alternate Z and X (or Left/Right) to puff! Tap left/right on mobile.', 0, 0);
    ctx.restore();
  }
})();

