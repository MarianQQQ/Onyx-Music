// ========================================================
// Onyx Music Landing Page — Interactive Micro-Interactions
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  initHeroTilt();
  initLyricsInteractiveDemo();
  initDropdownToggle();
  initHardwareAudioMeter();
});

// --------------------------------------------------------
// 1. Master Hardware Window 3D Perspective Tilt & Spotlight
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

    // Ultra-subtle tilt: max 2.5 degrees for premium weight
    const tiltX = -yPct * 4;
    const tiltY = xPct * 4;

    windowEl.style.transform = `perspective(1200px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(-2px)`;
  });

  stage.addEventListener('mouseleave', () => {
    windowEl.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0px)';
  });
}

// --------------------------------------------------------
// 2. Interactive Synced Lyrics Demo with Alt + Click Sim
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

  // Smooth auto-advancing demo loop
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
// 3. Dropdown Menu Toggle
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
// 4. Subtle Hardware Audio Meter Randomized Modulation
// --------------------------------------------------------
function initHardwareAudioMeter() {
  const meterBars = document.querySelectorAll('.meter-bar');
  if (meterBars.length === 0) return;

  setInterval(() => {
    meterBars.forEach((bar) => {
      const heightPct = Math.floor(Math.random() * 75) + 25;
      bar.style.height = `${heightPct}%`;
    });
  }, 180);
}
