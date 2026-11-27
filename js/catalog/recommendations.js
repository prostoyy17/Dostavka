// Learn category preferences on this device. Store scores and recent product IDs only.
function createRecommendations(storage) {
  const now = Date.now();
  const profile = storage.get('interests', {});
  for (const entry of Object.values(profile)) {
    entry.score *= 0.5 ** (Math.max(0, now - entry.at) / (14 * 86400000));
    entry.at = now;
  }
  const recent = new Set(storage.get('recentPicks', []));
  const impressions = new Set(recent);
  const pages = new Map();
  function learn(category, weight) {
    if (!category) return;
    const score = profile[category]?.score || 0;
    profile[category] = {score: Math.min(30, score + weight), at: Date.now()};
    storage.set('interests', profile);
  }
  function pick(key, products, limit) {
    if (pages.has(key)) return pages.get(key);
    const candidates = products.map(product => ({
      product,
      score: Math.random() * (1 + Math.log1p(profile[product.cat]?.score || 0)) + (recent.has(product.id) ? 0 : 4)
    })).sort((a,b) => b.score - a.score);
    const picked = [], groups = new Map();
    // Allow variety within a single department too.
    for (let quota = 1; picked.length < Math.min(limit, candidates.length); quota++) {
      for (const item of candidates) {
        const p = item.product, group = key === 'home' ? p.cat : p.sub;
        if (item.used || (groups.get(group) || 0) >= quota) continue;
        item.used = true;
        picked.push(p);
        groups.set(group, (groups.get(group) || 0) + 1);
        impressions.delete(p.id);
        impressions.add(p.id);
        if (picked.length === limit) break;
      }
    }
    while (impressions.size > 1200) impressions.delete(impressions.values().next().value);
    if (pages.size >= 100) pages.delete(pages.keys().next().value);
    storage.set('recentPicks', [...impressions].slice(-1200));
    pages.set(key, picked);
    return picked;
  }
  function refresh() {
    pages.clear();
    recent.clear();
    for (const id of [...impressions].slice(-1200)) recent.add(id);
  }
  return {learn, pick, refresh};
}
