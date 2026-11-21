// Runs only on a fresh simulator. Use the live site's controls, intercept the order receipt here.
const chapters = [];
let scene = 'start';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = title => { scene = title; chapters.push({ title, time: Date.now() }); };
async function find(selector) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const element = document.querySelector(selector);
        if (element) return element;
        await pause(180);
    }
    throw Error('Missing ' + selector + ' in ' + scene);
}
async function show(selector) {
    const el = await find(selector);
    if (!el.closest('.tabbar') && !el.closest('.modal') && el.getBoundingClientRect().height < innerHeight) {
        const rect = el.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > innerHeight - 80) {
            el.scrollIntoView({block: 'center', behavior: 'smooth'});
            await pause(580);
        }
    }
    return el;
}
async function tap(selector) {
    const el = await show(selector);
    if (el.disabled) throw Error('Disabled ' + selector);
    el.click();
    await pause(1050);
}
function fill(selector, value) {
    const el = document.querySelector(selector);
    el.value = value;
    el.dispatchEvent(new Event('input', {bubbles: true}));
}
const nav = name => tap('.tabbar [data-nav="' + name + '"]');
const back = () => tap('#page [data-action=back]');
try {
    const realFetch = window.fetch.bind(window);
    let demoOrder = false;
    window.fetch = async (resource, options) => {
        const method = (options?.method || resource?.method || 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD') return realFetch(resource, options);
        if (method === 'POST' && new URL(resource, location.href).pathname === '/orders' &&
            options.body instanceof FormData && options.body.has('photo') && options.body.has('message')) {
            demoOrder = true;
            return Response.json({ received: 1 });
        }
        throw Error('External write disabled during recording');
    };
    await find('#catalog .card');
    await document.fonts.ready;
    const fontLoaded = [...document.fonts].some(face => face.family.includes('Onest') && face.status === 'loaded');
    if (!fontLoaded) throw Error('Onest failed to load');
    stamp('Главная'); await pause(2500);
    await tap('[data-action=open-points]'); stamp('Выбор магазина'); await pause(1250);
    await tap('[data-store="1"]'); await tap('[data-confirm-point]');
    await tap('[data-action=open-points]'); await tap('[data-store="0"]'); await tap('[data-confirm-point]');
    await tap('#catStrip [data-cat=veg]'); stamp('Категории и фильтры');
    await tap('[data-dd=sub]'); await tap('button[data-dd-close]');
    await tap('[data-dd=flt]'); await tap('[data-filter=photo]'); await tap('button[data-dd-close]');
    await tap('[data-dd=sort]'); await tap('[data-sort=asc]');
    fill('#searchInput', 'апельсин'); await pause(1500);
    await tap('#catalog .card__name[data-open]'); stamp('Карточка товара');
    await find('.pm__buy'); await pause(1600);
    (await find('.pm__buy')).scrollIntoView({block:'center',behavior:'smooth'}); await pause(900);
    await tap('.pm__fav'); await tap('.pm__buy [data-add]'); await tap('#modal [data-close]');
    await nav('favorites'); stamp('Избранное'); await find('.fav-summary'); await pause(1300);
    await nav('account'); stamp('Аккаунт');
    await tap('[data-action=login]'); await tap('[data-auth-tab=register]'); await back();
    await tap('#page a[href="#/address"]'); stamp('Адрес доставки');
    await tap('#addrForm [data-kind=flat]'); await tap('#addrForm [data-kind=house]');
    fill('#addrForm [name=street]', 'Примерная, 1'); fill('#addrForm textarea', 'Позвонить у входа');
    await tap('#addrForm button[type=submit]');
    await tap('#page a[href="#/settings"]'); await tap('#darkSwitch'); await pause(1300); await tap('#darkSwitch'); await back();
    await tap('#page a[href="#/about"]'); await back();
    await tap('#page a[href="#/orders"]'); await back();
    await nav('cart'); stamp('Корзина'); await find('.cart-item__img'); await pause(1500);
    await tap('[data-action=checkout]'); await find('#checkoutForm'); stamp('Оформление заказа'); await pause(1500);
    fill('#checkoutForm [name=name]', 'Покупатель'); fill('#checkoutForm [name=phone]', '+7 (000) 000-00-00');
    await tap('[data-slot=custom]'); 
    const day = await find('[name=deliveryDay]');
    if (day.options.length > 1) { day.selectedIndex = 1; day.dispatchEvent(new Event('change', {bubbles:true})); }
    await pause(1400); await tap('[data-pay=cash]'); await tap('[data-pay=sbp]');
    await tap('.toggle input[name=leave]'); await show('#payBtn'); stamp('Итог заказа'); await pause(1600);
    await tap('#payBtn'); await find('#modal .success');
    if (!demoOrder) throw Error('Missing simulated receipt');
    stamp('Подтверждение'); await pause(1800); await tap('#modal button[data-close]');
    await find('[data-track]'); stamp('Мои заказы'); await tap('[data-track]'); await tap('#modal button[data-close]');
    await tap('[data-repeat]'); await pause(1000); await nav('catalog');
    return JSON.stringify({ok:true, chapters, fontLoaded, items: window.CATALOG.items.length, end:Date.now()});
} catch(error) { return JSON.stringify({ok:false, scene, error:String(error), chapters}); }
