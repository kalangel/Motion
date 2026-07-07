/* ============================================================
   main.js — связывает 3D-движок с интерфейсом страницы
   ============================================================ */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const HINTS = {
    orbit: 'Вращайте дом мышью · колесо — ближе/дальше · кликните по названию комнаты, чтобы войти',
    walk: 'Кликайте по полу, чтобы идти · зажмите и ведите — осмотреться · колесо — зум (до упора = вылет за окно)',
    pano: 'Реальное 360°-фото · ведите мышью, чтобы осмотреться · колесо — зум · Esc — выход',
    transition: '',
  };

  window.addEventListener('load', function () {
    const tour = MotionTour.init($('tour-canvas'));

    // прячем загрузчик после первого кадра
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { $('loader').classList.add('hide'); });
    });

    // стартовая плашка
    $('btn-start').addEventListener('click', function () {
      $('intro').classList.add('hide');
      tour.goWalk();
    });
    // любое взаимодействие с канвасом тоже прячет плашку
    $('tour-canvas').addEventListener('pointerdown', function () {
      $('intro').classList.add('hide');
    }, { once: true });

    // панель режимов
    const modeButtons = document.querySelectorAll('.modes button');
    function markActive(mode) {
      modeButtons.forEach(function (b) {
        const m = b.getAttribute('data-mode');
        const active = (m === mode) || (m === 'cut' && tour.cutawayOn());
        b.classList.toggle('active', active);
      });
    }
    document.querySelector('.modes').addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      $('intro').classList.add('hide');
      const m = btn.getAttribute('data-mode');
      if (m === 'walk') tour.goWalk();
      else if (m === 'orbit') { if (tour.cutawayOn()) tour.toggleCutaway(); tour.goOrbit(); }
      else if (m === 'pano') tour.goPano();
      else if (m === 'cut') {
        tour.toggleCutaway();
        if (tour.mode() === 'walk' || tour.mode() === 'pano') tour.goOrbit();
        markActive(tour.mode());
      }
    });

    // зум-кнопки
    $('zoom-in').addEventListener('click', function () { tour.zoom(-1); });
    $('zoom-out').addEventListener('click', function () { tour.zoom(1); });

    // карточка объекта
    $('card-toggle').addEventListener('click', function () {
      $('card').classList.toggle('open');
    });

    // подсказки и подсветка режима
    const hintbar = $('hintbar');
    tour.on('mode', function (mode) {
      markActive(mode === 'transition' ? '' : mode);
      const text = HINTS[mode] || '';
      if (text) {
        hintbar.textContent = text;
        hintbar.classList.remove('hide');
      } else {
        hintbar.classList.add('hide');
      }
    });
    tour.on('cutaway', function () { markActive(tour.mode()); });

    // индикатор «вылета за окно»
    const esc = $('escape'), fill = $('escape-fill');
    let escTimer = null;
    tour.on('escape', function (k) {
      if (k > 0) {
        esc.classList.add('show');
        fill.style.width = Math.round(k * 100) + '%';
        clearTimeout(escTimer);
        escTimer = setTimeout(function () {
          esc.classList.remove('show');
          fill.style.width = '0%';
        }, 1400);
      } else {
        esc.classList.remove('show');
        fill.style.width = '0%';
      }
    });

    tour.on('loadingPano', function (loading) {
      if (loading) {
        hintbar.textContent = 'Загружаем 360°-фотографию…';
        hintbar.classList.remove('hide');
      }
    });
  });
})();
