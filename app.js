(() => {
'use strict';
const BUILD = '1793790465';
if (window.APP_BUILD !== BUILD || !document.getElementById('page')) {
  const u = new URL(location.href);
  if (u.searchParams.get('b') !== BUILD) { u.searchParams.set('b', BUILD); location.replace(u.toString()); }
  return;
}

/* ================= Helpers / state ================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('s95_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('s95_' + k, JSON.stringify(v)); } catch {} }
};
const state = {
  point: LS.get('point', null),
  mode: LS.get('mode', 'delivery'),
  cart: LS.get('cart', {}),
  favs: LS.get('favs', []),              // ordered list, newest first
  orders: LS.get('orders', []),
  promo: LS.get('promo', null),
  address: LS.get('address', {}),
  theme: LS.get('theme', null),
  route: 'catalog',
  cat: 'all',
  query: '',
  filters: new Set(),
  sort: 'pop',
  favSort: 'added'
};

const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const ic = (name, cls = 'ic') => `<img class="${cls}" src="assets/icons/${name}.webp" alt="" loading="lazy" decoding="async">`;
const isFav = id => state.favs.includes(id);
const save = () => {
  LS.set('cart', state.cart); LS.set('favs', state.favs); LS.set('orders', state.orders);
  LS.set('promo', state.promo); LS.set('point', state.point); LS.set('mode', state.mode);
};
const point = () => POINTS.find(p => p.id === state.point);
const stockOf = (p, pid = state.point) => pid ? p.stock[pid] : 99;
const isOpen = pt => { const h = new Date().getHours(); return h >= pt.hours[0] && h < pt.hours[1]; };
const hours = pt => `${String(pt.hours[0]).padStart(2, '0')}:00–${pt.hours[1]}:00`;
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const heart = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z"/></svg>';
const isDesktopCart = () => matchMedia('(min-width: 1361px)').matches;

function applyTheme() {
  const t = state.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
}
applyTheme();

/* ================= Cart math ================= */
function cartLines() {
  return Object.entries(state.cart).filter(([id]) => byId[id]).map(([id, qty]) => {
    const p = byId[id], avail = stockOf(p);
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
    if (subtotal < pr.min) promoErr = `от ${rub(pr.min)}`;
    else if (pr.type === 'percent') discount = Math.round(subtotal * pr.value / 100);
    else if (pr.type === 'fixed') discount = Math.min(pr.value, subtotal);
    else if (pr.type === 'delivery') freeDelivery = true;
  }
  const isPickup = state.mode === 'pickup';
  const delivery = isPickup || freeDelivery || subtotal >= pt.freeFrom || subtotal === 0 ? 0 : pt.deliveryFee;
  const service = subtotal > 0 ? 19 : 0;
  const total = Math.max(0, subtotal - discount) + delivery + service;
  return { lines, okLines, count, subtotal, saved, discount, delivery, service, total, pt, minOk: subtotal >= pt.minOrder, promoErr, isPickup, toFree: Math.max(0, pt.freeFrom - subtotal) };
}

function setQty(id, qty) {
  const p = byId[id];
  const max = stockOf(p);
  const prev = state.cart[id] || 0;
  qty = Math.max(0, Math.min(qty, max));
  if (qty === prev && qty >= max && qty > 0) { toast('Больше нет на складе'); return; }
  if (qty === 0) delete state.cart[id]; else state.cart[id] = qty;
  save();
  refreshQty(id);
  renderCart();
  if (qty > prev && prev === 0 && !state.point) openPoints();
}

/* ================= Product card ================= */
function actionHTML(p, size = '') {
  const q = state.cart[p.id] || 0;
  const s = stockOf(p);
  if (s === 0) return `<button class="add-btn" disabled>Нет в наличии</button>`;
  if (!q) return `<button class="add-btn ${size.includes('primary') ? 'add-btn--primary' : ''}" data-add="${p.id}">+ В корзину</button>`;
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
  else if (p.tags.includes('local')) t.push('<span class="tag tag--local">Местное</span>');
  return t.slice(0, 2).join('');
}
function cardHTML(p) {
  const s = stockOf(p);
  return `<article class="card ${s === 0 ? 'out' : ''}">
    <div class="card__img" style="background:${catById[p.cat].color}" data-open="${p.id}">
      ${ic(p.icon)}
      <div class="card__tags">${s === 0 ? '<span class="tag tag--out">Нет в наличии</span>' : tagsHTML(p)}</div>
    </div>
    <button class="fav-btn ${isFav(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${heart}</button>
    <div class="card__price">
      <span class="price ${p.oldPrice ? 'price--sale' : ''}">${rub(p.price)}</span>
      ${p.oldPrice ? `<span class="price-old">${rub(p.oldPrice)}</span>` : ''}
    </div>
    <div class="card__name" data-open="${p.id}">${p.name}</div>
    <div class="card__unit"><span>${p.unit}</span>${state.point && s > 0 && s <= 5 ? `<span class="card__low">осталось ${s}</span>` : ''}</div>
    <div class="card__action" data-action-for="${p.id}">${actionHTML(p)}</div>
  </article>`;
}
function refreshQty(id) {
  $$(`[data-action-for="${id}"]`).forEach(el => { el.innerHTML = actionHTML(byId[id], el.dataset.size || ''); });
}
function syncFav(id) {
  $$(`[data-fav="${id}"]`).forEach(b => b.classList.toggle('on', isFav(id)));
  $$('[data-fav-count]').forEach(b => { b.hidden = !state.favs.length; b.textContent = state.favs.length; });
  const c = $('[data-cat="fav"] .cat-link__count'); if (c) c.textContent = state.favs.length || '';
}

/* ================= Router ================= */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  state.route = h.startsWith('favorites') ? 'favorites' : h.startsWith('orders') ? 'orders' : 'catalog';
}
window.addEventListener('hashchange', () => { parseRoute(); closeAll(); renderPage(); window.scrollTo(0, 0); });

function renderPage() {
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === state.route));
  renderCats();
  if (state.route === 'favorites') return renderFavorites();
  if (state.route === 'orders') return renderOrders();
  renderCatalogPage();
}

