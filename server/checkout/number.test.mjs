import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './worker.mjs';

test('parallel web and iOS reservations retry collisions without reusing numbers', async () => {
  const keys = new Set();
  let rejected = 0;
  const BUCKET = {async put(key, body, options) {
    assert.equal(options.onlyIf.etagDoesNotMatch, '*');
    if (rejected++ < 2 || keys.has(key)) return null;
    keys.add(key);
    return {key};
  }};
  const requests = Array.from({length: 4}, (_,i) => {
    const native = i % 2;
    const path = native ? '/ios/order-number' : '/order-number';
    const headers = native ? {'X-Mayr-Client':'ios'} : {Origin:'https://prostoyy17.github.io'};
    return new Request('https://example.org' + path, {method:'POST', headers});
  });
  const replies = await Promise.all(requests.map(req=>worker.fetch(req,{BUCKET})));
  const numbers = await Promise.all(replies.map(async r=>{
    assert.equal(r.status, 200);
    const {number} = await r.json();
    assert.match(number,/^[1-9]\d{5}$/);
    return number;
  }));
  assert.equal(new Set(numbers).size,4);
});

test('shared recommendations accept category totals only and include concurrent updates', async () => {
  const objects = new Map();
  const BUCKET = {
    async get(key) {
      const value = objects.get(key);
      return value && {etag: value.etag, json: async () => JSON.parse(value.body)};
    },
    async put(key, body, {onlyIf}) {
      const old = objects.get(key);
      if (old ? onlyIf.etagMatches !== old.etag : onlyIf.etagDoesNotMatch !== '*') return null;
      const entry = {body, etag: crypto.randomUUID()};
      objects.set(key, entry);
      return entry;
    }
  };
  const headers = {Origin:'https://prostoyy17.github.io'};
  const call = (body) => worker.fetch(new Request('https://example.org/category-interest',
    body ? {method:'POST', headers, body:JSON.stringify(body)} : {headers}), {BUCKET});
  const writes = await Promise.all([call({milk:2}),call({milk:3, veg:1})]);
  assert.ok(writes.every(r=>r.status===204));
  assert.equal((await call({query:'сыр'})).status,400);
  assert.deepEqual(await (await call()).json(),{milk:5,veg:1});
});
