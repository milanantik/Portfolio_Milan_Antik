// Canvas-Hintergrund, Skill-Animationen, Spotify-Karte und aktive Nav-Links
// Alles rein in Vanilla JS mit klaren Fehlermeldungen und Rücksicht auf Accessibility.

(function () {
  "use strict";

  /* =====================
     Canvas Hintergrund
     ===================== */
  const MOBILE_BREAKPOINT = 768; // px
  const PARTICLES_MOBILE = 48;
  const PARTICLES_DESKTOP = 100;
  const BASE_SPEED = 0.02; // px pro ms an der Bildschirmvorderseite
  const WRAP_MARGIN = 24; // px Randpuffer bevor Punkte umklappen
  const NEIGHBOR_COUNT = 3; // maximale Nachbarn pro Punkt
  const LINK_MAX_DIST = 120; // maximale Dreieckskante
  const DPR_CAP = 1.75; // begrenzt devicePixelRatio für Performance

  const COLOR_FILL_NEAR = (alpha) => `rgba(255, 255, 255, ${alpha})`;
  const COLOR_STROKE = (alpha) => `rgba(255, 255, 255, ${alpha})`;
  const TRIANGLE_ALPHA_NEAR = 0.08;
  const TRIANGLE_ALPHA_FAR = 0.03;
  const EDGE_ALPHA_NEAR = 0.35;
  const EDGE_ALPHA_FAR = 0.18;
  const POINT_RADIUS_NEAR = 1.6;
  const POINT_RADIUS_FAR = 0.6;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  let canvas, ctx;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let points = [];
  let rafId = 0;
  let lastTime = 0;
  let neighborRecalcTicker = 0;
  let resizeBound = false;

  const lerp = (a, b, t) => a + (b - a) * t;

  const computeParticleCount = () =>
    window.innerWidth <= MOBILE_BREAKPOINT
      ? PARTICLES_MOBILE
      : PARTICLES_DESKTOP;

  const getTargetSize = () => {
    const hero = document.querySelector(".section--home");
    const h =
      hero?.clientHeight ||
      document.getElementById("bg-canvas")?.clientHeight ||
      window.innerHeight;
    return { w: window.innerWidth, h: Math.max(1, h) };
  };

  const getOrCreateCanvas = () => {
    let c = document.getElementById("bg-canvas");
    if (c && c.getContext) return c;
    const host =
      document.getElementById("tsparticles") ||
      document.querySelector(".section--home");
    if (!host) return null;
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
  };

  const resizeCanvas = () => {
    const size = getTargetSize();
    width = size.w;
    height = size.h;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    if (!canvas) return;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const initParticles = () => {
    const count = computeParticleCount();
    points = new Array(count).fill(0).map(() => {
      const depth = Math.random();
      const speedFactor = lerp(1.0, 0.4, depth);
      const angle = Math.random() * Math.PI * 2;
      const speed = BASE_SPEED * speedFactor;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        depth,
      };
    });
  };

  const updateParticles = (dt) => {
    const wrapXMin = -WRAP_MARGIN;
    const wrapYMin = -WRAP_MARGIN;
    const wrapXMax = width + WRAP_MARGIN;
    const wrapYMax = height + WRAP_MARGIN;
    for (const p of points) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < wrapXMin) p.x = wrapXMax;
      else if (p.x > wrapXMax) p.x = wrapXMin;
      if (p.y < wrapYMin) p.y = wrapYMax;
      else if (p.y > wrapYMax) p.y = wrapYMin;
    }
  };

  const computeNeighbors = () => {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const pi = points[i];
      const arr = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const pj = points[j];
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        arr.push({ j, d2: dx * dx + dy * dy });
      }
      arr.sort((a, b) => a.d2 - b.d2);
      pi.neighbors = arr.slice(0, NEIGHBOR_COUNT);
    }
  };

  const drawScene = () => {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < points.length; i++) {
      const p0 = points[i];
      const neigh = p0.neighbors;
      if (!neigh || neigh.length < 2) continue;

      const maxTriangles = Math.min(2, neigh.length - 1);
      for (let t = 0; t < maxTriangles; t++) {
        const p1 = points[neigh[0].j];
        const p2 = points[neigh[t + 1].j];

        const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const d02 = Math.hypot(p2.x - p0.x, p2.y - p0.y);
        const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (d01 > LINK_MAX_DIST || d02 > LINK_MAX_DIST || d12 > LINK_MAX_DIST)
          continue;

        const area = Math.abs(
          (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)
        );
        if (area < 150) continue;

        const depthAvg = (p0.depth + p1.depth + p2.depth) / 3;
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

        const edgeAlpha = lerp(EDGE_ALPHA_NEAR, EDGE_ALPHA_FAR, depthAvg);
        ctx.strokeStyle = COLOR_STROKE(edgeAlpha);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const r = lerp(POINT_RADIUS_NEAR, POINT_RADIUS_FAR, p.depth);
      const alpha = lerp(0.6, 0.25, p.depth);
      ctx.fillStyle = COLOR_STROKE(alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const frame = (ts) => {
    if (!lastTime) lastTime = ts;
    const dt = ts - lastTime;
    lastTime = ts;

    updateParticles(dt);
    neighborRecalcTicker = (neighborRecalcTicker + 1) % 2;
    if (neighborRecalcTicker === 0) computeNeighbors();

    drawScene();
    rafId = requestAnimationFrame(frame);
  };

  const stopAnimation = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const start = () => {
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    if (prefersReducedMotion.matches) {
      stopAnimation();
      const bg = document.getElementById("bg-canvas");
      if (bg) bg.style.display = "none";
      return;
    }

    try {
      if (window.tsParticles && typeof window.tsParticles.dom === "function") {
        const containers = window.tsParticles.dom();
        if (Array.isArray(containers) && containers.length) {
          containers.forEach((c) => {
            try {
              c.destroy();
            } catch (_) {}
          });
        }
      }
      const host = document.getElementById("tsparticles");
      if (host) {
        host.querySelectorAll("canvas").forEach((cv) => {
          if (cv.id !== "bg-canvas") cv.remove();
        });
      }
    } catch (_) {}

    canvas = getOrCreateCanvas();
    if (!canvas) {
      return;
    }
    ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    resizeCanvas();
    initParticles();
    computeNeighbors();

    const onResize = () => {
      resizeCanvas();
      initParticles();
      computeNeighbors();
    };
    if (!resizeBound) {
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
      resizeBound = true;
    }

    lastTime = 0;
    stopAnimation();
    rafId = requestAnimationFrame(frame);
  };

  document.addEventListener("DOMContentLoaded", start);
  prefersReducedMotion.addEventListener("change", start);

  /* =====================
     Skill Bars
     ===================== */
  document.addEventListener("DOMContentLoaded", () => {
    const bars = document.querySelectorAll(".skill-bar");
    if (!bars.length) return;
    if (prefersReducedMotion.matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseFloat(el.style.getPropertyValue("--p")) || 0;
            const duration = 700;
            const startTs = performance.now();

            const tick = (ts) => {
              const t = Math.min(1, (ts - startTs) / duration);
              const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
              el.style.setProperty("--p", String(target * eased));
              if (t < 1) requestAnimationFrame(tick);
            };

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

  /* =====================
     Spotify Karte
     ===================== */
  document.addEventListener("DOMContentLoaded", async () => {
    const TRACK_ID = "5ChkMS8OtdzJeqyybCc9R5";
    const WORKER_URL = "https://milan-spotify.milan-antik.workers.dev/track";

    const loadingEl = document.getElementById("spotify-loading");
    const errorEl = document.getElementById("spotify-error");
    const contentEl = document.getElementById("spotify-content");
    const titleEl = document.getElementById("spotify-title");
    const artistEl = document.getElementById("spotify-artist");
    const albumEl = document.getElementById("spotify-album");
    const releaseDateEl = document.getElementById("spotify-release-date");
    const durationEl = document.getElementById("spotify-duration");
    const linkEl = document.getElementById("spotify-link");

    const showError = (message) => {
      if (loadingEl) loadingEl.classList.add("is-hidden");
      if (contentEl) contentEl.classList.add("is-hidden");
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("is-hidden");
      }
    };

    try {
      const response = await fetch(`${WORKER_URL}?id=${TRACK_ID}`);
      if (!response.ok) {
        throw new Error(`Server antwortete mit ${response.status}`);
      }

      const data = await response.json();
      const durationMinutes = Math.floor(data.duration_ms / 60000);
      const durationSeconds = Math.floor((data.duration_ms % 60000) / 1000);
      const formattedDuration = `${durationMinutes}:${String(
        durationSeconds
      ).padStart(2, "0")}`;

      if (titleEl) titleEl.textContent = data.name;
      if (artistEl) artistEl.textContent = `Artist: ${data.artists.join(", ")}`;
      if (albumEl) albumEl.textContent = `Album: ${data.album.name}`;
      if (releaseDateEl)
        releaseDateEl.textContent = `Released: ${data.album.release_date}`;
      if (durationEl) durationEl.textContent = `Duration: ${formattedDuration}`;
      if (linkEl) linkEl.href = data.external_urls.spotify;

      if (loadingEl) loadingEl.classList.add("is-hidden");
      if (contentEl) contentEl.classList.remove("is-hidden");
      if (errorEl) errorEl.classList.add("is-hidden");
    } catch (error) {
      showError("Could not load track info.");
    }
  });

  /* =====================
     Aktiver Nav-Link beim Scrollen
     ===================== */
  document.addEventListener("DOMContentLoaded", () => {
    const sections = Array.from(document.querySelectorAll("section[id]"));
    if (!sections.length) return;

    const navLinks = new Map();
    document.querySelectorAll(".nav__list a").forEach((link) => {
      const hash = link.getAttribute("href")?.replace("#", "");
      if (hash) navLinks.set(hash, link);
    });

    const setActive = (id) => {
      navLinks.forEach((link, key) => {
        const isActive = key === id;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute("id");
          if (id) setActive(id);
        });
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0.25 }
    );

    sections.forEach((section) => observer.observe(section));
    const firstId = sections[0]?.getAttribute("id");
    if (firstId) setActive(firstId);
  });
})();