/* ================= Catalog page ================= */
function filtered() {
  const q = state.query.trim().toLowerCase();
  const list = PRODUCTS.filter(p => {
    if (state.cat !== 'all' && p.cat !== state.cat) return false;
    if (q && !(p.name.toLowerCase().includes(q) || catById[p.cat].name.toLowerCase().includes(q))) return false;
    if (state.filters.has('sale') && !p.oldPrice) return false;
    if (state.filters.has('halal') && !p.tags.includes('halal')) return false;
    if (state.filters.has('local') && !p.tags.includes('local')) return false;
    if (state.filters.has('instock') && stockOf(p) === 0) return false;
    return true;
  });
  return sortList(list, state.sort);
}
function sortList(list, sort) {
  const disc = p => p.oldPrice ? 1 - p.price / p.oldPrice : 0;
  const sorters = {
    pop: (a, b) => b.popularity - a.popularity,
    asc: (a, b) => a.price - b.price,
    desc: (a, b) => b.price - a.price,
    sale: (a, b) => disc(b) - disc(a),
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    added: () => 0
  };
  return [...list].sort(sorters[sort]).sort((a, b) => (stockOf(a) === 0) - (stockOf(b) === 0));
}
const sortSelect = (id, val, extra = '') => `<select class="select" id="${id}">
  ${extra}
  ${[['pop', 'Популярные'], ['asc', 'Сначала дешевле'], ['desc', 'Сначала дороже'], ['sale', 'По скидке'], ['name', 'По названию']].map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}
</select>`;

function renderCatalogPage() {
  const page = $('#page');
  const title = state.query ? `Поиск «${state.query}»` : state.cat === 'all' ? 'Все товары' : catById[state.cat].name;
  const showBanners = state.cat === 'all' && !state.query;
  page.innerHTML = `
    ${showBanners ? `<section class="banners">${BANNERS.map((b, i) => `
      <button class="banner" style="background:${b.bg}" data-banner="${i}">
        <span class="banner__title">${b.title}</span>
        <span class="banner__sub">${b.sub}</span>
        ${ic(b.icon, 'banner__icon')}
      </button>`).join('')}</section>` : ''}
    <div class="cat-strip" id="catStrip"></div>
    <div class="toolbar">
      <h1 class="toolbar__title">${title}</h1>
      <div class="toolbar__controls">${sortSelect('sortSelect', state.sort)}</div>
    </div>
    <div class="filters">
      ${[['sale', '% Скидки'], ['halal', 'Халяль'], ['local', 'Местное'], ['instock', 'В наличии']].map(([f, l]) => `<button class="chip ${state.filters.has(f) ? 'active' : ''}" data-filter="${f}">${l}</button>`).join('')}
    </div>
    <div id="catalog"></div>`;
  renderCatStrip();
  renderCatalog();
}

function renderCatalog() {
  const root = $('#catalog');
  if (!root) return;
  const list = filtered();
  if (!list.length) {
    root.innerHTML = `<div class="empty">${ic('search', 'empty__icon')}<div class="empty__title">Ничего не найдено</div><button class="btn btn--ghost btn--sm" data-action="reset">Сбросить фильтры</button></div>`;
    return;
  }
  const grouped = state.cat === 'all' && !state.query && state.sort === 'pop' && !state.filters.size;
  if (!grouped) { root.innerHTML = `<div class="grid">${list.map(cardHTML).join('')}</div>`; return; }

  const deals = PRODUCTS.filter(p => p.oldPrice && stockOf(p) > 0).sort((a, b) => (b.oldPrice - b.price) / b.oldPrice - (a.oldPrice - a.price) / a.oldPrice).slice(0, 4);
  let html = `<section class="section"><div class="section__head"><h2 class="section__title">${ic('fire', '')}Скидки дня</h2><button class="section__more" data-chip="sale">Все скидки</button></div><div class="grid">${deals.map(cardHTML).join('')}</div></section>`;
  CATEGORIES.forEach(c => {
    const items = list.filter(p => p.cat === c.id);
    html += `<section class="section"><div class="section__head"><h2 class="section__title">${ic(c.icon, '')}${c.name}</h2><button class="section__more" data-cat="${c.id}">Все ${items.length}</button></div><div class="grid">${items.slice(0, 8).map(cardHTML).join('')}</div></section>`;
  });
  root.innerHTML = html;
}

function catItems() {
  return [{ id: 'all', name: 'Все товары', icon: 'cart' }, ...CATEGORIES];
}
function renderCats() {
  const counts = {};
  PRODUCTS.forEach(p => counts[p.cat] = (counts[p.cat] || 0) + 1);
  const active = id => state.route === 'catalog' && state.cat === id;
  $('#catNav').innerHTML = catItems().map(c => `
    <button class="cat-link ${active(c.id) ? 'active' : ''}" data-cat="${c.id}">
      ${ic(c.icon, 'cat-link__icon')}<span class="cat-link__name">${c.name}</span>
      <span class="cat-link__count">${c.id === 'all' ? PRODUCTS.length : counts[c.id]}</span>
    </button>`).join('') + `
    <div class="cats__sep"></div>
    <a class="cat-link ${state.route === 'favorites' ? 'active' : ''}" href="#/favorites" data-cat-fav>${ic('heart', 'cat-link__icon')}<span class="cat-link__name">Избранное</span><span class="cat-link__count" data-fav-side>${state.favs.length || ''}</span></a>
    <a class="cat-link ${state.route === 'orders' ? 'active' : ''}" href="#/orders">${ic('package', 'cat-link__icon')}<span class="cat-link__name">Мои заказы</span><span class="cat-link__count">${state.orders.length || ''}</span></a>`;
  $$('[data-fav-count]').forEach(b => { b.hidden = !state.favs.length; b.textContent = state.favs.length; });
}
function renderCatStrip() {
  const s = $('#catStrip');
  if (s) s.innerHTML = catItems().map(c => `<button class="cat-pill ${state.cat === c.id ? 'active' : ''}" data-cat="${c.id}">${ic(c.icon, '')}${c.name}</button>`).join('');
}

