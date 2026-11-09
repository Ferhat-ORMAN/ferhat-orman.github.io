(function () {
  'use strict';

  var sky = document.getElementById('sky');
  var heroCanvas = document.getElementById('hero-canvas');
  if (!sky || !heroCanvas || !sky.getContext) return;

  var sctx = sky.getContext('2d');
  var hctx = heroCanvas.getContext('2d');
  var root = document.documentElement;
  var hero = heroCanvas.parentElement;
  var nameEl = document.getElementById('isim');
  var dot = document.querySelector('.cursor-dot');
  var ring = document.querySelector('.cursor-ring');

  var IVORY = '232,228,216';
  var TEAL = '111,211,200';
  var AMBER = '232,162,92';
  var COLORS = [IVORY, TEAL, AMBER];

  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var enabled = false;
  var raf = 0;
  var last = 0;
  var dpr = 1;
  var W = 0, H = 0, hw = 0, hh = 0;
  var mobile = false;
  var heroVisible = true;

  var mouse = { x: -100, y: -100, active: false };
  var par = { x: 0, y: 0 };
  var ringPos = { x: -100, y: -100 };

  var layers = [];
  var shot = null;
  var nextShot = 0;
  var warp = { start: -1, cb: null };
  var WARP_PEAK = 280, WARP_END = 760;

  var galaxy = null;
  var nebula = null;
  var particles = [];
  var nameStart = 0;
  var nameReady = false;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function pickColor(teal, amber) {
    var r = Math.random();
    return r < teal ? 1 : r < teal + amber ? 2 : 0;
  }

  function sizeCanvas(c, ctx, w, h) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function measure() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    mobile = !finePointer || Math.min(W, H) < 600;
    sizeCanvas(sky, sctx, W, H);
    var nw = hero.clientWidth, nh = hero.clientHeight;
    var changed = nw !== hw || nh !== hh;
    hw = nw;
    hh = nh;
    sizeCanvas(heroCanvas, hctx, hw, hh);
    return changed;
  }

  /* Yıldız alanı: konumlar 0-1 arası saklanır, boyut değişince yeniden üretilmez */
  function buildSky() {
    var m = mobile ? 0.5 : 1;
    var spec = [
      { n: 230, size: 0.8, alpha: 0.5, depth: 6, scroll: 0.03 },
      { n: 110, size: 1.2, alpha: 0.75, depth: 14, scroll: 0.07 },
      { n: 45, size: 1.8, alpha: 0.95, depth: 28, scroll: 0.14 }
    ];
    layers = spec.map(function (s) {
      var groups = [[], [], []];
      for (var i = 0; i < Math.round(s.n * m); i++) {
        groups[pickColor(0.12, 0.08)].push({ x: Math.random(), y: Math.random() });
      }
      s.groups = groups;
      return s;
    });
  }

  function warpAmount(now) {
    if (warp.start < 0) return 0;
    var t = now - warp.start;
    if (t >= WARP_PEAK && warp.cb) {
      var cb = warp.cb;
      warp.cb = null;
      cb();
    }
    if (t < WARP_PEAK) return Math.pow(t / WARP_PEAK, 2);
    if (t < WARP_END) return 1 - Math.pow((t - WARP_PEAK) / (WARP_END - WARP_PEAK), 0.6);
    warp.start = -1;
    return 0;
  }

  function drawSky(now) {
    sctx.clearRect(0, 0, W, H);
    var w = warpAmount(now);
    var sy = window.scrollY;
    var cx = W / 2, cy = H / 2;
    var near = [];
    var linking = finePointer && mouse.active && w === 0;

    for (var li = 0; li < layers.length; li++) {
      var L = layers[li];
      var ox = -par.x * L.depth;
      var oy = -par.y * L.depth - sy * L.scroll;
      for (var g = 0; g < 3; g++) {
        var stars = L.groups[g];
        var color = 'rgba(' + COLORS[g] + ',' + L.alpha + ')';
        if (w > 0) {
          sctx.strokeStyle = color;
          sctx.lineWidth = L.size;
          sctx.beginPath();
        } else {
          sctx.fillStyle = color;
        }
        for (var i = 0; i < stars.length; i++) {
          var x = ((stars[i].x * W + ox) % W + W) % W;
          var y = ((stars[i].y * H + oy) % H + H) % H;
          if (w > 0) {
            var k = w * (0.25 + li * 0.2);
            sctx.moveTo(x, y);
            sctx.lineTo(x + (x - cx) * k, y + (y - cy) * k);
          } else {
            sctx.fillRect(x - L.size / 2, y - L.size / 2, L.size, L.size);
            if (linking && li > 0) {
              var dx = x - mouse.x, dy = y - mouse.y;
              var d = dx * dx + dy * dy;
              if (d < 25600) near.push({ x: x, y: y, d: Math.sqrt(d) });
            }
          }
        }
        if (w > 0) sctx.stroke();
      }
    }

    if (near.length > 1) drawConstellation(near);
    drawShootingStar(now, w);
  }

  /* İmlece yakın yıldızları birbirine bağlar */
  function drawConstellation(near) {
    near.sort(function (a, b) { return a.d - b.d; });
    near.length = Math.min(near.length, 12);
    sctx.lineWidth = 0.8;
    for (var i = 0; i < near.length; i++) {
      for (var j = i + 1; j < near.length; j++) {
        var dx = near[i].x - near[j].x, dy = near[i].y - near[j].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 120) continue;
        var fade = 1 - Math.max(near[i].d, near[j].d) / 160;
        sctx.strokeStyle = 'rgba(' + TEAL + ',' + (0.5 * (1 - d / 120) * fade).toFixed(3) + ')';
        sctx.beginPath();
        sctx.moveTo(near[i].x, near[i].y);
        sctx.lineTo(near[j].x, near[j].y);
        sctx.stroke();
      }
    }
  }

  function drawShootingStar(now, w) {
    if (!shot && now > nextShot && w === 0) {
      var ang = Math.PI * rand(0.76, 0.84);
      shot = {
        x: rand(W * 0.3, W * 1.05), y: rand(-20, H * 0.35),
        vx: Math.cos(ang), vy: Math.sin(ang),
        speed: rand(0.6, 0.85), born: now, life: rand(900, 1300)
      };
    }
    if (!shot) return;
    var t = (now - shot.born) / shot.life;
    if (t >= 1) {
      shot = null;
      nextShot = now + rand(7000, 16000);
      return;
    }
    var dist = (now - shot.born) * shot.speed;
    var hx = shot.x + shot.vx * dist, hy = shot.y + shot.vy * dist;
    var tx = hx - shot.vx * 130, ty = hy - shot.vy * 130;
    var grad = sctx.createLinearGradient(tx, ty, hx, hy);
    var a = Math.sin(Math.PI * t) * 0.85;
    grad.addColorStop(0, 'rgba(' + IVORY + ',0)');
    grad.addColorStop(1, 'rgba(' + IVORY + ',' + a.toFixed(3) + ')');
    sctx.strokeStyle = grad;
    sctx.lineWidth = 1.4;
    sctx.beginPath();
    sctx.moveTo(tx, ty);
    sctx.lineTo(hx, hy);
    sctx.stroke();
  }

  /* Spiral galaksi ve bulutsu */
  function buildGalaxy() {
    var n = mobile ? 1100 : 2400;
    var R = mobile ? Math.min(hw * 0.6, hh * 0.3) : Math.min(hw * 0.3, hh * 0.42);
    var gx = mobile ? hw * 0.68 : hw * 0.7;
    var gy = mobile ? hh * 0.74 : hh * 0.52;
    var groups = [];
    for (var k = 0; k < 9; k++) groups.push([]);

    for (var i = 0; i < n; i++) {
      var r, a;
      if (i < n * 0.15) {
        r = R * 0.2 * Math.pow(Math.random(), 1.5);
        a = rand(0, Math.PI * 2);
      } else {
        var t = Math.pow(Math.random(), 0.9);
        var spread = Math.random() + Math.random() - 1;
        r = R * (0.1 + t * 0.9) + spread * R * 0.07;
        a = (i % 2) * Math.PI + t * 6 + (Math.random() + Math.random() - 1) * 0.38;
        if (Math.random() < 0.12) a = rand(0, Math.PI * 2);
      }
      var rr = r / R;
      var c = rr < 0.25 ? (Math.random() < 0.6 ? 2 : 0) : rr > 0.6 ? (Math.random() < 0.55 ? 1 : 0) : pickColor(0.2, 0.15);
      var al = Math.floor(Math.random() * 3);
      groups[c * 3 + al].push({ r: r, a: a, s: rand(0.6, 1.6), k: 1.4 - 0.8 * rr });
    }
    galaxy = { groups: groups, R: R, x: gx, y: gy, tilt: -0.4, squash: 0.55 };
    buildNebula();
  }

  function buildNebula() {
    var scale = 0.5;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(hw * scale));
    c.height = Math.max(1, Math.round(hh * scale));
    var ctx = c.getContext('2d');
    var g = galaxy;
    var blobs = [
      [g.x - g.R * 0.3, g.y - g.R * 0.25, g.R * 1.2, '232,162,92', 0.16],
      [g.x + g.R * 0.5, g.y + g.R * 0.35, g.R * 0.9, '201,112,63', 0.13],
      [g.x - g.R * 0.9, g.y + g.R * 0.45, g.R * 0.85, '111,211,200', 0.08],
      [g.x + g.R * 0.2, g.y - g.R * 0.8, g.R * 0.7, '159,176,194', 0.06]
    ];
    blobs.forEach(function (b) {
      var x = b[0] * scale, y = b[1] * scale, rad = b[2] * scale;
      var grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(' + b[3] + ',' + b[4] + ')');
      grad.addColorStop(1, 'rgba(' + b[3] + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);
    });
    nebula = c;
  }

  function drawGalaxy(now) {
    var g = galaxy;
    var drift = Math.sin(now * 0.00005) * 12;
    hctx.globalAlpha = mobile ? 0.6 : 1;
    hctx.drawImage(nebula, drift, -drift * 0.5, hw, hh);
    hctx.globalCompositeOperation = 'lighter';

    var core = hctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.R * 0.35);
    core.addColorStop(0, 'rgba(' + AMBER + ',0.45)');
    core.addColorStop(1, 'rgba(' + AMBER + ',0)');
    hctx.fillStyle = core;
    hctx.fillRect(g.x - g.R, g.y - g.R, g.R * 2, g.R * 2);

    var rot = now * 0.00003;
    var ct = Math.cos(g.tilt), st = Math.sin(g.tilt);
    for (var gi = 0; gi < 9; gi++) {
      var list = g.groups[gi];
      hctx.fillStyle = 'rgba(' + COLORS[Math.floor(gi / 3)] + ',' + (0.35 + (gi % 3) * 0.25) + ')';
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var ang = p.a + rot * p.k;
        var u = Math.cos(ang) * p.r;
        var v = Math.sin(ang) * p.r * g.squash;
        hctx.fillRect(g.x + u * ct - v * st, g.y + u * st + v * ct, p.s, p.s);
      }
    }
    hctx.globalCompositeOperation = 'source-over';
    hctx.globalAlpha = 1;
  }

  /* İsim parçacıkları: h1 metninin pikselleri hedef noktalar olur */
  function buildName() {
    if (!enabled || !nameEl) return;
    var cs = window.getComputedStyle(nameEl);
    var fontSize = parseFloat(cs.fontSize);
    var off = document.createElement('canvas');
    off.width = hw;
    off.height = hh;
    var ctx = off.getContext('2d');
    ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    var hr = hero.getBoundingClientRect();
    var spans = nameEl.querySelectorAll('span');
    for (var s = 0; s < spans.length; s++) {
      var r = spans[s].getBoundingClientRect();
      ctx.fillText(spans[s].textContent, r.left - hr.left, r.top - hr.top + r.height / 2);
    }

    var data = ctx.getImageData(0, 0, hw, hh).data;
    var max = mobile ? 1600 : 2800;
    var step = Math.max(2, Math.round(fontSize / 26));
    var targets;
    do {
      targets = [];
      for (var y = 0; y < hh; y += step) {
        for (var x = 0; x < hw; x += step) {
          if (data[(y * hw + x) * 4 + 3] > 128) targets.push(x, y);
        }
      }
      step++;
    } while (targets.length / 2 > max);
    step--;

    var fresh = particles.length === 0;
    var next = [];
    var jitter = step * 0.3;
    for (var i = 0; i < targets.length; i += 2) {
      var old = particles[i / 2];
      targets[i] += rand(-jitter, jitter);
      targets[i + 1] += rand(-jitter, jitter);
      next.push({
        x: old ? old.x : fresh ? rand(0, hw) : targets[i],
        y: old ? old.y : fresh ? rand(0, hh) : targets[i + 1],
        vx: 0, vy: 0,
        tx: targets[i], ty: targets[i + 1],
        delay: fresh ? rand(0, 700) : 0,
        c: old ? old.c : pickColor(0.08, 0.12)
      });
    }
    particles = next;
    particles.size = Math.max(1.2, step * 0.5);
    if (fresh) nameStart = performance.now();
    nameReady = true;
    root.classList.add('name-drawn');
  }

  function drawName(now, f) {
    if (!nameReady) return;
    var hr = hero.getBoundingClientRect();
    var mx = mouse.x - hr.left, my = mouse.y - hr.top;
    var R = 80, R2 = R * R;
    var elapsed = now - nameStart;
    var damp = Math.pow(0.86, f);
    var size = particles.size;
    var buckets = [[], [], []];

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (elapsed > p.delay) {
        p.vx += (p.tx - p.x) * 0.035 * f;
        p.vy += (p.ty - p.y) * 0.035 * f;
        if (mouse.active) {
          var dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 0.01) {
            var d = Math.sqrt(d2), force = (1 - d / R) * 5 * f;
            p.vx += dx / d * force;
            p.vy += dy / d * force;
          }
        }
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * f;
        p.y += p.vy * f;
      }
      buckets[p.c].push(p);
    }

    for (var c = 0; c < 3; c++) {
      hctx.fillStyle = 'rgba(' + COLORS[c] + ',0.95)';
      var b = buckets[c];
      for (var j = 0; j < b.length; j++) hctx.fillRect(b[j].x, b[j].y, size, size);
    }
  }

  function frame(now) {
    raf = window.requestAnimationFrame(frame);
    var dt = last ? Math.min(50, now - last) : 16.67;
    last = now;
    var f = dt / 16.67;

    var px = mouse.active ? mouse.x / W - 0.5 : 0;
    var py = mouse.active ? mouse.y / H - 0.5 : 0;
    par.x += (px - par.x) * 0.04 * f;
    par.y += (py - par.y) * 0.04 * f;

    if (finePointer) {
      ringPos.x += (mouse.x - ringPos.x) * 0.2 * f;
      ringPos.y += (mouse.y - ringPos.y) * 0.2 * f;
      ring.style.transform = 'translate(' + ringPos.x + 'px,' + ringPos.y + 'px)';
    }

    drawSky(now);
    if (heroVisible) {
      hctx.clearRect(0, 0, hw, hh);
      drawGalaxy(now);
      drawName(now, f);
    }
  }

  function start() {
    if (raf || !enabled || document.hidden) return;
    last = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function onPointerMove(e) {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (!mouse.active) {
      ringPos.x = mouse.x;
      ringPos.y = mouse.y;
    }
    mouse.active = true;
    if (enabled && finePointer) dot.style.transform = 'translate(' + mouse.x + 'px,' + mouse.y + 'px)';
  }

  function onPointerOut(e) {
    if (e.relatedTarget) return;
    mouse.active = false;
    mouse.x = mouse.y = -100;
    dot.style.transform = ring.style.transform = 'translate(-100px,-100px)';
  }

  function onPointerOver(e) {
    ring.classList.toggle('is-hover', !!(e.target.closest && e.target.closest('a, button')));
  }

  var resizeTimer = 0;
  function onResize() {
    if (!enabled) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (measure()) {
        buildGalaxy();
        buildName();
      }
    }, 150);
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    measure();
    buildSky();
    buildGalaxy();
    if (finePointer) root.classList.add('cursor-on');
    nextShot = performance.now() + rand(3000, 6000);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(buildName);
    } else {
      buildName();
    }
    start();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    stop();
    sctx.clearRect(0, 0, W, H);
    hctx.clearRect(0, 0, hw, hh);
    particles = [];
    nameReady = false;
    shot = null;
    if (warp.cb) warp.cb();
    warp.cb = null;
    warp.start = -1;
    root.classList.remove('cursor-on', 'name-drawn');
  }

  /* Warp: yıldızlar çizgiye dönüşür, en uç noktada cb çağrılır */
  function doWarp(cb) {
    if (!enabled || !raf) {
      cb();
      return;
    }
    if (warp.cb) warp.cb();
    warp.start = performance.now();
    warp.cb = cb;
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerout', onPointerOut);
  document.addEventListener('pointerover', onPointerOver);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
    }).observe(hero);
  }

  window.SpaceFX = { enable: enable, disable: disable, warp: doWarp };
})();
