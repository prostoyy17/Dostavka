// MayrMarket — логика сайта: страницы (hash-роутер), корзина, избранное, поиск, оформление и отслеживание заказа.
// Данные: data/catalog.js (товары), js/config.js (доставка), js/icons.js (иконки).
(() => {
'use strict';
const BUILD = '1794766097';
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
  address: LS.get('address', {}),
  user: LS.get('user', null),
  theme: LS.get('theme', null),
  route: 'catalog',
  cat: 'all',
  query: '',
  sub: null,
  filters: new Set(),
  sort: 'pop',
  limit: 60,
  dd: null,
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
  LS.set('point', state.point); LS.set('mode', state.mode);
};
if (!POINTS.some(p => p.id === state.point)) state.point = POINTS.length === 1 ? POINTS[0].id : null;
state.mode = 'delivery';
const point = () => POINTS.find(p => p.id === state.point);
const stockOf = (p, pid = state.point || POINTS[0].id) => p ? (p.stock[pid] || 0) : 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Цены везде в целых рублях — копейки не показываем
const rubP = n => Math.round(n).toLocaleString('ru-RU') + '\u00a0₽';
const pic = (p, cls = 'ic') => p.img ? `<img class="${cls} photo" src="${p.img}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.className='${cls}';this.src='assets/icons/${p.icon}.webp'">` : ic(p.icon, cls);
const pad2 = n => String(n % 24).padStart(2, '0');
// hours: [открытие, закрытие]; закрытие больше 24 означает «после полуночи» (25 = 01:00 ночи)
const isOpen = pt => { const h = new Date().getHours(), [a, b] = pt.hours; return (h >= a && h < b) || (b > 24 && h < b - 24); };
const opensToday = pt => new Date().getHours() < pt.hours[0];
const hours = pt => `${pad2(pt.hours[0])}:00–${pad2(pt.hours[1])}:00`;
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const heart = svgI('heart-o', 20, 'h-off') + svgI('heart', 20, 'h-on');

function applyTheme() {
  const t = state.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#000000' : '#EEEDE8';
}
applyTheme();

/* ================= Cart math ================= */
function cartLines() {
  return Object.entries(state.cart).filter(([id]) => byId[id]).map(([id, qty]) => {
    const p = byId[id], avail = maxOf(p);
    return { p, qty, avail, ok: avail >= qty && avail > 0, sum: Math.round(p.price * qty) };
  });
}
function totals() {
  const lines = cartLines();
  const okLines = lines.filter(l => l.ok);
  const count = lines.reduce((s, l) => s + (l.p.kg ? 1 : l.qty), 0);
  const subtotal = okLines.reduce((s, l) => s + l.sum, 0);
  const pt = point() || POINTS[0];
  const isPickup = state.mode === 'pickup';
  const delivery = isPickup || subtotal >= pt.freeFrom || subtotal === 0 ? 0 : pt.deliveryFee;
  const service = 0;
  const total = subtotal + delivery + service;
  return { lines, okLines, count, subtotal, delivery, service, total, pt, minOk: subtotal >= pt.minOrder, isPickup, toFree: Math.max(0, pt.freeFrom - subtotal) };
}

/* Весовые товары: шаг 0,5 кг, первое нажатие «+» — 1 кг */
/* Весовые товары: вес только кратно 0,5 кг (0,5 · 1 · 1,5 · 2 · 2,5 …) — магазину так проще взвешивать */
const KG_STEP = 0.5;
const stepOf = p => p && p.kg ? KG_STEP : 1;
// сколько можно взять: для весовых — остаток, округлённый вниз до 0,5 кг
const maxOf = p => { const s = stockOf(p); return p && p.kg ? Math.round(Math.floor(s / KG_STEP + 1e-9) * KG_STEP * 10) / 10 : s; };
// первое нажатие «+»: 1 кг (или сколько есть, если меньше), штучные — 1 шт
const firstOf = p => p && p.kg ? Math.min(1, maxOf(p)) : 1;
const fmtQty = (p, q) => p && p.kg ? `${String(Math.round(q * 10) / 10).replace('.', ',')} кг` : `${q} шт`;
const stepQty = (p, q) => p && p.kg ? Math.round(Math.round(q / KG_STEP) * KG_STEP * 10) / 10 : Math.round(q);
const WEIGHT_NOTE = 'Весовые товары взвешивают в магазине, поэтому вес и сумма могут немного отличаться.';
function setQty(id, qty) {
  const p = byId[id];
  const max = maxOf(p);
  const prev = state.cart[id] || 0;
  qty = Math.max(0, Math.min(stepQty(p, qty), max));
  if (qty === prev && qty >= max && qty > 0) { toast('Больше нет в наличии'); return; }
  if (qty === 0) delete state.cart[id]; else state.cart[id] = qty;
  save();
  refreshQty(id);
  renderCart();
}

/* ================= Product card ================= */
function actionHTML(p, size = '') {
  const q = state.cart[p.id] || 0;
  const s = maxOf(p);
  if (size.includes('round')) {
    if (s === 0) return '';
    if (!q) return `<button class="add-btn add-btn--round" data-add="${p.id}" aria-label="В корзину">${svgI('plus', 20)}</button>`;
    return `<div class="stepper stepper--round"><button data-dec="${p.id}" aria-label="Меньше">${svgI('minus', 16)}</button><span>${p.kg ? fmtQty(p, q) : q}</span><button data-inc="${p.id}" aria-label="Больше" ${q >= maxOf(p) ? 'disabled' : ''}>${svgI('plus', 16)}</button></div>`;
  }
  if (s === 0) return `<button class="add-btn" disabled>Нет в наличии</button>`;
  if (!q) return `<button class="add-btn ${size.includes('primary') ? 'add-btn--primary' : ''}" data-add="${p.id}">+ В корзину</button>`;
  return `<div class="stepper ${size}">
    <button data-dec="${p.id}" aria-label="Меньше">${svgI('minus', 16)}</button>
    <span>${p.kg ? fmtQty(p, q) : q}</span>
    <button data-inc="${p.id}" aria-label="Больше" ${q >= maxOf(p) ? 'disabled' : ''}>${svgI('plus', 16)}</button>
  </div>`;
}
function tagsHTML(p) {
  return p.oldPrice > p.price ? `<span class="tag tag--sale">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : '';
}
function cardHTML(p) {
  const s = stockOf(p);
  return `<article class="card ${s === 0 ? 'out' : ''}">
    <div class="card__img ${p.img ? 'card__img--photo' : 'card__img--icon'}" style="--tint:${catById[p.cat].color}" data-open="${p.id}">
      ${pic(p)}
      <div class="card__tags">${s === 0 ? '<span class="tag tag--out">Нет в наличии</span>' : tagsHTML(p)}</div>
      <button class="fav-btn ${isFav(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${heart}</button>
      <div class="card__action" data-action-for="${p.id}" data-size="round">${actionHTML(p, 'round')}</div>
    </div>
    <div class="card__price">
      <span class="price">${rubP(p.price)}</span>${p.oldPrice > p.price ? `<span class="price-old">${rubP(p.oldPrice)}</span>` : ''}
    </div>
    <div class="card__name" data-open="${p.id}" title="${esc(p.name)}">${esc(p.name)}</div>
    <div class="card__unit"><span>${p.unit}</span>${s > 0 && s <= 5 ? `<span class="card__low">осталось ${fmtQty(p, s)}</span>` : ''}</div>
  </article>`;
}
function kgPickHTML(p) {
  const q = state.cart[p.id] || 0;
  return `<div class="kgpick__sum">${q ? `В корзине ${fmtQty(p, q)} — <b>≈ ${rubP(Math.round(p.price * q))}</b>` : `${rubP(p.price)} за 1 кг · шаг 0,5 кг`}</div>
    <div class="kgpick__note">${WEIGHT_NOTE}</div>`;
}
function refreshQty(id) {
  $$(`[data-action-for="${id}"]`).forEach(el => { el.innerHTML = actionHTML(byId[id], el.dataset.size || ''); });
  $$(`[data-kg-for="${id}"]`).forEach(el => { el.innerHTML = kgPickHTML(byId[id]); });
}
function syncFav(id) {
  $$(`[data-fav="${id}"]`).forEach(b => b.classList.toggle('on', isFav(id)));
  $$('[data-fav-count]').forEach(b => { b.hidden = !state.favs.length; b.textContent = state.favs.length; });
  const c = $('[data-cat="fav"] .cat-link__count'); if (c) c.textContent = state.favs.length || '';
}

/* ================= Router ================= */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  state.route = ['favorites', 'orders', 'account', 'address', 'about', 'settings', 'cart', 'login', 'checkout', 'z/'].find(r => h.startsWith(r)) || 'catalog';
}
/* Память прокрутки: у каждого экрана (и у каждого раздела каталога) своя позиция.
   Ушёл с главной в «Избранное» и вернулся — главная открывается там же, где была. */
const scrollMem = {};
const pageKey = () => state.route === 'catalog' ? `catalog:${state.cat}:${state.sub || ''}:${state.query || ''}` : state.route;
function rememberScroll() {
  scrollMem[pageKey()] = { y: window.scrollY, limit: state.limit, rows: [...document.querySelectorAll('#page .hrow')].map(r => r.scrollLeft) };
}
function restoreScroll() {
  const m = scrollMem[pageKey()];
  const apply = () => {
    if (!m) { window.scrollTo(0, 0); return; }
    document.querySelectorAll('#page .hrow').forEach((r, i) => { r.scrollLeft = m.rows[i] || 0; });
    window.scrollTo(0, m.y);
  };
  apply(); requestAnimationFrame(apply);   // второй раз — после того как браузер разложит страницу
}
// hashchange приходит до перерисовки, поэтому позиция старого экрана ещё на месте (работает и для жеста «назад»)
window.addEventListener('hashchange', () => { rememberScroll(); parseRoute(); closeAll(); renderPage(); restoreScroll(); });

function renderPage() {
  const navOf = { address: 'account', about: 'account', settings: 'account', orders: 'account', login: 'account', checkout: 'cart' };
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (navOf[state.route] || state.route)));
  document.body.classList.toggle('sub', state.route !== 'catalog');
  document.body.classList.toggle('no-tabbar', state.route === 'login' || state.route === 'checkout' || state.route === 'z/');
  renderCats();
  if (state.route === 'favorites') { renderFavorites(); return addGap(); }
  if (state.route === 'orders') { renderOrders(); return addBack(); }
  if (state.route === 'cart') { renderCartPage(); return addGap(); }
  if (state.route === 'account') return renderAccount();
  if (state.route === 'address') return renderAddress();
  if (state.route === 'about') return renderAbout();
  if (state.route === 'settings') return renderSettings();
  if (state.route === 'checkout') return openCheckout();
  if (state.route === 'z/') return renderOrderView();
  if (state.route === 'login') { renderAuth(); return addBack(); }
  renderCatalogPage();
}

/* ================= Catalog page ================= */
function filtered() {
  const words = state.query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  const list = PRODUCTS.filter(p => {
    if (state.cat !== 'all' && p.cat !== state.cat) return false;
    if (state.sub && p.sub !== state.sub) return false;
    if (words.length && !words.every(w => p.search.includes(w))) return false;
    if (state.filters.has('photo') && !p.img) return false;
    if (state.filters.has('kg') && !p.kg) return false;
    return true;
  });
  return sortList(list, state.sort);
}
function sortList(list, sort) {
  const sorters = {
    pop: (a, b) => (!!b.img - !!a.img) || b.popularity - a.popularity,
    asc: (a, b) => a.price - b.price,
    desc: (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    added: () => 0
  };
  return [...list].sort(sorters[sort]).sort((a, b) => (stockOf(a) === 0) - (stockOf(b) === 0));
}
const sortSelect = (id, val, extra = '') => `<select class="select" id="${id}">
  ${extra}
  ${[['pop', 'Популярные'], ['asc', 'Сначала дешевле'], ['desc', 'Сначала дороже'], ['name', 'По названию']].map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}
</select>`;

function renderCatalogPage() {
  const page = $('#page');
  const title = state.query ? `Поиск «${esc(state.query)}»` : state.cat === 'all' ? 'Все товары' : catById[state.cat].name;
  const home = state.cat === 'all' && !state.query;
  page.innerHTML = `
    <div class="circles" id="catStrip"></div>
    ${home ? '' : `<div class="toolbar"><h1 class="toolbar__title">${title}</h1></div>
    <div class="controls" id="controls"></div>`}
    <div id="catalog"></div>`;
  renderCatStrip();
  renderControls();
  renderCatalog();
}

/* ---- compact controls: Подраздел · Фильтры · Сортировка ---- */
const SORTS = [['pop', 'Популярные', 'Популярные'], ['asc', 'Сначала дешевле', 'Дешевле'], ['desc', 'Сначала дороже', 'Дороже'], ['name', 'По названию', 'А–Я']];
const FILTERS = [['photo', 'Только с фото'], ['kg', 'Весовые товары']];
const caret = svgI('down', 13);
const icoFilter = svgI('filter', 16, 'pill__ico');
const icoSort = svgI('sort', 16, 'pill__ico');
function renderControls() {
  const box = $('#controls');
  if (!box) return;
  const c = state.cat !== 'all' ? catById[state.cat] : null;
  const nF = state.filters.size;
  const head = t => `<div class="dd__head">${t}<button data-dd-close aria-label="Закрыть">${svgI('x', 16)}</button></div>`;
  let sub = '';
  if (c && c.subs.length) {
    let menu = '';
    if (state.dd === 'sub') {
      const cnt = {};
      PRODUCTS.forEach(p => { if (p.cat === c.id) cnt[p.sub] = (cnt[p.sub] || 0) + 1; });
      const all = PRODUCTS.filter(p => p.cat === c.id).length;
      menu = `<div class="dd__menu">${head('Подраздел')}<div class="dd__scroll">
        <button class="dd__opt ${!state.sub ? 'sel' : ''}" data-sub=""><span>Все</span><em>${all}</em></button>
        ${c.subs.map(s => `<button class="dd__opt ${state.sub === s ? 'sel' : ''}" data-sub="${esc(s)}"><span>${esc(s)}</span><em>${cnt[s] || 0}</em></button>`).join('')}
      </div></div>`;
    }
    sub = `<div class="dd"><button class="pill ${state.sub ? 'on' : ''}" data-dd="sub"><span class="pill__label">${state.sub ? esc(state.sub) : 'Подраздел'}</span>${state.sub ? '<i class="pill__x" data-sub="" title="Сбросить">×</i>' : caret}</button>${menu}</div>`;
  }
  const flt = `<div class="dd"><button class="pill ${nF ? 'on' : ''}" data-dd="flt">${icoFilter}<span class="pill__label">Фильтры</span>${nF ? `<b class="pill__n">${nF}</b>` : caret}</button>${state.dd === 'flt' ? `<div class="dd__menu">${head('Фильтры')}<div class="dd__scroll">${FILTERS.map(([f, l]) => `<button class="dd__opt ${state.filters.has(f) ? 'sel' : ''}" data-filter="${f}"><span>${l}</span><i class="dd__box"></i></button>`).join('')}</div></div>` : ''}</div>`;
  const sortName = (SORTS.find(s => s[0] === state.sort) || SORTS[0])[2];
  const srt = `<div class="dd dd--right"><button class="pill" data-dd="sort">${icoSort}<span class="pill__label">${sortName}</span>${caret}</button>${state.dd === 'sort' ? `<div class="dd__menu">${head('Сортировка')}<div class="dd__scroll">${SORTS.map(([v, l]) => `<button class="dd__opt ${state.sort === v ? 'sel' : ''}" data-sort="${v}"><span>${l}</span></button>`).join('')}</div></div>` : ''}</div>`;
  box.innerHTML = (state.dd ? '<div class="dd__back" data-dd-close></div>' : '') + sub + flt + srt;
  if (state.dd && matchMedia('(max-width: 760px)').matches) lockScroll('dd'); else unlockScroll('dd');
}

function renderCatalog() {
  const root = $('#catalog');
  if (!root) return;
  const list = filtered();
  if (!list.length) {
    root.innerHTML = `<div class="empty">${iconBox('search', 'empty__tile')}<div class="empty__title">Ничего не найдено</div><button class="btn btn--ghost btn--sm" data-action="reset">Сбросить фильтры</button></div>`;
    return;
  }
  const grouped = state.cat === 'all' && !state.query;
  if (!grouped) {
    const shown = list.slice(0, state.limit);
    root.innerHTML = `<div class="list-meta">${list.length.toLocaleString('ru-RU')} ${plural(list.length, 'товар', 'товара', 'товаров')}</div><div class="grid">${shown.map(cardHTML).join('')}</div>` +
      (list.length > shown.length ? `<div class="more"><button class="btn btn--ghost" data-action="more">Показать ещё ${Math.min(60, list.length - shown.length)} из ${(list.length - shown.length).toLocaleString('ru-RU')}</button></div>` : '');
    return;
  }

  // Главная: рекомендации (случайные товары с фото, на время визита) + подборки по разделам
  if (!RECS) {
    const pool = PRODUCTS.filter(p => p.img && stockOf(p) > 0);
    RECS = [];
    for (let i = 0; i < 10 && pool.length; i++) RECS.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  let html = `<section class="section"><div class="section__head"><h2 class="section__title">Рекомендации для вас</h2></div><div class="grid">${RECS.map(cardHTML).join('')}</div></section>`;
  CATEGORIES.forEach(c => {
    const items = list.filter(p => p.cat === c.id && p.img && stockOf(p) > 0).sort((a, b) => b.popularity - a.popularity);
    if (!items.length) return;
    html += `<section class="section"><div class="section__head"><h2 class="section__title">${c.name}</h2><button class="section__more" data-cat="${c.id}">Все${svgI('chev', 15)}</button></div><div class="hrow">${items.slice(0, 12).map(cardHTML).join('')}</div></section>`;
  });
  root.innerHTML = html;
}

let RECS = null;
function catItems() {
  return [{ id: 'all', name: 'Все товары', icon: 'cart' }, ...CATEGORIES];
}
function renderCats() {
  $$('[data-fav-count]').forEach(b => { b.hidden = !state.favs.length; b.textContent = state.favs.length; });
}
let catStripX = 0;
function renderCatStrip() {
  const s = $('#catStrip');
  if (s) s.onscroll = () => { catStripX = s.scrollLeft; };
  if (s) s.innerHTML = catItems().map(c => `<button class="circle ${state.cat === c.id ? 'active' : ''}" data-cat="${c.id}"><span class="circle__img" style="background:${c.color || 'var(--surface)'}">${ic(c.icon, '')}</span><span class="circle__name">${c.name}</span></button>`).join('');
  if (s) s.scrollLeft = catStripX;
}


/* ================= Иконка в строке меню / пустого экрана ================= */
const iconBox = (name, cls = '') => `<span class="pico ${cls}">${svgI(name, 24)}</span>`;

/* ================= Account & sub screens ================= */
const icoBack = svgI('back', 26);
const icoChev = svgI('chev', 18);
const backBar = () => `<div class="subhead"><button class="subhead__back" data-action="back" aria-label="Назад">${icoBack}</button></div>`;
function addGap() { $('#page').insertAdjacentHTML('afterbegin', '<div class="tabgap"></div>'); }
function addBack() { $('#page').insertAdjacentHTML('afterbegin', backBar()); }
function addressText() {
  const a = state.address || {};
  return a.street ? [a.street, a.house, a.apt && 'кв. ' + a.apt].filter(Boolean).join(', ') : 'Не указан';
}
function renderAccount() {
  $('#page').innerHTML = `
    <div class="acc acc--top">
      ${state.user ? `<div class="acc__card acc__row acc__me">${iconBox('user', 'acc__tile')}<span class="acc__text"><small>Аккаунт</small><b>${esc(state.user.name || state.user.phone)}</b>${state.user.name ? `<em>${esc(state.user.phone)}</em>` : ''}</span></div>`
        : `<button class="acc__login" data-action="login">Войти или зарегистрироваться</button>`}
      <a class="acc__card acc__row" href="#/address">
        ${iconBox('pin', 'acc__tile')}
        <span class="acc__text"><small>Адрес доставки</small><b>${esc(addressText())}</b></span>${icoChev}
      </a>
      <div class="acc__card">
        <a class="acc__row" href="#/orders">${iconBox('receipt', 'acc__tile')}<span class="acc__text"><b>Мои заказы</b></span>${state.orders.length ? `<span class="acc__count">${state.orders.length}</span>` : ''}${icoChev}</a>
        <a class="acc__row" href="#/settings">${iconBox('gear', 'acc__tile')}<span class="acc__text"><b>Настройки</b></span>${icoChev}</a>
        <a class="acc__row" href="#/about">${iconBox('info', 'acc__tile')}<span class="acc__text"><b>О сервисе</b></span>${icoChev}</a>
      </div>
      ${state.user ? `<div class="acc__card"><button class="acc__row acc__logout" data-action="logout">${iconBox('signout', 'acc__tile')}<span class="acc__text"><b>Выйти из аккаунта</b></span></button></div>` : ''}
      <div class="acc__foot"><div class="acc__brand">Mayr<b>Market</b></div><div>Версия 1.0</div></div>
    </div>`;
}
function renderSettings() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#page').innerHTML = `${backBar()}
    <div class="acc">
      <h1 class="acc__title">Настройки</h1>
      <div class="acc__card">
        <label class="acc__row acc__switchrow">${iconBox('moon', 'acc__tile')}<span class="acc__text"><b>Тёмная тема</b></span>
          <input type="checkbox" class="switch" id="darkSwitch" ${dark ? 'checked' : ''}></label>
      </div>
    </div>`;
  $('#darkSwitch').onchange = e => { state.theme = e.target.checked ? 'dark' : 'light'; LS.set('theme', state.theme); applyTheme(); };
}
// Переключатель «Частный дом / Квартира-офис»: плашка плавно переезжает, потом меняются поля
const kindSwitch = flat => `<div class="kindsw" data-k="${flat ? 'flat' : 'house'}">
  <button type="button" class="${flat ? '' : 'on'}" data-kind="house">${svgI('home2', 20)}Частный дом</button>
  <button type="button" class="${flat ? 'on' : ''}" data-kind="flat">${svgI('flat', 20)}Квартира / офис</button>
</div>`;
const slideKind = (btn, then) => {
  const sw = btn.closest('.kindsw'); sw.dataset.k = btn.dataset.kind;
  sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
  setTimeout(then, 200);
};
function renderAddress() {
  const f = state.address || {};
  const flat = f.kind === 'flat', pt = POINTS[0];
  $('#page').innerHTML = `${backBar()}
    <div class="acc">
      <h1 class="acc__title">Адрес доставки</h1>
      <form class="acc__form" id="addrForm" novalidate>
        ${kindSwitch(flat)}
        <div class="field"><input name="street" placeholder=" " value="${esc([f.street, f.house].filter(Boolean).join(', '))}" autocomplete="street-address"><label>Улица и дом</label></div>
        ${flat ? `
        <div class="row row--2" style="grid-template-columns:1fr 1fr">
          <div class="field"><input name="apt" placeholder=" " value="${esc(f.apt || '')}"><label>Квартира / офис</label></div>
          <div class="field"><input name="entrance" placeholder=" " inputmode="numeric" value="${esc(f.entrance || '')}"><label>Подъезд</label></div>
        </div>
        <div class="row row--2" style="grid-template-columns:1fr 1fr">
          <div class="field"><input name="floor" placeholder=" " inputmode="numeric" value="${esc(f.floor || '')}"><label>Этаж</label></div>
          <div class="field"><input name="code" placeholder=" " value="${esc(f.code || '')}"><label>Домофон</label></div>
        </div>` : ''}
        <div class="field"><select name="zone">${pt.zones.map(z => `<option ${f.zone === z ? 'selected' : ''}>${z}</option>`).join('')}</select><label>Район</label></div>
        <div class="field"><textarea name="comment" placeholder=" ">${esc(f.comment || '')}</textarea><label>Комментарий курьеру</label></div>
        <button class="acc__login acc__save" type="submit">Сохранить</button>
      </form>
    </div>`;
  const form = $('#addrForm');
  form.onclick = e => {
    const kd = e.target.closest('[data-kind]');
    if (!kd || kd.dataset.kind === (f.kind || 'house')) return;
    const d = Object.fromEntries(new FormData(form));
    state.address = { ...state.address, ...d, house: '', kind: kd.dataset.kind };
    slideKind(kd, renderAddress);
  };
  form.onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (!/\d/.test(d.street)) { toast('Укажите улицу и номер дома, например: Кадырова, 12'); return; }
    if (flat && !d.apt?.trim()) { toast('Укажите квартиру'); return; }
    state.address = { ...state.address, ...d, street: d.street.trim(), house: '', kind: flat ? 'flat' : 'house' };
    if (!flat) Object.assign(state.address, { apt: '', entrance: '', floor: '', code: '' });
    LS.set('address', state.address);
    renderPoint();
    toast('Адрес сохранён');
    history.length > 1 ? history.back() : (location.hash = '#/account');
  };
}
function renderAbout() {
  const pt = POINTS[0];
  $('#page').innerHTML = `${backBar()}
    <div class="acc">
      <h1 class="acc__title">О сервисе</h1>
      <div class="acc__card acc__about">
        <p><b>MayrMarket</b> — доставка продуктов по Грозному из магазинов города. Цены и наличие — как в самих магазинах.</p>
        <div class="acc__kv"><span>Магазины</span><b>${STORES.map(s => esc(s.name)).join(', ')}</b></div>
        <div class="acc__kv"><span>Часы доставки</span><b>${hours(pt)}</b></div>
        <div class="acc__kv"><span>Время доставки</span><b>${pt.eta}</b></div>
        <div class="acc__kv"><span>Доставка</span><b>${rub(pt.deliveryFee)}, от ${rub(pt.freeFrom)} бесплатно</b></div>
        <div class="acc__kv"><span>Товаров в каталоге</span><b>${PRODUCTS.length.toLocaleString('ru-RU')}</b></div>
      </div>
      <div class="acc__credit">Иконки: <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener">Uicons by Flaticon</a></div>
      <div class="acc__foot"><div class="acc__brand">Mayr<b>Market</b></div><div>Версия 1.0</div></div>
    </div>`;
}


/* ================= Вход и регистрация =================
   Пока нет сервера, аккаунт хранится только в этом браузере (пароль — в виде SHA-256 хеша).
   Черновик формы (вкладка, имя, телефон) сохраняется, чтобы не терялся при обновлении страницы. Пароль не сохраняется. */
// цифры номера без кода страны: «+7 …», «8 …» и «7 …» в начале — это код, а не часть номера
const phoneDigits = v => {
  let t = String(v).trim(), d;
  if (t.startsWith('+7')) d = t.slice(2).replace(/\D/g, '');
  else { d = t.replace(/\D/g, ''); if (/^[78]/.test(d)) d = d.slice(1); }
  return d.slice(0, 10);
};
const formatPhone = v => fmtDigits(phoneDigits(v));
const fmtDigits = d => {
  if (!d) return '';
  let out = '+7 (' + d.slice(0, 3);
  if (d.length >= 3) out += ') ' + d.slice(3, 6);
  if (d.length >= 6) out += '-' + d.slice(6, 8);
  if (d.length >= 8) out += '-' + d.slice(8, 10);
  return out;
};
const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mayr:' + t)))].map(b => b.toString(16).padStart(2, '0')).join('');

function renderAuth() {
  if (state.user) { location.hash = '#/account'; return; }
  const draft = LS.get('authDraft', { tab: 'login', login: '', phone: '', email: '' });
  const tab = draft.tab === 'register' ? 'register' : 'login';
  const pass = (id, ph) => `<div class="auth__field auth__field--pass"><input id="${id}" type="password" placeholder="${ph}" autocomplete="${tab === 'login' ? 'current-password' : 'new-password'}"><button type="button" class="auth__eye" data-eye="${id}" aria-label="Показать пароль">${svgI('eye', 22)}</button></div>`;
  $('#page').innerHTML = `
    <div class="auth">
      <div class="auth__tabs" data-tab="${tab}">
        <button class="${tab === 'login' ? 'on' : ''}" data-auth-tab="login">Войти</button>
        <button class="${tab === 'register' ? 'on' : ''}" data-auth-tab="register">Зарегистрироваться</button>
      </div>
      ${tab === 'login' ? `
      <form class="auth__form" id="authForm" novalidate>
        <h1 class="auth__title">Вход в аккаунт</h1>
        <div class="auth__field"><input id="aLogin" type="tel" placeholder="+7 (___) ___-__-__" autocomplete="tel" inputmode="tel" value="${esc(fmtDigits(phoneDigits(draft.login || '')))}"></div>
        ${pass('aPass', 'Пароль')}
        <div class="auth__err" id="authErr"></div>
        <button class="auth__submit" type="submit">Войти</button>
      </form>` : `
      <form class="auth__form" id="authForm" novalidate>
        <h1 class="auth__title">Создать аккаунт</h1>
        <div class="auth__field"><input id="aName" placeholder="Имя" autocomplete="given-name" autocapitalize="words" maxlength="40" value="${esc(draft.name || '')}"></div>
        <div class="auth__field"><input id="aPhone" type="tel" placeholder="+7 (___) ___-__-__" autocomplete="tel" inputmode="tel" value="${esc(fmtDigits(draft.phone || ''))}"></div>
        ${pass('aPass', 'Пароль (минимум 3 символа)')}
        <div class="auth__err" id="authErr"></div>
        <button class="auth__submit" type="submit">Создать аккаунт</button>
      </form>`}
    </div>`;

  const saveDraft = () => {
    const d = LS.get('authDraft', {}); d.tab = tab;
    if ($('#aLogin')) d.login = $('#aLogin').value;
    if ($('#aPhone')) d.phone = phoneDigits($('#aPhone').value);
    if ($('#aName')) d.name = $('#aName').value;
    LS.set('authDraft', d);
  };
  const err = m => { $('#authErr').textContent = m || ''; };
  const page = $('#page');
  page.querySelectorAll('[data-auth-tab]').forEach(b => b.onclick = () => {
    const to = b.dataset.authTab; if (to === tab) return;
    saveDraft(); const d = LS.get('authDraft', {}); d.tab = to; LS.set('authDraft', d);
    // сначала плашка плавно переезжает, потом меняется форма
    const tabs = page.querySelector('.auth__tabs'); tabs.dataset.tab = to;
    tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    page.querySelector('.auth__form').classList.add('auth__form--out');
    setTimeout(() => { renderAuth(); addBack(); }, 180);
  });
  page.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => {
    const i = $('#' + b.dataset.eye), show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.innerHTML = svgI(show ? 'eyeoff' : 'eye', 22);
  });
  // маска телефона: +7 (XXX) XXX-XX-XX
  const mask = inp => {
    if (!inp) return;
    let prev = phoneDigits(inp.value);
    inp.addEventListener('input', e => {
      {
        let d = phoneDigits(inp.value);
        if (/^delete/.test(e.inputType || '') && d === prev) d = d.slice(0, -1);   // стёрли скобку или чёрточку — стираем и цифру
        if (!prev && d === '7' && !/^delete/.test(e.inputType || '')) d = '';   // «+7» набрали вручную после автоподстановки «+7 (»
        const prefixOnly = !d && /^\s*(\+7?|[78])\s*\(?\s*$/.test(inp.value) && !/^delete/.test(e.inputType || '');
        inp.value = d ? fmtDigits(d) : (prefixOnly ? '+7 (' : '');
        prev = d;
      }
      err(''); inp.parentElement.classList.remove('bad'); saveDraft();
    });
  };
  mask($('#aPhone')); mask($('#aLogin'));
  [$('#aName'), $('#aPass')].forEach(i => i && i.addEventListener('input', () => { err(''); i.parentElement.classList.remove('bad'); saveDraft(); }));
  const bad = (id, m) => { $('#' + id).parentElement.classList.add('bad'); err(m); $('#' + id).focus(); };

  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const accounts = LS.get('accounts', []);
    const pw = $('#aPass').value;
    if (tab === 'login') {
      const ph = phoneDigits($('#aLogin').value);
      if (!ph) return bad('aLogin', 'Введите номер телефона');
      if (ph.length !== 10) return bad('aLogin', 'Номер телефона введён не полностью');
      if (!pw) return bad('aPass', 'Введите пароль');
      const acc = accounts.find(a => a.phone === ph);
      if (!acc || acc.hash !== await sha256(pw)) return bad('aPass', 'Неверный логин или пароль');
      state.user = { name: acc.name || '', phone: fmtDigits(acc.phone) };
    } else {
      const nm = $('#aName').value.trim().replace(/\s+/g, ' ');
      if (!nm) return bad('aName', 'Введите имя');
      const ph = phoneDigits($('#aPhone').value);
      if (!ph) return bad('aPhone', 'Введите номер телефона');
      if (ph && ph.length !== 10) return bad('aPhone', 'Номер телефона введён не полностью');
      if (pw.length < 3) return bad('aPass', 'Пароль — минимум 3 символа');
      if (ph && accounts.some(a => a.phone === ph)) return bad('aPhone', 'Этот номер уже зарегистрирован — войдите');
      accounts.push({ name: nm, phone: ph, hash: await sha256(pw) }); LS.set('accounts', accounts);
      state.user = { name: nm, phone: fmtDigits(ph) };
    }
    LS.set('user', state.user); LS.set('authDraft', { tab: 'login', login: '', phone: '', name: '' });
    toast(tab === 'login' ? 'Вы вошли в аккаунт' : 'Аккаунт создан');
    location.hash = '#/account';
  };
}

/* ================= Favorites page ================= */
function renderFavorites() {
  const page = $('#page');
  const items = state.favs.map(id => byId[id]).filter(Boolean);
  if (!items.length) {
    page.innerHTML = `
      <div class="toolbar"><h1 class="toolbar__title">Избранное</h1></div>
      <div class="empty">${iconBox('heart', 'empty__tile')}<div class="empty__title">В избранном пусто</div>Нажмите на сердечко на карточке товара<br><a class="btn btn--primary btn--sm" href="#/">В каталог</a></div>`;
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
      <span>В наличии${state.point ? ` на складе <b>${point().city}</b>` : ''}: <b>${avail.length} из ${items.length}</b> · по 1 шт. (весовые — по 1 кг) на <b>${rub(sum)}</b></span>
      <div class="page-actions">
        <button class="btn btn--ghost btn--sm" data-action="clear-favs">Очистить</button>
        <button class="btn btn--primary btn--sm" data-action="favs-to-cart" ${avail.length ? '' : 'disabled'}>Всё в корзину</button>
      </div>
    </div>
    <div class="grid">${list.map(cardHTML).join('')}</div>`;
}

/* ================= Orders page ================= */
const STEPS_DELIVERY = [['clip', 'Принят'], ['bag', 'Собираем'], ['moped', 'В пути'], ['check', 'Доставлен']];
const STEPS_PICKUP = [['clip', 'Принят'], ['bag', 'Собираем'], ['store', 'Готов'], ['check', 'Выдан']];
const payLabel = p => ({ card: 'Картой онлайн', sbp: 'СБП', 'courier-card': 'Картой при получении', cash: 'Наличными' })[p] || p;

function orderStage(o) {
  if (o.via === 'wa' || o.via === 'tg') return 3;   // статус знает продавец в WhatsApp, на сайте не выдумываем
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
      <div class="empty">${iconBox('receipt', 'empty__tile')}<div class="empty__title">Заказов пока нет</div><a class="btn btn--primary btn--sm" href="#/">В каталог</a></div>`;
    return;
  }
  page.innerHTML = `<div class="toolbar"><h1 class="toolbar__title">Мои заказы <small>${state.orders.length}</small></h1></div>
    <div class="orders">${state.orders.map(o => {
      const st = orderStage(o);
      const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
      const pt = POINTS.find(p => p.id === o.point) || POINTS[0];
      return `<div class="order">
        <div class="order__head">
          <div><div class="order__num">№${o.id} · ${pt.city}</div><div class="order__date">${new Date(o.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${o.mode === 'pickup' ? 'самовывоз' : o.address}</div></div>
          <span class="order__status ${st === 3 ? 'done' : ''}">${o.via === 'tg' ? 'Отправлен продавцу' : o.via === 'wa' ? 'Отправлен в WhatsApp' : steps[st][1]}</span>
        </div>
        <div class="order__icons">${o.items.slice(0, 7).map(i => byId[i.id] ? `<span style="background:${byId[i.id].img ? '#fff' : catById[byId[i.id].cat].color}">${pic(byId[i.id])}</span>` : '').join('')}${o.items.length > 7 ? `<em>+${o.items.length - 7}</em>` : ''}</div>
        <div class="order__foot">
          <span class="order__sum">${rub(o.total)}</span>
          <span class="order__btns">
            <button class="btn btn--ghost btn--sm" data-track="${o.id}">${o.via === 'wa' || o.via === 'tg' ? 'Подробнее' : 'Статус'}</button>
            <button class="btn btn--primary btn--sm" data-repeat="${o.id}">Повторить</button>
          </span>
        </div>
      </div>`;
    }).join('')}</div>`;
}

/* ================= Point ================= */
function renderPoint() {
  const pt = point();
  $('#pointCity').textContent = typeof WAREHOUSES_ENABLED !== 'undefined' && WAREHOUSES_ENABLED && pt ? `Склад ${pt.city}` : 'Доставка по Грозному';
  const open = pt ? isOpen(pt) : false;
  $('#pointDot').classList.toggle('off', !open);
  $('#pointMeta').textContent = pt
    ? (state.address.street ? [state.address.street, state.address.house].filter(Boolean).join(', ') : (open ? `Сегодня до ${pad2(pt.hours[1])}:00 · ${pt.eta}` : `${opensToday(pt) ? 'Сегодня' : 'Завтра'} с ${pad2(pt.hours[0])}:00`))
    : 'Грозный';
}


function openPoints() {
  let sel = state.point || POINTS[0].id;
  let mode = state.mode;
  const draw = () => {
    $('#modal').className = 'modal show';
    $('#modal').innerHTML = `
      <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
      <div class="pts">
        <div class="pts__list">
          <h2 class="pts__title">Доставка по Грозному</h2>
          ${POINTS.map(p => {
            const open = isOpen(p);
            const n = PRODUCTS.filter(x => x.stock[p.id] > 0).length;
            return `<button class="pt ${p.id === sel ? 'active' : ''}" data-pick="${p.id}">
              <span class="pt__city">${p.city}</span>
              <span class="pt__addr">Товары из магазинов: ${p.store}</span>
              <span class="pt__eta">${p.eta}<small class="pt__badge ${open ? '' : 'closed'}">${open ? 'Открыто' : 'Закрыто'}</small></span>
              <span class="pt__info">${hours(p)} · ${n.toLocaleString('ru-RU')} товаров · доставка ${rub(p.deliveryFee)}, от ${rub(p.freeFrom)} бесплатно${p.minOrder ? ` · заказ от ${rub(p.minOrder)}` : ''}</span>
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
      toast(changed && bad ? `${bad} ${plural(bad, 'товар недоступен', 'товара недоступны', 'товаров недоступны')}` : `Доставка: ${point().city}`);
    }
  };
}

/* ================= Cart ================= */
function cartHTML() {
  const t = totals();
  const head = (extra = '') => `<div class="cart__head"><h2 class="cart__title">Корзина</h2>${extra}</div>`;
  if (!t.lines.length) {
    return `<div class="cart">${head()}<div class="cart__body"><div class="cart__empty">${iconBox('bag', 'empty__tile')}<b>Корзина пуста</b></div></div></div>`;
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
          <div class="cart-item__img" style="background:${l.p.img ? '#fff' : catById[l.p.cat].color}" data-open="${l.p.id}">${pic(l.p)}</div>
          <div>
            <div class="cart-item__name">${esc(l.p.name)}</div>
            <div class="cart-item__meta">${rubP(l.p.price)}${l.p.kg ? ' / кг' : ''}</div>
            ${l.ok ? `<div class="cart-item__price">${l.p.kg ? "≈ " : ""}${rubP(l.sum)}</div>`
              : `<div class="cart-item__warn">${l.avail ? `Осталось ${fmtQty(l.p, l.avail)}` : 'Нет в наличии'}</div>`}
          </div>
          <div data-action-for="${l.p.id}" data-size="stepper--sm stepper--soft">${l.avail ? actionHTML(l.p, 'stepper--sm stepper--soft') : `<button class="cart__clear" data-remove="${l.p.id}">Удалить</button>`}</div>
        </div>`).join('')}
    </div>
    <div class="cart__foot">
      <div class="totals">
        <div class="totals__row"><span>Товары, ${t.lines.length} поз.</span><b>${rubP(t.subtotal)}</b></div>
        <div class="totals__row"><span>${t.isPickup ? 'Самовывоз' : 'Доставка'}</span><b>${t.delivery ? rub(t.delivery) : 'Бесплатно'}</b></div>
        <div class="totals__row totals__row--total"><span>Итого</span><b>${rub(t.total)}</b></div>
      </div>
      ${t.okLines.some(l => l.p.kg) ? `<div class="weight-note">${WEIGHT_NOTE}</div>` : ''}
      ${!t.minOk ? `<div class="warn-box">Минимальный заказ ${rub(t.pt.minOrder)}, не хватает ${rub(t.pt.minOrder - t.subtotal)}</div>` : ''}
      <button class="btn btn--primary btn--block btn--between" data-action="checkout" ${t.minOk && t.okLines.length ? '' : 'disabled'}><span>Оформить</span><span>${rub(t.total)}</span></button>
    </div>
  </div>`;
}

function renderCart() {
  const t = totals();
  if (state.route === 'cart' && $('#page .cart-page')) $('#page .cart-page').innerHTML = cartHTML();
  $$('[data-cart-total]').forEach(el => el.textContent = t.count ? rub(t.total) : 'Корзина');
  $$('[data-cart-count]').forEach(el => { el.hidden = !t.count; el.textContent = t.count; });
}

/* ================= Product modal ================= */
function openProduct(id) {
  const p = byId[id], c = catById[p.cat];
  const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id && stockOf(x) > 0).sort((a, b) => (b.sub === p.sub) - (a.sub === p.sub) || (!!b.img - !!a.img) || b.popularity - a.popularity).slice(0, 4);
  const s = stockOf(p);
  const m = $('#modal');
  m.className = 'modal';
  m.innerHTML = `
    <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
    <div class="pm">
      <div class="pm__img" style="background:${p.img ? '#fff' : c.color}">${p.imgLarge ? `<img class="ic photo" src="${p.imgLarge}" alt="" onerror="this.onerror=null;this.className='ic';this.src='assets/icons/${p.icon}.webp'">` : ic(p.icon)}<div class="card__tags" style="left:16px;top:16px">${tagsHTML(p)}</div></div>
      <div class="pm__body">
        <div><h2 class="pm__name">${esc(p.name)}</h2>${p.unit ? `<div class="pm__unit">Цена ${p.unit}</div>` : ''}</div>
        <div class="pm__meta">
          <span>${ic(c.icon, '')}${c.name}</span>
          ${p.sub ? `<span>${esc(p.sub)}</span>` : ''}
        </div>
        <div class="pm__stock">
          ${p.offers.map((o, i) => `<div class="pm__stock-row ${i === 0 ? 'current' : ''}"><span>${esc(STORES[o[0]].name)}</span><b>${rubP(o[2])}${i === 0 && p.offers.length > 1 ? ' · дешевле' : ''}</b></div>`).join('')}
          <div class="pm__stock-row"><span>Наличие</span><b>${s ? (s > 20 ? 'В наличии' : fmtQty(p, s)) : 'Нет'}</b></div>
        </div>
        ${p.kg && maxOf(p) ? `<div class="kgpick" data-kg-for="${p.id}">${kgPickHTML(p)}</div>` : ''}
        <div class="pm__buy">
          <div>
            <div class="price">${rubP(p.price)}</div>${p.oldPrice > p.price ? `<div class="price-old">${rubP(p.oldPrice)}</div>` : ''}
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
      const day = Math.round((new Date(start).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
      slots.push({ id: start.toISOString(), title: `${pad2(h)}:00–${pad2(h + 1)}:00`, sub: ['Сегодня', 'Завтра', 'Послезавтра'][day] || start.toLocaleDateString('ru-RU') });
    }
  }
  return slots;
}

// Оформление — обычная отдельная страница (#/checkout), а не всплывающее окно:
// прокручивается как страница, Safari сам правильно обрабатывает свои панели сверху и снизу.
function openCheckout() {
  if (state.route !== 'checkout') { location.hash = '#/checkout'; return; }
  const t = totals();
  if (!t.minOk || !t.okLines.length) { location.hash = '#/cart'; return; }
  const f = { slot: 'asap', pay: 'sbp', tip: 0, ...state.address };
  // имя и телефон из аккаунта, если в заказах их ещё не вводили
  if (state.user) { if (!f.name) f.name = state.user.name || ''; if (!f.phone) f.phone = state.user.phone || ''; }
  const flat = f.kind === 'flat';   // тип адреса: частный дом или квартира/офис
  const pt = t.pt, pickup = t.isPickup;
  const m = $('#page');
  m.innerHTML = `${backBar()}
    <form class="checkout checkout--page" id="checkoutForm" novalidate>
      <div class="checkout__form">
        <h2 class="checkout__title">Оформление заказа</h2>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">1</span>${pickup ? 'Самовывоз' : 'Адрес доставки'} · ${pt.city}</div>
          ${pickup ? `<div class="pickup-box">${svgI('store', 26)}<div><b>Заберёте заказ сами</b><div style="font-size:13px;color:var(--text-2)">Адрес и время выдачи пришлём в WhatsApp, когда соберём заказ</div></div></div>` : `
          ${kindSwitch(flat)}
          <div class="field"><input name="street" placeholder=" " value="${esc([f.street, f.house].filter(Boolean).join(', '))}" autocomplete="street-address"><label>Улица и дом</label></div>
          ${flat ? `
          <div class="row row--2" style="grid-template-columns:1fr 1fr">
            <div class="field"><input name="apt" placeholder=" " value="${esc(f.apt || '')}"><label>Квартира / офис</label></div>
            <div class="field"><input name="entrance" placeholder=" " inputmode="numeric" value="${esc(f.entrance || '')}"><label>Подъезд</label></div>
          </div>
          <div class="row row--2" style="grid-template-columns:1fr 1fr">
            <div class="field"><input name="floor" placeholder=" " inputmode="numeric" value="${esc(f.floor || '')}"><label>Этаж</label></div>
            <div class="field"><input name="code" placeholder=" " value="${esc(f.code || '')}"><label>Домофон</label></div>
          </div>` : ''}
          <div class="field"><select name="zone">${pt.zones.map(z => `<option ${f.zone === z ? 'selected' : ''}>${z}</option>`).join('')}</select><label>Район</label></div>
          <div class="field"><textarea name="comment" placeholder=" ">${esc(f.comment || '')}</textarea><label>Комментарий курьеру</label></div>
          ${HOUSE_PHOTOS ? `<div class="photos">
            <div class="photos__title">Фото дома или входа <span>до 3 фото, по желанию</span></div>
            <div class="photos__list" id="photoList"></div>
            <input type="file" id="photoInput" accept="image/*" multiple hidden>
          </div>` : ''}`}
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">2</span>Контакты</div>
          <div class="row row--2">
            <div class="field"><input name="name" placeholder=" " value="${f.name || ''}" autocomplete="given-name"><label>Имя</label></div>
            <div class="field"><input name="phone" type="tel" placeholder=" " value="${f.phone || ''}" autocomplete="tel"><label>Телефон</label></div>
          </div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">3</span>Время</div>
          <div class="slots">${timeSlots().map(s => `<button type="button" class="slot ${s.id === f.slot ? 'active' : ''}" data-slot="${s.id}">${s.title}<small>${s.sub}</small></button>`).join('')}</div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">4</span>Оплата</div>
          <div class="opts">
            ${[['sbp', 'qr', 'СБП', 'После подтверждения заказа'], ['cash', 'cash', 'Наличными', 'При получении']]
              .map(([id, icon, ti, su]) => `<button type="button" class="opt ${f.pay === id ? 'active' : ''}" data-pay="${id}">${svgI(icon, 24)}<span class="opt__title">${ti}</span><span class="opt__sub">${su}</span></button>`).join('')}
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
        </div>
      </div>
      <div class="checkout__side"><div class="checkout__side-inner">
        <div style="font-weight:800;font-size:18px">Ваш заказ</div>
        <div class="summary-items">
          ${t.okLines.map(l => `<div class="summary-item"><span class="summary-item__img" style="background:${l.p.img ? '#fff' : catById[l.p.cat].color}">${pic(l.p)}</span><span class="summary-item__name">${esc(l.p.name)}</span><span>${l.p.kg ? fmtQty(l.p, l.qty) : '×' + l.qty}</span><b>${l.p.kg ? '≈ ' : ''}${rubP(l.sum)}</b></div>`).join('')}
        </div>
        ${t.okLines.some(l => l.p.kg) ? `<div class="weight-note">${WEIGHT_NOTE}</div>` : ''}
        <div class="totals" id="checkoutTotals"></div>
        <button class="btn btn--primary btn--block btn--between" type="submit" id="payBtn"></button>
      </div></div>
    </form>`;

  const form = $('#checkoutForm');
  const drawTotals = () => {
    const tt = totals();
    const sum = tt.total + (pickup ? 0 : f.tip);
    $('#checkoutTotals').innerHTML = `
      <div class="totals__row"><span>Товары</span><b>${rubP(tt.subtotal)}</b></div>
      <div class="totals__row"><span>${pickup ? 'Самовывоз' : 'Доставка'}</span><b>${tt.delivery ? rub(tt.delivery) : 'Бесплатно'}</b></div>
      ${f.tip && !pickup ? `<div class="totals__row"><span>Чаевые</span><b>${rub(f.tip)}</b></div>` : ''}
      <div class="totals__row totals__row--total"><span>К оплате</span><b>${rub(sum)}</b></div>`;
    $('#payBtn').innerHTML = `<span class="wa-btn">${typeof TG_BOT_TOKEN !== 'undefined' && TG_BOT_TOKEN ? '' : svgI('whatsapp', 22)}Отправить заказ</span><span>${tt.okLines.some(l => l.p.kg) ? '≈ ' : ''}${rub(sum)}</span>`;
  };
  const drawPay = () => {
    $('#payExtra').innerHTML = f.pay === 'card' ? `<div class="card-form">
        <input name="cardNum" inputmode="numeric" placeholder="Номер карты" maxlength="19" autocomplete="cc-number">
        <div class="row row--2" style="grid-template-columns:1fr 1fr"><input name="cardExp" inputmode="numeric" placeholder="ММ/ГГ" maxlength="5" autocomplete="cc-exp"><input name="cardCvc" inputmode="numeric" placeholder="CVC" maxlength="3" type="password" autocomplete="cc-csc"></div>
      </div>`
      : f.pay === 'cash' ? `<div class="field"><input name="change" inputmode="numeric" placeholder=" "><label>С какой суммы сдача</label></div>` : '';
  };
  drawPay(); drawTotals();
  // фото дома: до 3 штук, хранятся только в памяти до отправки
  const drawPhotos = () => {
    $('#photoList').innerHTML = orderPhotos.map((ph, i) => `<div class="photos__item"><img src="${ph.url}" alt=""><button type="button" data-photo-del="${i}" aria-label="Удалить">${svgI('x', 14)}</button></div>`).join('')
      + (orderPhotos.length < 3 ? `<button type="button" class="photos__add" data-photo-add>${svgI('plus', 22)}<span>Добавить</span></button>` : '');
  };
  if (HOUSE_PHOTOS) drawPhotos();
  checkoutCard = null; orderCardImage({ total: t.total }, t.okLines).then(file => { checkoutCard = file; });
  if (HOUSE_PHOTOS) $('#photoInput').onchange = e => {
    [...e.target.files].slice(0, 3 - orderPhotos.length).forEach(file => orderPhotos.push({ file, url: URL.createObjectURL(file) }));
    if (e.target.files.length > 3) toast('Можно добавить до 3 фото');
    e.target.value = ''; drawPhotos();
  };

  form.onclick = e => {
    const s = e.target.closest('[data-slot]'), p = e.target.closest('[data-pay]'), tp = e.target.closest('[data-tip]');
    if (s) { f.slot = s.dataset.slot; $$('[data-slot]', form).forEach(b => b.classList.toggle('active', b === s)); }
    if (p) { f.pay = p.dataset.pay; $$('[data-pay]', form).forEach(b => b.classList.toggle('active', b === p)); drawPay(); drawTotals(); }
    if (e.target.closest('[data-photo-add]')) { $('#photoInput').click(); return; }
    const del = e.target.closest('[data-photo-del]');
    if (del) { const [ph] = orderPhotos.splice(+del.dataset.photoDel, 1); URL.revokeObjectURL(ph.url); drawPhotos(); return; }
    const kd = e.target.closest('[data-kind]');
    if (kd && kd.dataset.kind !== (f.kind || 'house')) {
      const d = Object.fromEntries(new FormData(form));
      ['street', 'apt', 'entrance', 'floor', 'code', 'zone', 'name', 'phone'].forEach(k => { if (d[k] !== undefined) state.address[k] = d[k]; }); state.address.house = '';
      state.address.kind = kd.dataset.kind;
      state.address.comment = d.comment || '';
      const y = window.scrollY;
      slideKind(kd, () => { openCheckout(); window.scrollTo(0, y); });
      return;
    }
    const sw = e.target.closest('[data-mode-sw]');
    if (sw && sw.dataset.modeSw !== state.mode) {
      const d = Object.fromEntries(new FormData(form));
      state.address = { ...state.address, ...['street', 'house', 'apt', 'entrance', 'floor', 'code', 'zone', 'name', 'phone', 'landmark'].reduce((o, k) => (d[k] !== undefined ? (o[k] = d[k], o) : o), {}) };
      state.mode = sw.dataset.modeSw; openCheckout(); return;
    }
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
    if (!pickup) { if (!data.street?.trim()) err('street', 'Укажите улицу и дом'); else if (!/\d/.test(data.street)) err('street', 'Добавьте номер дома, например: Кадырова, 12'); if (flat && !data.apt?.trim()) err('apt', 'Укажите квартиру'); }
    if (!data.name?.trim()) err('name', 'Укажите имя');
    if ((data.phone || '').replace(/\D/g, '').length !== 11) err('phone', 'Номер полностью');
    if (f.pay === 'card') {
      if ((data.cardNum || '').replace(/\D/g, '').length !== 16) err('cardNum');
      if (!/^(0[1-9]|1[0-2])\/\d\d$/.test(data.cardExp || '')) err('cardExp');
      if ((data.cardCvc || '').length !== 3) err('cardCvc');
    }
    if (first) { first.focus(); toast('Проверьте поля'); return; }

    state.address = { ...state.address, kind: flat ? 'flat' : 'house', name: data.name, phone: data.phone, ...(pickup ? {} : { comment: data.comment || '', street: data.street.trim(), house: '', apt: data.apt, entrance: data.entrance, floor: data.floor, code: data.code, zone: data.zone }) };
    LS.set('address', state.address);
    placeOrder({ ...f, ...data, pickup, kind: flat ? 'flat' : 'house' });
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

// Заказ уходит продавцу в WhatsApp готовым сообщением (без сервера)
let orderPhotos = [], sentPhotos = [], sentCard = null, checkoutCard = null;
// Фото дома и отправка файлами — включим, когда будет сервер (тогда всё уйдёт одним сообщением автоматически)
const HOUSE_PHOTOS = true, SHARE_FILES = false;   // фото дома: в форме и после отправки (для «Отправить фото»)
function orderMessage(o, f, t, withFiles) {
  const L = [], line = '━━━━━━━━━━━━━━';
  const kg = t.okLines.some(l => l.p.kg);
  L.push(`🛒 *ЗАКАЗ №${o.id}*`);
  L.push(line);
  L.push('👤 *КЛИЕНТ*');
  L.push(f.name.trim());
  L.push(`📞 ${f.phone}`);
  L.push('');
  if (f.pickup) L.push('🏪 *САМОВЫВОЗ*');
  else {
    L.push(`📍 *АДРЕС* — ${f.kind === 'flat' ? 'квартира / офис' : 'частный дом'}`);
    L.push(o.address);
    if (f.zone) L.push(`Район: ${f.zone}`);
    if (f.kind === 'flat') {
      const extra = [f.entrance && `подъезд ${f.entrance}`, f.floor && `этаж ${f.floor}`, f.code && `домофон ${f.code}`].filter(Boolean).join(' · ');
      if (extra) L.push(extra);
    }
    if (f.comment?.trim()) L.push(`💬 ${f.comment.trim()}`);
    if (f.leave) L.push('🚪 Оставить у двери');
    if (f.noCall) L.push('🔕 Не звонить в домофон');
  }
  L.push('');
  const slot = f.slot === 'asap' ? 'как можно скорее' : new Date(f.slot).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  L.push(`🕐 *Время:* ${slot}`);
  L.push(`💳 *Оплата:* ${payLabel(f.pay)}${f.pay === 'cash' && f.change ? `, сдача с ${f.change} ₽` : ''}`);
  L.push(`🔁 *Нет товара:* ${({ call: 'позвонить и согласовать', similar: 'заменить на похожий', remove: 'убрать из заказа' })[f.replace] || 'позвонить'}`);
  L.push(line);
  L.push(`📦 *ТОВАРЫ — ${t.okLines.length} поз.*`);
  L.push('');
  t.okLines.forEach((l, k) => {
    L.push(`*${k + 1}.* ${l.p.name}`);
    L.push(`      ${fmtQty(l.p, l.qty)} × ${rubP(l.p.price)}${l.p.kg ? '/кг' : ''} = *${l.p.kg ? '≈' : ''}${rub(l.sum)}*`);
  });
  L.push(line);
  L.push(`Товары: ${kg ? '≈' : ''}${rub(t.subtotal)}`);
  if (!f.pickup) L.push(`Доставка: ${t.delivery ? rub(t.delivery) : 'бесплатно'}`);
  if (f.tip && !f.pickup) L.push(`Чаевые: ${rub(f.tip)}`);
  L.push(`💰 *ИТОГО: ${kg ? '≈' : ''}${rub(o.total)}*`);
  if (!withFiles) { L.push(''); L.push('🖼 *Фото всех товаров:*'); L.push(orderViewLink(o)); }   // только в запасном WhatsApp — там фото не прикрепить
  return L.join('\n');
}

/* Картинка заказа: фото товаров со списком — одной картинкой, чтобы продавцу было видно, что брать */
async function orderCardImage(order, lines) {
  const W = 1080, PAD = 48, ROW = 156, HEAD = 190, FOOT = 150;
  const H = HEAD + lines.length * ROW + FOOT;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (w, sz) => `${w} ${sz}px Onest, system-ui, -apple-system, sans-serif`;
  const load = src => new Promise(res => { if (!src) return res(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; setTimeout(() => res(null), 8000); });
  const imgs = await Promise.all(lines.map(l => load(l.p.img).then(im => im || load(`assets/icons/${l.p.icon}.webp`))));
  g.fillStyle = '#EEEDE8'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0033B0'; g.fillRect(0, 0, W, HEAD - 30);
  g.fillStyle = '#fff'; g.font = font(800, 56); g.fillText(order.id ? `Заказ №${order.id}` : 'Заказ', PAD, 92);
  g.font = font(500, 30); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText([`${lines.length} поз.`, order.address].filter(Boolean).join(' · ').slice(0, 60), PAD, 138);
  const clip = (t, max) => { if (g.measureText(t).width <= max) return t; while (t.length && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
  lines.forEach((l, k) => {
    const y = HEAD + k * ROW;
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(PAD - 16, y, W - 2 * PAD + 32, ROW - 16, 26); g.fill();
    const im = imgs[k], box = 116, bx = PAD, by = y + 12;
    if (im) { const r = Math.min(box / im.width, box / im.height); g.drawImage(im, bx + (box - im.width * r) / 2, by + (box - im.height * r) / 2, im.width * r, im.height * r); }
    g.fillStyle = '#0E1433'; g.font = font(800, 30); g.fillText(`${k + 1}.`, bx + box + 22, y + 52);
    g.font = font(600, 30); const nx = bx + box + 70; g.fillText(clip(l.p.name, W - nx - PAD - 10), nx, y + 52);
    g.font = font(500, 28); g.fillStyle = '#4B5170'; g.fillText(`${fmtQty(l.p, l.qty)} × ${rubP(l.p.price)}${l.p.kg ? '/кг' : ''}`, nx, y + 100);
    g.font = font(800, 32); g.fillStyle = '#0033B0'; const sum = `${l.p.kg ? '≈' : ''}${rub(l.sum)}`; g.fillText(sum, W - PAD - g.measureText(sum).width, y + 100);
  });
  const fy = HEAD + lines.length * ROW + 30;
  g.fillStyle = '#0E1433'; g.font = font(800, 44); g.fillText(`Итого: ${lines.some(l => l.p.kg) ? '≈' : ''}${rub(order.total)}`, PAD, fy + 50);
  g.font = font(500, 26); g.fillStyle = '#8E92A6'; g.fillText('MayrMarket · с доставкой', PAD, fy + 92);
  try {
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return blob ? new File([blob], `zakaz${order.id ? "-" + order.id : ""}.jpg`, { type: 'image/jpeg' }) : null;
  } catch { return null; }   // если какая-то картинка без разрешения — без карточки, только фото дома
}
// Ссылка на страницу заказа с фото товаров (в ссылке только товары и количество, без личных данных)
const orderViewLink = o => `${location.origin}${location.pathname}#/z/${o.id}/${o.items.map(i => `${i.id.slice(1)}:${i.qty}`).join(',')}`;
const waLink = text => `https://wa.me/${ORDER_WHATSAPP}?text=${encodeURIComponent(text)}`;

/* Отправка заказа.
   Если чат с продавцом у клиента уже есть (не первый заказ) — всё одним действием:
   «Поделиться» → WhatsApp → чат продавца, и уходят текст + картинка заказа + фото дома.
   Первый заказ: чата ещё нет, поэтому открываем чат по ссылке (только текст), а фото — вторым шагом. */
/* ===== Отправка заказа в Telegram через бота (прямо из браузера, без сервера) ===== */
const tgHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1<i>$2</i>');
async function tgCall(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram ${r.status}`);
  return j;
}
async function sendOrderTelegram(text, files) {
  for (const chat of TG_CHATS) {
    if (files.length === 1) {
      const fd = new FormData(); fd.append('chat_id', chat); fd.append('photo', files[0], files[0].name || 'photo.jpg');
      await tgCall('sendPhoto', fd);
    } else if (files.length > 1) {
      const fd = new FormData(); fd.append('chat_id', chat);
      fd.append('media', JSON.stringify(files.map((_, i) => ({ type: 'photo', media: `attach://f${i}` }))));
      files.forEach((f, i) => fd.append(`f${i}`, f, f.name || `photo${i}.jpg`));
      await tgCall('sendMediaGroup', fd);
    }
    const fd = new FormData(); fd.append('chat_id', chat); fd.append('text', tgHtml(text)); fd.append('parse_mode', 'HTML');
    fd.append('link_preview_options', JSON.stringify({ is_disabled: true }));
    await tgCall('sendMessage', fd);
  }
}

function placeOrder(f) {
  const t = totals();
  const d = new Date(), id = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getTime()).slice(-3)}`;
  const order = {
    id, createdAt: Date.now(), point: state.point, mode: f.pickup ? 'pickup' : 'delivery', via: 'wa',
    items: t.okLines.map(l => ({ id: l.p.id, name: l.p.name, qty: l.qty, price: l.p.price, offers: l.p.offers })),
    total: t.total + (f.pickup ? 0 : f.tip), pay: f.pay, slot: f.slot,
    address: f.pickup ? 'Самовывоз' : `${f.street.trim()}${f.kind === 'flat' && f.apt ? ', кв. ' + f.apt : ''}`
  };
  const photos = orderPhotos.map(ph => ph.file);
  const files = [checkoutCard, ...photos].filter(Boolean);
  const finish = oneStep => {
    sentPhotos = oneStep ? [] : photos; orderPhotos = [];
    sentCard = oneStep ? null : checkoutCard;
    order.oneStep = oneStep;
    state.orders.unshift(order);
    t.okLines.forEach(l => delete state.cart[l.p.id]);
    LS.set('waKnown', true);
    save();
    location.hash = '#/orders';
    setTimeout(() => openTracking(order.id), 60);
  };
  if (typeof TG_BOT_TOKEN !== 'undefined' && TG_BOT_TOKEN && TG_CHATS.length) {
    const btn = $('#payBtn'); btn.disabled = true; btn.innerHTML = '<span>Отправляем заказ…</span>';
    (async () => {
      const card = checkoutCard || await orderCardImage(order, t.okLines);
      const fl = [card, ...photos].filter(Boolean).slice(0, 10);
      sentPhotos = photos; order.text = orderMessage(order, f, t, true);
      await sendOrderTelegram(order.text, fl);
      order.via = 'tg'; finish(true);
    })().catch(err => {
      console.warn('Telegram:', err);
      btn.disabled = false;
      // запасной путь: WhatsApp (только текст)
      sentPhotos = photos; order.text = orderMessage(order, f, t, false);
      toast('Не удалось отправить напрямую — открываем WhatsApp');
      finish(false);
      setTimeout(() => { location.href = waLink(order.text); }, 700);
    });
    return;
  }
  if (SHARE_FILES && LS.get('waKnown', false) && files.length && navigator.canShare && navigator.canShare({ files })) {
    sentPhotos = photos; order.text = orderMessage(order, f, t, true);
    navigator.share({ files, text: order.text })
      .then(() => finish(true))
      .catch(e => { if (e && e.name !== 'AbortError') toast('Не получилось отправить, попробуйте ещё раз'); });
    return;
  }
  sentPhotos = photos; order.text = orderMessage(order, f, t, false);
  const url = waLink(order.text);
  const win = window.open(url, '_blank');   // в обработчике нажатия — браузер разрешает
  finish(false);
  if (!win) location.href = url;
}

/* ================= Страница заказа с фото (по ссылке из WhatsApp) ================= */
function renderOrderView() {
  const [, id = '', list = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const lines = list.split(',').map(x => x.split(':')).map(([pid, q]) => ({ p: byId['p' + pid], qty: +q })).filter(l => l.p && l.qty > 0);
  const sum = lines.reduce((a, l) => a + Math.round(l.p.price * l.qty), 0), kg = lines.some(l => l.p.kg);
  $('#page').innerHTML = `
    <div class="zv">
      <div class="zv__head"><h1>Заказ №${esc(id)}</h1><span>${lines.length} поз. · товары ${kg ? '≈' : ''}${rub(sum)}</span></div>
      ${lines.map((l, k) => `<div class="zv__item">
        <div class="zv__img">${l.p.imgLarge ? `<img src="${l.p.imgLarge}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/icons/${l.p.icon}.webp';this.style.cssText='width:60%;height:60%'">` : ic(l.p.icon, '')}</div>
        <div class="zv__info">
          <div class="zv__name"><b>${k + 1}.</b> ${esc(l.p.name)}</div>
          <div class="zv__qty">${fmtQty(l.p, l.qty)} × ${rubP(l.p.price)}${l.p.kg ? '/кг' : ''}</div>
          <div class="zv__sum">${l.p.kg ? '≈' : ''}${rub(Math.round(l.p.price * l.qty))}</div>
          <div class="zv__shop">${esc(STORES[l.p.offers[0][0]].name)}</div>
        </div>
      </div>`).join('')}
    </div>`;
}

/* ================= Tracking ================= */
let trackTimer = null;
function openTracking(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  if (o.via === 'tg') {
    const m = $('#modal');
    m.className = 'modal show';
    m.innerHTML = `
      <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
      <div class="success">
        <span class="success__icon">${svgI('check', 56)}</span>
        <h2>Заказ №${o.id} отправлен</h2>
        <p>Продавец уже получил заказ. Он проверит наличие и свяжется с вами${o.pay === 'sbp' ? ' — пришлёт оплату по СБП' : ''}.</p>
        <div class="totals" style="margin-top:14px;text-align:left">
          <div class="totals__row"><span>Адрес</span><b>${esc(o.address)}</b></div>
          <div class="totals__row"><span>Оплата</span><b>${payLabel(o.pay)}</b></div>
          <div class="totals__row totals__row--total"><span>Сумма</span><b>${rub(o.total)}</b></div>
        </div>
        <div class="row row--2" style="margin-top:12px">
          <a class="btn btn--ghost" href="#/orders">Мои заказы</a>
          <button class="btn btn--primary" data-close>Продолжить</button>
        </div>
      </div>`;
    showOverlay();
    return;
  }
  if (o.via === 'wa') {
    const m = $('#modal');
    m.className = 'modal show';
    m.innerHTML = `
      <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
      <div class="success">
        <span class="success__icon success__icon--wa">${svgI('whatsapp', 56)}</span>
        <h2>Заказ №${o.id}</h2>
        <p>В WhatsApp открылся ваш заказ — нажмите там «Отправить». Продавец подтвердит наличие и пришлёт ${o.pay === 'sbp' ? 'ссылку для оплаты по СБП' : 'время доставки'}.</p>
        <div class="totals" style="margin-top:14px;text-align:left">
          <div class="totals__row"><span>${o.mode === 'pickup' ? 'Получение' : 'Адрес'}</span><b>${esc(o.address)}</b></div>
          <div class="totals__row"><span>Оплата</span><b>${payLabel(o.pay)}</b></div>
          <div class="totals__row totals__row--total"><span>Сумма</span><b>${rub(o.total)}</b></div>
        </div>
        ${SHARE_FILES && o.id === state.orders[0]?.id && !o.oneStep ? `<button class="btn btn--primary btn--block wa-open" data-share-photos>${svgI('whatsapp', 20)}Шаг 2: отправить фото товаров${sentPhotos.length ? ` и дома (${sentPhotos.length})` : ''}</button>
        <div class="checkout__hint" style="text-align:center">Выберите WhatsApp, затем чат продавца</div>` : ''}
        <a class="btn btn--ghost btn--block wa-again" style="margin-top:10px" href="${waLink(o.text || `Заказ №${o.id}`)}" target="_blank" rel="noopener">${svgI('whatsapp', 20)}Открыть WhatsApp ещё раз</a>
        <div class="row row--2" style="margin-top:8px">
          <a class="btn btn--ghost" href="#/orders">Мои заказы</a>
          <button class="btn btn--ghost" data-close>Продолжить</button>
        </div>
      </div>`;
    showOverlay();
    return;
  }
  const pt = POINTS.find(p => p.id === o.point) || POINTS[0];
  const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
  const m = $('#modal');
  const draw = () => {
    const st = orderStage(o);
    const scheduled = o.slot && o.slot !== 'asap' && st === 0;
    m.innerHTML = `
      <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
      <div class="success">
        <span class="success__icon">${svgI(steps[st][0], 56)}</span>
        <h2>Заказ №${o.id}</h2>
        <p>${scheduled ? `Доставим ${new Date(o.slot).toLocaleString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : `${steps[st][1]} · ${o.address}`}</p>
        <div class="track">${steps.map((s, i) => `<div class="track__step ${i < st ? 'done' : i === st ? 'cur' : ''}"><span class="track__dot">${svgI(s[0], 18)}</span>${s[1]}</div>`).join('')}</div>
        ${o.mode !== 'pickup' && st === 2 ? `<div class="courier"><span class="courier__ava">${svgI('moped', 24)}</span><div style="flex:1"><div class="courier__name">Курьер Ислам</div><div class="courier__meta">Будет через ~${Math.max(3, 15 - Math.round((Date.now() - o.createdAt) / 6000))} мин</div></div><a class="btn btn--ghost btn--sm" href="tel:+${pt.phone.replace(/\D/g, '')}">Позвонить</a></div>` : ''}
        <div class="totals" style="margin-top:18px;text-align:left">
          
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
    if (!byId[i.id]) { missing++; return; }
    const s = maxOf(byId[i.id]);
    const q = Math.min(s, stepQty(byId[i.id], (state.cart[i.id] || 0) + i.qty));
    if (q > 0) state.cart[i.id] = q;
    if (s < i.qty) missing++;
  });
  save(); renderAll(); openCart();
  toast(missing ? `${missing} ${plural(missing, 'товара', 'товаров', 'товаров')} не хватает на складе` : 'Добавлено в корзину');
}

/* ================= Overlays ================= */
/* Блокировка прокрутки фона (надёжно и на iPhone): фон не двигается, позиция сохраняется */
const scrollLocks = new Set(); let lockedY = 0;
function lockScroll(why) {
  if (!scrollLocks.size) {
    lockedY = window.scrollY;
    Object.assign(document.body.style, { position: 'fixed', top: -lockedY + 'px', left: '0', right: '0', width: '100%' });
    document.body.classList.add('locked');
  }
  scrollLocks.add(why);
}
function unlockScroll(why) {
  if (!scrollLocks.delete(why) || scrollLocks.size) return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' });
  document.body.classList.remove('locked');
  window.scrollTo(0, lockedY);
}
function showOverlay() { $('#overlay').classList.add('show'); lockScroll('overlay'); }
function closeAll() {
  $('#modal').classList.remove('show');
  $('#modal').onclick = null;
  $('#overlay').classList.remove('show');
  unlockScroll('overlay');
  clearInterval(trackTimer);
}
function openCart() {
  closeAll();
  if (state.route === 'cart') { renderPage(); window.scrollTo(0, 0); }
  else location.hash = '#/cart';
}
function renderCartPage() {
  $('#page').innerHTML = `<div class="cart-page">${cartHTML()}</div>`;
}

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${msg}</span>${action ? `<button>${action.label}</button>` : ''}`;
  // плавное исчезновение: сообщение уезжает вниз и тает, потом удаляется
  const hide = () => { if (el.classList.contains('hide')) return; el.classList.add('hide'); setTimeout(() => el.remove(), 320); };
  if (action) el.querySelector('button').onclick = () => { action.fn(); hide(); };
  const box = $('#toasts');
  box.appendChild(el);
  [...box.children].slice(0, -2).forEach(old => old.classList.contains('hide') || (old.classList.add('hide'), setTimeout(() => old.remove(), 320)));
  setTimeout(hide, action ? 4000 : 2400);
}

/* ================= Events ================= */
function goCatalog(cat) {
  if (state.route === 'catalog') rememberScroll();
  state.cat = cat; state.sub = null; state.dd = null;
  state.query = ''; $('#searchInput').value = '';
  const m = scrollMem[pageKey()]; state.limit = m ? m.limit : 60;   // раздел, где уже были, открывается на том же месте
  if (state.route !== 'catalog') { location.hash = '#/'; return; }
  renderPage();
  restoreScroll();
}

document.addEventListener('click', e => {
  const el = s => e.target.closest(s);
  let x;
  if (state.dd && !el('.dd')) { state.dd = null; renderControls(); }
  if ((x = el('[data-add]'))) return setQty(x.dataset.add, firstOf(byId[x.dataset.add]));
  if ((x = el('[data-inc]'))) return setQty(x.dataset.inc, Math.round(((state.cart[x.dataset.inc] || 0) + stepOf(byId[x.dataset.inc])) * 10) / 10);
  if ((x = el('[data-kg]'))) { const [id, kg] = x.dataset.kg.split(':'); return setQty(id, +kg); }
  if ((x = el('[data-dec]'))) {
    const id = x.dataset.dec, cur = state.cart[id] || 0, q = Math.max(0, Math.round((cur - stepOf(byId[id])) * 10) / 10);
    setQty(id, q);
    if (q === 0) toast('Удалено из корзины', { label: 'Вернуть', fn: () => setQty(id, cur) });
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
  if ((x = el('[data-filter]'))) {
    const f = x.dataset.filter;
    state.filters.has(f) ? state.filters.delete(f) : state.filters.add(f);
    state.limit = 60;
    renderControls(); return renderCatalog();
  }
  if ((x = el('[data-sub]'))) {
    state.sub = x.dataset.sub || null; state.limit = 60; state.dd = null;
    renderControls(); return renderCatalog();
  }
  if ((x = el('[data-sort]'))) {
    state.sort = x.dataset.sort; state.limit = 60; state.dd = null;
    renderControls(); return renderCatalog();
  }
  if (el('[data-dd-close]')) { state.dd = null; return renderControls(); }
  if ((x = el('[data-dd]'))) { state.dd = state.dd === x.dataset.dd ? null : x.dataset.dd; return renderControls(); }

  if ((x = el('[data-track]'))) return openTracking(x.dataset.track);
  if (el('[data-share-photos]')) {
    const files = [sentCard || checkoutCard, ...sentPhotos].filter(Boolean);
    if (!files.length) { toast('Картинка заказа ещё готовится, нажмите через секунду'); return; }
    if (navigator.canShare && navigator.canShare({ files })) navigator.share({ files }).catch(() => {});
    else toast('Ваш браузер не умеет отправлять фото — прикрепите их в WhatsApp вручную');
    return;
  }
  if ((x = el('[data-repeat]'))) return repeatOrder(x.dataset.repeat);
  if (el('[data-close]')) return closeAll();

  if ((x = el('[data-action]'))) {
    const a = x.dataset.action;
    if (a === 'open-points') openPoints();
    if (a === 'back') { history.length > 1 && document.referrer !== undefined ? history.back() : (location.hash = '#/'); }
    if (a === 'login') location.hash = '#/login';
    if (a === 'logout') { state.user = null; LS.set('user', null); renderPage(); toast('Вы вышли из аккаунта'); }
    if (a === 'more') { state.limit += 60; const y = window.scrollY; renderCatalog(); window.scrollTo(0, y); }
    if (a === 'open-cart') openCart();
    if (a === 'clear-cart') {
      const backup = { ...state.cart };
      state.cart = {}; save(); renderAll();
      toast('Корзина очищена', { label: 'Вернуть', fn: () => { state.cart = backup; save(); renderAll(); } });
    }
    if (a === 'remove-bad') { cartLines().filter(l => !l.ok).forEach(l => l.avail ? state.cart[l.p.id] = l.avail : delete state.cart[l.p.id]); save(); renderAll(); }
    if (a === 'checkout') openCheckout();
    if (a === 'reset') { state.filters.clear(); state.sub = null; state.query = ''; $('#searchInput').value = ''; goCatalog('all'); }
    if (a === 'clear-favs') {
      const backup = [...state.favs];
      state.favs = []; save(); renderPage();
      toast('Избранное очищено', { label: 'Вернуть', fn: () => { state.favs = backup; save(); renderPage(); } });
    }
    if (a === 'favs-to-cart') {
      let n = 0;
      state.favs.forEach(id => { const p = byId[id]; if (p && maxOf(p) > 0 && !state.cart[id]) { state.cart[id] = firstOf(p); n++; } });
      save(); renderAll();
      toast(n ? `Добавлено ${n} ${plural(n, 'товар', 'товара', 'товаров')}` : 'Всё уже в корзине');
    }
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'sortSelect') { state.sort = e.target.value; state.limit = 60; renderCatalog(); }
  if (e.target.id === 'favSort') { state.favSort = e.target.value; renderFavorites(); }
});
$('#overlay').addEventListener('click', closeAll);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); if (state.dd) { state.dd = null; renderControls(); } } });

let searchT;
/* Шапка как у Ozon: синяя карточка «прилипает» к верху (position: sticky) так,
   что видна только строка поиска; верхняя строка уезжает, товары уходят под карточку.
   Здесь только считаем, на сколько карточке можно уехать вверх. */
(() => {
  if (typeof STICKY_HEADER === 'undefined' || !STICKY_HEADER) return;
  document.body.classList.add('sticky-header');
  const top = $('.top'), slot = top.querySelector('.search-slot');
  const fit = () => top.style.setProperty('--stick', -(slot.offsetTop - 12) + 'px');
  fit();
  // тень у шапки только когда она прилипла и под ней уходят товары
  let stuck = false;
  const onScroll = () => { const v = window.scrollY > (slot.offsetTop - 14); if (v !== stuck) { stuck = v; top.classList.toggle('top--stuck', v); } };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', () => setTimeout(fit, 0));
  if (document.fonts) document.fonts.ready.then(fit);
})();
$('#searchInput').addEventListener('input', e => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    state.query = e.target.value.trim();
    state.limit = 60;
    if (state.query) { state.cat = 'all'; state.sub = null; }
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
window.__CATALOG_OK = PRODUCTS.length;
})();
