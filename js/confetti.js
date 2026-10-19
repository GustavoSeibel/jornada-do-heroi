/* Explosao de particulas em canvas, sem biblioteca. Chamada pela UI sempre que
   uma missao e' concluida. Respeita prefers-reduced-motion. */
window.Jornada = window.Jornada || {};

(function (Jornada) {
  'use strict';

  var COLORS = ['#7c3aed', '#a78bfa', '#38bdf8', '#f97316', '#fbbf24', '#34d399'];
  var PROFILES = {
    normal: { count: 70, speed: 7.5, spread: 1 },
    epic: { count: 160, speed: 10.5, spread: 1.35 }
  };

  var canvas = null;
  var ctx = null;
  var particles = [];
  var running = false;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function resize() {
    if (!canvas || !ctx) {
      return;
    }
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function spawn(profile, originX, originY) {
    for (var i = 0; i < profile.count; i += 1) {
      var angle = Math.random() * Math.PI * 2;
      var velocity = (0.35 + Math.random()) * profile.speed;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * velocity * profile.spread,
        vy: Math.sin(angle) * velocity - 3,
        size: 4 + Math.random() * 6,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1
      });
    }
  }

  function step() {
    if (!ctx) {
      running = false;
      return;
    }
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (var i = particles.length - 1; i >= 0; i -= 1) {
      var p = particles[i];
      p.vy += 0.26;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      p.life -= 0.009;

      if (p.life <= 0 || p.y > window.innerHeight + 40) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      ctx.restore();
    }

    if (particles.length > 0) {
      window.requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      running = false;
    }
  }

  var Confetti = {
    /* Sem canvas utilizavel o app continua funcionando — so' fica sem festa. */
    mount: function (canvasElement) {
      canvas = canvasElement;
      try {
        ctx = canvas ? canvas.getContext('2d') : null;
      } catch (error) {
        ctx = null;
      }
      if (!ctx) {
        return;
      }
      resize();
      window.addEventListener('resize', resize);
    },

    burst: function (intensity, origin) {
      if (!ctx || prefersReducedMotion()) {
        return;
      }
      var profile = PROFILES[intensity] || PROFILES.normal;
      var x = origin && Number.isFinite(origin.x) ? origin.x : window.innerWidth / 2;
      var y = origin && Number.isFinite(origin.y) ? origin.y : window.innerHeight * 0.42;
      spawn(profile, x, y);
      if (!running) {
        running = true;
        window.requestAnimationFrame(step);
      }
    }
  };

  Jornada.Confetti = Confetti;
})(window.Jornada);
