// ========================================================
// Onyx Music Landing Page — Interactive Micro-Interactions
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  initHeroTilt();
  initHeroWaveform();
  initSpotlightCards();
  initScrollReveal();
  initLyricsInteractiveDemo();
  initDropdownToggle();
  initSponsorBlockSync();
});

// --------------------------------------------------------
// 1. Master Hardware Window 3D Perspective Tilt
// --------------------------------------------------------
function initHeroTilt() {
  const windowEl = document.querySelector('.showcase-window');
  if (!windowEl) return;

  const stage = document.querySelector('.showcase-stage');
  if (!stage) return;

  let bounds = null;

  function updateBounds() {
    bounds = stage.getBoundingClientRect();
  }

  updateBounds();
  window.addEventListener('resize', updateBounds, { passive: true });
  window.addEventListener('scroll', updateBounds, { passive: true });

  stage.addEventListener('mousemove', (e) => {
    if (!bounds) updateBounds();
    const mouseX = e.clientX - bounds.left;
    const mouseY = e.clientY - bounds.top;

    const xPct = mouseX / bounds.width - 0.5; // -0.5 to 0.5
    const yPct = mouseY / bounds.height - 0.5;

    // Smooth subtle tilt
    const tiltX = -yPct * 3.5;
    const tiltY = xPct * 3.5;

    windowEl.style.transform = `perspective(1200px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(-2px)`;
  });

  stage.addEventListener('mouseleave', () => {
    windowEl.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0px)';
  });
}

// --------------------------------------------------------
// 2. Interactive Studio Oscilloscope Waveform (Audio Ribbon)
// --------------------------------------------------------
function initHeroWaveform() {
  const canvas = document.getElementById('hero-waveform');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let dpr = window.devicePixelRatio || 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    width = rect.width * dpr;
    height = rect.height * dpr;
    canvas.width = width;
    canvas.height = height;
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  let time = 0;
  let mouse = { x: -1000, y: -1000, isHovered: false, ampTarget: 1.0, currentAmp: 1.0 };

  const container = canvas.closest('.hero-waveform-container');
  if (container) {
    container.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * dpr;
      mouse.y = (e.clientY - rect.top) * dpr;
      mouse.isHovered = true;
      mouse.ampTarget = 1.6;
    });

    container.addEventListener('mouseleave', () => {
      mouse.isHovered = false;
      mouse.ampTarget = 1.0;
    });
  }

  function drawWave(amplitude, frequency, speed, color, lineWidth, phaseOffset, glow = false) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * dpr;
    if (glow) {
      ctx.shadowColor = '#ff2222';
      ctx.shadowBlur = 10 * dpr;
    }

    const midY = height / 2;
    const step = 2 * dpr;

    for (let x = 0; x <= width; x += step) {
      // Local mouse ripple influence
      let localAmp = amplitude;
      if (mouse.isHovered) {
        const dx = Math.abs(x - mouse.x);
        if (dx < 120 * dpr) {
          const factor = 1 - dx / (120 * dpr);
          localAmp += Math.sin(time * 6 + factor * 4) * 8 * dpr * factor;
        }
      }

      const wave1 = Math.sin(x * frequency + time * speed + phaseOffset) * localAmp;
      const wave2 = Math.cos(x * (frequency * 0.5) - time * (speed * 0.4)) * (localAmp * 0.35);
      const y = midY + wave1 + wave2;

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Subtle dampening
    mouse.currentAmp += (mouse.ampTarget - mouse.currentAmp) * 0.08;
    time += 0.025;

    // Draw hardware tick marks along top & bottom border
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    const tickSpacing = 24 * dpr;
    for (let x = 0; x < width; x += tickSpacing) {
      ctx.fillRect(x, 0, 1 * dpr, 4 * dpr);
      ctx.fillRect(x, height - 4 * dpr, 1 * dpr, 4 * dpr);
    }

    // Tertiary subtle white harmonic wave
    drawWave(5 * dpr * mouse.currentAmp, 0.015 / dpr, 0.8, 'rgba(255, 255, 255, 0.18)', 0.8, 1.2, false);

    // Secondary warm red harmonic wave
    drawWave(9 * dpr * mouse.currentAmp, 0.024 / dpr, -1.2, 'rgba(255, 34, 34, 0.45)', 1.1, 2.5, false);

    // Primary carrier sine wave with bloom
    drawWave(14 * dpr * mouse.currentAmp, 0.018 / dpr, 1.6, '#ff2222', 1.6, 0, true);

    requestAnimationFrame(render);
  }

  render();
}