/* ================= Favorites page ================= */
function renderFavorites() {
  const page = $('#page');
  const items = state.favs.map(id => byId[id]).filter(Boolean);
  if (!items.length) {
    page.innerHTML = `
      <div class="toolbar"><h1 class="toolbar__title">Избранное</h1></div>
      <div class="empty">${ic('whiteheart', 'empty__icon')}<div class="empty__title">В избранном пусто</div>Нажмите ♡ на карточке товара<br><a class="btn btn--primary btn--sm" href="#/">В каталог</a></div>`;
    return;
  }
  const list = sortList(items, state.favSort);
  const avail = items.filter(p => stockOf(p) > 0);
  const sum = avail.reduce((s, p) => s + p.price, 0);
  page.innerHTML = `
    <div class="toolbar">
      <h1 class="toolbar__title">Избранное <small>${items.length}</small></h1>
      <div class="toolbar__controls">${sortSelect('favSort', state.favSort, `<option value="added" ${state.favSort === 'added' ? 'selected' : ''}>Недавно добавленные</option>`)}</div>
    </div>
    <div class="fav-summary">
      <span>В наличии${state.point ? ` на складе <b>${point().city}</b>` : ''}: <b>${avail.length} из ${items.length}</b> · по 1 шт. на <b>${rub(sum)}</b></span>
      <div class="page-actions">
        <button class="btn btn--ghost btn--sm" data-action="clear-favs">Очистить</button>
        <button class="btn btn--primary btn--sm" data-action="favs-to-cart" ${avail.length ? '' : 'disabled'}>Всё в корзину</button>
      </div>
    </div>
    <div class="grid">${list.map(cardHTML).join('')}</div>`;
}

/* ================= Orders page ================= */
const STEPS_DELIVERY = [['memo', 'Принят'], ['basket', 'Собираем'], ['scooter', 'В пути'], ['check', 'Доставлен']];
const STEPS_PICKUP = [['memo', 'Принят'], ['basket', 'Собираем'], ['store', 'Готов'], ['check', 'Выдан']];
const payLabel = p => ({ card: 'Картой онлайн', sbp: 'СБП', 'courier-card': 'Картой при получении', cash: 'Наличными' })[p] || p;

function orderStage(o) {
  if (o.slot && o.slot !== 'asap') {
    const start = new Date(o.slot).getTime() - 30 * 60e3;
    if (Date.now() < start) return 0;
    const el = (Date.now() - start) / 1000;
    return el < 20 ? 1 : el < 60 ? 2 : 3;
  }
  const el = (Date.now() - o.createdAt) / 1000;
  return el < 8 ? 0 : el < 25 ? 1 : el < 60 ? 2 : 3;
}

