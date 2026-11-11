// Параметры доставки задаёт владелец сервиса. minOrder: 0 — без минимальной суммы заказа.
const STORES = window.CATALOG.meta.stores;
const POINTS = [
  {
    id: 'grz', city: 'Грозный', store: STORES.map(s => s.name).join(', '), address: 'Грозный',
    hours: [9, 21], eta: '60–90 мин', minOrder: 0, deliveryFee: 200, freeFrom: 3000,
    phone: '', x: 262, y: 118,
    zones: ['Ахматовский', 'Байсангуровский', 'Висаитовский', 'Шейх-Мансуровский']
  }
];

const CATEGORIES = window.CATALOG.cats.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, subs: c.subs }));

const PRODUCTS = (() => {
  const N = window.CATALOG.items.length;
  const catMap = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  return window.CATALOG.items.map(([id, name, price, cat, sub, img, kg, qty, offers, imgL, old], rank) => {
    const c = catMap[cat];
    if (!img) { const own = (offers || []).map(f => (window.PHOTOS || {})[f[0] + ':' + f[1]]).find(Boolean); if (own) { img = own; imgL = own; } }
    const subName = sub == null ? null : c.subs[sub];
    return {
      id: 'p' + id, cat, sub: subName, name, price, oldPrice: old || 0,
      icon: c.icon, img: img || null, imgLarge: imgL || img || null,
      unit: kg ? 'за 1 кг' : '', kg: !!kg,
      stock: { grz: qty }, popularity: N - rank, offers,
      search: (name + ' ' + c.name + ' ' + (subName || '')).toLowerCase().replace(/ё/g, 'е')
    };
  });
})();