// --------------------------------------------------------
// 3. Cursor Spotlight Tracker for Cards (Linear / Raycast Style)
// --------------------------------------------------------
function initSpotlightCards() {
  const cards = document.querySelectorAll('.spotlight-card');
  if (cards.length === 0) return;

  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

// --------------------------------------------------------
// 4. Scroll Reveal Animations (IntersectionObserver)
// --------------------------------------------------------
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length === 0) return;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('visible'));
  }
}

// --------------------------------------------------------
// 5. Interactive Synced Lyrics Demo with Alt + Click Sim
// --------------------------------------------------------
function initLyricsInteractiveDemo() {
  const lyricsContainer = document.getElementById('lyrics-demo');
  if (!lyricsContainer) return;

  const rows = lyricsContainer.querySelectorAll('.lyric-row');
  let currentIdx = 1;
  let autoAdvanceTimer = null;
  let isUserInteracting = false;

  function setActiveLine(idx, isAltClick = false) {
    rows.forEach((row, i) => {
      if (i === idx) {
        row.classList.add('active');
        const tag = row.querySelector('.lyric-tag');
        if (tag) {
          if (isAltClick) {
            tag.textContent = 'CALIBRATED';
            tag.style.background = 'rgba(34, 197, 94, 0.2)';
            tag.style.borderColor = 'rgba(34, 197, 94, 0.5)';
            tag.style.color = '#22c55e';
            setTimeout(() => {
              tag.textContent = 'Alt + Click';
              tag.style.background = '';
              tag.style.borderColor = '';
              tag.style.color = '';
            }, 1800);
          }
        }
      } else {
        row.classList.remove('active');
      }
    });
    currentIdx = idx;
  }

  rows.forEach((row, idx) => {
    row.addEventListener('click', (e) => {
      isUserInteracting = true;
      const isAlt = e.altKey || e.metaKey;
      setActiveLine(idx, isAlt);
    });
  });

  function startAutoAdvance() {
    autoAdvanceTimer = setInterval(() => {
      if (!isUserInteracting) {
        currentIdx = (currentIdx + 1) % rows.length;
        setActiveLine(currentIdx, false);
      }
    }, 3800);
  }

  lyricsContainer.addEventListener('mouseenter', () => {
    isUserInteracting = true;
  });

  lyricsContainer.addEventListener('mouseleave', () => {
    isUserInteracting = false;
  });

  startAutoAdvance();
}

// --------------------------------------------------------
// 6. Dropdown Menu Toggle
// --------------------------------------------------------
function initDropdownToggle() {
  const arrowBtn = document.querySelector('.split-btn-arrow');
  const dropdown = document.querySelector('.hero-dropdown');
  const splitBtn = document.querySelector('.download-split-btn');

  if (!arrowBtn || !dropdown || !splitBtn) return;

  arrowBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
  });

  document.addEventListener('click', (e) => {
    if (!splitBtn.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

// --------------------------------------------------------
// 7. SponsorBlock Flash Notification on Skip
// --------------------------------------------------------
function initSponsorBlockSync() {
  const sponsorTag = document.getElementById('sponsor-tag');
  if (!sponsorTag) return;

  setInterval(() => {
    setTimeout(() => {
      sponsorTag.style.boxShadow = '0 0 14px rgba(34, 197, 94, 0.6)';
      sponsorTag.style.borderColor = '#22c55e';
      setTimeout(() => {
        sponsorTag.style.boxShadow = '';
        sponsorTag.style.borderColor = '';
      }, 700);
    }, 1680);
  }, 6000);
}
