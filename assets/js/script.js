document.addEventListener('DOMContentLoaded', async () => {
  // set year
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

  // particles background
  const container = document.getElementById('tsparticles');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!container || reduce || !window.tsParticles) return;
  const mobile = matchMedia('(max-width:768px)').matches;
  const count = mobile ? 60 : 140;

  await tsParticles.load({ id: 'tsparticles', options: {
    background: { color: { value: '#111213' } }, fpsLimit: 60, detectRetina: true,
    particles: {
      number: { value: count, density: { enable: true, area: 800 } },
      color: { value: '#cbd5e1' }, shape: { type: 'circle' }, opacity: { value: .5 },
      size: { value: { min: 1, max: 2.4 } },
      links: { enable: true, distance: 130, color: '#9ca3af', opacity: .4, width: 1 },
      move: { enable: true, speed: .6, outModes: { default: 'out' } }
    },
    interactivity: { events: { resize: true } }
  }});
});
