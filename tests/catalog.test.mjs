import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({window: {}, location: {origin:'http://localhost'}, document: {addEventListener() {}}});
for (const file of ['data/catalog.js','data/photos.js','js/config.js','js/catalog/search.js','js/catalog/recommendations.js']) {
  vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
}
const products = vm.runInContext('PRODUCTS',context);
const search = context.createProductSearch(products);

test('published items have photos and match the bundled iOS catalog', () => {
  const bundled = JSON.parse(fs.readFileSync(new URL('../ios/App/Resources/market.json',import.meta.url)));
  assert.ok(products.length > 0);
  assert.ok(products.every(p=>p.img));
  assert.deepEqual(Array.from(products,p=>p.id),bundled.items.map(p=>'p'+p.id));
});

test('milk search handles layout, typos and category scoping', () => {
  for (const store of [0,1]) {
    const milk = new Set(search.lookup('молоко',store).rows.map(p=>p.id));
    for (const term of ['vjkjrj','молко','молок']) {
      const {rows,chips} = search.lookup(term,store);
      assert.ok(rows.slice(0,40).some(p=>milk.has(p.id)));
      assert.ok(rows.every(p=>p.offers.some(o=>o[0]===store)));
      for (const chip of chips) assert.ok(search.lookup(term+' '+chip,store).rows.length);
    }
  }
  const ids = term=>Array.from(search.lookup(term,null).rows, p=>p.id);
  assert.ok(ids('2,5 кефир').length);
  assert.deepEqual(ids('2,5 кефир'),ids('кефир 2.5'));
});

test('recommendations stay stable while browsing and rotate on return', () => {
  const values = new Map();
  const store = {get: (key, fallback)=>values.get(key) ?? fallback, set:(key,value)=>values.set(key,value)};
  const feed = context.createRecommendations(store);
  const first = feed.pick('home',products,10);
  assert.equal(new Set(first.map(p=>p.cat)).size,10);
  assert.equal(feed.pick('home',products,10),first);
  feed.learn('milk',3);
  assert.equal(values.get('interests').milk.score,3);
  feed.refresh();
  const second = feed.pick('home',products,10);
  assert.ok(second.every(p=>!first.includes(p)));
});
