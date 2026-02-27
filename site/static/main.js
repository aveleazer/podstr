(function() {
  'use strict';

  // ─── Scroll reveal via IntersectionObserver ───
  var srElements = document.querySelectorAll('.sr');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    srElements.forEach(function(el) { observer.observe(el); });
  } else {
    srElements.forEach(function(el) { el.classList.add('is-visible'); });
  }

  // ─── Accordion toggle (event delegation) ───
  document.addEventListener('click', function(e) {
    var header = e.target.closest('.group-header');
    if (!header) return;
    header.classList.toggle('open');
    var body = header.nextElementSibling;
    if (body && body.classList.contains('group-episodes')) {
      body.classList.toggle('open');
    }
  });

})();
