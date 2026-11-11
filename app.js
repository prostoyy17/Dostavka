(() => {
'use strict';
const BUILD = '1794434011';
if (window.APP_BUILD !== BUILD || !document.getElementById('page')) {
  const u = new URL(location.href);
  if (u.searchParams.get('b') !== BUILD) { u.searchParams.set('b', BUILD); location.replace(u.toString()); }
  return;
}

/* ================= Helpers / state ================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('s95_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('s95_' + k, JSON.stringify(v)); } catch {} }
};
const state = {
  point: LS.get('point', null),
  mode: LS.get('mode', 'delivery'),
  cart: LS.get('cart', {}),
  favs: LS.get('favs', []),              // ordered list, newest first
  orders: LS.get('orders', []),
  address: LS.get('address', {}),
  theme: LS.get('theme', null),
  route: 'catalog',
  cat: 'all',
  query: '',
  sub: null,
  filters: new Set(),
  sort: 'pop',
  limit: 60,
  dd: null,
  favSort: 'added'
};

const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽';
/* Иконки: Uicons by Flaticon (основные) + Phosphor Icons (MIT) для остальных */
const PHI = {"house": "<path transform=\"scale(0.85333)\" d=\"M150 187Q134 187 123.5 198.0Q113 209 113 225V300H188V225Q188 209 177.0 198.0Q166 187 150 187ZM213 225V300H263Q278 300 289.0 289.0Q300 278 300 262V148Q300 138 293 131L187 16Q173 1 152.0 0.0Q131 -1 116 13L7 131Q0 138 0 149V262Q0 278 11.0 289.0Q22 300 38 300H87V225Q88 208 96.0 194.0Q104 180 118.0 171.5Q132 163 148.5 162.5Q165 162 180.0 170.0Q195 178 203.5 193.0Q212 208 213 225ZM150 187Q134 187 123.5 198.0Q113 209 113 225V300H188V225Q188 209 177.0 198.0Q166 187 150 187Z\"/>", "heart": "<path transform=\"scale(0.85333)\" d=\"M219 24Q197 24 178.5 35.0Q160 46 150 65Q140 46 121.5 35.0Q103 24 80.5 24.5Q58 25 39.0 37.0Q20 49 9.5 69.0Q-1 89 0 112Q0 151 36 198Q64 234 110 273Q127 288 150.0 288.0Q173 288 190 273Q236 234 264 198Q300 151 300 112Q301 89 290.5 69.0Q280 49 261.0 37.0Q242 25 219 24Z\"/>", "heart-o": "<path transform=\"scale(0.85333)\" d=\"M216 23Q196 23 178.5 32.0Q161 41 150 57Q139 41 121.5 32.0Q104 23 84 23Q61 24 41.0 36.5Q21 49 10.0 69.5Q-1 90 0 114Q0 153 35 199Q62 235 108 273Q126 288 150.0 288.0Q174 288 193 273Q238 235 265 199Q300 153 300 114Q301 90 290.0 69.5Q279 49 259.0 36.5Q239 24 216 23ZM168 244Q160 251 150.0 251.0Q140 251 132 244Q87 207 62.5 173.0Q38 139 38 114Q36 93 50.0 77.5Q64 62 84 61Q105 62 118.5 77.5Q132 93 131 114Q131 122 136.5 127.5Q142 133 150.0 133.0Q158 133 163.5 127.5Q169 122 169 114Q168 93 181.5 77.5Q195 62 216 61Q236 62 250.0 77.5Q264 93 262 114Q263 139 238.0 173.0Q213 207 168 244Z\"/>", "receipt": "<path transform=\"scale(0.85333)\" d=\"M100 0Q83 0 68.5 8.5Q54 17 46.0 31.5Q38 46 37 62V287Q38 295 44.5 298.5Q51 302 57 298L83 280L110 298Q113 300 117.0 300.0Q121 300 124 298L150 280L176 298Q180 300 183.5 300.0Q187 300 190 298L217 280L243 298Q249 302 255.5 298.5Q262 295 262 288V62Q262 46 254.0 31.5Q246 17 231.5 8.5Q217 0 200 0ZM175 175H100Q95 175 91.5 171.5Q88 168 88.0 162.5Q88 157 91.5 153.5Q95 150 100 150H175Q180 150 184.0 153.5Q188 157 188.0 162.5Q188 168 184.0 171.5Q180 175 175 175ZM213 112Q213 118 209.0 121.5Q205 125 200 125H100Q95 125 91.5 121.5Q88 118 88.0 112.5Q88 107 91.5 103.5Q95 100 100 100H200Q205 100 209.0 103.5Q213 107 213 112Z\"/>", "cart": "<path transform=\"scale(0.85333)\" d=\"M284 51Q279 45 271.0 41.0Q263 37 255 37H53V33Q51 19 40.5 9.5Q30 0 15 0H13Q7 0 3.5 3.5Q0 7 0.0 12.5Q0 18 3.5 21.5Q7 25 12 25H15Q20 25 23.5 28.0Q27 31 28 36L45 182Q48 206 65.5 222.0Q83 238 107 238H238Q243 237 246.5 233.5Q250 230 250.0 225.0Q250 220 246.5 216.5Q243 213 238 213H107Q95 212 85.5 205.5Q76 199 72 188H221Q243 188 260.5 173.0Q278 158 282 136L292 82Q294 73 291.5 65.0Q289 57 284 51ZM63 275Q62 285 69.5 292.5Q77 300 87.5 300.0Q98 300 105.0 292.5Q112 285 112.5 275.0Q113 265 105.5 257.5Q98 250 87.5 250.0Q77 250 70.0 257.5Q63 265 63 275ZM188 275Q187 285 194.5 292.5Q202 300 212.5 300.0Q223 300 230.0 292.5Q237 285 237.5 275.0Q238 265 230.5 257.5Q223 250 212.5 250.0Q202 250 195.0 257.5Q188 265 188 275Z\"/>", "user": "<path transform=\"scale(0.85333)\" d=\"M201 175H99Q83 175 68.5 183.5Q54 192 46.0 206.0Q38 220 38 237V300H263V237Q262 220 254.0 206.0Q246 192 231.5 183.5Q217 175 201 175ZM75 75Q75 95 85.0 112.5Q95 130 112.5 140.0Q130 150 150.0 150.0Q170 150 187.5 140.0Q205 130 215.0 112.5Q225 95 225.0 75.0Q225 55 215.0 37.5Q205 20 187.5 10.0Q170 0 150.0 0.0Q130 0 112.5 10.0Q95 20 85.0 37.5Q75 55 75 75Z\"/>", "pin": "<path transform=\"scale(0.85333)\" d=\"M150 1Q116 1 87.5 17.5Q59 34 42.0 62.5Q25 91 25 125Q25 174 99 275Q108 287 121.5 294.0Q135 301 150.0 301.0Q165 301 178.5 294.0Q192 287 201 275Q275 174 275 125Q275 91 258.0 62.5Q241 34 212.5 17.5Q184 1 150 1ZM150 175Q129 175 114.5 160.5Q100 146 100.0 125.0Q100 104 114.5 89.5Q129 75 150.0 75.0Q171 75 185.5 89.5Q200 104 200.0 125.0Q200 146 185.5 160.5Q171 175 150 175Z\"/>", "gear": "<path transform=\"scale(0.85333)\" d=\"M20 225Q28 238 43.0 242.5Q58 247 71 239L77 236Q93 249 113 256V262Q112 278 123.0 289.0Q134 300 150.0 300.0Q166 300 177.0 289.0Q188 278 187 262V256Q207 249 223 236L229 239Q242 247 257.0 242.5Q272 238 280.0 225.0Q288 212 284.0 197.0Q280 182 266 174L261 171Q264 150 261 129L266 126Q280 118 284.0 103.0Q288 88 280.0 75.0Q272 62 257.0 57.5Q242 53 229 61L223 64Q207 51 187 44V37Q187 22 176.5 11.0Q166 0 150.0 0.0Q134 0 123.5 11.0Q113 22 113 38V44Q93 51 77 64L71 61Q58 53 43.0 57.5Q28 62 20.0 75.0Q12 88 16.0 103.0Q20 118 34 126L39 129Q36 150 39 171L34 174Q20 182 16.0 197.0Q12 212 20 225ZM150 100Q171 100 185.5 114.5Q200 129 200.0 150.0Q200 171 185.5 185.5Q171 200 150.0 200.0Q129 200 114.5 185.5Q100 171 100.0 150.0Q100 129 114.5 114.5Q129 100 150 100Z\"/>", "info": "<path transform=\"scale(0.85333)\" d=\"M150 300Q191 300 225.5 280.0Q260 260 280.0 225.5Q300 191 300.0 150.0Q300 109 280.0 74.5Q260 40 225.5 20.0Q191 0 150.0 0.0Q109 0 74.5 20.0Q40 40 20.0 74.5Q0 109 0.0 150.0Q0 191 20.0 225.5Q40 260 74.5 280.0Q109 300 150 300ZM150 62Q158 63 163.5 68.0Q169 73 169.0 81.0Q169 89 163.5 94.5Q158 100 150.0 100.0Q142 100 136.5 94.5Q131 89 131.0 81.0Q131 73 136.5 67.5Q142 62 150 62ZM138 125H150Q160 125 167.5 132.5Q175 140 175 150V225Q175 230 171.5 233.5Q168 237 162.5 237.0Q157 237 153.5 233.5Q150 230 150 225V150H138Q132 150 128.5 146.5Q125 143 125.0 137.5Q125 132 128.5 128.5Q132 125 138 125Z\"/>", "moon": "<path d=\"M235.54,150.21a104.84,104.84,0,0,1-37,52.91A104,104,0,0,1,32,120,103.09,103.09,0,0,1,52.88,57.48a104.84,104.84,0,0,1,52.91-37,8,8,0,0,1,10,10,88.08,88.08,0,0,0,109.8,109.8,8,8,0,0,1,10,10Z\"/>", "search": "<path transform=\"scale(0.85333)\" d=\"M295 268 236 210Q258 181 262.0 146.5Q266 112 252.5 80.0Q239 48 210.0 26.5Q181 5 146.5 1.0Q112 -3 80.0 10.5Q48 24 26.5 52.5Q5 81 1.0 116.0Q-3 151 10.5 183.0Q24 215 53 236Q76 254 103.5 260.0Q131 266 159.0 260.0Q187 254 210 236L268 295Q274 300 281.5 300.0Q289 300 294.5 294.5Q300 289 300.0 281.5Q300 274 295 268ZM132 225Q106 225 85.0 212.5Q64 200 51.0 178.5Q38 157 38.0 131.5Q38 106 51.0 85.0Q64 64 85.0 51.0Q106 38 131.5 38.0Q157 38 178.5 51.0Q200 64 212.5 85.0Q225 106 225.0 131.5Q225 157 212.5 178.5Q200 200 178.5 212.5Q157 225 132 225Z\"/>", "bag": "<path d=\"M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-88,96A48.05,48.05,0,0,1,80,88a8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0A48.05,48.05,0,0,1,128,136Z\"/>", "store": "<path d=\"M231.69,93.81,217.35,43.6A16.07,16.07,0,0,0,202,32H54A16.07,16.07,0,0,0,38.65,43.6L24.31,93.81A7.94,7.94,0,0,0,24,96v16a40,40,0,0,0,16,32v72a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V144a40,40,0,0,0,16-32V96A7.94,7.94,0,0,0,231.69,93.81ZM88,112a24,24,0,0,1-35.12,21.26,7.88,7.88,0,0,0-1.82-1.06A24,24,0,0,1,40,112v-8H88Zm64,0a24,24,0,0,1-48,0v-8h48Zm64,0a24,24,0,0,1-11.07,20.2,8.08,8.08,0,0,0-1.8,1.05A24,24,0,0,1,168,112v-8h48Z\"/>", "moped": "<path d=\"M216,128a39.3,39.3,0,0,0-6.27.5L175.49,37.19A8,8,0,0,0,168,32H136a8,8,0,0,0,0,16h26.46l32.3,86.13a40.13,40.13,0,0,0-18,25.87H136.54l-25-66.81A8,8,0,0,0,104,88H24a8,8,0,0,0,0,16h8v13.39A56.12,56.12,0,0,0,0,168a8,8,0,0,0,8,8h8.8a40,40,0,0,0,78.4,0h81.6A40,40,0,1,0,216,128ZM56,192a24,24,0,0,1-22.62-16H78.62A24,24,0,0,1,56,192Zm160,0a24,24,0,0,1-15.43-42.36l7.94,21.17a8,8,0,0,0,15-5.62L215.55,144H216a24,24,0,0,1,0,48Z\"/>", "check": "<path d=\"M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z\"/>", "clip": "<path d=\"M200,32H163.74a47.92,47.92,0,0,0-71.48,0H56A16,16,0,0,0,40,48V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V48A16,16,0,0,0,200,32Zm-72,0a32,32,0,0,1,32,32H96A32,32,0,0,1,128,32Zm32,128H96a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Zm0-32H96a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Z\"/>", "package": "<path d=\"M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.17a16,16,0,0,0-8.32,14v95.64a16,16,0,0,0,8.32,14l88,48.17a15.88,15.88,0,0,0,15.36,0l88-48.17a16,16,0,0,0,8.32-14V80.18A16,16,0,0,0,223.68,66.15ZM128,32l80.35,44L178.57,92.29l-80.35-44Zm0,88L47.65,76,81.56,57.43l80.35,44Zm88,55.85h0l-80,43.79V133.83l32-17.51V152a8,8,0,0,0,16,0V107.56l32-17.51v85.76Z\"/>", "filter": "<path d=\"M40,92H70.06a36,36,0,0,0,67.88,0H216a12,12,0,0,0,0-24H137.94a36,36,0,0,0-67.88,0H40a12,12,0,0,0,0,24Zm64-24A12,12,0,1,1,92,80,12,12,0,0,1,104,68Zm112,96H201.94a36,36,0,0,0-67.88,0H40a12,12,0,0,0,0,24h94.06a36,36,0,0,0,67.88,0H216a12,12,0,0,0,0-24Zm-48,24a12,12,0,1,1,12-12A12,12,0,0,1,168,188Z\"/>", "sort": "<path d=\"M120.49,167.51a12,12,0,0,1,0,17l-32,32a12,12,0,0,1-17,0l-32-32a12,12,0,1,1,17-17L68,179V48a12,12,0,0,1,24,0V179l11.51-11.52A12,12,0,0,1,120.49,167.51Zm96-96-32-32a12,12,0,0,0-17,0l-32,32a12,12,0,0,0,17,17L164,77V208a12,12,0,0,0,24,0V77l11.51,11.52a12,12,0,0,0,17-17Z\"/>", "x": "<path transform=\"scale(0.85333)\" d=\"M177 150 225 101Q230 96 229.5 88.5Q229 81 224.0 76.0Q219 71 211.5 70.5Q204 70 199 75L150 123L101 75Q98 71 93.0 70.0Q88 69 83.0 70.0Q78 71 74.5 74.5Q71 78 70.0 83.0Q69 88 70.0 93.0Q71 98 75 101L123 150L75 199Q71 202 69.5 207.0Q68 212 69.5 217.0Q71 222 74.5 225.5Q78 229 83.0 230.5Q88 232 93.0 230.5Q98 229 101 225L150 177L198 225Q204 230 212.0 230.0Q220 230 225.0 225.0Q230 220 230.0 212.0Q230 204 225 198Z\"/>", "back": "<path transform=\"scale(0.85333)\" d=\"M62 70 13 119Q0 132 0.0 150.0Q0 168 13 181L62 230Q65 234 70.0 235.0Q75 236 80.0 235.0Q85 234 88.5 230.5Q92 227 93.5 222.0Q95 217 93.5 212.0Q92 207 88 203L54 169L282 168Q289 168 294.5 162.5Q300 157 300 150Q300 142 294.5 136.5Q289 131 282 131H54L88 97Q94 91 93.5 83.5Q93 76 88.0 70.5Q83 65 75.0 65.0Q67 65 62 70Z\"/>", "chev": "<path transform=\"scale(0.85333)\" d=\"M197 119 140 62Q134 56 126.5 56.0Q119 56 113.5 61.5Q108 67 108.0 75.0Q108 83 113 88L170 146Q172 147 172.0 150.0Q172 153 170 154L113 212Q108 217 108.0 225.0Q108 233 113.5 238.5Q119 244 126.5 244.0Q134 244 140 238L197 181Q210 168 210.0 150.0Q210 132 197 119Z\"/>", "down": "<path transform=\"scale(0.85333)\" d=\"M238 98Q233 93 225.0 93.0Q217 93 212 98L154 155Q153 157 150.0 157.0Q147 157 146 155L88 98Q83 93 75.0 93.0Q67 93 61.5 98.5Q56 104 56.0 111.5Q56 119 62 125L119 182Q132 195 150.0 195.0Q168 195 181 182L238 125Q244 119 244.0 111.5Q244 104 238 98Z\"/>", "plus": "<path transform=\"scale(0.85333)\" d=\"M206 131H169V94Q169 86 163.5 80.5Q158 75 150.0 75.0Q142 75 136.5 80.5Q131 86 131 94V131H94Q86 131 80.5 136.5Q75 142 75.0 150.0Q75 158 80.5 163.5Q86 169 94 169H131V206Q131 214 136.5 219.5Q142 225 150.0 225.0Q158 225 163.5 219.5Q169 214 169 206V169H206Q214 169 219.5 163.5Q225 158 225.0 150.0Q225 142 219.5 136.5Q214 131 206 131Z\"/>", "minus": "<path transform=\"scale(0.85333)\" d=\"M206 169H94Q86 169 80.5 163.5Q75 158 75.0 150.0Q75 142 80.5 136.5Q86 131 94 131H206Q214 131 219.5 136.5Q225 142 225.0 150.0Q225 158 219.5 163.5Q214 169 206 169Z\"/>", "card": "<path d=\"M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48ZM136,176H120a8,8,0,0,1,0-16h16a8,8,0,0,1,0,16Zm64,0H168a8,8,0,0,1,0-16h32a8,8,0,0,1,0,16ZM32,88V64H224V88Z\"/>", "qr": "<path d=\"M120,56v48a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h48A16,16,0,0,1,120,56Zm-16,80H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm96-96H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40ZM144,184a8,8,0,0,0,8-8V144a8,8,0,0,0-16,0v32A8,8,0,0,0,144,184Zm64-32H184v-8a8,8,0,0,0-16,0v56H144a8,8,0,0,0,0,16h32a8,8,0,0,0,8-8V168h24a8,8,0,0,0,0-16Zm0,32a8,8,0,0,0-8,8v16a8,8,0,0,0,16,0V192A8,8,0,0,0,208,184Z\"/>", "terminal": "<path d=\"M176,16H80A24,24,0,0,0,56,40V216a24,24,0,0,0,24,24h96a24,24,0,0,0,24-24V40A24,24,0,0,0,176,16ZM80,32h96a8,8,0,0,1,8,8v8H72V40A8,8,0,0,1,80,32Zm96,192H80a8,8,0,0,1-8-8v-8H184v8A8,8,0,0,1,176,224Z\"/>", "cash": "<path d=\"M168,128a40,40,0,1,1-40-40A40,40,0,0,1,168,128Zm80-64V192a8,8,0,0,1-8,8H16a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H240A8,8,0,0,1,248,64Zm-16,46.35A56.78,56.78,0,0,1,193.65,72H62.35A56.78,56.78,0,0,1,24,110.35v35.3A56.78,56.78,0,0,1,62.35,184h131.3A56.78,56.78,0,0,1,232,145.65Z\"/>", "bell": "<path transform=\"scale(0.85333)\" d=\"M93 262Q100 280 115.5 290.0Q131 300 150.0 300.0Q169 300 184.5 290.0Q200 280 207 262ZM280 157 258 85Q251 60 234.0 40.5Q217 21 193.0 10.0Q169 -1 143.0 0.0Q117 1 93.5 12.5Q70 24 54.0 44.5Q38 65 32 91L15 160Q12 174 15.0 188.0Q18 202 27.0 213.5Q36 225 49.0 231.0Q62 237 76 237H220Q235 238 248.0 231.0Q261 224 270.0 212.0Q279 200 281.5 185.5Q284 171 280 157Z\"/>"};
const svgI = (n, s = 22, cls = '') => `<svg class="phi ${cls}" width="${s}" height="${s}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${PHI[n]}</svg>`;
const ic = (name, cls = 'ic') => `<img class="${cls}" src="assets/icons/${name}.webp" alt="" loading="lazy" decoding="async">`;
const isFav = id => state.favs.includes(id);
const save = () => {
  LS.set('cart', state.cart); LS.set('favs', state.favs); LS.set('orders', state.orders);
  LS.set('point', state.point); LS.set('mode', state.mode);
};
if (!POINTS.some(p => p.id === state.point)) state.point = POINTS.length === 1 ? POINTS[0].id : null;
state.mode = 'delivery';
const point = () => POINTS.find(p => p.id === state.point);
const stockOf = (p, pid = state.point || POINTS[0].id) => p ? (p.stock[pid] || 0) : 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rubP = n => (Math.round(n * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + '\u00a0₽';
const pic = (p, cls = 'ic') => p.img ? `<img class="${cls} photo" src="${p.img}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.className='${cls}';this.src='assets/icons/${p.icon}.webp'">` : ic(p.icon, cls);
const isOpen = pt => { const h = new Date().getHours(); return h >= pt.hours[0] && h < pt.hours[1]; };
const hours = pt => `${String(pt.hours[0]).padStart(2, '0')}:00–${pt.hours[1]}:00`;
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const heart = svgI('heart-o', 20, 'h-off') + svgI('heart', 20, 'h-on');
const isDesktopCart = () => false;   // корзина всегда открывается шторкой

function applyTheme() {
  const t = state.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#000000' : '#EEEDE8';
}
applyTheme();

/* ================= Cart math ================= */
function cartLines() {
  return Object.entries(state.cart).filter(([id]) => byId[id]).map(([id, qty]) => {
    const p = byId[id], avail = stockOf(p);
    return { p, qty, avail, ok: avail >= qty && avail > 0, sum: p.price * qty };
  });
}
function totals() {
  const lines = cartLines();
  const okLines = lines.filter(l => l.ok);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = okLines.reduce((s, l) => s + l.sum, 0);
  const pt = point() || POINTS[0];
  const isPickup = state.mode === 'pickup';
  const delivery = isPickup || subtotal >= pt.freeFrom || subtotal === 0 ? 0 : pt.deliveryFee;
  const service = 0;
  const total = subtotal + delivery + service;
  return { lines, okLines, count, subtotal, delivery, service, total, pt, minOk: subtotal >= pt.minOrder, isPickup, toFree: Math.max(0, pt.freeFrom - subtotal) };
}

function setQty(id, qty) {
  const p = byId[id];
  const max = stockOf(p);
  const prev = state.cart[id] || 0;
  qty = Math.max(0, Math.min(qty, max));
  if (qty === prev && qty >= max && qty > 0) { toast('Больше нет в наличии'); return; }
  if (qty === 0) delete state.cart[id]; else state.cart[id] = qty;
  save();
  refreshQty(id);
  renderCart();
}

/* ================= Product card ================= */
function actionHTML(p, size = '') {
  const q = state.cart[p.id] || 0;
  const s = stockOf(p);
  if (size.includes('round')) {
    if (s === 0) return '';
    if (!q) return `<button class="add-btn add-btn--round" data-add="${p.id}" aria-label="В корзину">${svgI('plus', 20)}</button>`;
    return `<div class="stepper stepper--round"><button data-dec="${p.id}" aria-label="Меньше">${svgI('minus', 16)}</button><span>${q}</span><button data-inc="${p.id}" aria-label="Больше" ${q >= s ? 'disabled' : ''}>${svgI('plus', 16)}</button></div>`;
  }
  if (s === 0) return `<button class="add-btn" disabled>Нет в наличии</button>`;
  if (!q) return `<button class="add-btn ${size.includes('primary') ? 'add-btn--primary' : ''}" data-add="${p.id}">+ В корзину</button>`;
  return `<div class="stepper ${size}">
    <button data-dec="${p.id}" aria-label="Меньше">${svgI('minus', 16)}</button>
    <span>${q}</span>
    <button data-inc="${p.id}" aria-label="Больше" ${q >= s ? 'disabled' : ''}>+</button>
  </div>`;
}
function tagsHTML(p) {
  return p.oldPrice > p.price ? `<span class="tag tag--sale">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : '';
}
function cardHTML(p) {
  const s = stockOf(p);
  return `<article class="card ${s === 0 ? 'out' : ''}">
    <div class="card__img ${p.img ? 'card__img--photo' : 'card__img--icon'}" style="--tint:${catById[p.cat].color}" data-open="${p.id}">
      ${pic(p)}
      <div class="card__tags">${s === 0 ? '<span class="tag tag--out">Нет в наличии</span>' : tagsHTML(p)}</div>
      <button class="fav-btn ${isFav(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${heart}</button>
      <div class="card__action" data-action-for="${p.id}" data-size="round">${actionHTML(p, 'round')}</div>
    </div>
    <div class="card__price">
      <span class="price">${rubP(p.price)}</span>${p.oldPrice > p.price ? `<span class="price-old">${rubP(p.oldPrice)}</span>` : ''}
    </div>
    <div class="card__name" data-open="${p.id}" title="${esc(p.name)}">${esc(p.name)}</div>
    <div class="card__unit"><span>${p.unit}</span>${s > 0 && s <= 5 ? `<span class="card__low">осталось ${s}</span>` : ''}</div>
  </article>`;
}
function refreshQty(id) {
  $$(`[data-action-for="${id}"]`).forEach(el => { el.innerHTML = actionHTML(byId[id], el.dataset.size || ''); });
}
function syncFav(id) {
  $$(`[data-fav="${id}"]`).forEach(b => b.classList.toggle('on', isFav(id)));
  $$('[data-fav-count]').forEach(b => { b.hidden = !state.favs.length; b.textContent = state.favs.length; });
  const c = $('[data-cat="fav"] .cat-link__count'); if (c) c.textContent = state.favs.length || '';
}

/* ================= Router ================= */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  state.route = ['favorites', 'orders', 'account', 'address', 'about', 'settings', 'cart'].find(r => h.startsWith(r)) || 'catalog';
}
window.addEventListener('hashchange', () => { parseRoute(); closeAll(); renderPage(); window.scrollTo(0, 0); });

function renderPage() {
  const navOf = { address: 'account', about: 'account', settings: 'account', orders: 'account' };
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (navOf[state.route] || state.route)));
  document.body.classList.toggle('sub', state.route !== 'catalog');
  renderCats();
  if (state.route === 'favorites') { renderFavorites(); return addGap(); }
  if (state.route === 'orders') { renderOrders(); return addBack(); }
  if (state.route === 'cart') { renderCartPage(); return addGap(); }
  if (state.route === 'account') return renderAccount();
  if (state.route === 'address') return renderAddress();
  if (state.route === 'about') return renderAbout();
  if (state.route === 'settings') return renderSettings();
  renderCatalogPage();
}

/* ================= Catalog page ================= */
function filtered() {
  const words = state.query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  const list = PRODUCTS.filter(p => {
    if (state.cat !== 'all' && p.cat !== state.cat) return false;
    if (state.sub && p.sub !== state.sub) return false;
    if (words.length && !words.every(w => p.search.includes(w))) return false;
    if (state.filters.has('photo') && !p.img) return false;
    if (state.filters.has('kg') && !p.kg) return false;
    return true;
  });
  return sortList(list, state.sort);
}
function sortList(list, sort) {
  const sorters = {
    pop: (a, b) => (!!b.img - !!a.img) || b.popularity - a.popularity,
    asc: (a, b) => a.price - b.price,
    desc: (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    added: () => 0
  };
  return [...list].sort(sorters[sort]).sort((a, b) => (stockOf(a) === 0) - (stockOf(b) === 0));
}
const sortSelect = (id, val, extra = '') => `<select class="select" id="${id}">
  ${extra}
  ${[['pop', 'Популярные'], ['asc', 'Сначала дешевле'], ['desc', 'Сначала дороже'], ['name', 'По названию']].map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}
</select>`;

function renderCatalogPage() {
  const page = $('#page');
  const title = state.query ? `Поиск «${esc(state.query)}»` : state.cat === 'all' ? 'Все товары' : catById[state.cat].name;
  const home = state.cat === 'all' && !state.query;
  page.innerHTML = `
    <div class="circles" id="catStrip"></div>
    ${home ? '' : `<div class="toolbar"><h1 class="toolbar__title">${title}</h1></div>
    <div class="controls" id="controls"></div>`}
    <div id="catalog"></div>`;
  renderCatStrip();
  renderControls();
  renderCatalog();
}

/* ---- compact controls: Подраздел · Фильтры · Сортировка ---- */
const SORTS = [['pop', 'Популярные', 'Популярные'], ['asc', 'Сначала дешевле', 'Дешевле'], ['desc', 'Сначала дороже', 'Дороже'], ['name', 'По названию', 'А–Я']];
const FILTERS = [['photo', 'Только с фото'], ['kg', 'Весовые товары']];
const caret = svgI('down', 13);
const icoFilter = svgI('filter', 16, 'pill__ico');
const icoSort = svgI('sort', 16, 'pill__ico');
function renderControls() {
  const box = $('#controls');
  if (!box) return;
  const c = state.cat !== 'all' ? catById[state.cat] : null;
  const nF = state.filters.size;
  const head = t => `<div class="dd__head">${t}<button data-dd-close aria-label="Закрыть">${svgI('x', 16)}</button></div>`;
  let sub = '';
  if (c && c.subs.length) {
    let menu = '';
    if (state.dd === 'sub') {
      const cnt = {};
      PRODUCTS.forEach(p => { if (p.cat === c.id) cnt[p.sub] = (cnt[p.sub] || 0) + 1; });
      const all = PRODUCTS.filter(p => p.cat === c.id).length;
      menu = `<div class="dd__menu">${head('Подраздел')}<div class="dd__scroll">
        <button class="dd__opt ${!state.sub ? 'sel' : ''}" data-sub=""><span>Все</span><em>${all}</em></button>
        ${c.subs.map(s => `<button class="dd__opt ${state.sub === s ? 'sel' : ''}" data-sub="${esc(s)}"><span>${esc(s)}</span><em>${cnt[s] || 0}</em></button>`).join('')}
      </div></div>`;
    }
    sub = `<div class="dd"><button class="pill ${state.sub ? 'on' : ''}" data-dd="sub"><span class="pill__label">${state.sub ? esc(state.sub) : 'Подраздел'}</span>${state.sub ? '<i class="pill__x" data-sub="" title="Сбросить">×</i>' : caret}</button>${menu}</div>`;
  }
  const flt = `<div class="dd"><button class="pill ${nF ? 'on' : ''}" data-dd="flt">${icoFilter}<span class="pill__label">Фильтры</span>${nF ? `<b class="pill__n">${nF}</b>` : caret}</button>${state.dd === 'flt' ? `<div class="dd__menu">${head('Фильтры')}<div class="dd__scroll">${FILTERS.map(([f, l]) => `<button class="dd__opt ${state.filters.has(f) ? 'sel' : ''}" data-filter="${f}"><span>${l}</span><i class="dd__box"></i></button>`).join('')}</div></div>` : ''}</div>`;
  const sortName = (SORTS.find(s => s[0] === state.sort) || SORTS[0])[2];
  const srt = `<div class="dd dd--right"><button class="pill" data-dd="sort">${icoSort}<span class="pill__label">${sortName}</span>${caret}</button>${state.dd === 'sort' ? `<div class="dd__menu">${head('Сортировка')}<div class="dd__scroll">${SORTS.map(([v, l]) => `<button class="dd__opt ${state.sort === v ? 'sel' : ''}" data-sort="${v}"><span>${l}</span></button>`).join('')}</div></div>` : ''}</div>`;
  box.innerHTML = (state.dd ? '<div class="dd__back" data-dd-close></div>' : '') + sub + flt + srt;
  if (state.dd && matchMedia('(max-width: 760px)').matches) lockScroll('dd'); else unlockScroll('dd');
}

function renderCatalog() {
  const root = $('#catalog');
  if (!root) return;
  const list = filtered();
  if (!list.length) {
    root.innerHTML = `<div class="empty">${tile('search', 'blue', 'empty__tile')}<div class="empty__title">Ничего не найдено</div><button class="btn btn--ghost btn--sm" data-action="reset">Сбросить фильтры</button></div>`;
    return;
  }
  const grouped = state.cat === 'all' && !state.query;
  if (!grouped) {
    const shown = list.slice(0, state.limit);
    root.innerHTML = `<div class="list-meta">${list.length.toLocaleString('ru-RU')} ${plural(list.length, 'товар', 'товара', 'товаров')}</div><div class="grid">${shown.map(cardHTML).join('')}</div>` +
      (list.length > shown.length ? `<div class="more"><button class="btn btn--ghost" data-action="more">Показать ещё ${Math.min(60, list.length - shown.length)} из ${(list.length - shown.length).toLocaleString('ru-RU')}</button></div>` : '');
    return;
  }

  // Главная: рекомендации (случайные товары с фото, на время визита) + подборки по разделам
  if (!RECS) {
    const pool = PRODUCTS.filter(p => p.img && stockOf(p) > 0);
    RECS = [];
    for (let i = 0; i < 10 && pool.length; i++) RECS.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  let html = `<section class="section"><div class="section__head"><h2 class="section__title">Рекомендации для вас</h2></div><div class="grid">${RECS.map(cardHTML).join('')}</div></section>`;
  CATEGORIES.forEach(c => {
    const items = list.filter(p => p.cat === c.id && p.img && stockOf(p) > 0).sort((a, b) => b.popularity - a.popularity);
    if (!items.length) return;
    html += `<section class="section"><div class="section__head"><h2 class="section__title">${c.name}</h2><button class="section__more" data-cat="${c.id}">Все${svgI('chev', 15)}</button></div><div class="hrow">${items.slice(0, 12).map(cardHTML).join('')}</div></section>`;
  });
  root.innerHTML = html;
}

let RECS = null;
function catItems() {
  return [{ id: 'all', name: 'Все товары', icon: 'cart' }, ...CATEGORIES];
}
function renderCats() {
  const counts = {};
  PRODUCTS.forEach(p => counts[p.cat] = (counts[p.cat] || 0) + 1);
  const active = id => state.route === 'catalog' && state.cat === id;
  $('#catNav').innerHTML = catItems().map(c => `
    <button class="cat-link ${active(c.id) ? 'active' : ''}" data-cat="${c.id}">
      ${ic(c.icon, 'cat-link__icon')}<span class="cat-link__name">${c.name}</span>
      <span class="cat-link__count">${c.id === 'all' ? PRODUCTS.length : counts[c.id]}</span>
    </button>`).join('') + `
    <div class="cats__sep"></div>
    <a class="cat-link ${state.route === 'favorites' ? 'active' : ''}" href="#/favorites" data-cat-fav>${svgI('heart', 20, 'cat-link__icon')}<span class="cat-link__name">Избранное</span><span class="cat-link__count" data-fav-side>${state.favs.length || ''}</span></a>
    <a class="cat-link ${state.route === 'orders' ? 'active' : ''}" href="#/orders">${svgI('package', 20, 'cat-link__icon')}<span class="cat-link__name">Мои заказы</span><span class="cat-link__count">${state.orders.length || ''}</span></a>`;
  $$('[data-fav-count]').forEach(b => { b.hidden = !state.favs.length; b.textContent = state.favs.length; });
}
let catStripX = 0;
function renderCatStrip() {
  const s = $('#catStrip');
  if (s) s.onscroll = () => { catStripX = s.scrollLeft; };
  if (s) s.innerHTML = catItems().map(c => `<button class="circle ${state.cat === c.id ? 'active' : ''}" data-cat="${c.id}"><span class="circle__img" style="background:${c.color || 'var(--surface)'}">${ic(c.icon, '')}</span><span class="circle__name">${c.name}</span></button>`).join('');
  if (s) s.scrollLeft = catStripX;
}


/* ================= Icon tiles (единый стиль иконок) ================= */
const tile = (name, color, cls = '') => `<span class="pico ${cls}">${svgI(name, 24)}</span>`;

/* ================= Account & sub screens ================= */
const icoBack = svgI('back', 26);
const icoChev = svgI('chev', 18);
const backBar = () => `<div class="subhead"><button class="subhead__back" data-action="back" aria-label="Назад">${icoBack}</button></div>`;
function addGap() { $('#page').insertAdjacentHTML('afterbegin', '<div class="tabgap"></div>'); }
function addBack() { $('#page').insertAdjacentHTML('afterbegin', backBar()); }
function addressText() {
  const a = state.address || {};
  return a.street ? `${a.street}, ${a.house || ''}${a.apt ? ', кв. ' + a.apt : ''}` : 'Не указан';
}
function renderAccount() {
  $('#page').innerHTML = `
    <div class="acc acc--top">
      <button class="acc__login" data-action="login">Войти или зарегистрироваться</button>
      <a class="acc__card acc__row" href="#/address">
        ${tile('pin', 'blue', 'acc__tile')}
        <span class="acc__text"><small>Адрес доставки</small><b>${esc(addressText())}</b></span>${icoChev}
      </a>
      <div class="acc__card">
        <a class="acc__row" href="#/orders">${tile('receipt', '', 'acc__tile')}<span class="acc__text"><b>Мои заказы</b></span>${state.orders.length ? `<span class="acc__count">${state.orders.length}</span>` : ''}${icoChev}</a>
        <a class="acc__row" href="#/settings">${tile('gear', 'slate', 'acc__tile')}<span class="acc__text"><b>Настройки</b></span>${icoChev}</a>
        <a class="acc__row" href="#/about">${tile('info', 'violet', 'acc__tile')}<span class="acc__text"><b>О сервисе</b></span>${icoChev}</a>
      </div>
      <div class="acc__foot"><div class="acc__brand">Mayr<b>Market</b></div><div>Версия 1.0</div></div>
    </div>`;
}
function renderSettings() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#page').innerHTML = `${backBar()}
    <div class="acc">
      <h1 class="acc__title">Настройки</h1>
      <div class="acc__card">
        <label class="acc__row acc__switchrow">${tile('moon', 'night', 'acc__tile')}<span class="acc__text"><b>Тёмная тема</b></span>
          <input type="checkbox" class="switch" id="darkSwitch" ${dark ? 'checked' : ''}></label>
      </div>
    </div>`;
  $('#darkSwitch').onchange = e => { state.theme = e.target.checked ? 'dark' : 'light'; LS.set('theme', state.theme); applyTheme(); };
}
function renderAddress() {
  const f = state.address || {};
  $('#page').innerHTML = `${backBar()}
    <div class="acc">
      <h1 class="acc__title">Адрес доставки</h1>
      <form class="acc__form" id="addrForm" novalidate>
        <div class="field"><input name="street" placeholder=" " value="${esc(f.street || '')}"><label>Улица</label></div>
        <div class="row row--3">
          <div class="field"><input name="house" placeholder=" " value="${esc(f.house || '')}"><label>Дом</label></div>
          <div class="field"><input name="apt" placeholder=" " value="${esc(f.apt || '')}"><label>Кв./офис</label></div>
          <div class="field"><input name="entrance" placeholder=" " value="${esc(f.entrance || '')}"><label>Подъезд</label></div>
        </div>
        <div class="row row--2">
          <div class="field"><input name="floor" placeholder=" " value="${esc(f.floor || '')}"><label>Этаж</label></div>
          <div class="field"><input name="code" placeholder=" " value="${esc(f.code || '')}"><label>Домофон</label></div>
        </div>
        <button class="acc__login acc__save" type="submit">Сохранить</button>
      </form>
    </div>`;
  $('#addrForm').onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (!d.street.trim() || !d.house.trim()) { toast('Укажите улицу и дом'); return; }
    state.address = { ...state.address, ...d };
    LS.set('address', state.address);
    renderPoint();
    toast('Адрес сохранён');
    history.length > 1 ? history.back() : (location.hash = '#/account');
  };
}
function renderAbout() {
  const pt = POINTS[0];
  $('#page').innerHTML = `${backBar()}
    <div class="acc">
      <h1 class="acc__title">О сервисе</h1>
      <div class="acc__card acc__about">
        <p><b>MayrMarket</b> — доставка продуктов по Грозному из магазинов города. Цены и наличие — как в самих магазинах.</p>
        <div class="acc__kv"><span>Магазины</span><b>${STORES.map(s => esc(s.name)).join(', ')}</b></div>
        <div class="acc__kv"><span>Часы доставки</span><b>${hours(pt)}</b></div>
        <div class="acc__kv"><span>Время доставки</span><b>${pt.eta}</b></div>
        <div class="acc__kv"><span>Доставка</span><b>${rub(pt.deliveryFee)}, от ${rub(pt.freeFrom)} бесплатно</b></div>
        <div class="acc__kv"><span>Товаров в каталоге</span><b>${PRODUCTS.length.toLocaleString('ru-RU')}</b></div>
      </div>
      <div class="acc__credit">Иконки: <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener">Uicons by Flaticon</a></div>
      <div class="acc__foot"><div class="acc__brand">Mayr<b>Market</b></div><div>Версия 1.0</div></div>
    </div>`;
}

/* ================= Favorites page ================= */
function renderFavorites() {
  const page = $('#page');
  const items = state.favs.map(id => byId[id]).filter(Boolean);
  if (!items.length) {
    page.innerHTML = `
      <div class="toolbar"><h1 class="toolbar__title">Избранное</h1></div>
      <div class="empty">${tile('heart', 'red', 'empty__tile')}<div class="empty__title">В избранном пусто</div>Нажмите на сердечко на карточке товара<br><a class="btn btn--primary btn--sm" href="#/">В каталог</a></div>`;
    return;
  }
  const list = sortList(items, state.favSort);
  const avail = items.filter(p => stockOf(p) > 0);
  const sum = avail.reduce((s, p) => s + p.price, 0);
  page.innerHTML = `
    <div class="toolbar">
      <h1 class="toolbar__title">Избранное <small>${items.length}</small></h1>
      <div class="toolbar__controls">${sortSelect('favSort', state.favSort, `<option value="added" ${state.favSort === 'added' ? 'selected' : ''}>Недавно добавленные</option>`)}</div>
    </div>
    <div class="fav-summary">
      <span>В наличии${state.point ? ` на складе <b>${point().city}</b>` : ''}: <b>${avail.length} из ${items.length}</b> · по 1 шт. на <b>${rub(sum)}</b></span>
      <div class="page-actions">
        <button class="btn btn--ghost btn--sm" data-action="clear-favs">Очистить</button>
        <button class="btn btn--primary btn--sm" data-action="favs-to-cart" ${avail.length ? '' : 'disabled'}>Всё в корзину</button>
      </div>
    </div>
    <div class="grid">${list.map(cardHTML).join('')}</div>`;
}

/* ================= Orders page ================= */
const STEPS_DELIVERY = [['clip', 'Принят'], ['bag', 'Собираем'], ['moped', 'В пути'], ['check', 'Доставлен']];
const STEPS_PICKUP = [['clip', 'Принят'], ['bag', 'Собираем'], ['store', 'Готов'], ['check', 'Выдан']];
const payLabel = p => ({ card: 'Картой онлайн', sbp: 'СБП', 'courier-card': 'Картой при получении', cash: 'Наличными' })[p] || p;

function orderStage(o) {
  if (o.slot && o.slot !== 'asap') {
    const start = new Date(o.slot).getTime() - 30 * 60e3;
    if (Date.now() < start) return 0;
    const el = (Date.now() - start) / 1000;
    return el < 20 ? 1 : el < 60 ? 2 : 3;
  }
  const el = (Date.now() - o.createdAt) / 1000;
  return el < 8 ? 0 : el < 25 ? 1 : el < 60 ? 2 : 3;
}

function renderOrders() {
  const page = $('#page');
  if (!state.orders.length) {
    page.innerHTML = `<div class="toolbar"><h1 class="toolbar__title">Мои заказы</h1></div>
      <div class="empty">${tile('receipt', 'orange', 'empty__tile')}<div class="empty__title">Заказов пока нет</div><a class="btn btn--primary btn--sm" href="#/">В каталог</a></div>`;
    return;
  }
  page.innerHTML = `<div class="toolbar"><h1 class="toolbar__title">Мои заказы <small>${state.orders.length}</small></h1></div>
    <div class="orders">${state.orders.map(o => {
      const st = orderStage(o);
      const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
      const pt = POINTS.find(p => p.id === o.point) || POINTS[0];
      return `<div class="order">
        <div class="order__head">
          <div><div class="order__num">№${o.id} · ${pt.city}</div><div class="order__date">${new Date(o.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${o.mode === 'pickup' ? 'самовывоз' : o.address}</div></div>
          <span class="order__status ${st === 3 ? 'done' : ''}">${steps[st][1]}</span>
        </div>
        <div class="order__icons">${o.items.slice(0, 7).map(i => byId[i.id] ? `<span style="background:${byId[i.id].img ? '#fff' : catById[byId[i.id].cat].color}">${pic(byId[i.id])}</span>` : '').join('')}${o.items.length > 7 ? `<em>+${o.items.length - 7}</em>` : ''}</div>
        <div class="order__foot">
          <span class="order__sum">${rub(o.total)}</span>
          <span class="order__btns">
            <button class="btn btn--ghost btn--sm" data-track="${o.id}">Статус</button>
            <button class="btn btn--primary btn--sm" data-repeat="${o.id}">Повторить</button>
          </span>
        </div>
      </div>`;
    }).join('')}</div>`;
}

/* ================= Point ================= */
function renderPoint() {
  const pt = point();
  $('#pointCity').textContent = typeof WAREHOUSES_ENABLED !== 'undefined' && WAREHOUSES_ENABLED && pt ? `Склад ${pt.city}` : 'Доставка по Грозному';
  const open = pt ? isOpen(pt) : false;
  $('#pointDot').classList.toggle('off', !open);
  $('#pointMeta').textContent = pt
    ? (state.address.street ? `${state.address.street}, ${state.address.house || ''}` : (open ? `Сегодня до ${pt.hours[1]}:00 · ${pt.eta}` : `Завтра с ${String(pt.hours[0]).padStart(2, '0')}:00`))
    : 'Грозный';
  if (!pt) { $('#pointCard').innerHTML = `<button class="btn btn--primary btn--sm btn--block" data-action="open-points">Выбрать склад</button>`; return; }
  $('#pointCard').innerHTML = `
    <div class="point-card__title"><span class="status-dot ${isOpen(pt) ? '' : 'closed'}"></span>Доставка по Грозному</div>
    <div class="point-card__row"><span>Магазинов</span><b>${STORES.length}</b></div>
    <div class="point-card__row"><span>Часы</span><b>${hours(pt)}</b></div>
    <div class="point-card__row"><span>Доставка</span><b>${pt.eta}</b></div>
    <div class="point-card__row"><span>Бесплатно от</span><b>${rub(pt.freeFrom)}</b></div>${pt.minOrder ? `
    <div class="point-card__row"><span>Заказ от</span><b>${rub(pt.minOrder)}</b></div>` : ''}`;
}

function mapSVG(sel) {
  const roads = `<path d="M40 70 C120 90 200 100 262 118 S380 120 470 100"/><path d="M148 196 C190 160 230 140 262 118"/><path d="M262 118 C290 150 310 180 330 206"/><path d="M148 196 C220 215 280 215 330 206"/><path d="M60 230 C100 215 120 205 148 196"/><path d="M330 206 C380 220 430 240 470 250"/>`;
  const pins = POINTS.map(p => {
    const on = p.id === sel;
    return `<g class="map-pin" data-pick="${p.id}" transform="translate(${p.x},${p.y})">
      ${on ? '<circle r="20" fill="#0033B0" opacity=".18"/>' : ''}
      <circle r="${on ? 10 : 8}" fill="${on ? '#0033B0' : '#fff'}" stroke="${on ? '#fff' : '#0033B0'}" stroke-width="3"/>
      <text y="-18" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${p.city}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="20 30 470 250" preserveAspectRatio="xMidYMid meet" style="color:var(--text)">
    <path d="M30 40 C140 60 220 70 300 60 S420 40 500 55" fill="none" stroke="#5aa9e6" stroke-width="5" stroke-linecap="round" opacity=".55"/>
    <text x="440" y="44" font-size="11" fill="#5aa9e6">Терек</text>
    <path d="M300 320 C305 250 290 170 262 118" fill="none" stroke="#5aa9e6" stroke-width="3" opacity=".5"/>
    <text x="300" y="268" font-size="11" fill="#5aa9e6">Аргун</text>
    <g fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="3" stroke-linecap="round">${roads}</g>
    ${pins}
  </svg>`;
}

function openPoints() {
  let sel = state.point || POINTS[0].id;
  let mode = state.mode;
  const draw = () => {
    $('#modal').className = 'modal show';
    $('#modal').innerHTML = `
      <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
      <div class="pts">
        <div class="pts__map">${mapSVG(sel)}</div>
        <div class="pts__list">
          <h2 class="pts__title">Доставка по Грозному</h2>
          ${POINTS.map(p => {
            const open = isOpen(p);
            const n = PRODUCTS.filter(x => x.stock[p.id] > 0).length;
            return `<button class="pt ${p.id === sel ? 'active' : ''}" data-pick="${p.id}">
              <span class="pt__city">${p.city}</span>
              <span class="pt__addr">Товары из магазинов: ${p.store}</span>
              <span class="pt__eta">${p.eta}<small class="${open ? '' : 'closed'}">${open ? 'Открыто' : 'Закрыто'}</small></span>
              <span class="pt__info">${hours(p)} · ${n.toLocaleString('ru-RU')} товаров · доставка ${rub(p.deliveryFee)}, от ${rub(p.freeFrom)} бесплатно${p.minOrder ? ` · заказ от ${rub(p.minOrder)}` : ''}</span>
            </button>`;
          }).join('')}
          <button class="btn btn--primary btn--block" data-confirm-point>Готово</button>
        </div>
      </div>`;
  };
  draw();
  showOverlay();
  $('#modal').onclick = e => {
    const pick = e.target.closest('[data-pick]'), m = e.target.closest('[data-mode]');
    if (pick) { sel = pick.dataset.pick; draw(); }
    else if (m) { mode = m.dataset.mode; draw(); }
    else if (e.target.closest('[data-confirm-point]')) {
      const changed = state.point && state.point !== sel;
      state.point = sel; state.mode = mode; save();
      closeAll(); renderAll();
      const bad = cartLines().filter(l => !l.ok).length;
      toast(changed && bad ? `${bad} ${plural(bad, 'товар недоступен', 'товара недоступны', 'товаров недоступны')}` : `Доставка: ${point().city}`);
    }
  };
}

/* ================= Cart ================= */
function cartHTML(inDrawer) {
  const t = totals();
  const head = (extra = '') => `<div class="cart__head" ${inDrawer ? 'style="padding-right:62px"' : ''}><h2 class="cart__title">Корзина</h2>${extra}</div>`;
  if (!t.lines.length) {
    return `<div class="cart">${head()}<div class="cart__body"><div class="cart__empty">${tile('bag', 'green', 'empty__tile')}<b>Корзина пуста</b></div></div></div>`;
  }
  const bad = t.lines.filter(l => !l.ok);
  return `<div class="cart">
    ${head(`<button class="cart__clear" data-action="clear-cart">Очистить</button>`)}
    <div class="cart__body">
      ${!t.isPickup ? `<div class="delivery-bar">
        <div class="delivery-bar__row"><span>${t.toFree > 0 ? `До бесплатной доставки ${rub(t.toFree)}` : 'Бесплатная доставка'}</span><span>${t.pt.eta}</span></div>
        <div class="progress"><i style="width:${Math.min(100, t.subtotal / t.pt.freeFrom * 100)}%"></i></div>
      </div>` : `<div class="delivery-bar"><div class="delivery-bar__row"><span>Самовывоз · ${t.pt.address}</span><span>~10 мин</span></div></div>`}
      ${bad.length ? `<div class="danger-box"><span>${bad.length} ${plural(bad.length, 'товара', 'товаров', 'товаров')} нет на складе ${t.pt.city}</span><button data-action="remove-bad">Убрать</button></div>` : ''}
      ${t.lines.map(l => `
        <div class="cart-item ${l.ok ? '' : 'unavailable'}">
          <div class="cart-item__img" style="background:${l.p.img ? '#fff' : catById[l.p.cat].color}" data-open="${l.p.id}">${pic(l.p)}</div>
          <div>
            <div class="cart-item__name">${esc(l.p.name)}</div>
            <div class="cart-item__meta">${rubP(l.p.price)}${l.p.kg ? ' / кг' : ''}</div>
            ${l.ok ? `<div class="cart-item__price">${rubP(l.sum)}</div>`
              : `<div class="cart-item__warn">${l.avail ? `Осталось ${l.avail} шт` : 'Нет в наличии'}</div>`}
          </div>
          <div data-action-for="${l.p.id}" data-size="stepper--sm stepper--soft">${l.avail ? actionHTML(l.p, 'stepper--sm stepper--soft') : `<button class="cart__clear" data-remove="${l.p.id}">Удалить</button>`}</div>
        </div>`).join('')}
    </div>
    <div class="cart__foot">
      <div class="totals">
        <div class="totals__row"><span>Товары, ${t.lines.length} поз.</span><b>${rubP(t.subtotal)}</b></div>
        <div class="totals__row"><span>${t.isPickup ? 'Самовывоз' : 'Доставка'}</span><b>${t.delivery ? rub(t.delivery) : 'Бесплатно'}</b></div>
        <div class="totals__row totals__row--total"><span>Итого</span><b>${rub(t.total)}</b></div>
      </div>
      ${!t.minOk ? `<div class="warn-box">Минимальный заказ ${rub(t.pt.minOrder)}, не хватает ${rub(t.pt.minOrder - t.subtotal)}</div>` : ''}
      <button class="btn btn--primary btn--block btn--between" data-action="checkout" ${t.minOk && t.okLines.length ? '' : 'disabled'}><span>Оформить</span><span>${rub(t.total)}</span></button>
    </div>
  </div>`;
}

function renderCart() {
  const t = totals();
  const body = $('#sideCart .cart__body'), scroll = body ? body.scrollTop : 0;
  $('#sideCart').innerHTML = cartHTML(false);
  if ($('#sideCart .cart__body')) $('#sideCart .cart__body').scrollTop = scroll;
  if (state.route === 'cart' && $('#page .cart-page')) $('#page .cart-page').innerHTML = cartHTML(false);
  if ($('#drawer').dataset.view === 'cart') {
    const db = $('#drawer .cart__body'), ds = db ? db.scrollTop : 0;
    $('#drawer').innerHTML = `<button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>` + cartHTML(true);
    if ($('#drawer .cart__body')) $('#drawer .cart__body').scrollTop = ds;
  }
  $$('[data-cart-total]').forEach(el => el.textContent = t.count ? rub(t.total) : 'Корзина');
  $$('[data-cart-count]').forEach(el => { el.hidden = !t.count; el.textContent = t.count; });
}

/* ================= Product modal ================= */
function openProduct(id) {
  const p = byId[id], c = catById[p.cat];
  const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id && stockOf(x) > 0).sort((a, b) => (b.sub === p.sub) - (a.sub === p.sub) || (!!b.img - !!a.img) || b.popularity - a.popularity).slice(0, 4);
  const s = stockOf(p);
  const m = $('#modal');
  m.className = 'modal';
  m.innerHTML = `
    <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
    <div class="pm">
      <div class="pm__img" style="background:${p.img ? '#fff' : c.color}">${p.imgLarge ? `<img class="ic photo" src="${p.imgLarge}" alt="" onerror="this.onerror=null;this.className='ic';this.src='assets/icons/${p.icon}.webp'">` : ic(p.icon)}<div class="card__tags" style="left:16px;top:16px">${tagsHTML(p)}</div></div>
      <div class="pm__body">
        <div><h2 class="pm__name">${esc(p.name)}</h2>${p.unit ? `<div class="pm__unit">Цена ${p.unit}</div>` : ''}</div>
        <div class="pm__meta">
          <span>${ic(c.icon, '')}${c.name}</span>
          ${p.sub ? `<span>${esc(p.sub)}</span>` : ''}
        </div>
        <div class="pm__stock">
          ${p.offers.map((o, i) => `<div class="pm__stock-row ${i === 0 ? 'current' : ''}"><span>${esc(STORES[o[0]].name)}</span><b>${rubP(o[2])}${i === 0 && p.offers.length > 1 ? ' · дешевле' : ''}</b></div>`).join('')}
          <div class="pm__stock-row"><span>Наличие</span><b>${s ? (s > 20 ? 'В наличии' : `${s} ${p.kg ? 'кг' : 'шт'}`) : 'Нет'}</b></div>
        </div>
        <div class="pm__buy">
          <div>
            <div class="price">${rubP(p.price)}</div>${p.oldPrice > p.price ? `<div class="price-old">${rubP(p.oldPrice)}</div>` : ''}
          </div>
          <div data-action-for="${p.id}" data-size="primary">${actionHTML(p, 'primary')}</div>
          <button class="pm__fav ${isFav(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="В избранное">${heart}</button>
        </div>
      </div>
      ${related.length ? `<div class="pm__related"><h3>Ещё в категории</h3><div class="grid">${related.map(cardHTML).join('')}</div></div>` : ''}
    </div>`;
  m.classList.add('show');
  m.scrollTop = 0;
  showOverlay();
}

/* ================= Checkout ================= */
function timeSlots() {
  const pt = point();
  const slots = [{ id: 'asap', title: 'Как можно скорее', sub: state.mode === 'pickup' ? '~10 мин' : pt.eta }];
  const now = new Date();
  for (let d = 0; d < 2 && slots.length < 15; d++) {
    for (let h = pt.hours[0]; h < pt.hours[1] && slots.length < 15; h++) {
      const start = new Date(now); start.setDate(now.getDate() + d); start.setHours(h, 0, 0, 0);
      if (start - now < 60 * 60 * 1000) continue;
      slots.push({ id: start.toISOString(), title: `${h}:00–${h + 1}:00`, sub: d === 0 ? 'Сегодня' : 'Завтра' });
    }
  }
  return slots;
}

function openCheckout() {
  const t = totals();
  if (!t.minOk || !t.okLines.length) return;
  const f = { slot: 'asap', pay: 'card', tip: 0, ...state.address };
  const pt = t.pt, pickup = t.isPickup;
  const m = $('#modal');
  m.className = 'modal modal--wide show';
  showOverlay();
  m.innerHTML = `
    <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
    <form class="checkout" id="checkoutForm" novalidate>
      <div class="checkout__form">
        <h2 class="checkout__title">Оформление заказа</h2>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">1</span>${pickup ? 'Самовывоз' : 'Адрес доставки'} · ${pt.city}</div>
          ${pickup ? `<div class="pickup-box">${svgI('store', 26)}<div><b>${pt.address}</b><div style="font-size:13px;color:var(--text-2)">${hours(pt)} · ${pt.phone}</div></div></div>` : `
          <div class="row row--3">
            <div class="field"><input name="street" placeholder=" " value="${f.street || ''}"><label>Улица</label></div>
            <div class="field"><input name="house" placeholder=" " value="${f.house || ''}"><label>Дом</label></div>
            <div class="field"><input name="apt" placeholder=" " value="${f.apt || ''}"><label>Кв./офис</label></div>
          </div>
          <div class="row row--4">
            <div class="field"><input name="entrance" placeholder=" " value="${f.entrance || ''}"><label>Подъезд</label></div>
            <div class="field"><input name="floor" placeholder=" " value="${f.floor || ''}"><label>Этаж</label></div>
            <div class="field"><input name="code" placeholder=" " value="${f.code || ''}"><label>Домофон</label></div>
            <div class="field"><select name="zone">${pt.zones.map(z => `<option ${f.zone === z ? 'selected' : ''}>${z}</option>`).join('')}</select><label>Район</label></div>
          </div>`}
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">2</span>Контакты</div>
          <div class="row row--2">
            <div class="field"><input name="name" placeholder=" " value="${f.name || ''}" autocomplete="given-name"><label>Имя</label></div>
            <div class="field"><input name="phone" type="tel" placeholder=" " value="${f.phone || ''}" autocomplete="tel"><label>Телефон</label></div>
          </div>
          <div class="field"><textarea name="comment" placeholder=" "></textarea><label>Комментарий${pickup ? '' : ' курьеру'}</label></div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">3</span>Время</div>
          <div class="slots">${timeSlots().map(s => `<button type="button" class="slot ${s.id === f.slot ? 'active' : ''}" data-slot="${s.id}">${s.title}<small>${s.sub}</small></button>`).join('')}</div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">4</span>Оплата</div>
          <div class="opts">
            ${[['card', 'card', 'Картой онлайн', 'Visa, MC, МИР'], ['sbp', 'qr', 'СБП', 'По QR-коду'], ['courier-card', 'terminal', pickup ? 'Картой на кассе' : 'Картой курьеру', 'Терминал'], ['cash', 'cash', 'Наличными', 'При получении']]
              .map(([id, icon, ti, su]) => `<button type="button" class="opt ${f.pay === id ? 'active' : ''}" data-pay="${id}">${svgI(icon, 24)}<span class="opt__title">${ti}</span><span class="opt__sub">${su}</span></button>`).join('')}
          </div>
          <div id="payExtra"></div>
        </div>
        <div class="fieldset">
          <div class="fieldset__title"><span class="fieldset__num">5</span>Дополнительно</div>
          ${pickup ? '' : `<label class="toggle">Оставить у двери<input type="checkbox" name="leave"><i></i></label>
          <label class="toggle">Не звонить в домофон<input type="checkbox" name="noCall"><i></i></label>`}
          <div class="field"><select name="replace">
            <option value="call">Позвонить и согласовать</option>
            <option value="similar">Заменить на похожий</option>
            <option value="remove">Убрать из заказа</option>
          </select><label>Если товара не окажется</label></div>
          ${pickup ? '' : `<div style="font-weight:600;font-size:14px">Чаевые курьеру</div>
          <div class="slots">${[0, 50, 100, 150, 200].map(v => `<button type="button" class="slot ${f.tip === v ? 'active' : ''}" data-tip="${v}">${v ? rub(v) : 'Без чаевых'}</button>`).join('')}</div>`}
        </div>
      </div>
      <div class="checkout__side"><div class="checkout__side-inner">
        <div style="font-weight:800;font-size:18px">Ваш заказ</div>
        <div class="summary-items">
          ${t.okLines.map(l => `<div class="summary-item"><span class="summary-item__img" style="background:${l.p.img ? '#fff' : catById[l.p.cat].color}">${pic(l.p)}</span><span class="summary-item__name">${esc(l.p.name)}</span><span>×${l.qty}${l.p.kg ? ' кг' : ''}</span><b>${rubP(l.sum)}</b></div>`).join('')}
        </div>
        <div class="totals" id="checkoutTotals"></div>
        <button class="btn btn--primary btn--block btn--between" type="submit" id="payBtn"></button>
      </div></div>
    </form>`;
  m.scrollTop = 0;

  const form = $('#checkoutForm');
  const drawTotals = () => {
    const tt = totals();
    const sum = tt.total + (pickup ? 0 : f.tip);
    $('#checkoutTotals').innerHTML = `
      <div class="totals__row"><span>Товары</span><b>${rubP(tt.subtotal)}</b></div>
      <div class="totals__row"><span>${pickup ? 'Самовывоз' : 'Доставка'}</span><b>${tt.delivery ? rub(tt.delivery) : 'Бесплатно'}</b></div>
      ${f.tip && !pickup ? `<div class="totals__row"><span>Чаевые</span><b>${rub(f.tip)}</b></div>` : ''}
      <div class="totals__row totals__row--total"><span>К оплате</span><b>${rub(sum)}</b></div>`;
    $('#payBtn').innerHTML = `<span>${f.pay === 'card' || f.pay === 'sbp' ? 'Оплатить' : 'Заказать'}</span><span>${rub(sum)}</span>`;
  };
  const drawPay = () => {
    $('#payExtra').innerHTML = f.pay === 'card' ? `<div class="card-form">
        <input name="cardNum" inputmode="numeric" placeholder="Номер карты" maxlength="19" autocomplete="cc-number">
        <div class="row row--2" style="grid-template-columns:1fr 1fr"><input name="cardExp" inputmode="numeric" placeholder="ММ/ГГ" maxlength="5" autocomplete="cc-exp"><input name="cardCvc" inputmode="numeric" placeholder="CVC" maxlength="3" type="password" autocomplete="cc-csc"></div>
      </div>`
      : f.pay === 'cash' ? `<div class="field"><input name="change" inputmode="numeric" placeholder=" "><label>С какой суммы сдача</label></div>` : '';
  };
  drawPay(); drawTotals();

  form.onclick = e => {
    const s = e.target.closest('[data-slot]'), p = e.target.closest('[data-pay]'), tp = e.target.closest('[data-tip]');
    if (s) { f.slot = s.dataset.slot; $$('[data-slot]', form).forEach(b => b.classList.toggle('active', b === s)); }
    if (p) { f.pay = p.dataset.pay; $$('[data-pay]', form).forEach(b => b.classList.toggle('active', b === p)); drawPay(); drawTotals(); }
    if (tp) { f.tip = +tp.dataset.tip; $$('[data-tip]', form).forEach(b => b.classList.toggle('active', b === tp)); drawTotals(); }
  };
  form.oninput = e => {
    const el = e.target;
    if (el.name === 'phone') el.value = maskPhone(el.value);
    if (el.name === 'cardNum') el.value = el.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    if (el.name === 'cardExp') { let v = el.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); el.value = v; }
    if (el.name === 'cardCvc' || el.name === 'change') el.value = el.value.replace(/\D/g, '');
    el.classList.remove('bad');
    const fld = el.closest('.field');
    if (fld) { fld.classList.remove('error'); fld.querySelector('.field__err')?.remove(); }
  };
  form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    let first = null;
    const err = (name, msg) => {
      const el = form.elements[name];
      if (!el) return;
      first = first || el;
      const fld = el.closest('.field');
      if (fld) { fld.classList.add('error'); if (!fld.querySelector('.field__err')) fld.insertAdjacentHTML('beforeend', `<div class="field__err">${msg}</div>`); }
      else el.classList.add('bad');
    };
    if (!pickup) { if (!data.street?.trim()) err('street', 'Укажите улицу'); if (!data.house?.trim()) err('house', 'Укажите дом'); }
    if (!data.name?.trim()) err('name', 'Укажите имя');
    if ((data.phone || '').replace(/\D/g, '').length !== 11) err('phone', 'Номер полностью');
    if (f.pay === 'card') {
      if ((data.cardNum || '').replace(/\D/g, '').length !== 16) err('cardNum');
      if (!/^(0[1-9]|1[0-2])\/\d\d$/.test(data.cardExp || '')) err('cardExp');
      if ((data.cardCvc || '').length !== 3) err('cardCvc');
    }
    if (first) { first.focus(); toast('Проверьте поля'); return; }

    state.address = { street: data.street, house: data.house, apt: data.apt, entrance: data.entrance, floor: data.floor, code: data.code, zone: data.zone, name: data.name, phone: data.phone };
    LS.set('address', state.address);
    const btn = $('#payBtn');
    btn.disabled = true; btn.innerHTML = '<span>Обрабатываем…</span>';
    setTimeout(() => placeOrder({ ...f, ...data, pickup }), f.pay === 'card' || f.pay === 'sbp' ? 1200 : 500);
  };
}

function maskPhone(v) {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  let out = '+7';
  if (p[0]) out += ' (' + p[0] + (p[0].length === 3 ? ')' : '');
  if (p[1]) out += ' ' + p[1];
  if (p[2]) out += '-' + p[2];
  if (p[3]) out += '-' + p[3];
  return out;
}

function placeOrder(f) {
  const t = totals();
  const order = {
    id: String(Date.now()).slice(-6), createdAt: Date.now(), point: state.point, mode: state.mode,
    items: t.okLines.map(l => ({ id: l.p.id, name: l.p.name, qty: l.qty, price: l.p.price, offers: l.p.offers })),
    total: t.total + (f.pickup ? 0 : f.tip), pay: f.pay, slot: f.slot,
    address: f.pickup ? point().address : `${f.street}, ${f.house}${f.apt ? ', кв. ' + f.apt : ''}`
  };
  state.orders.unshift(order);
  t.okLines.forEach(l => delete state.cart[l.p.id]);
  save(); renderAll();
  openTracking(order.id);
}

/* ================= Tracking ================= */
let trackTimer = null;
function openTracking(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  const pt = POINTS.find(p => p.id === o.point) || POINTS[0];
  const steps = o.mode === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
  const m = $('#modal');
  const draw = () => {
    const st = orderStage(o);
    const scheduled = o.slot && o.slot !== 'asap' && st === 0;
    m.innerHTML = `
      <button class="close-x" data-close aria-label="Закрыть">${svgI('x', 18)}</button>
      <div class="success">
        <span class="success__icon">${svgI(steps[st][0], 56)}</span>
        <h2>Заказ №${o.id}</h2>
        <p>${scheduled ? `Доставим ${new Date(o.slot).toLocaleString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : `${steps[st][1]} · ${o.address}`}</p>
        <div class="track">${steps.map((s, i) => `<div class="track__step ${i < st ? 'done' : i === st ? 'cur' : ''}"><span class="track__dot">${svgI(s[0], 18)}</span>${s[1]}</div>`).join('')}</div>
        ${o.mode !== 'pickup' && st === 2 ? `<div class="courier"><span class="courier__ava">${svgI('moped', 24)}</span><div style="flex:1"><div class="courier__name">Курьер Ислам</div><div class="courier__meta">Будет через ~${Math.max(3, 15 - Math.round((Date.now() - o.createdAt) / 6000))} мин</div></div><a class="btn btn--ghost btn--sm" href="tel:+${pt.phone.replace(/\D/g, '')}">Позвонить</a></div>` : ''}
        <div class="totals" style="margin-top:18px;text-align:left">
          
          <div class="totals__row"><span>Оплата</span><b>${payLabel(o.pay)}</b></div>
          <div class="totals__row totals__row--total"><span>Сумма</span><b>${rub(o.total)}</b></div>
        </div>
        <div class="row row--2" style="margin-top:8px">
          <a class="btn btn--ghost" href="#/orders">Мои заказы</a>
          <button class="btn btn--primary" data-close>Продолжить</button>
        </div>
      </div>`;
    if (st >= 3) clearInterval(trackTimer);
  };
  clearInterval(trackTimer);
  m.className = 'modal show';
  draw();
  showOverlay();
  trackTimer = setInterval(() => m.classList.contains('show') ? draw() : clearInterval(trackTimer), 2000);
}

function repeatOrder(id) {
  const o = state.orders.find(x => x.id === id);
  let missing = 0;
  o.items.forEach(i => {
    if (!byId[i.id]) { missing++; return; }
    const s = stockOf(byId[i.id]);
    const q = Math.min(s, (state.cart[i.id] || 0) + i.qty);
    if (q > 0) state.cart[i.id] = q;
    if (s < i.qty) missing++;
  });
  save(); renderAll(); openCart();
  toast(missing ? `${missing} ${plural(missing, 'товара', 'товаров', 'товаров')} не хватает на складе` : 'Добавлено в корзину');
}

/* ================= Overlays ================= */
/* Блокировка прокрутки фона (надёжно и на iPhone): фон не двигается, позиция сохраняется */
const scrollLocks = new Set(); let lockedY = 0;
function lockScroll(why) {
  if (!scrollLocks.size) {
    lockedY = window.scrollY;
    Object.assign(document.body.style, { position: 'fixed', top: -lockedY + 'px', left: '0', right: '0', width: '100%' });
    document.body.classList.add('locked');
  }
  scrollLocks.add(why);
}
function unlockScroll(why) {
  if (!scrollLocks.delete(why) || scrollLocks.size) return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' });
  document.body.classList.remove('locked');
  window.scrollTo(0, lockedY);
}
function showOverlay() { $('#overlay').classList.add('show'); lockScroll('overlay'); }
function closeAll() {
  $('#modal').classList.remove('show');
  $('#modal').onclick = null;
  $('#drawer').classList.remove('show');
  $('#drawer').dataset.view = '';
  $('#overlay').classList.remove('show');
  unlockScroll('overlay');
  clearInterval(trackTimer);
}
function openCart() {
  closeAll();
  if (state.route === 'cart') { renderPage(); window.scrollTo(0, 0); }
  else location.hash = '#/cart';
}
function renderCartPage() {
  $('#page').innerHTML = `<div class="cart-page">${cartHTML(false)}</div>`;
}

function toast(msg, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${msg}</span>${action ? `<button>${action.label}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 200); }, action ? 4000 : 2200);
}

/* ================= Events ================= */
function goCatalog(cat) {
  state.cat = cat; state.sub = null; state.limit = 60; state.dd = null;
  state.query = ''; $('#searchInput').value = '';
  if (state.route !== 'catalog') { location.hash = '#/'; return; }
  renderPage();
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const el = s => e.target.closest(s);
  let x;
  if (state.dd && !el('.dd')) { state.dd = null; renderControls(); }
  if ((x = el('[data-add]'))) return setQty(x.dataset.add, 1);
  if ((x = el('[data-inc]'))) return setQty(x.dataset.inc, (state.cart[x.dataset.inc] || 0) + 1);
  if ((x = el('[data-dec]'))) {
    const id = x.dataset.dec, q = (state.cart[id] || 0) - 1;
    setQty(id, q);
    if (q === 0) toast('Удалено из корзины', { label: 'Вернуть', fn: () => setQty(id, 1) });
    return;
  }
  if ((x = el('[data-remove]'))) { delete state.cart[x.dataset.remove]; save(); renderCart(); refreshQty(x.dataset.remove); return; }
  if ((x = el('[data-fav]'))) {
    const id = x.dataset.fav;
    state.favs = isFav(id) ? state.favs.filter(f => f !== id) : [id, ...state.favs];
    save(); syncFav(id);
    if (state.route === 'favorites' && !$('#modal').classList.contains('show')) renderFavorites();
    return;
  }
  if ((x = el('[data-open]'))) return openProduct(x.dataset.open);
  if ((x = el('[data-cat]'))) { closeAll(); return goCatalog(x.dataset.cat); }
  if ((x = el('[data-filter]'))) {
    const f = x.dataset.filter;
    state.filters.has(f) ? state.filters.delete(f) : state.filters.add(f);
    state.limit = 60;
    renderControls(); return renderCatalog();
  }
  if ((x = el('[data-sub]'))) {
    state.sub = x.dataset.sub || null; state.limit = 60; state.dd = null;
    renderControls(); return renderCatalog();
  }
  if ((x = el('[data-sort]'))) {
    state.sort = x.dataset.sort; state.limit = 60; state.dd = null;
    renderControls(); return renderCatalog();
  }
  if (el('[data-dd-close]')) { state.dd = null; return renderControls(); }
  if ((x = el('[data-dd]'))) { state.dd = state.dd === x.dataset.dd ? null : x.dataset.dd; return renderControls(); }

  if ((x = el('[data-track]'))) return openTracking(x.dataset.track);
  if ((x = el('[data-repeat]'))) return repeatOrder(x.dataset.repeat);
  if (el('[data-close]')) return closeAll();

  if ((x = el('[data-action]'))) {
    const a = x.dataset.action;
    if (a === 'open-points') openPoints();
    if (a === 'back') { history.length > 1 && document.referrer !== undefined ? history.back() : (location.hash = '#/'); }
    if (a === 'login') toast('Вход появится, когда подключим сервер');
    if (a === 'more') { state.limit += 60; const y = window.scrollY; renderCatalog(); window.scrollTo(0, y); }
    if (a === 'open-cart') openCart();
    if (a === 'toggle-theme') { state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; LS.set('theme', state.theme); applyTheme(); }
    if (a === 'clear-cart') {
      const backup = { ...state.cart };
      state.cart = {}; save(); renderAll();
      toast('Корзина очищена', { label: 'Вернуть', fn: () => { state.cart = backup; save(); renderAll(); } });
    }
    if (a === 'remove-bad') { cartLines().filter(l => !l.ok).forEach(l => l.avail ? state.cart[l.p.id] = l.avail : delete state.cart[l.p.id]); save(); renderAll(); }
    if (a === 'checkout') { $('#drawer').classList.remove('show'); $('#drawer').dataset.view = ''; openCheckout(); }
    if (a === 'reset') { state.filters.clear(); state.sub = null; state.query = ''; $('#searchInput').value = ''; goCatalog('all'); }
    if (a === 'clear-favs') {
      const backup = [...state.favs];
      state.favs = []; save(); renderPage();
      toast('Избранное очищено', { label: 'Вернуть', fn: () => { state.favs = backup; save(); renderPage(); } });
    }
    if (a === 'favs-to-cart') {
      let n = 0;
      state.favs.forEach(id => { const p = byId[id]; if (p && stockOf(p) > 0 && !state.cart[id]) { state.cart[id] = 1; n++; } });
      save(); renderAll();
      toast(n ? `Добавлено ${n} ${plural(n, 'товар', 'товара', 'товаров')}` : 'Всё уже в корзине');
    }
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'sortSelect') { state.sort = e.target.value; state.limit = 60; renderCatalog(); }
  if (e.target.id === 'favSort') { state.favSort = e.target.value; renderFavorites(); }
});
$('#overlay').addEventListener('click', closeAll);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); if (state.dd) { state.dd = null; renderControls(); } } });

let searchT;
$('#searchInput').addEventListener('input', e => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    state.query = e.target.value.trim();
    state.limit = 60;
    if (state.query) { state.cat = 'all'; state.sub = null; }
    if (state.route !== 'catalog') { location.hash = '#/'; return; }
    renderPage();
  }, 200);
});

function renderAll() {
  renderPoint(); renderPage(); renderCart();
  const active = state.orders.some(o => orderStage(o) < 3);
  $$('[data-orders-dot]').forEach(d => d.hidden = !active);
}

parseRoute();
renderAll();
if (!state.point) openPoints();
window.__CATALOG_OK = PRODUCTS.length;
})();
