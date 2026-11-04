(() => {
'use strict';

/* ================= State ================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('s95_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('s95_' + k, JSON.stringify(v)); } catch {} }
};

const state = {
  point: LS.get('point', null),
  mode: LS.get('mode', 'delivery'),
  cart: LS.get('cart', {}),          // {id: qty}
  favs: new Set(LS.get('favs', [])),
  orders: LS.get('orders', []),
  promo: LS.get('promo', null),
  address: LS.get('address', {}),
  theme: LS.get('theme', null),
  cat: 'all',
  query: '',
  filters: new Set(),
  sort: 'pop'
};

const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const save = () => {
  LS.set('cart', state.cart); LS.set('favs', [...state.favs]); LS.set('orders', state.orders);
  LS.set('promo', state.promo); LS.set('point', state.point); LS.set('mode', state.mode);
};
const point = () => POINTS.find(p => p.id === state.point);
const stockOf = (p, pid = state.point) => pid ? p.stock[pid] : 99;
const isOpen = pt => { const h = new Date().getHours(); return h >= pt.hours[0] && h < pt.hours[1]; };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const heart = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z"/></svg>';

/* ================= Theme ================= */
function applyTheme() {
  const t = state.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
}
applyTheme();

/* ================= Cart math ================= */
function cartLines() {
  return Object.entries(state.cart)
    .filter(([id]) => byId[id])
    .map(([id, qty]) => {
      const p = byId[id];
      const avail = stockOf(p);
      return { p, qty, avail, ok: avail >= qty && avail > 0, sum: p.price * qty, oldSum: (p.oldPrice || p.price) * qty };
    });
}
function totals() {
  const lines = cartLines();
  const okLines = lines.filter(l => l.ok);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = okLines.reduce((s, l) => s + l.sum, 0);
  const saved = okLines.reduce((s, l) => s + (l.oldSum - l.sum), 0);
  const pt = point() || POINTS[0];
  let discount = 0, freeDelivery = false, promoErr = null;
  if (state.promo) {
    const pr = PROMOS[state.promo];
    if (subtotal < pr.min) promoErr = `Промокод действует от ${rub(pr.min)}`;
    else if (pr.type === 'percent') discount = Math.round(subtotal * pr.value / 100);
    else if (pr.type === 'fixed') discount = Math.min(pr.value, subtotal);
    else if (pr.type === 'delivery') freeDelivery = true;
  }
  const isPickup = state.mode === 'pickup';
  const delivery = isPickup || freeDelivery || subtotal >= pt.freeFrom || subtotal === 0 ? 0 : pt.deliveryFee;
  const service = subtotal > 0 ? 19 : 0;
  const total = Math.max(0, subtotal - discount) + delivery + service;
  const minOk = subtotal >= pt.minOrder;
  return { lines, okLines, count, subtotal, saved, discount, delivery, service, total, pt, minOk, promoErr, isPickup, toFree: Math.max(0, pt.freeFrom - subtotal) };
}

function setQty(id, qty, srcEl) {
  const p = byId[id];
  const max = state.point ? stockOf(p) : 99;
  const prev = state.cart[id] || 0;
  qty = Math.max(0, Math.min(qty, max));
  if (qty > prev && prev >= max) { toast(`Больше нет в наличии на складе`); return; }
  if (qty === 0) delete state.cart[id]; else state.cart[id] = qty;
  save();
  if (qty > prev && srcEl) flyToCart(p.emoji, srcEl);
  if (qty > prev && prev === 0 && !state.point) openPoints();
  refreshQty(id);
  renderCartAll();
}

/* ================= Rendering: product card ================= */
function actionHTML(p, size = '') {
  const q = state.cart[p.id] || 0;
  const s = stockOf(p);
  if (s === 0) return `<button class="add-btn" disabled>Нет в наличии</button>`;
  if (!q) return `<button class="add-btn" data-add="${p.id}"><span>+</span> В корзину</button>`;
  return `<div class="stepper ${size}">
    <button data-dec="${p.id}" aria-label="Меньше">−</button>
    <span>${q}</span>
    <button data-inc="${p.id}" aria-label="Больше" ${q >= s ? 'disabled' : ''}>+</button>
  </div>`;
}
function tagsHTML(p) {
  const t = [];
  if (p.oldPrice) t.push(`<span class="tag tag--sale">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>`);
  if (p.tags.includes('hit')) t.push('<span class="tag tag--hit">Хит</span>');
  if (p.tags.includes('halal')) t.push('<span class="tag tag--halal">Халяль</span>');
  if (p.tags.includes('local')) t.push('<span class="tag tag--local">Местное</span>');
  return t.join('');
}
function cardHTML(p) {
  const s = stockOf(p);
  const c = catById[p.cat];
  return `<article class="card ${s === 0 ? 'out' : ''}" data-card="${p.id}">
    <div class="card__img" style="background:${c.color}" data-open="${p.id}">
      <span>${p.emoji}</span>
      <div class="card__tags">${tagsHTML(p)}</div>
    </div>
    <button class="fav-btn ${state.favs.has(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${heart}</button>
    <div class="card__price">
      <span class="price ${p.oldPrice ? 'price--sale' : ''}">${rub(p.price)}</span>
      ${p.oldPrice ? `<span class="price-old">${rub(p.oldPrice)}</span>` : ''}
    </div>
    <div class="card__name" data-open="${p.id}">${p.name}</div>
    <div class="card__unit"><span>${p.unit}</span>${state.point && s > 0 && s <= 5 ? `<span class="card__low">${s} шт</span>` : ''}</div>
    <div class="card__action" data-action-for="${p.id}">${actionHTML(p)}</div>
  </article>`;
}
function refreshQty(id) {
  const p = byId[id];
  $$(`[data-action-for="${id}"]`).forEach(el => {
    el.innerHTML = actionHTML(p, el.dataset.size || '');
  });
}

/* ================= Catalog ================= */
function filtered() {
  const q = state.query.trim().toLowerCase();
  let list = PRODUCTS.filter(p => {
    if (state.cat === 'fav') { if (!state.favs.has(p.id)) return false; }
    else if (state.cat !== 'all' && p.cat !== state.cat) return false;
    if (q && !(p.name.toLowerCase().includes(q) || catById[p.cat].name.toLowerCase().includes(q))) return false;
    if (state.filters.has('sale') && !p.oldPrice) return false;
    if (state.filters.has('halal') && !p.tags.includes('halal')) return false;
    if (state.filters.has('local') && !p.tags.includes('local')) return false;
    if (state.filters.has('instock') && stockOf(p) === 0) return false;
    return true;
  });
  const disc = p => p.oldPrice ? 1 - p.price / p.oldPrice : 0;
  const sorters = {
    pop: (a, b) => b.popularity - a.popularity,
    asc: (a, b) => a.price - b.price,
    desc: (a, b) => b.price - a.price,
    sale: (a, b) => disc(b) - disc(a),
    name: (a, b) => a.name.localeCompare(b.name, 'ru')
  };
  list.sort(sorters[state.sort]);
  // out-of-stock to the end
  list.sort((a, b) => (stockOf(a) === 0) - (stockOf(b) === 0));
  return list;
}

function renderCatalog() {
  const list = filtered();
  const root = $('#catalog');
  const grouped = state.cat === 'all' && !state.query && state.sort === 'pop';
  $('#listTitle').textContent = state.query ? `Поиск: «${state.query}»`
    : state.cat === 'all' ? 'Все товары' : state.cat === 'fav' ? 'Избранное' : catById[state.cat].name;

  if (!list.length) {
    root.innerHTML = state.cat === 'fav' && !state.favs.size
      ? `<div class="empty"><div class="empty__icon">🤍</div><div class="empty__title">Пока пусто</div>Нажмите ♡ на товаре</div>`
      : `<div class="empty"><div class="empty__icon">🔍</div><div class="empty__title">Ничего не найдено</div><button class="btn btn--ghost btn--sm" data-action="reset" style="margin-top:12px">Сбросить фильтры</button></div>`;
    return;
  }
  if (grouped) {
    const hits = PRODUCTS.filter(p => p.oldPrice && stockOf(p) > 0).sort((a, b) => (1 - a.price / a.oldPrice) < (1 - b.price / b.oldPrice) ? 1 : -1).slice(0, 10);
    let html = '';
    if (hits.length && !state.filters.size) {
      html += `<section class="section"><div class="section__head"><h2 class="section__title">🔥 Скидки дня</h2><button class="section__more" data-chip="sale">Все</button></div><div class="grid">${hits.slice(0, 5).map(cardHTML).join('')}</div></section>`;
    }
    CATEGORIES.forEach(c => {
      const items = list.filter(p => p.cat === c.id);
      if (!items.length) return;
      html += `<section class="section" id="sec-${c.id}"><div class="section__head"><h2 class="section__title">${c.icon} ${c.name}</h2><button class="section__more" data-cat="${c.id}">Все ${items.length}</button></div><div class="grid">${items.map(cardHTML).join('')}</div></section>`;
    });
    root.innerHTML = html;
  } else {
    root.innerHTML = `<div class="grid">${list.map(cardHTML).join('')}</div>`;
  }
}

function renderCats() {
  const counts = {};
  PRODUCTS.forEach(p => counts[p.cat] = (counts[p.cat] || 0) + 1);
  const items = [{ id: 'all', name: 'Все товары', icon: '🛒', color: 'var(--surface-2)' }, ...CATEGORIES, { id: 'fav', name: 'Избранное', icon: '❤️', color: '#fde8e6' }];
  $('#catNav').innerHTML = items.map(c => `
    <button class="cat-link ${state.cat === c.id ? 'active' : ''}" data-cat="${c.id}">
      <span class="cat-link__icon" style="background:${c.color}">${c.icon}</span>${c.name}
      <span class="cat-link__count">${c.id === 'all' ? PRODUCTS.length : c.id === 'fav' ? (state.favs.size || '') : counts[c.id]}</span>
    </button>`).join('');
  $('#catStrip').innerHTML = items.map(c => `<button class="cat-pill ${state.cat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.name}</button>`).join('');
  const fb = $('#favBadge'); fb.hidden = !state.favs.size; fb.textContent = state.favs.size;
}

function renderBanners() {
  $('#banners').innerHTML = BANNERS.map((b, i) => `
    <button class="banner" style="background:${b.bg}" data-banner="${i}">
      <span class="banner__icon">${b.icon}</span>
      <span class="banner__title">${b.title}</span>
      <span class="banner__sub">${b.sub}</span>
    </button>`).join('');
}

/* ================= Point UI ================= */
function renderPoint() {
  const pt = point();
  $('#pointCity').textContent = pt ? `${pt.city}${state.mode === 'pickup' ? ' · самовывоз' : ''}` : 'Выберите точку';
  $('#pointMeta').textContent = pt ? (state.mode === 'pickup' ? pt.address : (state.address.street ? `${state.address.street}, ${state.address.house || ''}` : `Доставка ${pt.eta}`)) : 'Грозный · Урус-Мартан · Шали';
  if (!pt) { $('#pointCard').innerHTML = ''; return; }
  const open = isOpen(pt);
  $('#pointCard').innerHTML = `
    <div class="point-card__title"><span class="status-dot ${open ? '' : 'closed'}"></span>Склад ${pt.city}</div>
    <div class="point-card__row"><span>Адрес</span><b>${pt.address}</b></div>
    <div class="point-card__row"><span>Работаем</span><b>${String(pt.hours[0]).padStart(2, '0')}:00–${pt.hours[1]}:00</b></div>
    <div class="point-card__row"><span>Доставка</span><b>${pt.eta}</b></div>
    <div class="point-card__row"><span>Бесплатно от</span><b>${rub(pt.freeFrom)}</b></div>
    <button class="btn btn--ghost btn--sm btn--block" style="margin-top:10px" data-action="open-points">Сменить</button>`;
  $('#footerPoints').innerHTML = POINTS.map(p => `<div><b>${p.city}</b>${p.address} · ${p.phone}</div>`).join('');
}

function mapSVG(sel) {
  const roads = `<path d="M40 70 C120 90 200 100 262 118 S380 120 470 100" /><path d="M148 196 C190 160 230 140 262 118" /><path d="M262 118 C290 150 310 180 330 206" /><path d="M148 196 C220 215 280 215 330 206" /><path d="M60 230 C100 215 120 205 148 196" /><path d="M330 206 C380 220 430 240 470 250" />`;
  const pins = POINTS.map(p => {
    const on = p.id === sel;
    return `<g class="map-pin" data-pick="${p.id}" transform="translate(${p.x},${p.y})">
      ${on ? '<circle class="pulse" r="14" fill="#14a05c" opacity=".5"/>' : ''}
      <circle r="${on ? 11 : 8}" fill="${on ? '#14a05c' : '#fff'}" stroke="${on ? '#fff' : '#14a05c'}" stroke-width="3"/>
      <text y="-20" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${p.city}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 500 320" preserveAspectRatio="xMidYMid meet" style="color:var(--text)">
    <defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="currentColor" stroke-opacity=".06"/></pattern></defs>
    <rect width="500" height="320" fill="url(#g)"/>
    <path d="M0 260 C80 250 140 280 220 270 S380 290 500 280 V320 H0Z" fill="currentColor" opacity=".05"/>
    <path d="M30 40 C140 60 220 70 300 60 S420 40 500 55" fill="none" stroke="#5aa9e6" stroke-width="5" stroke-linecap="round" opacity=".55"/>
    <text x="440" y="44" font-size="11" fill="#5aa9e6" opacity=".9">Терек</text>
    <path d="M300 320 C305 250 290 170 262 118" fill="none" stroke="#5aa9e6" stroke-width="3" opacity=".45"/>
    <text x="255" y="300" font-size="11" fill="#5aa9e6" opacity=".9">Аргун</text>
    <g fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="3" stroke-linecap="round">${roads}</g>
    ${pins}
  </svg>`;
}

function openPoints() {
  let sel = state.point || 'grz';
  let mode = state.mode;
  const draw = () => {
    $('#modal').innerHTML = `
      <button class="close-x" data-close>✕</button>
      <div class="pts">
        <div class="pts__map">${mapSVG(sel)}</div>
        <div class="pts__list">
          <h2 class="pts__title">Откуда доставить?</h2>
          <div class="mode-switch">
            <button class="${mode === 'delivery' ? 'active' : ''}" data-mode="delivery">🛵 Доставка</button>
            <button class="${mode === 'pickup' ? 'active' : ''}" data-mode="pickup">🏪 Самовывоз</button>
          </div>
          ${POINTS.map(p => {
            const open = isOpen(p);
            const n = PRODUCTS.filter(x => x.stock[p.id] > 0).length;
            return `<button class="pt ${p.id === sel ? 'active' : ''}" data-pick="${p.id}">
              <span class="pt__city">${p.city}</span>
              <span class="pt__addr">${p.address}</span>
              <span class="pt__eta">${mode === 'pickup' ? '10 мин' : p.eta}<small>${open ? 'Открыто' : 'Закрыто'}</small></span>
              <span class="pt__info">
                <span>🕒 ${String(p.hours[0]).padStart(2, '0')}:00–${p.hours[1]}:00</span>
                <span>📦 ${n} товаров</span>
                ${mode === 'delivery' ? `<span>🛵 ${rub(p.deliveryFee)}, бесплатно от ${rub(p.freeFrom)}</span>` : ''}
              </span>
            </button>`;
          }).join('')}
          <button class="btn btn--primary btn--block" style="margin-top:6px" data-confirm-point>Выбрать ${POINTS.find(p => p.id === sel).city}</button>
        </div>
      </div>`;
  };
  draw();
  openModal('', () => {});
  $('#modal').onclick = e => {
    const pick = e.target.closest('[data-pick]');
    const m = e.target.closest('[data-mode]');
    if (pick) { sel = pick.dataset.pick; draw(); }
    else if (m) { mode = m.dataset.mode; draw(); }
    else if (e.target.closest('[data-confirm-point]')) {
      const changed = state.point && state.point !== sel;
      state.point = sel; state.mode = mode; save();
      closeAll();
      renderAll();
      const bad = cartLines().filter(l => !l.ok).length;
      toast(changed && bad ? `${bad} ${plural(bad, 'товар недоступен', 'товара недоступны', 'товаров недоступны')} на этом складе` : `Склад: ${point().city}`);
    } else if (e.target.closest('[data-close]')) closeAll();
  };
}

/* ================= Cart ================= */
function cartHTML(inDrawer) {
  const t = totals();
  if (!t.lines.length) {
    return `<div class="cart">
      <div class="cart__head"><h2 class="cart__title">Корзина</h2></div>
      <div class="cart__body"><div class="empty" style="padding:40px 10px"><div class="empty__icon">🧺</div><div class="empty__title">Корзина пуста</div></div></div>
    </div>`;
  }
  const bad = t.lines.filter(l => !l.ok);
  const freePct = Math.min(100, t.subtotal / t.pt.freeFrom * 100);
  return `<div class="cart">
    <div class="cart__head" ${inDrawer ? 'style="padding-right:70px"' : ''}>
      <h2 class="cart__title">Корзина</h2>
      <button class="cart__clear" data-action="clear-cart">Очистить</button>
    </div>
    <div class="cart__body">
      ${!t.isPickup ? `<div class="delivery-bar">
        <div class="delivery-bar__row"><span>${t.toFree > 0 ? `До бесплатной доставки ${rub(t.toFree)}` : 'Доставка бесплатная 🎉'}</span><span>${t.pt.eta}</span></div>
        <div class="progress"><i style="width:${freePct}%"></i></div>
      </div>` : `<div class="delivery-bar"><div class="delivery-bar__row"><span>Самовывоз: ${t.pt.address}</span><span>~10 мин</span></div></div>`}
      ${bad.length ? `<div class="danger-box"><span>${bad.length} ${plural(bad.length, 'товар', 'товара', 'товаров')} нет на складе ${t.pt.city}</span><button data-action="remove-bad">Убрать</button></div>` : ''}
      ${t.lines.map(l => `
        <div class="cart-item ${l.ok ? '' : 'unavailable'}">
          <div class="cart-item__img" style="background:${catById[l.p.cat].color}" data-open="${l.p.id}">${l.p.emoji}</div>
          <div>
            <div class="cart-item__name">${l.p.name}</div>
            <div class="cart-item__meta">${l.p.unit}</div>
            ${l.ok ? `<div class="cart-item__price">${rub(l.sum)} ${l.p.oldPrice ? `<span class="price-old">${rub(l.oldSum)}</span>` : ''}</div>`
              : `<div class="cart-item__warn">${l.avail ? `Осталось ${l.avail} шт` : 'Нет в наличии'}</div>`}
          </div>
          <div data-action-for="${l.p.id}" data-size="stepper--sm stepper--soft">${l.ok || l.avail ? actionHTML(l.p, 'stepper--sm stepper--soft') : `<button class="cart__clear" data-remove="${l.p.id}">Удалить</button>`}</div>
        </div>`).join('')}
      ${state.promo ? `<div class="promo-applied"><span>🏷 ${state.promo} · ${t.promoErr || PROMOS[state.promo].label}</span><button data-action="remove-promo">×</button></div>`
        : `<form class="promo" data-promo-form><input name="code" placeholder="Промокод" autocomplete="off"><button class="btn btn--ghost btn--sm">Применить</button></form>`}
    </div>
    <div class="cart__foot">
      <div class="totals">
        <div class="totals__row"><span>Товары · ${t.count}</span><b>${rub(t.subtotal + t.saved)}</b></div>
        ${t.saved ? `<div class="totals__row totals__row--discount"><span>Скидка</span><b>−${rub(t.saved)}</b></div>` : ''}
        ${t.discount ? `<div class="totals__row totals__row--discount"><span>Промокод</span><b>−${rub(t.discount)}</b></div>` : ''}
        <div class="totals__row"><span>${t.isPickup ? 'Самовывоз' : 'Доставка'}</span><b>${t.delivery ? rub(t.delivery) : 'Бесплатно'}</b></div>
        <div class="totals__row"><span>Сборка</span><b>${rub(t.service)}</b></div>
        <div class="totals__row totals__row--total"><span>Итого</span><b>${rub(t.total)}</b></div>
      </div>
      ${!t.minOk ? `<div class="warn-box">Минимальный заказ ${rub(t.pt.minOrder)} — добавьте ещё на ${rub(t.pt.minOrder - t.subtotal)}</div>` : ''}
      <button class="btn btn--primary btn--block btn--between" data-action="checkout" ${t.minOk && t.okLines.length ? '' : 'disabled'}>
        <span>Оформить</span><span>${rub(t.total)}</span>
      </button>
    </div>
  </div>`;
}

function renderCartAll() {
  const t = totals();
  $('#sideCart').innerHTML = cartHTML(false);
  if ($('#drawer').dataset.view === 'cart') $('#drawer').innerHTML = `<button class="close-x" data-close>✕</button>` + cartHTML(true);
  $('#cartBtnText').textContent = t.count ? rub(t.total) : 'Корзина';
  const mc = $('#mobileCart');
  mc.hidden = !t.count;
  $('#mobileSum').textContent = rub(t.total);
  $('#mobileEta').textContent = `${t.count} ${plural(t.count, 'товар', 'товара', 'товаров')} · ${t.isPickup ? 'самовывоз' : t.pt.eta}`;
  if (state.cat === 'fav') renderCatalog();
}

function applyPromo(code) {
  code = code.trim().toUpperCase();
  if (!code) return;
  if (!PROMOS[code]) { toast('Промокод не найден'); return; }
  state.promo = code; save(); renderCartAll();
  toast(`Промокод ${code} применён`);
}

/* ================= Product modal ================= */
function openProduct(id) {
  const p = byId[id];
  const c = catById[p.cat];
  const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id && stockOf(x) > 0).sort(() => Math.random() - .5).slice(0, 8);
  $('#modal').innerHTML = `
    <button class="close-x" data-close>✕</button>
    <div class="pm">
      <div class="pm__img" style="background:${c.color}"><span>${p.emoji}</span><div class="card__tags" style="left:16px;top:16px">${tagsHTML(p)}</div></div>
      <div class="pm__body">
        <div>
          <h2 class="pm__name">${p.name}</h2>
          <div class="pm__unit">${p.unit}</div>
        </div>
        <div class="pm__meta">
          <span>⭐ ${p.rating}</span>
          ${p.kcal ? `<span>${p.kcal} ккал / 100 г</span>` : ''}
          <span>${c.icon} ${c.name}</span>
        </div>
        <div class="pm__desc">${p.desc}</div>
        <div class="pm__stock">
          ${POINTS.map(pt => `<div class="pm__stock-row ${pt.id === state.point ? 'current' : ''}"><span>${pt.city}</span><b>${p.stock[pt.id] ? (p.stock[pt.id] > 5 ? 'В наличии' : `${p.stock[pt.id]} шт`) : '—'}</b></div>`).join('')}
        </div>
        <div class="pm__buy">
          <div>
            <div class="price ${p.oldPrice ? 'price--sale' : ''}">${rub(p.price)}</div>
            ${p.oldPrice ? `<div class="price-old">${rub(p.oldPrice)}</div>` : ''}
          </div>
          <div style="flex:1;display:flex" data-action-for="${p.id}">${actionHTML(p)}</div>
          <button class="fav-btn ${state.favs.has(p.id) ? 'on' : ''}" style="position:static;width:50px;height:50px;background:var(--surface-2)" data-fav="${p.id}">${heart}</button>
        </div>
      </div>
      ${related.length ? `<div class="pm__related"><h3>Ещё в «${c.name}»</h3><div class="mini-row">${related.map(cardHTML).join('')}</div></div>` : ''}
    </div>`;
  $('#modal').classList.remove('modal--wide');
  openModal();
  $('#modal').scrollTop = 0;
}

/* ================= Checkout ================= */
function timeSlots() {
  const pt = point();
  const slots = [{ id: 'asap', title: 'Как можно скорее', sub: pt.eta }];
  const now = new Date();
  for (let d = 0; d < 2; d++) {
    for (let h = pt.hours[0]; h < pt.hours[1]; h++) {
      const start = new Date(now); start.setDate(now.getDate() + d); start.setHours(h, 0, 0, 0);
      if (start - now < 60 * 60 * 1000) continue;
      slots.push({ id: start.toISOString(), title: `${h}:00–${h + 1}:00`, sub: d === 0 ? 'Сегодня' : 'Завтра' });
      if (slots.length > 14) break;
    }
  }
  return slots;
}

function openCheckout() {
  const t = totals();
  if (!t.minOk) return;
  const f = { slot: 'asap', pay: 'card', tip: 0, noCall: false, leave: false, replace: 'call', ...state.address };
  const slots = timeSlots();
  const pt = t.pt;
  const pickup = t.isPickup;

  $('#modal').classList.add('modal--wide');
  $('#modal').innerHTML = `
    <button class="close-x" data-close>✕</button>
    <form class="checkout" id="checkoutForm" novalidate>
      <div class="checkout__form">
        <h2 class="checkout__title">Оформление заказа</h2>

        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">1</span>${pickup ? `Самовывоз · ${pt.city}` : `Адрес доставки · ${pt.city}`}</div>
          ${pickup ? `<div class="opt active" style="pointer-events:none"><span class="opt__title">🏪 ${pt.address}</span><span class="opt__sub">Ежедневно ${pt.hours[0]}:00–${pt.hours[1]}:00 · будет готов через ~10 мин</span></div>` : `
          <div class="row row--2">
            <div class="field"><input name="street" placeholder=" " value="${f.street || ''}" required><label>Улица</label></div>
            <div class="row row--2" style="grid-template-columns:1fr 1fr">
              <div class="field"><input name="house" placeholder=" " value="${f.house || ''}" required><label>Дом</label></div>
              <div class="field"><input name="apt" placeholder=" " value="${f.apt || ''}"><label>Кв./офис</label></div>
            </div>
          </div>
          <div class="row row--4">
            <div class="field"><input name="entrance" placeholder=" " value="${f.entrance || ''}"><label>Подъезд</label></div>
            <div class="field"><input name="floor" placeholder=" " value="${f.floor || ''}"><label>Этаж</label></div>
            <div class="field"><input name="code" placeholder=" " value="${f.code || ''}"><label>Домофон</label></div>
            <div class="field"><select name="zone" style="padding-top:18px">${pt.zones.map(z => `<option ${f.zone === z ? 'selected' : ''}>${z}</option>`).join('')}</select><label style="top:6px;font-size:11px;font-weight:600">Район</label></div>
          </div>`}
        </div>

        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">2</span>Контакты</div>
          <div class="row row--2">
            <div class="field"><input name="name" placeholder=" " value="${f.name || ''}" required autocomplete="given-name"><label>Имя</label></div>
            <div class="field"><input name="phone" type="tel" placeholder=" " value="${f.phone || ''}" required autocomplete="tel"><label>Телефон</label></div>
          </div>
          <div class="field"><textarea name="comment" placeholder=" ">${f.comment || ''}</textarea><label>Комментарий ${pickup ? '' : 'курьеру'}</label></div>
        </div>

        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">3</span>Время</div>
          <div class="slots">${slots.map(s => `<button type="button" class="slot ${s.id === f.slot ? 'active' : ''}" data-slot="${s.id}">${s.title}<small>${s.sub}</small></button>`).join('')}</div>
        </div>

        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">4</span>Оплата</div>
          <div class="opts">
            ${[
              ['card', '💳', 'Картой онлайн', 'Visa, MC, МИР'],
              ['sbp', '⚡', 'СБП', 'По QR-коду'],
              ['courier-card', '📟', pickup ? 'Картой на кассе' : 'Картой курьеру', 'Терминал'],
              ['cash', '💵', 'Наличными', pickup ? 'На кассе' : 'Курьеру']
            ].map(([id, ic, ti, su]) => `<button type="button" class="opt ${f.pay === id ? 'active' : ''}" data-pay="${id}"><span class="opt__icon">${ic}</span><span class="opt__title">${ti}</span><span class="opt__sub">${su}</span></button>`).join('')}
          </div>
          <div id="payExtra"></div>
        </div>

        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">5</span>Дополнительно</div>
          ${pickup ? '' : `<label class="toggle">Оставить у двери<input type="checkbox" name="leave"><i></i></label>
          <label class="toggle">Не звонить в домофон<input type="checkbox" name="noCall"><i></i></label>`}
          <div class="field"><select name="replace" style="padding-top:18px">
            <option value="call">Позвонить и согласовать</option>
            <option value="similar">Заменить на похожий</option>
            <option value="remove">Убрать из заказа</option>
          </select><label style="top:6px;font-size:11px;font-weight:600">Если товара не окажется</label></div>
          ${pickup ? '' : `<div style="font-weight:600;font-size:14px;margin-top:4px">Чаевые курьеру</div>
          <div class="slots">${[0, 50, 100, 150, 200].map(v => `<button type="button" class="slot ${f.tip === v ? 'active' : ''}" data-tip="${v}">${v ? rub(v) : 'Без чаевых'}</button>`).join('')}</div>`}
        </div>
      </div>

      <div class="checkout__side">
        <div style="font-weight:800;font-size:18px">Ваш заказ</div>
        <div class="summary-items">
          ${t.okLines.map(l => `<div class="summary-item"><span class="summary-item__img" style="background:${catById[l.p.cat].color}">${l.p.emoji}</span><span class="summary-item__name">${l.p.name}</span><span>×${l.qty}</span><b>${rub(l.sum)}</b></div>`).join('')}
        </div>
        <div class="totals" id="checkoutTotals"></div>
        <button class="btn btn--primary btn--block btn--between" type="submit" id="payBtn"></button>
      </div>
    </form>`;
  openModal();
  $('#modal').scrollTop = 0;

  const form = $('#checkoutForm');
  const drawTotals = () => {
    const tt = totals();
    const sum = tt.total + (pickup ? 0 : f.tip);
    $('#checkoutTotals').innerHTML = `
      <div class="totals__row"><span>Товары</span><b>${rub(tt.subtotal + tt.saved)}</b></div>
      ${tt.saved ? `<div class="totals__row totals__row--discount"><span>Скидка</span><b>−${rub(tt.saved)}</b></div>` : ''}
      ${tt.discount ? `<div class="totals__row totals__row--discount"><span>Промокод ${state.promo}</span><b>−${rub(tt.discount)}</b></div>` : ''}
      <div class="totals__row"><span>${pickup ? 'Самовывоз' : 'Доставка'}</span><b>${tt.delivery ? rub(tt.delivery) : 'Бесплатно'}</b></div>
      <div class="totals__row"><span>Сборка</span><b>${rub(tt.service)}</b></div>
      ${f.tip && !pickup ? `<div class="totals__row"><span>Чаевые</span><b>${rub(f.tip)}</b></div>` : ''}
      <div class="totals__row totals__row--total"><span>К оплате</span><b>${rub(sum)}</b></div>`;
    $('#payBtn').innerHTML = `<span>${f.pay === 'card' ? 'Оплатить' : f.pay === 'sbp' ? 'Оплатить через СБП' : 'Заказать'}</span><span>${rub(sum)}</span>`;
    return sum;
  };
  const drawPay = () => {
    const box = $('#payExtra');
    if (f.pay === 'card') {
      box.innerHTML = `<div class="card-form">
        <input name="cardNum" inputmode="numeric" placeholder="0000 0000 0000 0000" maxlength="19" autocomplete="cc-number">
        <div class="row row--2"><input name="cardExp" inputmode="numeric" placeholder="ММ/ГГ" maxlength="5" autocomplete="cc-exp"><input name="cardCvc" inputmode="numeric" placeholder="CVC" maxlength="3" type="password" autocomplete="cc-csc"></div>
      </div>`;
    } else if (f.pay === 'cash') {
      box.innerHTML = `<div class="field"><input name="change" inputmode="numeric" placeholder=" "><label>С какой суммы сдача</label></div>`;
    } else box.innerHTML = '';
  };
  drawPay(); drawTotals();
  form.replace && (form.replace.value = f.replace);

  form.onclick = e => {
    const s = e.target.closest('[data-slot]'), p = e.target.closest('[data-pay]'), tp = e.target.closest('[data-tip]');
    if (s) { f.slot = s.dataset.slot; $$('[data-slot]', form).forEach(b => b.classList.toggle('active', b === s)); }
    if (p) { f.pay = p.dataset.pay; $$('[data-pay]', form).forEach(b => b.classList.toggle('active', b === p)); drawPay(); drawTotals(); }
    if (tp) { f.tip = +tp.dataset.tip; $$('[data-tip]', form).forEach(b => b.classList.toggle('active', b === tp)); drawTotals(); }
  };
  form.oninput = e => {
    const el = e.target;
    if (el.name === 'phone') el.value = maskPhone(el.value);
    if (el.name === 'cardNum') el.value = el.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    if (el.name === 'cardExp') { let v = el.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); el.value = v; }
    if (el.name === 'cardCvc' || el.name === 'change') el.value = el.value.replace(/\D/g, '');
    el.closest('.field')?.classList.remove('error');
    el.closest('.field')?.querySelector('.field__err')?.remove();
  };
  form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let ok = true;
    const err = (name, msg) => {
      ok = false;
      const el = form.elements[name];
      if (!el) return;
      const fld = el.closest('.field');
      if (fld) { fld.classList.add('error'); if (!fld.querySelector('.field__err')) fld.insertAdjacentHTML('beforeend', `<div class="field__err">${msg}</div>`); }
      else { el.style.borderColor = '#ff6b6b'; }
    };
    if (!pickup) { if (!data.street?.trim()) err('street', 'Укажите улицу'); if (!data.house?.trim()) err('house', 'Укажите дом'); }
    if (!data.name?.trim()) err('name', 'Как к вам обращаться?');
    if ((data.phone || '').replace(/\D/g, '').length !== 11) err('phone', 'Введите номер полностью');
    if (f.pay === 'card') {
      if ((data.cardNum || '').replace(/\D/g, '').length !== 16) err('cardNum');
      if (!/^(0[1-9]|1[0-2])\/\d\d$/.test(data.cardExp || '')) err('cardExp');
      if ((data.cardCvc || '').length !== 3) err('cardCvc');
    }
    if (!ok) { form.querySelector('.error input, .error textarea, [style*="border-color"]')?.focus(); toast('Проверьте поля'); return; }

    state.address = { street: data.street, house: data.house, apt: data.apt, entrance: data.entrance, floor: data.floor, code: data.code, zone: data.zone, name: data.name, phone: data.phone };
    LS.set('address', state.address);

    const btn = $('#payBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>Обрабатываем…</span>';
    setTimeout(() => placeOrder({ ...f, ...data, pickup }), f.pay === 'card' || f.pay === 'sbp' ? 1400 : 600);
  };
}

function maskPhone(v) {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  let out = '+7';
  if (p[0]) out += ' (' + p[0];
  if (p[0].length === 3) out += ')';
  if (p[1]) out += ' ' + p[1];
  if (p[2]) out += '-' + p[2];
  if (p[3]) out += '-' + p[3];
  return out;
}

function placeOrder(f) {
  const t = totals();
  const order = {
    id: String(Date.now()).slice(-6),
    createdAt: Date.now(),
    point: state.point,
    mode: state.mode,
    items: t.okLines.map(l => ({ id: l.p.id, qty: l.qty, price: l.p.price })),
    total: t.total + (f.pickup ? 0 : f.tip),
    pay: f.pay,
    slot: f.slot,
    address: f.pickup ? point().address : `${f.street}, ${f.house}${f.apt ? ', кв. ' + f.apt : ''}`,
    promo: state.promo
  };
  state.orders.unshift(order);
  t.okLines.forEach(l => delete state.cart[l.p.id]);
  state.promo = null;
  save();
  renderAll();
  openTracking(order.id);
}

/* ================= Tracking ================= */
const STEPS_DELIVERY = [['📝', 'Принят'], ['🧺', 'Собираем'], ['🛵', 'В пути'], ['✅', 'Доставлен']];
const STEPS_PICKUP = [['📝', 'Принят'], ['🧺', 'Собираем'], ['🏪', 'Готов'], ['✅', 'Выдан']];
function orderStage(o) {
  if (o.slot !== 'asap' && o.slot) {
    const start = new Date(o.slot).getTime();
    if (Date.now() < start - 30 * 60e3) return 0;
    const el = (Date.now() - (start - 30 * 60e3)) / 1000;
    return el < 20 ? 1 : el < 60 ? 2 : 3;
  }
  const el = (Date.now() - o.createdAt) / 1000;
  return el < 8 ? 0 : el < 25 ? 1 : el < 60 ? 2 : 3;
}
let trackTimer = null;
function openTracking(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  const pt = POINTS.find(p => p.id === o.point);
  const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
  const draw = () => {
    const st = orderStage(o);
    const scheduled = o.slot && o.slot !== 'asap' && st === 0;
    $('#modal').classList.remove('modal--wide');
    $('#modal').innerHTML = `
      <button class="close-x" data-close>✕</button>
      <div class="success">
        <div class="success__icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5L20 7"/></svg></div>
        <h2>Заказ №${o.id}</h2>
        <p>${scheduled ? `Доставим ${new Date(o.slot).toLocaleString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : `${steps[st][1]} · ${o.mode === 'pickup' ? pt.address : o.address}`}</p>
        <div class="track">${steps.map((s, i) => `<div class="track__step ${i < st ? 'done' : i === st ? 'cur' : ''}"><span class="track__dot">${s[0]}</span>${s[1]}</div>`).join('')}</div>
        ${o.mode !== 'pickup' && st >= 2 ? `<div class="courier"><span class="courier__ava">🧑</span><div style="flex:1"><div class="courier__name">Курьер Ислам</div><div class="courier__meta">${st === 3 ? 'Заказ доставлен' : 'Будет через ~' + Math.max(3, 15 - Math.round((Date.now() - o.createdAt) / 6000)) + ' мин'}</div></div><a class="btn btn--ghost btn--sm" href="tel:${pt.phone.replace(/\D/g, '')}">📞</a></div>` : ''}
        <div class="totals" style="margin-top:18px;text-align:left">
          <div class="totals__row"><span>Склад</span><b>${pt.city}, ${pt.address}</b></div>
          <div class="totals__row"><span>Оплата</span><b>${payLabel(o.pay)}</b></div>
          <div class="totals__row totals__row--total"><span>Сумма</span><b>${rub(o.total)}</b></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn--ghost btn--block" data-action="open-orders">Мои заказы</button>
          <button class="btn btn--primary btn--block" data-close>Продолжить покупки</button>
        </div>
      </div>`;
    if (st >= 3) clearInterval(trackTimer);
  };
  clearInterval(trackTimer);
  draw();
  openModal(null, () => clearInterval(trackTimer));
  trackTimer = setInterval(() => { if ($('#modal').classList.contains('show')) draw(); else clearInterval(trackTimer); }, 2000);
}
const payLabel = p => ({ card: 'Картой онлайн', sbp: 'СБП', 'courier-card': 'Картой при получении', cash: 'Наличными' })[p] || p;

/* ================= Orders drawer ================= */
function openOrders() {
  closeModal();
  const d = $('#drawer');
  d.dataset.view = 'orders';
  d.innerHTML = `<button class="close-x" data-close>✕</button>
    <h2 class="drawer__title">Мои заказы</h2>
    <div class="drawer__body">
      ${!state.orders.length ? `<div class="empty"><div class="empty__icon">📦</div><div class="empty__title">Заказов пока нет</div></div>` :
      state.orders.map(o => {
        const st = orderStage(o);
        const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
        const pt = POINTS.find(p => p.id === o.point);
        return `<div class="order">
          <div class="order__head">
            <div><div class="order__num">№${o.id} · ${pt.city}</div><div class="order__date">${new Date(o.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div></div>
            <span class="order__status ${st === 3 ? 'done' : ''}">${steps[st][1]}</span>
          </div>
          <div class="order__emojis">${o.items.slice(0, 10).map(i => byId[i.id]?.emoji || '').join('')}${o.items.length > 10 ? `<span style="font-size:13px;color:var(--text-3);align-self:center">+${o.items.length - 10}</span>` : ''}</div>
          <div class="order__foot">
            <span class="order__sum">${rub(o.total)}</span>
            <span class="order__btns">
              <button class="btn btn--ghost btn--sm" data-track="${o.id}">Статус</button>
              <button class="btn btn--primary btn--sm" data-repeat="${o.id}">Повторить</button>
            </span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  openDrawer();
  $('#ordersBadge').hidden = true;
}

function repeatOrder(id) {
  const o = state.orders.find(x => x.id === id);
  let added = 0, missing = 0;
  o.items.forEach(i => {
    const p = byId[i.id];
    const s = stockOf(p);
    const q = Math.min(s, (state.cart[i.id] || 0) + i.qty);
    if (q > (state.cart[i.id] || 0)) { state.cart[i.id] = q; added++; }
    if (s < i.qty) missing++;
  });
  save(); renderAll();
  openCart();
  toast(missing ? `Добавлено ${added}, ${missing} нет в наличии` : 'Товары добавлены в корзину');
}

/* ================= Overlay helpers ================= */
let onModalClose = null;
function openModal(_, onClose) {
  onModalClose = onClose || null;
  $('#modal').classList.add('show');
  $('#overlay').classList.add('show');
  document.body.classList.add('locked');
}
function closeModal() {
  if (!$('#modal').classList.contains('show')) return;
  $('#modal').classList.remove('show');
  if (onModalClose) { onModalClose(); onModalClose = null; }
  if (!$('#drawer').classList.contains('show')) { $('#overlay').classList.remove('show'); document.body.classList.remove('locked'); }
}
function openDrawer() {
  $('#drawer').classList.add('show');
  $('#overlay').classList.add('show');
  document.body.classList.add('locked');
}
function closeDrawer() {
  $('#drawer').classList.remove('show');
  $('#drawer').dataset.view = '';
  if (!$('#modal').classList.contains('show')) { $('#overlay').classList.remove('show'); document.body.classList.remove('locked'); }
}
function closeAll() { closeModal(); closeDrawer(); }
function openCart() {
  closeModal();
  const d = $('#drawer');
  d.dataset.view = 'cart';
  renderCartAll();
  openDrawer();
}

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${msg}</span>${action ? `<button>${action.label}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  $('#toasts').appendChild(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 260); }, action ? 4000 : 2200);
}

function flyToCart(emoji, src) {
  const target = [$('#mobileCart'), $('.cart-btn'), $('#sideCart')].find(el => el && el.offsetParent && !el.hidden) || $('.cart-btn');
  if (!target || !target.offsetParent) return;
  const a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly'; el.textContent = emoji;
  el.style.left = a.left + a.width / 2 - 18 + 'px'; el.style.top = a.top - 10 + 'px';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + 10 - a.top}px) scale(.4)`;
    el.style.opacity = '.3';
  });
  setTimeout(() => { el.remove(); const cb = $('.cart-btn'); cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); }, 600);
}

/* ================= Events ================= */
function setCat(cat) {
  state.cat = cat;
  state.query = ''; $('#searchInput').value = '';
  renderCats(); renderCatalog();
  const top = $('.toolbar').offsetTop - $('.header').offsetHeight - 10;
  if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  $('.cat-pill.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}

document.addEventListener('click', e => {
  const t = e.target;
  const el = s => t.closest(s);
  let x;

  if ((x = el('[data-add]'))) return setQty(x.dataset.add, 1, x);
  if ((x = el('[data-inc]'))) return setQty(x.dataset.inc, (state.cart[x.dataset.inc] || 0) + 1, x);
  if ((x = el('[data-dec]'))) {
    const id = x.dataset.dec, q = (state.cart[id] || 0) - 1;
    setQty(id, q);
    if (q === 0) toast(`${byId[id].name} удалён`, { label: 'Вернуть', fn: () => setQty(id, 1) });
    return;
  }
  if ((x = el('[data-remove]'))) { delete state.cart[x.dataset.remove]; save(); renderCartAll(); refreshQty(x.dataset.remove); return; }
  if ((x = el('[data-fav]'))) {
    const id = x.dataset.fav;
    state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
    save();
    $$(`[data-fav="${id}"]`).forEach(b => b.classList.toggle('on', state.favs.has(id)));
    renderCats();
    if (state.cat === 'fav') renderCatalog();
    return;
  }
  if ((x = el('[data-open]'))) return openProduct(x.dataset.open);
  if ((x = el('[data-cat]'))) { closeAll(); return setCat(x.dataset.cat); }
  if ((x = el('[data-chip]'))) { state.filters = new Set([x.dataset.chip]); syncChips(); state.cat = 'all'; renderCats(); return renderCatalog(); }
  if ((x = el('[data-filter]'))) {
    const f = x.dataset.filter;
    state.filters.has(f) ? state.filters.delete(f) : state.filters.add(f);
    syncChips(); return renderCatalog();
  }
  if ((x = el('[data-banner]'))) {
    const b = BANNERS[x.dataset.banner];
    if (b.cat) return setCat(b.cat);
    if (b.promo) { navigator.clipboard?.writeText(b.promo).catch(() => {}); state.promo = b.promo; save(); renderCartAll(); return toast(`Промокод ${b.promo} применён`); }
  }
  if ((x = el('[data-track]'))) { closeDrawer(); return openTracking(x.dataset.track); }
  if ((x = el('[data-repeat]'))) return repeatOrder(x.dataset.repeat);
  if (el('[data-close]')) return closeAll();

  if ((x = el('[data-action]'))) {
    const a = x.dataset.action;
    if (a === 'home') { e.preventDefault(); state.filters.clear(); syncChips(); setCat('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (a === 'open-points') openPoints();
    if (a === 'open-cart') { window.innerWidth > 1280 && !$('#drawer').classList.contains('show') ? $('#sideCart').scrollIntoView({ behavior: 'smooth' }) : null; openCart(); }
    if (a === 'open-favs') setCat('fav');
    if (a === 'open-orders') openOrders();
    if (a === 'toggle-theme') { state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; LS.set('theme', state.theme); applyTheme(); }
    if (a === 'clear-cart') {
      const backup = { ...state.cart };
      state.cart = {}; save(); renderAll();
      toast('Корзина очищена', { label: 'Вернуть', fn: () => { state.cart = backup; save(); renderAll(); } });
    }
    if (a === 'remove-bad') { cartLines().filter(l => !l.ok).forEach(l => l.avail ? state.cart[l.p.id] = l.avail : delete state.cart[l.p.id]); save(); renderAll(); }
    if (a === 'remove-promo') { state.promo = null; save(); renderCartAll(); }
    if (a === 'checkout') { closeDrawer(); openCheckout(); }
    if (a === 'reset') { state.filters.clear(); state.query = ''; $('#searchInput').value = ''; state.cat = 'all'; syncChips(); renderCats(); renderCatalog(); }
  }
});

document.addEventListener('submit', e => {
  if (e.target.matches('[data-promo-form]')) { e.preventDefault(); applyPromo(e.target.code.value); }
});

$('#overlay').addEventListener('click', closeAll);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAll();
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#searchInput').focus(); }
});

let searchT;
$('#searchInput').addEventListener('input', e => {
  clearTimeout(searchT);
  searchT = setTimeout(() => { state.query = e.target.value; if (state.query) state.cat = 'all'; renderCats(); renderCatalog(); }, 150);
});
$('#sortSelect').addEventListener('change', e => { state.sort = e.target.value; renderCatalog(); });

function syncChips() { $$('[data-filter]').forEach(c => c.classList.toggle('active', state.filters.has(c.dataset.filter))); }

function renderAll() {
  renderPoint(); renderCats(); renderCatalog(); renderCartAll();
  const active = state.orders.some(o => orderStage(o) < 3);
  $('#ordersBadge').hidden = !active;
}

renderBanners();
renderAll();
if (!state.point) setTimeout(openPoints, 300);
})();