function renderOrders() {
  const page = $('#page');
  if (!state.orders.length) {
    page.innerHTML = `<div class="toolbar"><h1 class="toolbar__title">Мои заказы</h1></div>
      <div class="empty">${ic('package', 'empty__icon')}<div class="empty__title">Заказов пока нет</div><a class="btn btn--primary btn--sm" href="#/">В каталог</a></div>`;
    return;
  }
  page.innerHTML = `<div class="toolbar"><h1 class="toolbar__title">Мои заказы <small>${state.orders.length}</small></h1></div>
    <div class="orders">${state.orders.map(o => {
      const st = orderStage(o);
      const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
      const pt = POINTS.find(p => p.id === o.point);
      return `<div class="order">
        <div class="order__head">
          <div><div class="order__num">№${o.id} · ${pt.city}</div><div class="order__date">${new Date(o.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${o.mode === 'pickup' ? 'самовывоз' : o.address}</div></div>
          <span class="order__status ${st === 3 ? 'done' : ''}">${steps[st][1]}</span>
        </div>
        <div class="order__icons">${o.items.slice(0, 7).map(i => byId[i.id] ? `<span style="background:${catById[byId[i.id].cat].color}">${ic(byId[i.id].icon)}</span>` : '').join('')}${o.items.length > 7 ? `<em>+${o.items.length - 7}</em>` : ''}</div>
        <div class="order__foot">
          <span class="order__sum">${rub(o.total)}</span>
          <span class="order__btns">
            <button class="btn btn--ghost btn--sm" data-track="${o.id}">Статус</button>
            <button class="btn btn--primary btn--sm" data-repeat="${o.id}">Повторить</button>
          </span>
        </div>
      </div>`;
    }).join('')}</div>`;
}

/* ================= Point ================= */
function renderPoint() {
  const pt = point();
  $('#pointCity').textContent = pt ? `${pt.city}${state.mode === 'pickup' ? ' · самовывоз' : ''}` : 'Выберите точку';
  $('#pointMeta').textContent = pt
    ? (state.mode === 'pickup' ? pt.address : (state.address.street ? `${state.address.street}, ${state.address.house || ''}` : `Доставка ${pt.eta}`))
    : 'Грозный · Урус-Мартан · Шали';
  if (!pt) { $('#pointCard').innerHTML = `<button class="btn btn--primary btn--sm btn--block" data-action="open-points">Выбрать склад</button>`; return; }
  $('#pointCard').innerHTML = `
    <div class="point-card__title"><span class="status-dot ${isOpen(pt) ? '' : 'closed'}"></span>Склад ${pt.city}</div>
    <div class="point-card__row"><span>Адрес</span><b>${pt.address}</b></div>
    <div class="point-card__row"><span>Часы</span><b>${hours(pt)}</b></div>
    <div class="point-card__row"><span>Доставка</span><b>${pt.eta}</b></div>
    <div class="point-card__row"><span>Бесплатно от</span><b>${rub(pt.freeFrom)}</b></div>`;
}

function mapSVG(sel) {
  const roads = `<path d="M40 70 C120 90 200 100 262 118 S380 120 470 100"/><path d="M148 196 C190 160 230 140 262 118"/><path d="M262 118 C290 150 310 180 330 206"/><path d="M148 196 C220 215 280 215 330 206"/><path d="M60 230 C100 215 120 205 148 196"/><path d="M330 206 C380 220 430 240 470 250"/>`;
  const pins = POINTS.map(p => {
    const on = p.id === sel;
    return `<g class="map-pin" data-pick="${p.id}" transform="translate(${p.x},${p.y})">
      ${on ? '<circle r="20" fill="#14a05c" opacity=".18"/>' : ''}
      <circle r="${on ? 10 : 8}" fill="${on ? '#14a05c' : '#fff'}" stroke="${on ? '#fff' : '#14a05c'}" stroke-width="3"/>
      <text y="-18" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${p.city}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="20 30 470 250" preserveAspectRatio="xMidYMid meet" style="color:var(--text)">
    <path d="M30 40 C140 60 220 70 300 60 S420 40 500 55" fill="none" stroke="#5aa9e6" stroke-width="5" stroke-linecap="round" opacity=".55"/>
    <text x="440" y="44" font-size="11" fill="#5aa9e6">Терек</text>
    <path d="M300 320 C305 250 290 170 262 118" fill="none" stroke="#5aa9e6" stroke-width="3" opacity=".5"/>
    <text x="300" y="268" font-size="11" fill="#5aa9e6">Аргун</text>
    <g fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="3" stroke-linecap="round">${roads}</g>
    ${pins}
  </svg>`;
}

function openPoints() {
  let sel = state.point || 'grz';
  let mode = state.mode;
  const draw = () => {
    $('#modal').className = 'modal show';
    $('#modal').innerHTML = `
      <button class="close-x" data-close>✕</button>
      <div class="pts">
        <div class="pts__map">${mapSVG(sel)}</div>
        <div class="pts__list">
          <h2 class="pts__title">Выберите склад</h2>
          <div class="mode-switch">
            <button class="${mode === 'delivery' ? 'active' : ''}" data-mode="delivery">${ic('scooter', '')}Доставка</button>
            <button class="${mode === 'pickup' ? 'active' : ''}" data-mode="pickup">${ic('store', '')}Самовывоз</button>
          </div>
          ${POINTS.map(p => {
            const open = isOpen(p);
            const n = PRODUCTS.filter(x => x.stock[p.id] > 0).length;
            return `<button class="pt ${p.id === sel ? 'active' : ''}" data-pick="${p.id}">
              <span class="pt__city">${p.city}</span>
              <span class="pt__addr">${p.address}</span>
              <span class="pt__eta">${mode === 'pickup' ? '~10 мин' : p.eta}<small class="${open ? '' : 'closed'}">${open ? 'Открыто' : 'Закрыто'}</small></span>
              <span class="pt__info">${hours(p)} · ${n} товаров${mode === 'delivery' ? ` · доставка ${rub(p.deliveryFee)}, от ${rub(p.freeFrom)} бесплатно` : ''}</span>
            </button>`;
          }).join('')}
          <button class="btn btn--primary btn--block" data-confirm-point>Готово</button>
        </div>
      </div>`;
  };
  draw();
  showOverlay();
  $('#modal').onclick = e => {
    const pick = e.target.closest('[data-pick]'), m = e.target.closest('[data-mode]');
    if (pick) { sel = pick.dataset.pick; draw(); }
    else if (m) { mode = m.dataset.mode; draw(); }
    else if (e.target.closest('[data-confirm-point]')) {
      const changed = state.point && state.point !== sel;
      state.point = sel; state.mode = mode; save();
      closeAll(); renderAll();
      const bad = cartLines().filter(l => !l.ok).length;
      toast(changed && bad ? `${bad} ${plural(bad, 'товар недоступен', 'товара недоступны', 'товаров недоступны')} на этом складе` : `Склад: ${point().city}`);
    }
  };
}

/* ================= Cart ================= */
function cartHTML(inDrawer) {
  const t = totals();
  const head = (extra = '') => `<div class="cart__head" ${inDrawer ? 'style="padding-right:62px"' : ''}><h2 class="cart__title">Корзина</h2>${extra}</div>`;
  if (!t.lines.length) {
    return `<div class="cart">${head()}<div class="cart__body"><div class="cart__empty">${ic('basket', '')}<b>Корзина пуста</b></div></div></div>`;
  }
  const bad = t.lines.filter(l => !l.ok);
  return `<div class="cart">
    ${head(`<button class="cart__clear" data-action="clear-cart">Очистить</button>`)}
    <div class="cart__body">
      ${!t.isPickup ? `<div class="delivery-bar">
        <div class="delivery-bar__row"><span>${t.toFree > 0 ? `До бесплатной доставки ${rub(t.toFree)}` : 'Бесплатная доставка'}</span><span>${t.pt.eta}</span></div>
        <div class="progress"><i style="width:${Math.min(100, t.subtotal / t.pt.freeFrom * 100)}%"></i></div>
      </div>` : `<div class="delivery-bar"><div class="delivery-bar__row"><span>Самовывоз · ${t.pt.address}</span><span>~10 мин</span></div></div>`}
      ${bad.length ? `<div class="danger-box"><span>${bad.length} ${plural(bad.length, 'товара', 'товаров', 'товаров')} нет на складе ${t.pt.city}</span><button data-action="remove-bad">Убрать</button></div>` : ''}
      ${t.lines.map(l => `
        <div class="cart-item ${l.ok ? '' : 'unavailable'}">
          <div class="cart-item__img" style="background:${catById[l.p.cat].color}" data-open="${l.p.id}">${ic(l.p.icon)}</div>
          <div>
            <div class="cart-item__name">${l.p.name}</div>
            <div class="cart-item__meta">${l.p.unit}</div>
            ${l.ok ? `<div class="cart-item__price">${rub(l.sum)}${l.p.oldPrice ? `<span class="price-old">${rub(l.oldSum)}</span>` : ''}</div>`
              : `<div class="cart-item__warn">${l.avail ? `Осталось ${l.avail} шт` : 'Нет в наличии'}</div>`}
          </div>
          <div data-action-for="${l.p.id}" data-size="stepper--sm stepper--soft">${l.avail ? actionHTML(l.p, 'stepper--sm stepper--soft') : `<button class="cart__clear" data-remove="${l.p.id}">Удалить</button>`}</div>
        </div>`).join('')}
    </div>
    <div class="cart__foot">
      ${state.promo ? `<div class="promo-applied"><span>${state.promo} · ${t.promoErr ? 'действует ' + t.promoErr : PROMOS[state.promo].label}</span><button data-action="remove-promo" aria-label="Убрать">×</button></div>`
        : `<form class="promo" data-promo-form><input name="code" placeholder="Промокод" autocomplete="off"><button class="btn btn--ghost btn--sm" style="height:42px">Применить</button></form>`}
      <div class="totals">
        <div class="totals__row"><span>Товары, ${t.count} шт</span><b>${rub(t.subtotal + t.saved)}</b></div>
        ${t.saved ? `<div class="totals__row totals__row--discount"><span>Скидка</span><b>−${rub(t.saved)}</b></div>` : ''}
        ${t.discount ? `<div class="totals__row totals__row--discount"><span>Промокод</span><b>−${rub(t.discount)}</b></div>` : ''}
        <div class="totals__row"><span>${t.isPickup ? 'Самовывоз' : 'Доставка'}</span><b>${t.delivery ? rub(t.delivery) : 'Бесплатно'}</b></div>
        <div class="totals__row"><span>Сборка</span><b>${rub(t.service)}</b></div>
        <div class="totals__row totals__row--total"><span>Итого</span><b>${rub(t.total)}</b></div>
      </div>
      ${!t.minOk ? `<div class="warn-box">Минимальный заказ ${rub(t.pt.minOrder)}, не хватает ${rub(t.pt.minOrder - t.subtotal)}</div>` : ''}
      <button class="btn btn--primary btn--block btn--between" data-action="checkout" ${t.minOk && t.okLines.length ? '' : 'disabled'}><span>Оформить</span><span>${rub(t.total)}</span></button>
    </div>
  </div>`;
}

function renderCart() {
  const t = totals();
  const body = $('#sideCart .cart__body'), scroll = body ? body.scrollTop : 0;
  $('#sideCart').innerHTML = cartHTML(false);
  if ($('#sideCart .cart__body')) $('#sideCart .cart__body').scrollTop = scroll;
  if ($('#drawer').dataset.view === 'cart') {
    const db = $('#drawer .cart__body'), ds = db ? db.scrollTop : 0;
    $('#drawer').innerHTML = `<button class="close-x" data-close>✕</button>` + cartHTML(true);
    if ($('#drawer .cart__body')) $('#drawer .cart__body').scrollTop = ds;
  }
  $$('[data-cart-total]').forEach(el => el.textContent = t.count ? rub(t.total) : 'Корзина');
  $$('[data-cart-count]').forEach(el => { el.hidden = !t.count; el.textContent = t.count; });
}

function applyPromo(code) {
  code = code.trim().toUpperCase();
  if (!code) return;
  if (!PROMOS[code]) { toast('Промокод не найден'); return; }
  state.promo = code; save(); renderCart();
  toast(`Промокод ${code} применён`);
}

/* ================= Product modal ================= */
function openProduct(id) {
  const p = byId[id], c = catById[p.cat];
  const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id && stockOf(x) > 0).sort((a, b) => b.popularity - a.popularity).slice(0, 4);
  const m = $('#modal');
  m.className = 'modal';
  m.innerHTML = `
    <button class="close-x" data-close>✕</button>
    <div class="pm">
      <div class="pm__img" style="background:${c.color}">${ic(p.icon)}<div class="card__tags" style="left:16px;top:16px">${tagsHTML(p)}</div></div>
      <div class="pm__body">
        <div><h2 class="pm__name">${p.name}</h2><div class="pm__unit">${p.unit}</div></div>
        <div class="pm__meta">
          <span>★ ${p.rating}</span>
          ${p.kcal ? `<span>${p.kcal} ккал / 100 г</span>` : ''}
          <span>${ic(c.icon, '')}${c.name}</span>
        </div>
        <div class="pm__desc">${p.desc}</div>
        <div class="pm__stock">
          ${POINTS.map(pt => `<div class="pm__stock-row ${pt.id === state.point ? 'current' : ''}"><span>${pt.city}</span><b>${p.stock[pt.id] ? (p.stock[pt.id] > 5 ? 'В наличии' : `${p.stock[pt.id]} шт`) : 'Нет'}</b></div>`).join('')}
        </div>
        <div class="pm__buy">
          <div>
            <div class="price ${p.oldPrice ? 'price--sale' : ''}">${rub(p.price)}</div>
            ${p.oldPrice ? `<div class="price-old">${rub(p.oldPrice)}</div>` : ''}
          </div>
          <div data-action-for="${p.id}" data-size="primary">${actionHTML(p, 'primary')}</div>
          <button class="pm__fav ${isFav(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${heart}</button>
        </div>
      </div>
      ${related.length ? `<div class="pm__related"><h3>Ещё в категории</h3><div class="grid">${related.map(cardHTML).join('')}</div></div>` : ''}
    </div>`;
  m.classList.add('show');
  m.scrollTop = 0;
  showOverlay();
}

/* ================= Checkout ================= */
function timeSlots() {
  const pt = point();
  const slots = [{ id: 'asap', title: 'Как можно скорее', sub: state.mode === 'pickup' ? '~10 мин' : pt.eta }];
  const now = new Date();
  for (let d = 0; d < 2 && slots.length < 15; d++) {
    for (let h = pt.hours[0]; h < pt.hours[1] && slots.length < 15; h++) {
      const start = new Date(now); start.setDate(now.getDate() + d); start.setHours(h, 0, 0, 0);
      if (start - now < 60 * 60 * 1000) continue;
      slots.push({ id: start.toISOString(), title: `${h}:00–${h + 1}:00`, sub: d === 0 ? 'Сегодня' : 'Завтра' });
    }
  }
  return slots;
}

function openCheckout() {
  const t = totals();
  if (!t.minOk || !t.okLines.length) return;
  const f = { slot: 'asap', pay: 'card', tip: 0, ...state.address };
  const pt = t.pt, pickup = t.isPickup;
  const m = $('#modal');
  m.className = 'modal modal--wide show';
  showOverlay();
  m.innerHTML = `
    <button class="close-x" data-close>✕</button>
    <form class="checkout" id="checkoutForm" novalidate>
      <div class="checkout__form">
        <h2 class="checkout__title">Оформление заказа</h2>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">1</span>${pickup ? 'Самовывоз' : 'Адрес доставки'} · ${pt.city}</div>
          ${pickup ? `<div class="pickup-box">${ic('store', '')}<div><b>${pt.address}</b><div style="font-size:13px;color:var(--text-2)">${hours(pt)} · ${pt.phone}</div></div></div>` : `
          <div class="row row--3">
            <div class="field"><input name="street" placeholder=" " value="${f.street || ''}"><label>Улица</label></div>
            <div class="field"><input name="house" placeholder=" " value="${f.house || ''}"><label>Дом</label></div>
            <div class="field"><input name="apt" placeholder=" " value="${f.apt || ''}"><label>Кв./офис</label></div>
          </div>
          <div class="row row--4">
            <div class="field"><input name="entrance" placeholder=" " value="${f.entrance || ''}"><label>Подъезд</label></div>
            <div class="field"><input name="floor" placeholder=" " value="${f.floor || ''}"><label>Этаж</label></div>
            <div class="field"><input name="code" placeholder=" " value="${f.code || ''}"><label>Домофон</label></div>
            <div class="field"><select name="zone">${pt.zones.map(z => `<option ${f.zone === z ? 'selected' : ''}>${z}</option>`).join('')}</select><label>Район</label></div>
          </div>`}
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">2</span>Контакты</div>
          <div class="row row--2">
            <div class="field"><input name="name" placeholder=" " value="${f.name || ''}" autocomplete="given-name"><label>Имя</label></div>
            <div class="field"><input name="phone" type="tel" placeholder=" " value="${f.phone || ''}" autocomplete="tel"><label>Телефон</label></div>
          </div>
          <div class="field"><textarea name="comment" placeholder=" "></textarea><label>Комментарий${pickup ? '' : ' курьеру'}</label></div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">3</span>Время</div>
          <div class="slots">${timeSlots().map(s => `<button type="button" class="slot ${s.id === f.slot ? 'active' : ''}" data-slot="${s.id}">${s.title}<small>${s.sub}</small></button>`).join('')}</div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">4</span>Оплата</div>
          <div class="opts">
            ${[['card', 'card', 'Картой онлайн', 'Visa, MC, МИР'], ['sbp', 'voltage', 'СБП', 'По QR-коду'], ['courier-card', 'pager', pickup ? 'Картой на кассе' : 'Картой курьеру', 'Терминал'], ['cash', 'cash', 'Наличными', 'При получении']]
              .map(([id, icon, ti, su]) => `<button type="button" class="opt ${f.pay === id ? 'active' : ''}" data-pay="${id}">${ic(icon, '')}<span class="opt__title">${ti}</span><span class="opt__sub">${su}</span></button>`).join('')}
          </div>
          <div id="payExtra"></div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">5</span>Дополнительно</div>
          ${pickup ? '' : `<label class="toggle">Оставить у двери<input type="checkbox" name="leave"><i></i></label>
          <label class="toggle">Не звонить в домофон<input type="checkbox" name="noCall"><i></i></label>`}
          <div class="field"><select name="replace">
            <option value="call">Позвонить и согласовать</option>
            <option value="similar">Заменить на похожий</option>
            <option value="remove">Убрать из заказа</option>
          </select><label>Если товара не окажется</label></div>
          ${pickup ? '' : `<div style="font-weight:600;font-size:14px">Чаевые курьеру</div>
          <div class="slots">${[0, 50, 100, 150, 200].map(v => `<button type="button" class="slot ${f.tip === v ? 'active' : ''}" data-tip="${v}">${v ? rub(v) : 'Без чаевых'}</button>`).join('')}</div>`}
        </div>
      </div>
      <div class="checkout__side"><div class="checkout__side-inner">
        <div style="font-weight:800;font-size:18px">Ваш заказ</div>
        <div class="summary-items">
          ${t.okLines.map(l => `<div class="summary-item"><span class="summary-item__img" style="background:${catById[l.p.cat].color}">${ic(l.p.icon)}</span><span class="summary-item__name">${l.p.name}</span><span>×${l.qty}</span><b>${rub(l.sum)}</b></div>`).join('')}
        </div>
        <div class="totals" id="checkoutTotals"></div>
        <button class="btn btn--primary btn--block btn--between" type="submit" id="payBtn"></button>
      </div></div>
    </form>`;
  m.scrollTop = 0;

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
    $('#payBtn').innerHTML = `<span>${f.pay === 'card' || f.pay === 'sbp' ? 'Оплатить' : 'Заказать'}</span><span>${rub(sum)}</span>`;
  };
  const drawPay = () => {
    $('#payExtra').innerHTML = f.pay === 'card' ? `<div class="card-form">
        <input name="cardNum" inputmode="numeric" placeholder="Номер карты" maxlength="19" autocomplete="cc-number">
        <div class="row row--2" style="grid-template-columns:1fr 1fr"><input name="cardExp" inputmode="numeric" placeholder="ММ/ГГ" maxlength="5" autocomplete="cc-exp"><input name="cardCvc" inputmode="numeric" placeholder="CVC" maxlength="3" type="password" autocomplete="cc-csc"></div>
      </div>`
      : f.pay === 'cash' ? `<div class="field"><input name="change" inputmode="numeric" placeholder=" "><label>С какой суммы сдача</label></div>` : '';
  };
  drawPay(); drawTotals();

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
    el.classList.remove('bad');
    const fld = el.closest('.field');
    if (fld) { fld.classList.remove('error'); fld.querySelector('.field__err')?.remove(); }
  };
  form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let first = null;
    const err = (name, msg) => {
      const el = form.elements[name];
      if (!el) return;
      first = first || el;
      const fld = el.closest('.field');
      if (fld) { fld.classList.add('error'); if (!fld.querySelector('.field__err')) fld.insertAdjacentHTML('beforeend', `<div class="field__err">${msg}</div>`); }
      else el.classList.add('bad');
    };
    if (!pickup) { if (!data.street?.trim()) err('street', 'Укажите улицу'); if (!data.house?.trim()) err('house', 'Укажите дом'); }
    if (!data.name?.trim()) err('name', 'Укажите имя');
    if ((data.phone || '').replace(/\D/g, '').length !== 11) err('phone', 'Номер полностью');
    if (f.pay === 'card') {
      if ((data.cardNum || '').replace(/\D/g, '').length !== 16) err('cardNum');
      if (!/^(0[1-9]|1[0-2])\/\d\d$/.test(data.cardExp || '')) err('cardExp');
      if ((data.cardCvc || '').length !== 3) err('cardCvc');
    }
    if (first) { first.focus(); toast('Проверьте поля'); return; }

    state.address = { street: data.street, house: data.house, apt: data.apt, entrance: data.entrance, floor: data.floor, code: data.code, zone: data.zone, name: data.name, phone: data.phone };
    LS.set('address', state.address);
    const btn = $('#payBtn');
    btn.disabled = true; btn.innerHTML = '<span>Обрабатываем…</span>';
    setTimeout(() => placeOrder({ ...f, ...data, pickup }), f.pay === 'card' || f.pay === 'sbp' ? 1200 : 500);
  };
}

