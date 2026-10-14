// ==========================================
// Onyx Music Landing Page Interactive Engine
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initHeroParticleOrb();
  initInteractiveDsp();
});

// --------------------------------------------------
// 1. Hero Particle Audio Orb (Interactive Canvas)
// --------------------------------------------------
function initHeroParticleOrb() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio);
  let height = (canvas.height = canvas.parentElement.clientHeight * window.devicePixelRatio);

  const particles = [];
  const PARTICLE_COUNT = 140;
  const BASE_RADIUS = Math.min(width, height) * 0.32;
  const CENTER_X = width / 2;
  const CENTER_Y = height / 2;

  let mouse = { x: CENTER_X, y: CENTER_Y, isHovered: false };
  let tick = 0;

  class Particle {
    constructor(index) {
      this.angle = (index / PARTICLE_COUNT) * Math.PI * 2;
      this.baseAngle = this.angle;
      this.speed = 0.005 + (Math.random() * 0.005);
      this.dist = BASE_RADIUS + (Math.sin(index * 3) * 15);
      this.baseDist = this.dist;
      this.size = 2.0 + Math.random() * 2.8;
      this.alpha = 0.3 + Math.random() * 0.7;
      this.pulseSpeed = 0.02 + Math.random() * 0.03;
      this.color = Math.random() > 0.85 ? '#24c8d8' : '#ff2252';
    }

    update() {
      this.angle += this.speed;
      tick += 0.0001;

      // Audio breathing effect
      const breath = Math.sin(tick * 30 + this.baseAngle * 4) * 12;
      let targetDist = this.baseDist + breath;

      // Mouse displacement
      const currentX = CENTER_X + Math.cos(this.angle) * targetDist;
      const currentY = CENTER_Y + Math.sin(this.angle) * targetDist;

      const dx = mouse.x - currentX;
      const dy = mouse.y - currentY;
      const distToMouse = Math.sqrt(dx * dx + dy * dy);

      if (mouse.isHovered && distToMouse < 180) {
        const force = (180 - distToMouse) / 180;
        this.x = currentX - (dx / distToMouse) * force * 35;
        this.y = currentY - (dy / distToMouse) * force * 35;
      } else {
        this.x = currentX;
        this.y = currentY;
      }
    }

    draw() {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = this.color;
      ctx.globalAlpha = this.alpha;
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle(i));
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Draw connecting lines between close particles
    ctx.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();

      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 45) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(255, 34, 82, ${(1 - dist / 45) * 0.25})`;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(render);
  }

  render();

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * window.devicePixelRatio;
    mouse.y = (e.clientY - rect.top) * window.devicePixelRatio;
    mouse.isHovered = true;
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.isHovered = false;
  });

  window.addEventListener('resize', () => {
    width = canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
    height = canvas.height = canvas.parentElement.clientHeight * window.devicePixelRatio;
  });
}

// --------------------------------------------------
// 2. Interactive Live DSP & EQ Demo (Web Audio API)
// --------------------------------------------------
function initInteractiveDsp() {
  const canvas = document.getElementById('dsp-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio);
  let height = (canvas.height = 200 * window.devicePixelRatio);

  const playBtn = document.getElementById('dsp-play-btn');
  const bassSlider = document.getElementById('eq-bass');
  const midSlider = document.getElementById('eq-mid');
  const trebleSlider = document.getElementById('eq-treble');
  const bassVal = document.getElementById('eq-bass-val');
  const midVal = document.getElementById('eq-mid-val');
  const trebleVal = document.getElementById('eq-treble-val');
  const presetChips = document.querySelectorAll('.preset-chip');

  let audioCtx = null;
  let isPlaying = false;
  let osc1 = null;
  let osc2 = null;
  let filterBass = null;
  let filterMid = null;
  let filterTreble = null;
  let analyser = null;
  let dataArray = null;

  function initAudioNodes() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    // 3-Band Equalizer Filters
    filterBass = audioCtx.createBiquadFilter();
    filterBass.type = 'lowshelf';
    filterBass.frequency.value = 100;
    filterBass.gain.value = parseFloat(bassSlider.value);

    filterMid = audioCtx.createBiquadFilter();
    filterMid.type = 'peaking';
    filterMid.frequency.value = 1000;
    filterMid.Q.value = 1.0;
    filterMid.gain.value = parseFloat(midSlider.value);

    filterTreble = audioCtx.createBiquadFilter();
    filterTreble.type = 'highshelf';
    filterTreble.frequency.value = 8000;
    filterTreble.gain.value = parseFloat(trebleSlider.value);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    filterBass.connect(filterMid);
    filterMid.connect(filterTreble);
    filterTreble.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function startSynthLoop() {
    initAudioNodes();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Gentle chord harmonic generator
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    masterGain.connect(filterBass);

    // Warm chord notes (F minor / Ab major vibe)
    const freqs = [174.61, 220.00, 261.63, 349.23];
    freqs.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      // Subtle LFO vibrato
      const lfo = audioCtx.createOscillator();
      lfo.frequency.setValueAtTime(0.3 + idx * 0.1, audioCtx.currentTime);
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.setValueAtTime(2.5, audioCtx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      osc.connect(masterGain);
      osc.start();
    });

    isPlaying = true;
    if (playBtn) {
      playBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        <span>Pause Sample</span>
      `;
      playBtn.classList.add('btn-accent');
      playBtn.classList.remove('btn-solid');
    }
  }

  function stopSynthLoop() {
    if (audioCtx) {
      audioCtx.suspend();
    }
    isPlaying = false;
    if (playBtn) {
      playBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Play Audio Sample</span>
      `;
      playBtn.classList.remove('btn-accent');
      playBtn.classList.add('btn-solid');
    }
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (isPlaying) {
        stopSynthLoop();
      } else {
        startSynthLoop();
      }
    });
  }

  // Slider Listeners
  function updateSliderValues() {
    const b = parseFloat(bassSlider.value);
    const m = parseFloat(midSlider.value);
    const t = parseFloat(trebleSlider.value);

    bassVal.textContent = (b > 0 ? '+' : '') + b + ' dB';
    midVal.textContent = (m > 0 ? '+' : '') + m + ' dB';
    trebleVal.textContent = (t > 0 ? '+' : '') + t + ' dB';

    if (filterBass) filterBass.gain.setTargetAtTime(b, audioCtx.currentTime, 0.05);
    if (filterMid) filterMid.gain.setTargetAtTime(m, audioCtx.currentTime, 0.05);
    if (filterTreble) filterTreble.gain.setTargetAtTime(t, audioCtx.currentTime, 0.05);
  }

  bassSlider.addEventListener('input', updateSliderValues);
  midSlider.addEventListener('input', updateSliderValues);
  trebleSlider.addEventListener('input', updateSliderValues);

  // Preset Chips
  const presets = {
    flat: [0, 0, 0],
    bass: [8, 1, 2],
    vocal: [-2, 7, 3],
    electro: [7, -2, 6],
    acoustic: [3, 4, 1]
  };

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const name = chip.dataset.preset;
      const values = presets[name];
      if (values) {
        bassSlider.value = values[0];
        midSlider.value = values[1];
        trebleSlider.value = values[2];
        updateSliderValues();
      }
    });
  });

  // Oscilloscope & Spectrum Render Loop
  let simTime = 0;
  function drawDspCanvas() {
    ctx.clearRect(0, 0, width, height);
    simTime += 0.03;

    const b = parseFloat(bassSlider.value);
    const m = parseFloat(midSlider.value);
    const t = parseFloat(trebleSlider.value);

    // Spectrum Bars
    const barCount = 32;
    const barWidth = (width / barCount) - 3;

    for (let i = 0; i < barCount; i++) {
      let amp = 0;
      if (isPlaying && analyser) {
        analyser.getByteFrequencyData(dataArray);
        amp = (dataArray[i % dataArray.length] / 255) * height * 0.7;
      } else {
        // Idle ambient wave simulation
        const freqRatio = i / barCount;
        const baseH = Math.sin(simTime * 2 + i * 0.3) * 15 + 25;
        const eqInfluence = (1 - freqRatio) * b + Math.sin(freqRatio * Math.PI) * m + freqRatio * t;
        amp = Math.max(8, baseH + eqInfluence * 2.2);
      }

      const x = i * (barWidth + 3);
      const y = height - amp;

      const grad = ctx.createLinearGradient(0, height, 0, y);
      grad.addColorStop(0, 'rgba(255, 34, 82, 0.15)');
      grad.addColorStop(1, i % 3 === 0 ? 'rgba(36, 200, 216, 0.85)' : 'rgba(255, 34, 82, 0.85)');

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth, amp);

      // Top glowing cap
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y - 2, barWidth, 2);
    }

    requestAnimationFrame(drawDspCanvas);
  }

  drawDspCanvas();

  window.addEventListener('resize', () => {
    width = canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
    height = canvas.height = 200 * window.devicePixelRatio;
  });
}
