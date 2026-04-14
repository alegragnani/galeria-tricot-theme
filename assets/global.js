/**
 * Galeria Tricot — Global JavaScript
 * Tema para Shopify
 */

/* ── Sticky Header ────────────────────────────────────────── */
(function() {
  const header = document.querySelector('.header');
  if (!header) return;

  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  }, { passive: true });
})();

/* ── Mobile Menu ──────────────────────────────────────────── */
(function() {
  const toggle = document.querySelector('.header__menu-toggle');
  const nav = document.querySelector('.header__nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    nav.classList.toggle('is-open');
    document.body.classList.toggle('menu-open');
  });
})();

/* ── Generic Slideshow ────────────────────────────────────── */
class Slideshow {
  constructor(el) {
    this.el = el;
    this.slides = el.querySelector('[data-slides]');
    this.items = el.querySelectorAll('[data-slide]');
    this.dots = el.querySelectorAll('[data-dot]');
    this.prevBtn = el.querySelector('[data-prev]');
    this.nextBtn = el.querySelector('[data-next]');
    this.current = 0;
    this.total = this.items.length;
    this.autoplayInterval = null;

    if (this.total <= 1) return;

    this.prevBtn?.addEventListener('click', () => this.prev());
    this.nextBtn?.addEventListener('click', () => this.next());
    this.dots.forEach((dot, i) => dot.addEventListener('click', () => this.goTo(i)));

    this.startAutoplay();
    this.el.addEventListener('mouseenter', () => this.stopAutoplay());
    this.el.addEventListener('mouseleave', () => this.startAutoplay());

    // Touch support
    let startX = 0;
    this.slides?.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    this.slides?.addEventListener('touchend', (e) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) diff > 0 ? this.next() : this.prev();
    }, { passive: true });
  }

  goTo(index) {
    this.current = ((index % this.total) + this.total) % this.total;
    if (this.slides) {
      this.slides.style.transform = `translateX(-${this.current * 100}%)`;
    }
    this.dots.forEach((dot, i) => dot.classList.toggle('active', i === this.current));
  }

  next() { this.goTo(this.current + 1); }
  prev() { this.goTo(this.current - 1); }

  startAutoplay() {
    this.autoplayInterval = setInterval(() => this.next(), 5000);
  }
  stopAutoplay() {
    clearInterval(this.autoplayInterval);
  }
}

document.querySelectorAll('[data-slideshow]').forEach(el => new Slideshow(el));

/* ── Horizontal Scroll Carousels ──────────────────────────── */
document.querySelectorAll('[data-carousel]').forEach(carousel => {
  const track = carousel.querySelector('[data-carousel-track]');
  const prevBtn = carousel.querySelector('[data-carousel-prev]');
  const nextBtn = carousel.querySelector('[data-carousel-next]');
  if (!track) return;

  const scrollAmount = 320;

  prevBtn?.addEventListener('click', () => {
    track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });

  nextBtn?.addEventListener('click', () => {
    track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });
});

/* ── Product Accordion ────────────────────────────────────── */
document.querySelectorAll('.product-accordion__trigger').forEach(trigger => {
  trigger.addEventListener('click', () => {
    const item = trigger.closest('.product-accordion__item');
    const content = item.querySelector('.product-accordion__content');
    const isOpen = item.classList.contains('is-open');

    // Close all
    document.querySelectorAll('.product-accordion__item').forEach(i => {
      i.classList.remove('is-open');
      i.querySelector('.product-accordion__content').style.maxHeight = '0';
    });

    // Open clicked (if was closed)
    if (!isOpen) {
      item.classList.add('is-open');
      content.style.maxHeight = content.scrollHeight + 'px';
    }
  });
});

