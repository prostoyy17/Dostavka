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