function maskPhone(v) {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  let out = '+7';
  if (p[0]) out += ' (' + p[0] + (p[0].length === 3 ? ')' : '');
  if (p[1]) out += ' ' + p[1];
  if (p[2]) out += '-' + p[2];
  if (p[3]) out += '-' + p[3];
  return out;
}

function placeOrder(f) {
  const t = totals();
  const order = {
    id: String(Date.now()).slice(-6), createdAt: Date.now(), point: state.point, mode: state.mode,
    items: t.okLines.map(l => ({ id: l.p.id, qty: l.qty, price: l.p.price })),
    total: t.total + (f.pickup ? 0 : f.tip), pay: f.pay, slot: f.slot,
    address: f.pickup ? point().address : `${f.street}, ${f.house}${f.apt ? ', кв. ' + f.apt : ''}`
  };
  state.orders.unshift(order);
  t.okLines.forEach(l => delete state.cart[l.p.id]);
  state.promo = null;
  save(); renderAll();
  openTracking(order.id);
}

/* ================= Tracking ================= */
let trackTimer = null;
function openTracking(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  const pt = POINTS.find(p => p.id === o.point);
  const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
  const m = $('#modal');
  const draw = () => {
    const st = orderStage(o);
    const scheduled = o.slot && o.slot !== 'asap' && st === 0;
    m.innerHTML = `
      <button class="close-x" data-close>✕</button>
      <div class="success">
        ${ic(steps[st][0], 'success__icon')}
        <h2>Заказ №${o.id}</h2>
        <p>${scheduled ? `Доставим ${new Date(o.slot).toLocaleString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : `${steps[st][1]} · ${o.address}`}</p>
        <div class="track">${steps.map((s, i) => `<div class="track__step ${i < st ? 'done' : i === st ? 'cur' : ''}"><span class="track__dot">${ic(s[0])}</span>${s[1]}</div>`).join('')}</div>
        ${o.mode !== 'pickup' && st === 2 ? `<div class="courier"><span class="courier__ava">${ic('scooter')}</span><div style="flex:1"><div class="courier__name">Курьер Ислам</div><div class="courier__meta">Будет через ~${Math.max(3, 15 - Math.round((Date.now() - o.createdAt) / 6000))} мин</div></div><a class="btn btn--ghost btn--sm" href="tel:+${pt.phone.replace(/\D/g, '')}">Позвонить</a></div>` : ''}
        <div class="totals" style="margin-top:18px;text-align:left">
          <div class="totals__row"><span>Склад</span><b>${pt.city}, ${pt.address}</b></div>
          <div class="totals__row"><span>Оплата</span><b>${payLabel(o.pay)}</b></div>
          <div class="totals__row totals__row--total"><span>Сумма</span><b>${rub(o.total)}</b></div>
        </div>
        <div class="row row--2" style="margin-top:8px">
          <a class="btn btn--ghost" href="#/orders">Мои заказы</a>
          <button class="btn btn--primary" data-close>Продолжить</button>
        </div>
      </div>`;
    if (st >= 3) clearInterval(trackTimer);
  };
  clearInterval(trackTimer);
  m.className = 'modal show';
  draw();
  showOverlay();
  trackTimer = setInterval(() => m.classList.contains('show') ? draw() : clearInterval(trackTimer), 2000);
}

function repeatOrder(id) {
  const o = state.orders.find(x => x.id === id);
  let missing = 0;
  o.items.forEach(i => {
    const s = stockOf(byId[i.id]);
    const q = Math.min(s, (state.cart[i.id] || 0) + i.qty);
    if (q > 0) state.cart[i.id] = q;
    if (s < i.qty) missing++;
  });
  save(); renderAll(); openCart();
  toast(missing ? `${missing} ${plural(missing, 'товара', 'товаров', 'товаров')} не хватает на складе` : 'Добавлено в корзину');
}

/* ================= Overlays ================= */
function showOverlay() { $('#overlay').classList.add('show'); document.body.classList.add('locked'); }
function closeAll() {
  $('#modal').classList.remove('show');
  $('#modal').onclick = null;
  $('#drawer').classList.remove('show');
  $('#drawer').dataset.view = '';
  $('#overlay').classList.remove('show');
  document.body.classList.remove('locked');
  clearInterval(trackTimer);
}
function openCart() {
  if (isDesktopCart()) { closeAll(); return; }
  $('#modal').classList.remove('show');
  $('#drawer').dataset.view = 'cart';
  renderCart();
  $('#drawer').classList.add('show');
  showOverlay();
}

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${msg}</span>${action ? `<button>${action.label}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 200); }, action ? 4000 : 2200);
}

