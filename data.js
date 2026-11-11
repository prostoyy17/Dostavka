// Магазин-источник ассортимента и параметры доставки.
// Параметры доставки (часы, время, суммы) — значения по умолчанию, их задаёт владелец сервиса.
const POINTS = [
  {
    id: 'msf', city: 'Грозный', store: 'Musafir Market', address: 'ул. Сайханова, 101а',
    hours: [9, 21], eta: '60–90 мин', minOrder: 0, deliveryFee: 200, freeFrom: 3000,
    phone: '+7 (965) 952-54-34', x: 262, y: 118,
    zones: ['Ахматовский', 'Байсангуровский', 'Висаитовский', 'Шейх-Мансуровский']
  }
];

const CATEGORIES = window.CATALOG.cats.map(c => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, subs: c.subs }));

const PRODUCTS = (() => {
  const base = window.CATALOG.meta.imgBase;
  const N = window.CATALOG.items.length;
  return window.CATALOG.items.map(([id, name, price, cat, sub, img, kg, qty, link, old], rank) => {
    const c = CATEGORIES.find(x => x.id === cat);
    return {
      id: 'm' + id, cat, sub: sub == null ? null : c.subs[sub], name, price, oldPrice: old || 0,
      icon: c.icon, img: img ? base + img.replace('/~', '/medium_') : null,
      imgLarge: img ? base + img.replace('/~', '/large_') : null,
      unit: kg ? 'за 1 кг' : '', kg: !!kg,
      stock: { msf: qty }, popularity: N - rank, link,
      search: (name + ' ' + c.name + ' ' + (sub == null ? '' : c.subs[sub])).toLowerCase().replace(/ё/g, 'е')
    };
  });
})();