/* ── Product Variant Selector ─────────────────────────────── */
(function() {
  const form = document.querySelector('[data-product-form]');
  if (!form) return;

  const variantData = form.querySelector('[data-variant-json]');
  if (!variantData) return;

  let variants;
  try { variants = JSON.parse(variantData.textContent); } catch(e) { return; }

  // Size buttons
  form.querySelectorAll('[data-size-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('[data-size-btn]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateVariant();
    });
  });

  // Color swatches
  form.querySelectorAll('[data-color-swatch]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      form.querySelectorAll('[data-color-swatch]').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      updateVariant();
    });
  });

  function updateVariant() {
    const selectedColor = form.querySelector('[data-color-swatch].active')?.dataset.colorSwatch || '';
    const selectedSize = form.querySelector('[data-size-btn].active')?.dataset.sizeBtn || '';

    const variant = variants.find(v => {
      const options = v.options || [];
      if (selectedColor && selectedSize) {
        return options.includes(selectedColor) && options.includes(selectedSize);
      }
      if (selectedSize) return options.includes(selectedSize);
      if (selectedColor) return options.includes(selectedColor);
      return false;
    });

    if (variant) {
      const idInput = form.querySelector('input[name="id"]');
      if (idInput) idInput.value = variant.id;

      // Update price
      const priceEl = document.querySelector('[data-product-price]');
      if (priceEl) {
        priceEl.textContent = formatMoney(variant.price);
      }

      // Update availability
      const addBtn = form.querySelector('[data-add-to-cart]');
      if (addBtn) {
        if (variant.available) {
          addBtn.disabled = false;
          addBtn.textContent = 'ADICIONAR À SACOLA';
        } else {
          addBtn.disabled = true;
          addBtn.textContent = 'ESGOTADO';
        }
      }
    }
  }

  function formatMoney(cents) {
    return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
  }
})();

/* ── Product Gallery ──────────────────────────────────────── */
(function() {
  const gallery = document.querySelector('[data-product-gallery]');
  if (!gallery) return;

  const images = gallery.querySelectorAll('[data-gallery-image]');
  const dots = gallery.querySelectorAll('[data-gallery-dot]');
  const prevBtn = gallery.querySelector('[data-gallery-prev]');
  const nextBtn = gallery.querySelector('[data-gallery-next]');
  let current = 0;

  function showImage(index) {
    current = ((index % images.length) + images.length) % images.length;
    images.forEach((img, i) => {
      img.style.display = i === current ? 'block' : 'none';
    });
    dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
  }

  prevBtn?.addEventListener('click', () => showImage(current - 1));
  nextBtn?.addEventListener('click', () => showImage(current + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => showImage(i)));

  // Touch swipe
  let startX = 0;
  gallery.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  gallery.addEventListener('touchend', (e) => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? showImage(current + 1) : showImage(current - 1);
  }, { passive: true });

  showImage(0);
})();

/* ── Filter Drawer ────────────────────────────────────────── */
(function() {
  const filterBtn = document.querySelector('[data-filter-toggle]');
  const drawer = document.getElementById('filter-drawer');
  const overlay = document.getElementById('filter-overlay');
  const closeBtn = document.querySelector('[data-filter-close]');

  if (!filterBtn || !drawer) return;

  function openFilters() {
    drawer.classList.add('is-open');
    overlay?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeFilters() {
    drawer.classList.remove('is-open');
    overlay?.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  filterBtn.addEventListener('click', openFilters);
  closeBtn?.addEventListener('click', closeFilters);
  overlay?.addEventListener('click', closeFilters);
})();

/* ── Announcement Bar Carousel ────────────────────────────── */
(function() {
  const bar = document.querySelector('[data-announcement-bar]');
  if (!bar) return;

  const slides = bar.querySelectorAll('[data-announcement-slide]');
  if (slides.length <= 1) return;

  let current = 0;
  const prevBtn = bar.querySelector('[data-announcement-prev]');
  const nextBtn = bar.querySelector('[data-announcement-next]');

  function showSlide(index) {
    current = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.style.display = i === current ? 'flex' : 'none';
    });
  }

  prevBtn?.addEventListener('click', () => showSlide(current - 1));
  nextBtn?.addEventListener('click', () => showSlide(current + 1));

  setInterval(() => showSlide(current + 1), 5000);
  showSlide(0);
})();

/* ── Smooth Scroll to Top ─────────────────────────────────── */
document.querySelector('[data-scroll-top]')?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