/* ================= Events ================= */
function goCatalog(cat) {
  state.cat = cat;
  state.query = ''; $('#searchInput').value = '';
  if (state.route !== 'catalog') { location.hash = '#/'; return; }
  renderPage();
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const el = s => e.target.closest(s);
  let x;
  if ((x = el('[data-add]'))) return setQty(x.dataset.add, 1);
  if ((x = el('[data-inc]'))) return setQty(x.dataset.inc, (state.cart[x.dataset.inc] || 0) + 1);
  if ((x = el('[data-dec]'))) {
    const id = x.dataset.dec, q = (state.cart[id] || 0) - 1;
    setQty(id, q);
    if (q === 0) toast('Удалено из корзины', { label: 'Вернуть', fn: () => setQty(id, 1) });
    return;
  }
  if ((x = el('[data-remove]'))) { delete state.cart[x.dataset.remove]; save(); renderCart(); refreshQty(x.dataset.remove); return; }
  if ((x = el('[data-fav]'))) {
    const id = x.dataset.fav;
    state.favs = isFav(id) ? state.favs.filter(f => f !== id) : [id, ...state.favs];
    save(); syncFav(id);
    if (state.route === 'favorites' && !$('#modal').classList.contains('show')) renderFavorites();
    return;
  }
  if ((x = el('[data-open]'))) return openProduct(x.dataset.open);
  if ((x = el('[data-cat]'))) { closeAll(); return goCatalog(x.dataset.cat); }
  if ((x = el('[data-chip]'))) { state.filters = new Set([x.dataset.chip]); return goCatalog('all'); }
  if ((x = el('[data-filter]'))) {
    const f = x.dataset.filter;
    state.filters.has(f) ? state.filters.delete(f) : state.filters.add(f);
    x.classList.toggle('active', state.filters.has(f));
    return renderCatalog();
  }
  if ((x = el('[data-banner]'))) {
    const b = BANNERS[x.dataset.banner];
    if (b.cat) return goCatalog(b.cat);
    if (b.promo) { state.promo = b.promo; save(); renderCart(); return toast(`Промокод ${b.promo} применён`); }
  }
  if ((x = el('[data-track]'))) return openTracking(x.dataset.track);
  if ((x = el('[data-repeat]'))) return repeatOrder(x.dataset.repeat);
  if (el('[data-close]')) return closeAll();

  if ((x = el('[data-action]'))) {
    const a = x.dataset.action;
    if (a === 'open-points') openPoints();
    if (a === 'open-cart') openCart();
    if (a === 'toggle-theme') { state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; LS.set('theme', state.theme); applyTheme(); }
    if (a === 'clear-cart') {
      const backup = { ...state.cart };
      state.cart = {}; save(); renderAll();
      toast('Корзина очищена', { label: 'Вернуть', fn: () => { state.cart = backup; save(); renderAll(); } });
    }
    if (a === 'remove-bad') { cartLines().filter(l => !l.ok).forEach(l => l.avail ? state.cart[l.p.id] = l.avail : delete state.cart[l.p.id]); save(); renderAll(); }
    if (a === 'remove-promo') { state.promo = null; save(); renderCart(); }
    if (a === 'checkout') { $('#drawer').classList.remove('show'); $('#drawer').dataset.view = ''; openCheckout(); }
    if (a === 'reset') { state.filters.clear(); state.query = ''; $('#searchInput').value = ''; goCatalog('all'); }
    if (a === 'clear-favs') {
      const backup = [...state.favs];
      state.favs = []; save(); renderPage();
      toast('Избранное очищено', { label: 'Вернуть', fn: () => { state.favs = backup; save(); renderPage(); } });
    }
    if (a === 'favs-to-cart') {
      let n = 0;
      state.favs.forEach(id => { const p = byId[id]; if (p && stockOf(p) > 0 && !state.cart[id]) { state.cart[id] = 1; n++; } });
      save(); renderAll();
      toast(n ? `Добавлено ${n} ${plural(n, 'товар', 'товара', 'товаров')}` : 'Всё уже в корзине');
    }
  }
});

document.addEventListener('submit', e => {
  if (e.target.matches('[data-promo-form]')) { e.preventDefault(); applyPromo(e.target.code.value); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'sortSelect') { state.sort = e.target.value; renderCatalog(); }
  if (e.target.id === 'favSort') { state.favSort = e.target.value; renderFavorites(); }
});
$('#overlay').addEventListener('click', closeAll);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

let searchT;
$('#searchInput').addEventListener('input', e => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    state.query = e.target.value;
    if (state.query) state.cat = 'all';
    if (state.route !== 'catalog') { location.hash = '#/'; return; }
    renderPage();
  }, 200);
});

function renderAll() {
  renderPoint(); renderPage(); renderCart();
  const active = state.orders.some(o => orderStage(o) < 3);
  $$('[data-orders-dot]').forEach(d => d.hidden = !active);
}

parseRoute();
renderAll();
if (!state.point) openPoints();
})();
