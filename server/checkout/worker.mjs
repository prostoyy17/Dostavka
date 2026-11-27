const base = 'https://prostoyy17.github.io/Dostavka/';
async function deliver(token, chat, files, message, timing) {
  async function send(method, form) {
    form.set('chat_id',chat);
    const start = Date.now();
    try {
    const r = await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
    if (!r.ok || !(await r.json()).ok) throw Error('Telegram delivery failed');
    } finally { if (timing) timing.push({method, start, end:Date.now()}); }
  }
  const album=new FormData();
  if (files.length===1) {
    album.set('photo',files[0]); await send('sendPhoto',album);
  } else {
    album.set('media',JSON.stringify(files.map((_,i)=>({type:'photo',media:'attach://photo'+i}))));
    files.forEach((f,i)=>album.set('photo'+i,f));
    await send('sendMediaGroup',album);
  }
  for(const part of message.match(/[\s\S]{1,3900}/gu)) {
    const text=new FormData(); text.set('text',part.replace(/\*/g,'')); text.set('link_preview_options','{"is_disabled":true}');
    await send('sendMessage',text);
  }
}
// A short burst limit per client and isolate, bounded in memory.
const recent = new Map();
function withinLimit(ip) {
  const now = Date.now();
  for (const [key, bucket] of recent) if (bucket.until <= now) recent.delete(key);
  const bucket = recent.get(ip) || {count: 0, until: now + 60000};
  if (bucket.count >= 5 || recent.size >= 3000) return false;
  bucket.count++;
  recent.set(ip, bucket);
  return true;
}
export default {
 async fetch(req,env) {
  const entered=Date.now();
  const url=new URL(req.url);
  const reserve = ['/order-number', '/ios/order-number'].includes(url.pathname);
  const native = ['/ios/orders', '/ios/order-number'].includes(url.pathname);
  if(reserve || native || url.pathname === '/orders') {
    const origin = req.headers.get('Origin');
    const headers = {'Cache-Control':'no-store'};
    if (native) {
      // A public guest checkout for the native app. Browser requests use /orders.
      if (origin !== null || req.headers.get('X-Mayr-Client') !== 'ios') {
        return new Response(null,{status:403,headers});
      }
    } else {
      if (origin !== 'https://prostoyy17.github.io' && origin !== url.origin) return new Response(null,{status:403});
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
      if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
    }
    if (req.method !== 'POST') return new Response(null,{status:405,headers});
    if (reserve) {
      if (!withinLimit('number:' + (req.headers.get('CF-Connecting-IP') || 'unknown'))) return new Response(null, {status:429, headers});
      // Conditional creation is atomic across workers. Keep reservations permanently.
      for (let attempt = 0; attempt < 12; attempt++) {
        const digits = attempt < 6 ? 6 : 8;
        const range = 9 * 10 ** (digits - 1);
        const number = String(10 ** (digits - 1) + crypto.getRandomValues(new Uint32Array(1))[0] % range);
        const saved = await env.BUCKET.put('order-numbers/' + number, '', {onlyIf: {etagDoesNotMatch: '*'}});
        if (saved) return Response.json({number}, {headers});
      }
      return new Response(null, {status:503, headers});
    }
    if (!req.headers.get('content-type')?.startsWith('multipart/form-data;')) return new Response(null,{status:415,headers});
    if (!withinLimit(req.headers.get('CF-Connecting-IP') || 'unknown')) return new Response(null,{status:429,headers});
    if(Number(req.headers.get('content-length'))>12000000)return new Response(null,{status:413});
    const parseStart=Date.now();
    const form=await req.formData(), message=form.get('message'), files=form.getAll('photo');
    if(typeof message!=='string'||!message.startsWith('🛒 *ЗАКАЗ №')||message.length>30000||files.length<1||files.length>4||files.some(f=>typeof f==='string'||f.type!=='image/jpeg'||f.size>8000000))return new Response(null,{status:400,headers});
    const parsed=Date.now();
    const measure=message.includes('ТЕСТ ЗАМЕРА — НЕ СОБИРАТЬ');
    const chats=env.CHAT_IDS.split(',');
    const deliveries=measure ? chats.map(()=>[]) : [];
    const results=await Promise.allSettled(chats.map((chat,i)=>deliver(env.TELEGRAM_BOT_TOKEN,chat,files,message,deliveries[i])));
    return Response.json({received:results.filter(r=>r.status==='fulfilled').length,...(measure ? {timing:{entered,parseStart,parsed,finished:Date.now(),deliveries,status:results.map(r=>r.status)}} : {})},{headers});
  }
  if(url.pathname==='/') return Response.redirect(base,302);
  return new Response(null,{status:404});
 }
};
