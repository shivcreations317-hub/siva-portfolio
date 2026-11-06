(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  const page = body.dataset.page || '';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer:fine)').matches && window.innerWidth > 900;

  root.classList.add('js');

  // ── SCROLL PROGRESS ────────────────────────────────────────────────────
  const progress = doc.createElement('div');
  progress.id = 'progress';
  progress.setAttribute('aria-hidden', 'true');
  body.appendChild(progress);

  const updateProgress = () => {
    const max = root.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  // ── CUSTOM CURSOR ──────────────────────────────────────────────────────
  let cursor = null;
  let ring = null;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let ringX = pointerX;
  let ringY = pointerY;

  if (finePointer && !reduceMotion) {
    cursor = doc.createElement('div');
    cursor.id = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    ring = doc.createElement('div');
    ring.id = 'cursor-ring';
    ring.setAttribute('aria-hidden', 'true');
    body.append(cursor, ring);
    body.classList.add('cursor-enabled', 'cursor-ready');

    const moveCursor = event => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      cursor.style.transform = `translate(${pointerX}px, ${pointerY}px) translate(-50%, -50%)`;

      const interactive = event.target.closest('a, button, select, input, textarea, [data-cursor], [data-tilt]');
      const view = event.target.closest('[data-cursor="view"]');
      body.classList.toggle('cursor-hover', Boolean(interactive));
      body.classList.toggle('cursor-view', Boolean(view));
    };

    doc.addEventListener('pointermove', moveCursor, { passive: true });
    doc.addEventListener('pointerleave', () => body.classList.remove('cursor-hover', 'cursor-view'));

    const animateRing = () => {
      ringX += (pointerX - ringX) * 0.16;
      ringY += (pointerY - ringY) * 0.16;
      ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
      requestAnimationFrame(animateRing);
    };
    requestAnimationFrame(animateRing);
  }

  // ── AUTO-TARGETS PER SURFACE ───────────────────────────────────────────
  const revealTargets = {
    dashboard: '.topbar, .filters, .panel',
    case: '.hero__grid > div, .hero__grid > .brief, .metric, .section__head, .question, .callout, .dashboard, .step, .finding, .signal, .rec, .note, .deliverable, .next'
  };

  const addReveal = (element, index = 0) => {
    if (!element || element.hasAttribute('data-reveal')) return;
    element.setAttribute('data-reveal', '');
    if (!element.style.getPropertyValue('--delay')) {
      element.style.setProperty('--delay', `${Math.min(index, 5) * 0.055}s`);
    }
  };

  const targets = doc.querySelectorAll(revealTargets[page] || '[data-reveal]');
  targets.forEach((element, index) => addReveal(element, index));

  if (page === 'case') {
    doc.querySelectorAll('.brief, .metric, .question, .finding, .rec, .deliverable').forEach(element => {
      if (!element.hasAttribute('data-tilt')) element.setAttribute('data-tilt', '3');
    });
    doc.querySelectorAll('.dashboard a, .deliverable, .brief__link').forEach(element => {
      element.setAttribute('data-cursor', 'view');
    });
  }

  if (page === 'dashboard') {
    doc.querySelectorAll('.project-link').forEach(element => {
      element.setAttribute('data-cursor', 'view');
    });
  }

  // ── REVEAL OBSERVER ────────────────────────────────────────────────────
  let observer = null;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    const observe = scope => {
      scope.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(element => observer.observe(element));
    };
    observe(doc);

    const mutations = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches('[data-reveal]:not(.is-visible)')) observer.observe(node);
          observe(node);
        });
      });
    });
    mutations.observe(body, { childList: true, subtree: true });
  } else {
    doc.querySelectorAll('[data-reveal]').forEach(element => element.classList.add('is-visible'));
  }

  // ── 3D TILT (delegated so filter re-renders are covered) ───────────────
  if (!reduceMotion && finePointer) {
    let activeTilt = null;

    doc.addEventListener('pointermove', event => {
      const card = event.target.closest('[data-tilt]');
      if (!card) return;
      const max = Number(card.dataset.tilt) || 3;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const rotateX = ((0.5 - y) * max).toFixed(2);
      const rotateY = ((x - 0.5) * max).toFixed(2);

      if (activeTilt && activeTilt !== card) {
        activeTilt.classList.remove('is-tilting');
        activeTilt.style.transform = '';
      }
      activeTilt = card;
      card.classList.add('is-tilting');
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
      card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    }, { passive: true });

    doc.addEventListener('pointerout', event => {
      const card = event.target.closest('[data-tilt]');
      if (!card || card.contains(event.relatedTarget)) return;
      card.classList.remove('is-tilting');
      card.style.transform = '';
      if (activeTilt === card) activeTilt = null;
    });
  }

  // A small page-in cue, matching the portfolio's fade-through feel.
  requestAnimationFrame(() => body.classList.add('page-ready'));
})();
