/* Koroma Leone Tech — Night Sky visual theme.
   Paints a twinkling starfield + the occasional shooting star inside the
   sidebar and the sign-in hero (the two surfaces that are always dark by
   brand), and switches the whole app to a deep-space backdrop when the
   user turns on Dark mode. Respects prefers-reduced-motion. */
(function () {
  if (window.__kltNightSkyLoaded) return;
  window.__kltNightSkyLoaded = true;

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function buildDotField(count, w, h) {
    var dots = [];
    for (var i = 0; i < count; i++) {
      dots.push(Math.round(rand(0, w)) + 'px ' + Math.round(rand(0, h)) + 'px #fff');
    }
    return dots.join(',');
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function paint(host, wrap, opts) {
    var w = Math.max(host.offsetWidth, 80);
    var h = Math.max(host.offsetHeight, 80);
    var reduce = reducedMotion();
    wrap.innerHTML = '';

    var small = document.createElement('div');
    small.className = 'klt-star-layer klt-star-small' + (reduce ? ' klt-no-anim' : '');
    small.style.boxShadow = buildDotField(opts.small, w, h);
    wrap.appendChild(small);

    var med = document.createElement('div');
    med.className = 'klt-star-layer klt-star-med' + (reduce ? ' klt-no-anim' : '');
    med.style.boxShadow = buildDotField(opts.med, w, h);
    wrap.appendChild(med);

    if (!reduce) {
      for (var s = 0; s < opts.shooting; s++) {
        var star = document.createElement('span');
        star.className = 'klt-shooting-star';
        star.style.top = Math.round(rand(0, h * 0.55)) + 'px';
        star.style.left = Math.round(rand(0, w * 0.55)) + 'px';
        star.style.animationDelay = rand(0, 9).toFixed(2) + 's';
        star.style.animationDuration = rand(4.5, 8).toFixed(2) + 's';
        wrap.appendChild(star);
      }
    }
  }

  function mount(host, opts) {
    if (!host) return;
    var wrap = host.querySelector(':scope > .klt-night-sky');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'klt-night-sky';
      wrap.setAttribute('aria-hidden', 'true');
      host.insertBefore(wrap, host.firstChild);
    }
    paint(host, wrap, opts);
    return wrap;
  }

  var hosts = [];

  function setup() {
    var sidebar = document.querySelector('.sidebar');
    if (sidebar) hosts.push({ host: sidebar, opts: { small: 60, med: 28, shooting: 2 } });
    var authShell = document.getElementById('wlCloudBox');
    if (authShell) hosts.push({ host: authShell, opts: { small: 90, med: 42, shooting: 3 } });
    hosts.forEach(function (h) { mount(h.host, h.opts); });
  }

  var resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      hosts.forEach(function (h) { mount(h.host, h.opts); });
    }, 400);
  }

  function start() {
    setup();
    window.addEventListener('resize', onResize);
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onMqChange = function () { hosts.forEach(function (h) { mount(h.host, h.opts); }); };
      if (mq.addEventListener) mq.addEventListener('change', onMqChange);
      else if (mq.addListener) mq.addListener(onMqChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
