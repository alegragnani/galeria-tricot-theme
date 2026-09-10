/**
 * Video Stories Widget — Shopify Edition (asset do tema: assets/video-stories.js, v10/09/2026)
 * Galeria Tricot — Bunny.net Stream + Supabase (Cloudflare removido jul/2026)
 *
 * MASTER SWITCH: checa widget_config.enabled antes de renderizar.
 * Se enabled=false, o widget não aparece. Pode ligar/desligar no admin.
 */
(function() {
  'use strict';

  const CONFIG = {
    SUPABASE_URL: 'https://qherrkxzkxopoprglybj.supabase.co/rest/v1',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZXJya3h6a3hvcG9wcmdseWJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4Nzk0NTgsImV4cCI6MjA5MDQ1NTQ1OH0.7iFZry9_N8rnwCRqrTKkRneQ7qX5gxekWt7I5EWIeD0',
    BUNNY_LIBRARY_ID: '667894',
    BUNNY_CDN: 'vz-fa63cd18-bc1.b-cdn.net',
    Z_INDEX_WIDGET: 999999,
    Z_INDEX_OVERLAY: 9999999,
  };

  let widgetConfig = {
    enabled: false,
    formato: 'rectangle',
    cor_borda_primaria: '#c37350',
    cor_borda_secundaria: '#ffffff',
    tipo_texto: 'horizontal',
    cor_texto: '#ffffff',
    acompanhar_scroll: true,
    pode_fechar_video: false,
    animado: false,
    mobile_posicao: 'superior-left',
    mobile_margem_esquerda: 0,
    mobile_margem_superior: 130,
    desktop_posicao: 'superior-left',
    desktop_margem_esquerda: 2,
    desktop_margem_superior: 147,
    som_padrao: true,
    widget_largura: 100,
    widget_altura: 156,
  };

  let widgetState = {
    initialized: false,
    videos: [],
    currentVideoIndex: 0,
    overlayOpen: false,
    productSlug: null,
    productTitle: null,
    productUrl: null,
    imageContainer: null,
    widget: null,
    configLoaded: false,
    isDragging: false,
    isMuted: false,
  };

  function isMobile() { return window.innerWidth <= 768; }

  // ========== SHOPIFY: detecção de página de produto ==========
  function isProductPage() {
    return /\/products\/[^/?#]+/.test(window.location.pathname);
  }

  function isHomePage() {
    return window.location.pathname === '/' || window.location.pathname === '';
  }

  /**
   * Shopify URL: /products/blusa-tricot-giovana-vinho
   * DB slug:     blusa-tricot-giovana-vinho/p
   * Mapeia: pega o handle do Shopify e adiciona "/p"
   */
  function getProductSlug() {
    const match = window.location.pathname.match(/\/products\/([^/?#]+)/);
    if (!match) return null;
    return match[1] + '/p';
  }

  // ========== SHOPIFY: seletores de imagem do tema atual ==========
  function findImageContainer() {
    const selectors = [
      '.pdp__gallery',
      '.pdp__gallery-track',
      '.pdp__gallery-item',
      '.product__media-list',
      '.product__media-item',
      '.product-media-container',
      '[class*="product-image"]',
      '[class*="ProductImage"]',
      '.product__images',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
        return element;
      }
    }

    // Fallback: procurar imagem grande na página
    const imgs = document.querySelectorAll('.pdp__gallery-img, .product img, main img');
    for (const img of imgs) {
      if (img.offsetWidth > 200 && img.offsetHeight > 200) {
        return img.parentElement;
      }
    }

    return null;
  }

  // ========== Supabase config + master switch ==========
  async function loadWidgetConfig() {
    try {
      const pageType = isProductPage() ? 'produtos' : (isHomePage() ? 'home' : 'outras_paginas');
      const response = await fetch(
        `${CONFIG.SUPABASE_URL}/widget_config?page_type=eq.${pageType}&select=*&limit=1`,
        { headers: { 'apikey': CONFIG.SUPABASE_KEY, 'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}` } }
      );
      if (!response.ok) return;
      const data = await response.json();
      if (data.length > 0) {
        const cfg = data[0];
        Object.keys(widgetConfig).forEach(key => {
          if (cfg[key] !== undefined && cfg[key] !== null) {
            widgetConfig[key] = cfg[key];
          }
        });
      }
      widgetState.configLoaded = true;
    } catch (error) {
      console.warn('[VideoStories] Could not load config, widget disabled');
    }
  }

  // ========== Buscar vídeos do Supabase ==========
  async function fetchVideos(slug) {
    // Shopify: busca pelo handle (RPC widget_videos_por_handle tolera diferencas entre o handle da Shopify
    // e o linkText da VTEX, e cai para o titulo do produto se preciso)
    try {
      const handle = slug.replace(/\/p$/, '');
      const h1 = document.querySelector('h1');
      const titulo = h1 ? h1.textContent.trim() : null;
      const response = await fetch(`${CONFIG.SUPABASE_URL}/rpc/widget_videos_por_handle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`, 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_KEY },
        body: JSON.stringify({ p_handle: handle, p_titulo: titulo })
      });
      if (!response.ok) return [];
      const data = await response.json();
      const seen = new Set();
      const videos = data.map(item => {
        if (!item.bunny_guid || seen.has(item.video_id)) return null;
        seen.add(item.video_id);
        return { id: item.video_id, bunnyGuid: item.bunny_guid, thumbnailUrl: item.bunny_thumb_url || item.thumbnail_url, bunnyIframeUrl: item.bunny_iframe_url, bunnyStreamUrl: item.bunny_stream_url, sortOrder: item.sort_order };
      }).filter(Boolean);
      if (data.length > 0) {
        widgetState.productTitle = data[0].product_title;
        widgetState.productUrl = window.location.href;
        widgetState.productSlug = data[0].slug; // slug real do banco (para contagem de views/opens)
      }
      return videos;
    } catch (error) {
      console.error('[VideoStories] Error fetching videos:', error);
      return [];
    }
  }

  // ========== Posição e forma ==========
  function getPositionConfig() {
    const mobile = isMobile();
    return {
      posicao: mobile ? widgetConfig.mobile_posicao : widgetConfig.desktop_posicao,
      margemEsquerda: mobile ? widgetConfig.mobile_margem_esquerda : widgetConfig.desktop_margem_esquerda,
      margemSuperior: mobile ? widgetConfig.mobile_margem_superior : widgetConfig.desktop_margem_superior,
    };
  }

  function getShapeStyles() {
    const w = isMobile() ? Math.min(widgetConfig.widget_largura, 70) : widgetConfig.widget_largura;
    const h = isMobile() ? Math.min(widgetConfig.widget_altura, 100) : widgetConfig.widget_altura;
    switch (widgetConfig.formato) {
      case 'simple': case 'stamp': case 'heart':
        return { width: w, height: w, borderRadius: '50%' };
      case 'rectangle': default:
        return { width: w, height: h, borderRadius: '8px' };
    }
  }

  // ========== CSS ==========
  function injectStyles() {
    if (document.getElementById('video-stories-styles')) return;
    const styles = `
      #video-stories-widget {
        position: fixed;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        z-index: ${CONFIG.Z_INDEX_WIDGET};
        overflow: hidden;
        transition: box-shadow 0.2s ease;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
      }
      #video-stories-widget:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.35); }
      #video-stories-widget.dragging { cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.4); opacity: 0.9; transition: none; }
      #video-stories-widget::after {
        content: '';
        position: absolute; bottom: 0; left: 0; right: 0; height: 30px;
        background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%);
        pointer-events: none;
      }
      #video-stories-widget iframe.widget-mini-video {
        position: absolute; top: 50%; left: 50%; width: 180%; height: 180%;
        transform: translate(-50%, -50%); border: none; pointer-events: none; z-index: 1;
      }
      #video-stories-close-widget {
        position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
        background: rgba(0,0,0,0.6); border: none; border-radius: 50%; color: white;
        font-size: 12px; cursor: pointer; z-index: 3; display: none;
        align-items: center; justify-content: center; line-height: 1;
      }
      #video-stories-widget:hover #video-stories-close-widget { display: flex; }
      @keyframes video-stories-glow {
        0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 0 var(--widget-color, #c37350)33; }
        50% { box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 8px var(--widget-color, #c37350)00; }
      }
      .video-stories-animated { animation: video-stories-glow 2s infinite; }
      #video-stories-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.92); display: flex; align-items: center; justify-content: center;
        z-index: ${CONFIG.Z_INDEX_OVERLAY}; opacity: 0; visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease; overflow: hidden;
      }
      #video-stories-overlay.active { opacity: 1; visibility: visible; }
      .video-stories-container {
        position: relative; width: 100%; max-width: 500px; max-height: 95vh;
        aspect-ratio: 9/16; background: #000; border-radius: 12px; overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5); animation: video-stories-pop 0.3s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes video-stories-pop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
      .video-stories-player { width: 100%; height: 100%; position: relative; }
      .video-stories-player iframe { width: 100%; height: 100%; border: none; }
      .video-stories-close {
        position: absolute; top: 16px; right: 16px; width: 40px; height: 40px;
        background: rgba(0,0,0,0.5); border: none; border-radius: 50%; color: white;
        font-size: 24px; cursor: pointer; z-index: 10; display: flex;
        align-items: center; justify-content: center; transition: background 0.2s ease;
      }
      .video-stories-close:hover { background: rgba(0,0,0,0.7); }
      .video-stories-nav {
        position: absolute; top: 8px; left: 8px; right: 8px;
        display: flex; gap: 4px; z-index: 10;
      }
      .video-stories-bar {
        flex: 1; height: 3px; border-radius: 2px;
        background: rgba(255,255,255,0.35); cursor: pointer; overflow: hidden;
      }
      .video-stories-bar .bar-fill { width: 0%; height: 100%; border-radius: 2px; background: rgba(255,255,255,0.95); transition: width 0.3s linear; }
      .video-stories-bar.completed .bar-fill { width: 100%; }
      .video-stories-bar.active .bar-fill { width: 100%; transition: none; }
      .video-stories-tap-zone { position: absolute; top: 0; bottom: 120px; width: 40%; cursor: pointer; z-index: 5; }
      .video-stories-tap-left { left: 0; }
      .video-stories-tap-right { right: 0; }
      .video-stories-actions {
        position: absolute; right: 12px; bottom: 160px;
        display: flex; flex-direction: column; gap: 16px; z-index: 10; align-items: center;
      }
      .video-stories-action-btn {
        width: 44px; height: 44px; border-radius: 50%; background: rgba(0,0,0,0.45);
        border: none; color: white; cursor: pointer; display: flex;
        align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: background 0.2s ease;
      }
      .video-stories-action-btn:hover { background: rgba(0,0,0,0.65); }
      .video-stories-action-btn svg { width: 22px; height: 22px; }
      .video-stories-product {
        position: absolute; bottom: 0; left: 0; right: 0; padding: 0 0 16px 0;
        z-index: 10; display: flex; flex-direction: column; gap: 8px; pointer-events: none;
      }
      .video-stories-product > * { pointer-events: auto; }
      .video-stories-cards {
        display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
        padding: 0 12px; scroll-snap-type: x mandatory;
      }
      .video-stories-cards::-webkit-scrollbar { display: none; }
      .video-stories-card {
        display: flex; align-items: center; gap: 10px;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        border-radius: 12px; padding: 10px 14px; min-width: 240px; max-width: 320px;
        flex-shrink: 0; cursor: pointer; text-decoration: none; scroll-snap-align: start; transition: background 0.2s;
      }
      .video-stories-card:hover { background: rgba(0,0,0,0.65); }
      .video-stories-card-img { width: 50px; height: 66px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: rgba(255,255,255,0.1); }
      .video-stories-card-info { flex: 1; min-width: 0; }
      .video-stories-card-name { font-size: 13px; font-weight: 500; color: white; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 4px; }
      .video-stories-card-price { font-size: 14px; font-weight: 700; color: white; }
      @media (max-width: 480px) {
        .video-stories-container { max-width: 100%; max-height: 100vh; border-radius: 0; }
        .video-stories-close { top: 12px; right: 12px; width: 36px; height: 36px; font-size: 20px; }
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'video-stories-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // ========== Draggable ==========
  function makeDraggable(widget) {
    let startX, startY, startLeft, startTop, hasMoved = false;
    function onStart(e) {
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX; startY = touch.clientY;
      const rect = widget.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      hasMoved = false;
      widget.classList.add('dragging');
      widgetState.isDragging = true;
      if (e.touches) { document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onEnd); }
      else { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onEnd); }
    }
    function onMove(e) {
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      let nl = startLeft + dx, nt = startTop + dy;
      nl = Math.max(0, Math.min(nl, window.innerWidth - widget.offsetWidth));
      nt = Math.max(0, Math.min(nt, window.innerHeight - widget.offsetHeight));
      widget.style.left = nl + 'px'; widget.style.top = nt + 'px';
      widget.style.right = 'auto'; widget.style.bottom = 'auto';
    }
    function onEnd() {
      widget.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd);
      setTimeout(() => { widgetState.isDragging = false; if (!hasMoved) openOverlay(); }, 50);
    }
    widget.addEventListener('mousedown', onStart);
    widget.addEventListener('touchstart', onStart, { passive: false });
  }

  // ========== Widget (bolha) ==========
  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'video-stories-widget';
    const shape = getShapeStyles();
    const posConfig = getPositionConfig();
    widget.style.width = shape.width + 'px';
    widget.style.height = shape.height + 'px';
    widget.style.borderRadius = shape.borderRadius;
    widget.style.border = `3px solid ${widgetConfig.cor_borda_primaria}`;
    widget.style.outline = `2px solid ${widgetConfig.cor_borda_secundaria}`;
    widget.style.outlineOffset = '-5px';
    widget.style.setProperty('--widget-color', widgetConfig.cor_borda_primaria);

    const imgRect = widgetState.imageContainer ? widgetState.imageContainer.getBoundingClientRect() : null;
    if (imgRect) {
      const topPos = imgRect.top + posConfig.margemSuperior;
      const leftPos = posConfig.posicao.includes('left')
        ? imgRect.left + posConfig.margemEsquerda
        : imgRect.right - shape.width - posConfig.margemEsquerda;
      widget.style.top = Math.max(0, topPos) + 'px';
      widget.style.left = Math.max(0, leftPos) + 'px';
    } else {
      widget.style.top = posConfig.margemSuperior + 'px';
      widget.style.left = posConfig.margemEsquerda + 'px';
    }

    if (widgetConfig.animado) widget.classList.add('video-stories-animated');

    // Mini vídeo autoplay (muted) dentro da bolha — Bunny only
    if (widgetState.videos.length > 0 && widgetState.videos[0].bunnyGuid) {
      const guid = widgetState.videos[0].bunnyGuid;
      const miniIframe = document.createElement('iframe');
      miniIframe.className = 'widget-mini-video';
      miniIframe.src = `https://iframe.mediadelivery.net/embed/${CONFIG.BUNNY_LIBRARY_ID}/${guid}?autoplay=true&muted=true&loop=true&preload=true&responsive=true&controls=false&playsinline=true`;
      miniIframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
      miniIframe.setAttribute('playsinline', '');
      miniIframe.setAttribute('webkit-playsinline', '');
      miniIframe.setAttribute('loading', 'lazy');
      widget.appendChild(miniIframe);
    } else if (widgetState.videos.length > 0 && widgetState.videos[0].thumbnailUrl) {
      widget.style.backgroundImage = `url('${widgetState.videos[0].thumbnailUrl}')`;
    }

    widget.setAttribute('aria-label', 'Visualizar vídeos do produto');
    widget.title = 'Clique para ver vídeos';

    if (widgetConfig.pode_fechar_video) {
      const closeBtn = document.createElement('button');
      closeBtn.id = 'video-stories-close-widget';
      closeBtn.innerHTML = '×';
      closeBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); widget.style.display = 'none'; });
      widget.appendChild(closeBtn);
    }

    makeDraggable(widget);
    return widget;
  }

  function positionWidget() {
    if (!widgetState.widget || !widgetState.widget.parentElement) {
      widgetState.widget = createWidget();
      document.body.appendChild(widgetState.widget);
    }
  }

  // ========== Overlay (tela cheia stories) ==========
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'video-stories-overlay';
    const container = document.createElement('div');
    container.className = 'video-stories-container';

    // Botão fechar
    const closeBtn = document.createElement('button');
    closeBtn.className = 'video-stories-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.addEventListener('click', closeOverlay);

    // Barras de progresso
    const navContainer = document.createElement('div');
    navContainer.className = 'video-stories-nav';
    if (widgetState.videos.length > 1) {
      widgetState.videos.forEach((_, index) => {
        const bar = document.createElement('div');
        bar.className = `video-stories-bar ${index === 0 ? 'active' : ''}`;
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        bar.appendChild(fill);
        bar.addEventListener('click', () => goToVideo(index));
        navContainer.appendChild(bar);
      });
    }

    // Player
    const playerWrapper = document.createElement('div');
    playerWrapper.className = 'video-stories-player';

    // Tap zones
    const tapLeft = document.createElement('div');
    tapLeft.className = 'video-stories-tap-zone video-stories-tap-left';
    tapLeft.addEventListener('click', () => previousVideo());
    const tapRight = document.createElement('div');
    tapRight.className = 'video-stories-tap-zone video-stories-tap-right';
    tapRight.addEventListener('click', () => nextVideo());

    // Botões de ação
    const actions = document.createElement('div');
    actions.className = 'video-stories-actions';

    // Coração
    const heartBtn = document.createElement('button');
    heartBtn.className = 'video-stories-action-btn';
    heartBtn.title = 'Curtir';
    heartBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>`;
    heartBtn.addEventListener('click', () => {
      const isLiked = heartBtn.dataset.liked === '1';
      heartBtn.dataset.liked = isLiked ? '0' : '1';
      heartBtn.querySelector('svg').style.fill = isLiked ? 'none' : '#ef4444';
      heartBtn.querySelector('svg').style.stroke = isLiked ? 'currentColor' : '#ef4444';
    });

    // WhatsApp
    const waBtn = document.createElement('button');
    waBtn.className = 'video-stories-action-btn';
    waBtn.title = 'Falar com vendedora';
    waBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.555 4.121 1.523 5.854L.057 23.882a.5.5 0 00.612.612l6.028-1.466A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.96 0-3.794-.524-5.371-1.435l-.385-.23-3.988.969.989-3.988-.23-.385A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>`;
    waBtn.addEventListener('click', () => {
      const text = `Olá gostaria de ajuda\n\nEstou no vídeo: ${window.location.href}`;
      window.open(`https://api.whatsapp.com/send/?phone=5535998543079&type=phone_number&app_absent=0&text=${encodeURIComponent(text)}`, '_blank');
    });

    // Compartilhar
    const shareBtn = document.createElement('button');
    shareBtn.className = 'video-stories-action-btn';
    shareBtn.title = 'Compartilhar';
    shareBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>`;
    shareBtn.addEventListener('click', () => {
      const url = widgetState.productUrl || window.location.href;
      if (navigator.share) { navigator.share({ title: widgetState.productTitle || 'Galeria Tricot', url }); }
      else {
        navigator.clipboard.writeText(url).then(() => {
          shareBtn.innerHTML = `<svg fill="none" stroke="#4ade80" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>`;
          setTimeout(() => { shareBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>`; }, 2000);
        });
      }
    });

    // Mute
    const muteBtn = document.createElement('button');
    muteBtn.className = 'video-stories-action-btn';
    muteBtn.id = 'vs-mute-btn';
    muteBtn.title = 'Som';
    const iconSound = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4H5a1 1 0 01-1-1v-4a1 1 0 011-1h3l4-4z" /></svg>`;
    const iconMuted = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>`;
    muteBtn.innerHTML = widgetState.isMuted ? iconMuted : iconSound;
    muteBtn.addEventListener('click', () => {
      widgetState.isMuted = !widgetState.isMuted;
      muteBtn.innerHTML = widgetState.isMuted ? iconMuted : iconSound;
      loadVideo(widgetState.currentVideoIndex);
    });

    actions.appendChild(heartBtn);
    actions.appendChild(waBtn);
    actions.appendChild(shareBtn);
    actions.appendChild(muteBtn);

    // Card do produto
    const productSection = document.createElement('div');
    productSection.className = 'video-stories-product';
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'video-stories-cards';

    const card = document.createElement('a');
    card.className = 'video-stories-card';
    card.href = widgetState.productUrl || window.location.href;
    const cardImg = document.createElement('img');
    cardImg.className = 'video-stories-card-img';
    if (widgetState.videos[0]?.thumbnailUrl) cardImg.src = widgetState.videos[0].thumbnailUrl;
    cardImg.alt = '';
    const cardInfo = document.createElement('div');
    cardInfo.className = 'video-stories-card-info';
    const cardName = document.createElement('div');
    cardName.className = 'video-stories-card-name';
    cardName.textContent = widgetState.productTitle || '';
    const cardPrice = document.createElement('div');
    cardPrice.className = 'video-stories-card-price';
    // Shopify: buscar preço na página
    const priceEl = document.querySelector('.pdp__price-current, .pdp__price .money, .price__regular .money, .product-price, [class*="price"] .money');
    cardPrice.textContent = priceEl ? priceEl.textContent.trim() : '';
    cardInfo.appendChild(cardName);
    if (cardPrice.textContent) cardInfo.appendChild(cardPrice);
    card.appendChild(cardImg);
    card.appendChild(cardInfo);
    cardsContainer.appendChild(card);

    if (widgetState.videos.length > 1) {
      for (let i = 1; i < widgetState.videos.length; i++) {
        const extraCard = document.createElement('a');
        extraCard.className = 'video-stories-card';
        extraCard.href = widgetState.productUrl || window.location.href;
        extraCard.addEventListener('click', (e) => { e.preventDefault(); goToVideo(i); });
        const extraImg = document.createElement('img');
        extraImg.className = 'video-stories-card-img';
        if (widgetState.videos[i]?.thumbnailUrl) extraImg.src = widgetState.videos[i].thumbnailUrl;
        extraImg.alt = '';
        const extraInfo = document.createElement('div');
        extraInfo.className = 'video-stories-card-info';
        const extraName = document.createElement('div');
        extraName.className = 'video-stories-card-name';
        extraName.textContent = widgetState.productTitle || '';
        extraInfo.appendChild(extraName);
        extraCard.appendChild(extraImg);
        extraCard.appendChild(extraInfo);
        cardsContainer.appendChild(extraCard);
      }
    }
    productSection.appendChild(cardsContainer);

    container.appendChild(closeBtn);
    if (widgetState.videos.length > 1) container.appendChild(navContainer);
    container.appendChild(playerWrapper);
    container.appendChild(tapLeft);
    container.appendChild(tapRight);
    container.appendChild(actions);
    container.appendChild(productSection);
    overlay.appendChild(container);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    let touchStartY = 0;
    overlay.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; });
    overlay.addEventListener('touchend', (e) => { if (e.changedTouches[0].clientY - touchStartY > 100) closeOverlay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });

    return overlay;
  }

  function loadVideo(index) {
    const video = widgetState.videos[index];
    const playerWrapper = document.querySelector('.video-stories-player');
    if (!playerWrapper) return;
    const muted = widgetState.isMuted || !widgetConfig.som_padrao;
    const muteParam = muted ? '&muted=true' : '';
    const posterUrl = video.thumbnailUrl || `https://${CONFIG.BUNNY_CDN}/${video.bunnyGuid}/thumbnail.jpg`;
    const iframeUrl = `https://iframe.mediadelivery.net/embed/${CONFIG.BUNNY_LIBRARY_ID}/${video.bunnyGuid}?autoplay=true${muteParam}&preload=true&responsive=true`;
    playerWrapper.style.backgroundImage = `url('${posterUrl}')`;
    playerWrapper.style.backgroundSize = 'cover';
    playerWrapper.style.backgroundPosition = 'center';
    playerWrapper.innerHTML = `<iframe src="${iframeUrl}" allow="autoplay; encrypted-media" allowfullscreen=""></iframe>`;

    // Bunny player.js event listener for auto-advance
    const iframe = playerWrapper.querySelector('iframe');
    if (iframe) {
      if (widgetState._streamListener) window.removeEventListener('message', widgetState._streamListener);
      widgetState._streamListener = function(e) {
        let msg = e.data;
        if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch(_) { return; } }
        if (!msg || typeof msg !== 'object') return;
        if (msg.context === 'player.js') {
          if (msg.event === 'ended') {
            if (widgetState.currentVideoIndex < widgetState.videos.length - 1) nextVideo();
            else closeOverlay();
          }
          if (msg.event === 'timeupdate' && msg.value) {
            const pct = Math.min(((msg.value.seconds || 0) / (msg.value.duration || 1)) * 100, 100);
            const activeBar = document.querySelector('.video-stories-bar.active .bar-fill');
            if (activeBar) { activeBar.style.transition = 'width 0.3s linear'; activeBar.style.width = pct + '%'; }
          }
        }
      };
      window.addEventListener('message', widgetState._streamListener);
    }

    const bars = document.querySelectorAll('.video-stories-bar');
    bars.forEach((bar, i) => { bar.classList.remove('active', 'completed'); if (i < index) bar.classList.add('completed'); else if (i === index) bar.classList.add('active'); });
    widgetState.currentVideoIndex = index;
  }

  function openOverlay() {
    if (widgetState.overlayOpen || widgetState.isDragging) return;
    let overlay = document.getElementById('video-stories-overlay');
    if (!overlay) { overlay = createOverlay(); document.body.appendChild(overlay); }
    loadVideo(0);
    widgetState.currentVideoIndex = 0;
    overlay.offsetHeight;
    overlay.classList.add('active');
    widgetState.overlayOpen = true;
    document.body.style.overflow = 'hidden';
    if (widgetState.productSlug) trackOpen(widgetState.productSlug);
  }

  function closeOverlay() {
    const overlay = document.getElementById('video-stories-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    widgetState.overlayOpen = false;
    document.body.style.overflow = '';
    const pw = document.querySelector('.video-stories-player');
    if (pw) pw.innerHTML = '';
    widgetState.isMuted = true;
    const muteBtn = document.getElementById('vs-mute-btn');
    if (muteBtn) muteBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>`;
  }

  function nextVideo() { if (widgetState.currentVideoIndex < widgetState.videos.length - 1) goToVideo(widgetState.currentVideoIndex + 1); }
  function previousVideo() { if (widgetState.currentVideoIndex > 0) goToVideo(widgetState.currentVideoIndex - 1); }
  function goToVideo(index) { if (index >= 0 && index < widgetState.videos.length) loadVideo(index); }

  // ========== Analytics ==========
  async function trackView(slug) {
    try { await fetch(`${CONFIG.SUPABASE_URL}/rpc/increment_views`, { method: 'POST', headers: { 'apikey': CONFIG.SUPABASE_KEY, 'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ row_slug: slug }) }); } catch(e) {}
  }
  async function trackOpen(slug) {
    try { await fetch(`${CONFIG.SUPABASE_URL}/rpc/increment_opens`, { method: 'POST', headers: { 'apikey': CONFIG.SUPABASE_KEY, 'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ row_slug: slug }) }); } catch(e) {}
  }

  // ========== Esperar container de imagem ==========
  function waitForImageContainer() {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        const container = findImageContainer();
        if (container && container.offsetWidth > 0 && container.offsetHeight > 0) {
          widgetState.imageContainer = container;
          positionWidget();
          resolve(true);
          return;
        }
        attempts++;
        if (attempts < 30) setTimeout(check, 100);
        else resolve(false);
      };
      check();
    });
  }

  // ========== INIT ==========
  async function init() {
    if (widgetState.initialized) return;
    if (!isProductPage()) return;

    const slug = getProductSlug();
    if (!slug) return;
    widgetState.productSlug = slug;

    // Carregar config (inclui check do master switch)
    await loadWidgetConfig();

    // MASTER SWITCH: se desligado, não faz nada
    if (!widgetConfig.enabled) {
      console.log('[VideoStories] Widget desligado (master switch off)');
      return;
    }

    injectStyles();

    const videos = await fetchVideos(slug);
    if (videos.length === 0) return;

    widgetState.videos = videos;
    widgetState.initialized = true;

    const found = await waitForImageContainer();
    if (!found) {
      console.warn('[VideoStories] Could not find product image container, placing widget anyway');
      // Coloca no canto se não achar o container
      positionWidget();
    }

    trackView(widgetState.productSlug || slug);
  }

  // Detecção de navegação SPA (Shopify com Ajax)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (!isProductPage()) closeOverlay();
      // Reset para re-init
      widgetState.initialized = false;
      widgetState.videos = [];
      if (widgetState.widget && widgetState.widget.parentElement) {
        widgetState.widget.parentElement.removeChild(widgetState.widget);
      }
      widgetState.widget = null;
      const oldOverlay = document.getElementById('video-stories-overlay');
      if (oldOverlay) oldOverlay.remove();
      init();
    }
  }, 500);

  // Start
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Debug API
  window.VideoStoriesWidget = { state: widgetState, config: widgetConfig, openOverlay, closeOverlay, nextVideo, previousVideo };
})();
