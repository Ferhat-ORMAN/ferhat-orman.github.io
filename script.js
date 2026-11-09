(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('fx-toggle');
  var STORAGE_KEY = 'fx';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fx = window.SpaceFX;

  function readPref() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function savePref(on) {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch (e) { /* depolama kapalıysa tercih yalnızca bu oturumda geçerli */ }
  }

  /* Kaydırınca açılan öğeler */
  var revealItems = document.querySelectorAll('.reveal');
  var observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' })
    : null;

  function setFx(on) {
    root.classList.toggle('fx-on', on);
    toggle.setAttribute('aria-pressed', String(on));
    revealItems.forEach(function (el) {
      if (!on || !observer || el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add('is-visible');
      } else {
        observer.observe(el);
      }
    });
    if (fx) {
      if (on) fx.enable(); else fx.disable();
    }
  }

  var pref = readPref();
  setFx(pref ? pref === 'on' : !reduceMotion);

  toggle.addEventListener('click', function () {
    var on = !root.classList.contains('fx-on');
    savePref(on);
    setFx(on);
  });

  /* Sayfa içi bağlantılar: efektler açıksa warp ile atlar */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href').slice(1);
      var target = document.getElementById(id);
      if (!target || !root.classList.contains('fx-on') || !fx) return;
      e.preventDefault();
      fx.warp(function () {
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        try {
          history.pushState(null, '', '#' + id);
        } catch (err) { /* bazı file:// ortamlarında desteklenmiyor */ }
      });
    });
  });
})();
