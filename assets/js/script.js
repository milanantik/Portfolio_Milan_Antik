// Custom triangle mesh background on transparent canvas
// - Waits for DOMContentLoaded
// - Sets footer year
// - Renders a subtle 3D-ish triangle mesh on a transparent canvas overlay

(function () {
  "use strict";

  // ====== Tunable parameters ======
  const MOBILE_BREAKPOINT = 768; // px
  const PARTICLES_MOBILE = 48; // +20%
  const PARTICLES_DESKTOP = 100; // +20%
  const BASE_SPEED = 0.02; // px per ms at depth=0 (slower overall motion) #schneller langsamer
  const WRAP_MARGIN = 24; // px outside edges before wrapping
  const NEIGHBOR_COUNT = 3; // weniger Verbindungen
  const LINK_MAX_DIST = 120; // kürzere Verbindungen
  const EXTRA_LINE_DIST = 80; // noch kürzer

  // Color style (RGBA strings for easy tweaking)
  const COLOR_FILL_NEAR = (alpha) => `rgba(255, 255, 255, ${alpha})`;
  const COLOR_STROKE = (alpha) => `rgba(255, 255, 255, ${alpha})`;
  const TRIANGLE_ALPHA_NEAR = 0.08;
  const TRIANGLE_ALPHA_FAR = 0.03;
  const EDGE_ALPHA_NEAR = 0.35;
  const EDGE_ALPHA_FAR = 0.18;
  const POINT_RADIUS_NEAR = 1.6;
  const POINT_RADIUS_FAR = 0.6;
  const DPR_CAP = 1.75; // cap devicePixelRatio for perf

  // ====== State ======
  let canvas, ctx;
  let width = 0,
    height = 0,
    dpr = 1;
  let points = [];
  let rafId = 0;
  let lastTime = 0;
  let neighborRecalcTicker = 0;

  // Utility: linear interpolation
  const lerp = (a, b, t) => a + (b - a) * t;

  // Choose particle count by viewport
  function computeParticleCount() {
    return window.innerWidth <= MOBILE_BREAKPOINT
      ? PARTICLES_MOBILE
      : PARTICLES_DESKTOP;
  }

  // Find hero height (visible section). Fallbacks if missing.
  function getTargetSize() {
    const hero = document.querySelector(".section--home");
    const h =
      hero?.clientHeight ||
      document.getElementById("bg-canvas")?.clientHeight ||
      window.innerHeight;
    const w = window.innerWidth;
    return { w, h: Math.max(1, h) };
  }

  // Create or obtain canvas#bg-canvas. If missing, try to inject into #tsparticles or .section--home
  function getOrCreateCanvas() {
    let c = document.getElementById("bg-canvas");
    if (c && c.getContext) return c;
    const host =
      document.getElementById("tsparticles") ||
      document.querySelector(".section--home");
    if (host) {
      c = document.createElement("canvas");
      c.id = "bg-canvas";
      c.style.position = "absolute";
      c.style.inset = "0";
      c.style.width = "100%";
      c.style.height = "100%";
      c.style.pointerEvents = "none";
      c.style.zIndex = "1";
      host.appendChild(c);
      return c;
    }
    return null;
  }

  // Resize canvas to hero size with DPR scaling
  function resizeCanvas() {
    const size = getTargetSize();
    width = size.w;
    height = size.h;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    if (!canvas) return;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }

  // Initialize points with random positions and velocities
  function initParticles() {
    const count = computeParticleCount();
    points = new Array(count).fill(0).map(() => {
      const depth = Math.random(); // 0 near, 1 far
      const speedFactor = lerp(1.0, 0.4, depth); // far moves slower
      const angle = Math.random() * Math.PI * 2;
      const speed = BASE_SPEED * speedFactor; // px/ms
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        depth,
      };
    });
  }

  // Update particle positions, wrap around edges
  function updateParticles(dt) {
    const wrapXMin = -WRAP_MARGIN,
      wrapYMin = -WRAP_MARGIN,
      wrapXMax = width + WRAP_MARGIN,
      wrapYMax = height + WRAP_MARGIN;
    for (let p of points) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < wrapXMin) p.x = wrapXMax;
      else if (p.x > wrapXMax) p.x = wrapXMin;
      if (p.y < wrapYMin) p.y = wrapYMax;
      else if (p.y > wrapYMax) p.y = wrapYMin;
    }
  }

  // Compute up to NEIGHBOR_COUNT nearest neighbors per point (naive O(n^2), capped N ~ 100)
  function computeNeighbors() {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const pi = points[i];
      const arr = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const pj = points[j];
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const d2 = dx * dx + dy * dy;
        arr.push({ j, d2 });
      }
      arr.sort((a, b) => a.d2 - b.d2);
      // store small neighbor list and their squared distances
      pi.neighbors = arr.slice(0, NEIGHBOR_COUNT);
    }
  }

  // Draw triangles and optional short links
  function drawScene() {
    ctx.clearRect(0, 0, width, height); // transparent background

    /* Optional short network lines between very close neighbors
    for (let i = 0; i < points.length; i++) {
      const pi = points[i];
      if (!pi.neighbors) continue;
      for (const nRef of pi.neighbors) {
        const pj = points[nRef.j];
        const d = Math.sqrt(nRef.d2);
        if (d <= EXTRA_LINE_DIST) {
          const depthAvg = (pi.depth + pj.depth) * 0.5;
          const alpha = lerp(EDGE_ALPHA_NEAR, EDGE_ALPHA_FAR, depthAvg);
          ctx.strokeStyle = COLOR_STROKE(alpha);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pi.x, pi.y);
          ctx.lineTo(pj.x, pj.y);
          ctx.stroke();
        }
      }
    }
    */

    // Triangles: for each point, build triangles with its first two neighbors
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i];
      const neigh = p0.neighbors;
      if (!neigh || neigh.length < 2) continue;

      // limit triangles per point to reduce overdraw
      const maxTriangles = Math.min(2, neigh.length - 1);
      for (let t = 0; t < maxTriangles; t++) {
        const p1 = points[neigh[0].j];
        const p2 = points[neigh[t + 1].j];

        // skip if points zu weit auseinander
        const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const d02 = Math.hypot(p2.x - p0.x, p2.y - p0.y);
        const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (d01 > LINK_MAX_DIST || d02 > LINK_MAX_DIST || d12 > LINK_MAX_DIST)
          continue;

        // Fläche des Dreiecks (ohne 0.5)
        const area = Math.abs(
          (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)
        );
        // zu kleine Dreiecke ignorieren
        if (area < 150) continue;

        const depthAvg = (p0.depth + p1.depth + p2.depth) / 3;

        // Fill
        const fillAlpha = lerp(
          TRIANGLE_ALPHA_NEAR,
          TRIANGLE_ALPHA_FAR,
          depthAvg
        );
        ctx.fillStyle = COLOR_FILL_NEAR(fillAlpha);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();

        // Stroke
        const edgeAlpha = lerp(EDGE_ALPHA_NEAR, EDGE_ALPHA_FAR, depthAvg);
        ctx.strokeStyle = COLOR_STROKE(edgeAlpha);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Optional tiny points (subtle)
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const r = lerp(POINT_RADIUS_NEAR, POINT_RADIUS_FAR, p.depth);
      const alpha = lerp(0.6, 0.25, p.depth);
      ctx.fillStyle = COLOR_STROKE(alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Animation loop
  function frame(ts) {
    if (!lastTime) lastTime = ts;
    const dt = ts - lastTime; // ms
    lastTime = ts;

    updateParticles(dt);

    // Recompute neighbors every 2nd frame to reduce cost
    neighborRecalcTicker = (neighborRecalcTicker + 1) % 2;
    if (neighborRecalcTicker === 0) computeNeighbors();

    drawScene();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    // Footer year
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    // If tsParticles is present from previous setup, destroy it and remove its canvases
    try {
      if (window.tsParticles && typeof window.tsParticles.dom === "function") {
        const containers = window.tsParticles.dom();
        if (Array.isArray(containers) && containers.length) {
          containers.forEach((c) => {
            try {
              c.destroy();
            } catch (_) {}
          });
          console.log("tsParticles containers destroyed");
        }
      }
      const host = document.getElementById("tsparticles");
      if (host) {
        host.querySelectorAll("canvas").forEach((cv) => {
          if (cv.id !== "bg-canvas") cv.remove();
        });
      }
    } catch (_) {}

    // Canvas + context
    canvas = getOrCreateCanvas();
    if (!canvas) {
      console.warn("bg-canvas not found and no host to create it.");
      return;
    }
    ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("2D context not available");
      return;
    }

    // Initial sizing and particles
    resizeCanvas();
    initParticles();
    computeNeighbors();

    // Events
    const onResize = () => {
      resizeCanvas();
      // Re-init particles to fill new area more evenly
      initParticles();
      computeNeighbors();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    // Start anim
    lastTime = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  document.addEventListener("DOMContentLoaded", start);
})();

// Animate skill bars when they enter viewport
document.addEventListener("DOMContentLoaded", () => {
  const bars = document.querySelectorAll(".skill-bar");
  if (!bars.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const style = getComputedStyle(el);
          const target = parseFloat(el.style.getPropertyValue("--p")) || 0;
          // Animate --p from 0 to target using a small JS tween
          const duration = 700;
          const start = performance.now();
          function tick(ts) {
            const t = Math.min(1, (ts - start) / duration);
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
            el.style.setProperty("--p", String(target * eased));
            if (t < 1) requestAnimationFrame(tick);
          }
          // Start from 0 for visual effect
          el.style.setProperty("--p", "0");
          requestAnimationFrame(tick);

          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.2 }
  );

  bars.forEach((b) => observer.observe(b));
});
