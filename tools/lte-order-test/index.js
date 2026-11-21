'use strict';
const { timingSafeEqual, createHash } = require('node:crypto');
const origin = 'https://prostoyy17.github.io';
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'Content-Type, X-Test-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store', Vary: 'Origin'
};
const reply = (statusCode, data) => ({ statusCode, headers, body: JSON.stringify(data) });
const digest = value => createHash('sha256').update(value).digest();

exports.handler = async event => {
  const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(), v]));
  if (h.origin !== origin) return reply(403, {});
  if (event.httpMethod === 'OPTIONS') return {statusCode:204, headers, body:''};
  if (event.httpMethod !== 'POST') return reply(405, {});
  const key = process.env.TEST_KEY || '';
  if (key.length < 24 || !timingSafeEqual(digest(key), digest(h['x-test-key'] || ''))) return reply(403, {error:'Проверьте TEST_KEY.'});
  const chats = [...new Set((process.env.CHAT_IDS || '').split(',').map(x=>x.trim()).filter(Boolean))];
  if (chats.length !== 2 || !chats.every(x=>/^-?\d+$/.test(x)) || !process.env.TELEGRAM_BOT_TOKEN)
    return reply(503, {error:'Нужны токен бота и два разных CHAT_IDS.'});
  let input;
  try {
    if (typeof event.body !== 'string' || event.body.length > 2800000) return reply(413,{error:'Фотографии слишком большие.'});
    input = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body,'base64').toString('utf8') : event.body);
  } catch {return reply(400,{error:'Не удалось прочитать запрос.'});}
  if (input?.probe === true) return reply(200,{ready:true});
  if (!/^[a-f0-9]{16}$/.test(input?.id || '') || !Array.isArray(input.photos) || input.photos.length !== 4 ||
      !input.photos.every(p=>typeof p==='string' && p.length<450000 && p.startsWith('/9j/'))) return reply(400,{error:'Ожидались четыре тестовых JPEG.'});
  const photos=input.photos.map(p=>new Blob([Buffer.from(p,'base64')],{type:'image/jpeg'}));
  const label='ТЕСТ СВЯЗИ '+input.id+' — НЕ СОБИРАТЬ, НЕ ДОСТАВЛЯТЬ';
  const start=Date.now();
  async function send(method,form){
    const r=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',body:form,signal:AbortSignal.timeout(18000)});
    const body=await r.json();
    if(!r.ok || body.ok!==true) throw Error('Telegram '+(body.error_code||r.status));
  }
  const results=await Promise.all(chats.map(async(chat)=>{
    const result={album:false,text:false}; let stage='album',since=Date.now();
    try {
      const f=new FormData(); f.set('chat_id',chat);
      f.set('media',JSON.stringify(photos.map((_,i)=>({type:'photo',media:'attach://p'+i,...(i===0?{caption:label}:{})}))));
      photos.forEach((p,i)=>f.set('p'+i,p,'test-'+i+'.jpg'));
      await send('sendMediaGroup',f);result.album=true;result.albumMs=Date.now()-since;
      stage='text';since=Date.now();const m=new FormData();m.set('chat_id',chat);m.set('text',label+'\nКарточка и три фото. Это техническая проверка.');
      await send('sendMessage',m);result.text=true;result.textMs=Date.now()-since;
    }catch(e){result.failedAt=stage;result.waitMs=Date.now()-since;result.error=/^Telegram \d+$/.test(e.message)?e.message:'Нет подтверждения Telegram';}
    return result;
  }));
  return reply(200,{id:input.id,results,workerMs:Date.now()-start});
};
