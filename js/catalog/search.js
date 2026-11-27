function createProductSearch(products) {
  const normalize = text => text.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/(\d),(?=\d)/g, '$1.').match(/\d+(?:\.\d+)?|\p{L}+/gu) || [];
  const index = new Map(), words = new Map(), cache = new Map();
  for (const p of products) {
    const name = normalize(p.name);
    words.set(p, name);
    for (const word of new Set([...name, ...normalize(p.search)])) {
      if (!index.has(word)) index.set(word, []);
      index.get(word).push(p);
    }
  }
  function near(a,b) {
    if (a.length < 4 || Math.abs(a.length-b.length)>1) return false;
    let i=0,j=0, edits=0;
    while (i<a.length && j<b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits>1) return false;
      if (a.length===b.length && a[i]===b[j+1] && a[i+1]===b[j]) { i+=2; j+=2; continue; }
      if (a.length>=b.length) i++;
      if (b.length>=a.length) j++;
    }
    return edits + a.length-i + b.length-j <= 1;
  }
  function lookup(value, store) {
    const tokens = [...new Set(normalize(value))].slice(0,12);
    const key = JSON.stringify([tokens,store]);
    if (cache.has(key)) return cache.get(key);
    let matches;
    const matchedTerms = [];
    for (const token of tokens) {
      const ids = new Set(), quality = new Map();
      function collect(term, approximate = false) {
        for (const [word, rows] of index) {
          if (!(approximate ? near(term, word) : word.startsWith(term))) continue;
          quality.set(word, word === term ? 5 : approximate ? 2 : 3);
          for (const p of rows) {
            if (matches && !matches.has(p)) continue;
            if (store !== null && !p.offers.some(o => o[0] === store)) continue;
            ids.add(p);
          }
        }
      }
      collect(token);
      if (!ids.size && /^[a-z]+$/.test(token)) {
        const english = 'qwertyuiopasdfghjklzxcvbnm';
        const russian = 'йцукенгшщзфывапролдячсмить';
        collect([...token].map(c => russian[english.indexOf(c)]).join(''));
      }
      if (!ids.size) collect(token, true);
      matches = ids;
      matchedTerms.push(quality);
      if (!ids.size) break;
    }
    const rows = [...(matches || [])].map(p => {
      const name = words.get(p);
      const score = matchedTerms.reduce((sum, quality) => {
        const best = name.reduce((n, w) => Math.max(n, quality.get(w) || 0), 0);
        return sum + best + Number(quality.has(name[0]));
      }, 0);
      return {p, score};
    }).sort((a,b) => b.score - a.score || b.p.popularity - a.p.popularity).map(row => row.p);
    const counts = new Map();
    for (const p of rows.slice(0,160)) {
      for (const word of new Set(words.get(p))) {
        if (!tokens.includes(word) && word.length>1 && !tokens.some(t=>word.startsWith(t))) counts.set(word,(counts.get(word)||0)+1);
      }
    }
    const chips=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
    const result={rows,chips,categories:[...new Set(rows.map(p=>p.cat))].slice(0,5)};
    if (cache.size>=24) cache.delete(cache.keys().next().value);
    cache.set(key,result);
    return result;
  }
  return {lookup};
}
