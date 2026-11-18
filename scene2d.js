/* 2D 小屋场景:一张等距房间插画 + 代码层氛围动效(窗光浮尘 / 台灯 / 屏幕 / 热气 / 熊 / 窗外天气)。
   首页:单屏房间,点物件 / 导航(URL hash)时镜头推近该物件、内容以居中弹窗展示;其他页面:只做背景,随鼠标轻微视差。
   坐标全部用插画的百分比,换图时只需改 ROOM 与各物件位置。 */
const host = document.getElementById('scene');
const MOBILE = matchMedia('(max-width:820px)').matches;
const asset = f => new URL('scene/' + f, import.meta.url).href;
const ROOM = { w: 2752, h: 1536, src: asset(MOBILE ? 'room-sm.webp' : 'room.webp'), night: asset(MOBILE ? 'room-night-sm.webp' : 'room-night.webp') };

// 物件位置:[left, top, width, height],单位为插画宽/高的百分比
// 熊单独一层;椅背从底图裁出叠在熊上面,保持「熊坐在椅子里」的遮挡关系
const BEAR = [40.916, 39.453, 8.757, 22.461]; // 身体与头共用此画框
const CHAIR = [47.057, 50.065, 4.070, 12.630];
// 趴在键盘上睡的熊:连椅子一起的整块补丁(边缘羽化),睡觉 / 午休时盖在底图上,同时隐藏上面的熊和椅背
const SLEEP = [39.244, 36.458, 15.262, 33.854];
// 软木板:整块裁成一张图,每张便签用多边形裁出,绕图钉轻摆;下面垫软木色,摆动时不露原图重影
// 坐标为相对 CORK 画框的百分比:[多边形, 图钉]
const CORK = [37.972, 18.555, 9.448, 19.531];
const NOTES = [
  [[77.8, 9.8, 94.3, 2.5, 96.3, 21.5, 79.8, 28.8], [87.3, 7.0]],
  [[44.9, 23.8, 62.0, 18.5, 62.5, 38.8, 45.7, 44.2], [54.2, 21.9]],
  [[25.2, 28.5, 41.0, 24.5, 43.3, 44.2, 27.5, 47.5], [33.9, 29.9]],
  [[2.6, 41.2, 19.9, 34.8, 21.3, 55.2, 4.7, 61.6], [12.2, 39.5]],
  [[61.0, 36.1, 77.1, 34.8, 77.1, 53.5, 61.7, 54.8], [70.1, 39.3]],
  [[79.5, 33.8, 94.5, 29.4, 97.4, 46.2, 81.7, 52.2], [88.1, 35.3]],
  [[24.4, 55.2, 41.3, 50.2, 42.5, 70.8, 25.7, 77.1], [33.9, 54.6]],
  [[44.1, 66.5, 59.4, 61.2, 62.8, 78.2, 47.2, 84.2], [53.0, 65.7]],
  [[4.7, 80.5, 20.2, 75.4, 21.7, 92.8, 6.3, 98.2], [13.9, 79.9]],
];
const clip = poly => `clip-path:polygon(${poly.reduce((a, v, i) => i % 2 ? a : [...a, `${v}% ${poly[i + 1]}%`], []).join(',')})`;
const HOTSPOTS = [
  { box: [31, 39.4, 19.5, 28.7], href: '#about',    label: '关于' },
  { box: [52, 22.4, 12.8, 38.5], href: '#writing',  label: '文章' },
  { box: [37, 15.7, 10.9, 25],   href: '#timeline', label: '经历' },
  { box: [67, 31, 10, 41],       href: '#contact',  label: '联系' },
  { box: [27.5, 28.5, 7, 22],    href: '#',         label: '晨昏', toggle: true },
];
// 镜头站点:u/v 为插画上的注视点,x/y 为它落在屏幕上的位置,z 为相对铺满屏幕的缩放
// 弹窗居中,物件也居中并适度推近,让它从弹窗四周露出来
const POSE = {
  hero:     { u: .50,  v: .52, z: .80, x: .66, y: .52 },
  about:    { u: .44,  v: .52, z: 1.5, x: .50, y: .52 },
  writing:  { u: .585, v: .42, z: 1.5, x: .50, y: .50 },
  timeline: { u: .425, v: .28, z: 1.6, x: .50, y: .48 },
  contact:  { u: .74,  v: .50, z: 1.5, x: .50, y: .50 },
};
const AMBIENT_POSE = { u: .5, v: .5, z: 1, x: .5, y: .5 };

const pct = ([l, t, w, h]) => `left:${l}%;top:${t}%;width:${w}%;height:${h}%`;
const stations = [...document.querySelectorAll('[data-station]')];
const AMBIENT = stations.length === 0;

/* ---------- 作息 / 天气:按访客本地时间决定;?bear= 与 ?wx= 可强制指定,调试用 ---------- */
const Q = new URLSearchParams(location.search);
const NOW = new Date(), HOUR = NOW.getHours();
const pick = (key, list, auto) => list.includes(Q.get(key)) ? Q.get(key) : auto;
// 熊:凌晨睡觉、早上喝咖啡、午休打盹,其余时间写码
const MOOD = pick('bear', ['sleep', 'coffee', 'nap', 'work'],
  HOUR < 6 ? 'sleep' : HOUR < 9 ? 'coffee' : HOUR >= 12 && HOUR < 14 ? 'nap' : 'work');
const SLEEPY = MOOD === 'sleep' || MOOD === 'nap';
// 天气:以日期为种子,同一天各页面一致。晴 60% / 雨 30%(12–2 月为雪)/ 多云 10%
const DAY = NOW.getFullYear() * 372 + NOW.getMonth() * 31 + NOW.getDate();
const roll = (Math.imul(DAY, 0x9E3779B1) >>> 8) % 100;
const WX = pick('wx', ['sun', 'rain', 'snow', 'cloud'],
  roll < 60 ? 'sun' : roll < 90 ? ([11, 0, 1].includes(NOW.getMonth()) ? 'snow' : 'rain') : 'cloud');
// 窗玻璃的外接框,具体形状由 .fx-wx 的 clip-path 裁出(避开窗帘和台灯)
const WINDOW = [28.1, 28.5, 5.5, 20.5];
// 笔记本屏幕上滚动的「代码条」宽度(%),首尾相接循环
const CODE = [62, 38, 80, 54, 30, 72, 46];
// 彩蛋物件:[名字, 位置, 无障碍标签, 手机上是否因太小而略去]
const EGGS = [
  ['laptop', [37.2, 41.6, 4.4, 8], '笔记本电脑'],
  ['lamp', [32.3, 43.3, 3.8, 10.2], '台灯'],
  ['bin', [30.3, 59.6, 4.2, 8.7], '垃圾桶'],
  ['bed', [39.5, 69, 20.5, 19], '床'],
  ['mug', [36.5, 50.4, 2.7, 4.8], '咖啡杯', 1],
  ['clock', [58.1, 23.4, 2, 5.2], '闹钟', 1],
  ['slippers', [30.6, 69.8, 5.9, 5.3], '拖鞋', 1],
].filter(e => !(MOBILE && e[3]));

/* ---------- DOM ---------- */
const layer = document.createElement('div');
layer.className = 'room';
layer.style.width = ROOM.w + 'px';
layer.style.height = ROOM.h + 'px';
const dust = Array.from({ length: 16 }, (_, i) =>
  `<i style="left:${(i * 37) % 100}%;top:${(i * 53) % 100}%;animation-delay:${-(i * 1.7) % 12}s;animation-duration:${9 + (i % 5) * 2}s"></i>`).join('');
layer.innerHTML =
  `<img class="room-img" src="${ROOM.src}" alt="" draggable="false">` +
  `<img class="room-img room-night" alt="" draggable="false">` +
  `<div class="fx fx-beam" style="${pct([24, 30, 22, 46])}"><span class="fx-dust">${dust}</span></div>` +
  `<div class="fx fx-wx" style="${pct(WINDOW)}">` + Array.from({ length: 14 }, (_, i) =>
    `<i style="left:${(i * 29 + 7) % 100}%;top:${(i * 53 + 11) % 90}%;animation-delay:${(-(i * .37) % 3).toFixed(2)}s"></i>`).join('') + '</div>' +
  `<div class="fx fx-glow fx-lamp" style="${pct([29.5, 39, 9.5, 15])}"></div>` +
  `<div class="fx fx-glow fx-screen" style="${pct([36.6, 41.5, 6, 8])}"></div>` +
  '<div class="fx fx-code"><b>' + [...CODE, ...CODE].map((w, i) =>
    `<i style="width:${w}%;margin-left:${(i % 7 % 3) * 8}%"></i>`).join('') + '</b><u></u></div>' +
  `<div class="fx fx-steam" style="${pct([36.8, 45.5, 1.8, 5])}"><i></i><i></i><i></i></div>` +
  `<div class="bear" style="${pct(BEAR)}"><img src="${asset('bear-body.webp')}" alt="" draggable="false">` +
  `<img class="bear-head" src="${asset('bear-head.webp')}" alt="" draggable="false"></div>` +
  `<img class="chair" src="${asset('chair.webp')}" alt="" draggable="false" style="${pct(CHAIR)}">` +
  `<img class="chair chair-night" alt="" draggable="false" style="${pct(CHAIR)}">` +
  (SLEEPY ? `<img class="bear-sleep" src="${asset('bear-sleep.webp')}" alt="" draggable="false" style="${pct(SLEEP)}">` +
    `<img class="bear-sleep bear-sleep-night" alt="" draggable="false" style="${pct(SLEEP)}">` : '') +
  `<div class="fx fx-zzz" style="${pct([45.6, 31, 4, 9])}"><i>z</i><i>z</i><i>Z</i></div>` +
  '<div class="fx fx-dark"></div>' +
  (AMBIENT ? '' : `<div class="cork" style="${pct(CORK)}">` + NOTES.map(([poly, pin]) =>
    `<i class="cork-patch" style="${clip(poly)}"></i>` +
    `<div class="note" style="${clip(poly)};transform-origin:${pin[0]}% ${pin[1]}%">` +
    `<img src="${asset('cork.webp')}" alt="" draggable="false"><img class="n-night" src="${asset('cork-night.webp')}" alt="" draggable="false"></div>`).join('') + '</div>') +
  (AMBIENT ? '' : HOTSPOTS.map(h => `<a class="hs${h.toggle ? ' hs-toggle' : ''}" href="${h.href}" style="${pct(h.box)}"><i class="dot"></i><span>${h.label}</span></a>`).join('')) +
  (AMBIENT ? '' : EGGS.map(([id, box, label]) => `<button class="egg" type="button" data-egg="${id}" aria-label="${label}" style="${pct(box)}"></button>`).join(''));
// 文章页:背景缓慢左右漂移,交给 CSS 动画(不占主线程)
if (AMBIENT) layer.classList.add('drift');
layer.dataset.mood = MOOD;
layer.dataset.wx = WX;
host.appendChild(layer);
const bearEl = layer.querySelector('.bear');
const headEl = layer.querySelector('.bear-head');

/* ---------- camera ---------- */
const lerpPose = (a, b, t) => Object.fromEntries(Object.keys(a).map(k => [k, a[k] + (b[k] - a[k]) * t]));
// 手机首页:按实际布局把整间房放进导航栏与标题区之间的空档,不与两者重叠
// .56 / .92 为房间在插画中所占的宽 / 高比例
// 用 offsetTop / offsetHeight 取布局位置,不受标题区淡入淡出 transform 的影响
function mobileHome(p) {
  const top = document.querySelector('nav').offsetHeight;
  const gap = Math.max(document.getElementById('hero').offsetTop - top, 80);
  const base = Math.max(innerWidth / ROOM.w, innerHeight / ROOM.h);
  const s = Math.min((innerWidth - 40) / (ROOM.w * .56), (gap - 32) / (ROOM.h * .92));
  return { ...p, u: .5, v: .5, x: .5, y: (top + gap / 2) / innerHeight, z: s / base };
}
const forScreen = (p, open) => !MOBILE ? p
  : open || AMBIENT ? { ...p, x: .5, y: open ? .45 : .3, z: p.z * .55 } : mobileHome(p);
let want = forScreen(AMBIENT ? AMBIENT_POSE : POSE.hero), cur = { ...want };
let station = 'hero';

function route() {
  if (AMBIENT) return;
  const name = location.hash.slice(1);
  const next = POSE[name] && name !== 'hero' ? name : 'hero';
  want = forScreen(POSE[next], next !== 'hero');
  stations.forEach(el => el.classList.toggle('on', el.dataset.station === next && next !== 'hero'));
  document.body.classList.toggle('open', next !== 'hero');
  document.querySelectorAll('nav a').forEach(l => l.classList.toggle('cur', (l.hash.slice(1) || 'hero') === next));
  if (next !== station && next === 'about') hop();
  if (next !== 'hero') bubble?.classList.remove('on');
  station = next;
  wake();
}
const goHome = () => { if (station !== 'hero') location.hash = ''; };
addEventListener('hashchange', route);
addEventListener('keydown', e => { if (e.key === 'Escape') goHome(); });
// 触屏长按房间时屏蔽系统菜单(Android 的链接 / 图片菜单);鼠标右键保持不变
let lastPointer = 'mouse';
host.addEventListener('pointerdown', e => { lastPointer = e.pointerType; });
host.addEventListener('contextmenu', e => { if (lastPointer === 'touch') e.preventDefault(); });
// 点房间空白处关闭弹窗
host.addEventListener('click', e => { if (!e.target.closest('.hs')) goHome(); });

let px = 0, py = 0;
addEventListener('pointermove', e => {
  px = e.clientX / innerWidth * 2 - 1;
  py = e.clientY / innerHeight * 2 - 1;
  wake();
}, { passive: true });

// 镜头循环:镜头和鼠标都停稳后自动停下,有新动静(鼠标移动 / 切站点 / 窗口变化)再由 wake() 叫醒
let raf = 0, lastMove = '', lastLook = '';
const wake = () => { raf ||= requestAnimationFrame(frame); };
function frame() {
  raf = 0;
  cur = lerpPose(cur, want, 0.08);
  const vw = innerWidth, vh = innerHeight;
  const s = Math.max(vw / ROOM.w, vh / ROOM.h) * cur.z;
  const x = cur.x * vw - cur.u * ROOM.w * s - px * 10;
  const y = cur.y * vh - cur.v * ROOM.h * s - py * 7;
  const move = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
  const moved = move !== lastMove;
  if (moved) layer.style.transform = lastMove = move;
  const look = (px * 4).toFixed(2); // 头随鼠标左右轻歪
  const looked = look !== lastLook;
  if (looked) headEl.style.setProperty('--look', lastLook = look);
  if (moved || looked) wake();
}
wake();

/* ---------- 熊:戳一下 ---------- */
const bubble = document.getElementById('bearsay');
const SAY = {
  work: ['唔……', '别戳了,痒。', '今天也没有减肥。', 'Hi there 👋', '编译中,请稍候', '蜂蜜在哪里', '代码写完再理你'],
  coffee: ['早……先来杯咖啡', '还没开机,别催', '咖啡因加载中', '再喝一口就开工'],
  nap: ['午休呢……', '就眯一会儿', '下午还有需求,让我缓缓'],
  sleep: ['……几点了?', 'Zzz……啊?', '再睡五分钟', '梦到上线没出 bug'],
};
let sayT, wakeT, pokes = 0;
function hop() {
  bearEl.classList.remove('hop');
  void bearEl.offsetWidth;
  bearEl.classList.add('hop');
}
function say(text, ms = 2200) {
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.add('on');
  clearTimeout(sayT); sayT = setTimeout(() => bubble.classList.remove('on'), ms);
}
function poke() {
  hop();
  // 睡着时被戳:惊醒几秒,然后接着睡
  if (SLEEPY) {
    layer.dataset.mood = 'work';
    clearTimeout(wakeT); wakeT = setTimeout(() => { layer.dataset.mood = MOOD; }, 4200);
  }
  headEl.classList.remove('shake'); void headEl.offsetWidth; headEl.classList.add('shake');
  if (++pokes === 10) return say('第 10 下了。再戳要收蜂蜜的 🍯', 3600);
  say(SAY[MOOD][Math.floor(Math.random() * SAY[MOOD].length)]);
}
document.getElementById('poke')?.addEventListener('click', poke);
layer.querySelector('.hs[href="#about"]')?.addEventListener('click', poke);

/* ---------- 昼夜:默认按本地时间,点窗户切换并记住选择 ---------- */
const NIGHT_KEY = 'fatbruin-night';
const nightImgs = [[layer.querySelector('.room-night'), ROOM.night], [layer.querySelector('.chair-night'), asset('chair-night.webp')],
  [layer.querySelector('.bear-sleep-night'), asset('bear-sleep-night.webp')]].filter(([el]) => el);
async function setNight(on, animate) {
  if (on) {
    // 夜景图首次用到时才加载,解码完再淡入,避免闪一下
    await Promise.all(nightImgs.map(([el, src]) => {
      if (!el.src) el.src = src;
      return el.decode ? el.decode().catch(() => {}) : null;
    }));
  }
  const root = document.documentElement;
  if (animate) { root.classList.add('theme-anim'); setTimeout(() => root.classList.remove('theme-anim'), 1300); }
  root.classList.toggle('night', on);
}
// 初始晨昏已由页面开头的内联脚本写到 html.night,这里只负责补加载夜景图
setNight(document.documentElement.classList.contains('night'));
// 手动切换晨昏并记住;环境音开着时,晴天的鸟鸣 / 虫鸣要跟着换
function switchNight(on) {
  try { localStorage.setItem(NIGHT_KEY, on ? '1' : '0'); } catch {}
  setNight(on, true);
  if (sndOn) amb.start(sndEnv(on), actx);
}
layer.querySelector('.hs-toggle')?.addEventListener('click', e => {
  e.preventDefault();
  switchNight(!document.documentElement.classList.contains('night'));
});

/* ---------- 彩蛋:房间里几样没有标签的小物件,点了各有反应 ---------- */
const store = (k, v) => {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {}
  return null;
};
const EGG = {
  mug() {
    // 按天计数,隔天清零
    const [d, n] = (store('fatbruin-cups') || '').split(':');
    const cups = (+d === DAY ? +n : 0) + 1;
    store('fatbruin-cups', DAY + ':' + cups);
    layer.classList.add('refill'); setTimeout(() => layer.classList.remove('refill'), 4000);
    say(cups > 5 ? `第 ${cups} 杯了,手开始抖了` : `续杯 ☕ 今天第 ${cups} 杯`, 2600);
  },
  lamp() {
    amb?.blip('lamp');
    say(layer.classList.toggle('lamp-off') ? '啪。关灯。' : '啪。亮了。', 1600);
  },
  // 笔记本:打开「熊的终端」,首次点击时才加载
  async laptop() {
    (await import('./terminal.js')).open({ wx: WX, mood: () => layer.dataset.mood, night: switchNight });
  },
  bin() {
    const n = (+store('fatbruin-drafts') || 0) + 1;
    store('fatbruin-drafts', n);
    say(`废稿 +1,累计 ${n} 张`);
  },
  clock() {
    const d = new Date(), h = d.getHours();
    say(`${h}:${String(d.getMinutes()).padStart(2, '0')}。` + (h < 6 ? '还不睡?' : h < 9 ? '起这么早。' : h < 12 ? '上午效率最高。'
      : h < 14 ? '该吃饭了。' : h < 18 ? '下午茶时间。' : h < 22 ? '该下班了。' : '夜深了,早点睡。'), 2800);
  },
  slippers() { say('那是我的拖鞋,别穿走。'); },
  // 床:随机推荐一篇文章当睡前读物,点气泡里的标题才跳转。posts.json 由 build.js 生成
  async bed() {
    try {
      const posts = await (await fetch(new URL('posts.json', import.meta.url))).json();
      const p = posts[Math.floor(Math.random() * posts.length)];
      say('睡前读物:', 6000);
      const a = bubble.appendChild(document.createElement('a'));
      a.href = p.u;
      a.textContent = `《${p.t}》`;
    } catch { say('床上只有熊毛。'); }
  },
};
// 弹窗打开时不响应,交给上面「点房间空白处关闭弹窗」
layer.addEventListener('click', e => {
  const egg = e.target.closest('.egg');
  if (egg && station === 'hero') EGG[egg.dataset.egg]();
});

/* ---------- 环境音:默认关,开关记在 localStorage;声音由 ambience.js 合成,打开时才加载 ---------- */
const sndBtn = document.getElementById('snd');
let amb = null, actx = null, sndOn = false;
const sndEnv = (night = document.documentElement.classList.contains('night')) =>
  ({ wx: WX, night, mood: () => layer.dataset.mood, bear: bearEl });
async function setSound(on) {
  sndOn = on;
  store('fatbruin-sound', on ? '1' : '0');
  sndBtn.textContent = '环境音 · ' + (on ? '开' : '关');
  sndBtn.setAttribute('aria-pressed', on);
  if (!on) return amb?.stop();
  // AudioContext 必须在点击事件里同步创建并 resume,之后再异步加载合成代码
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  actx.resume();
  amb ||= await import('./ambience.js');
  if (sndOn) amb.start(sndEnv(), actx);
}
if (sndBtn) {
  sndBtn.addEventListener('click', () => setSound(!sndOn));
  // 上次开着:浏览器不允许自动出声,等这次访问的第一次点击再响
  if (store('fatbruin-sound') === '1') {
    sndBtn.textContent = '环境音 · 开';
    addEventListener('pointerdown', e => { if (!e.target.closest('#snd')) setSound(true); }, { once: true });
  }
  // 切到后台标签页时静音
  document.addEventListener('visibilitychange', () => {
    if (actx && sndOn) document.hidden ? actx.suspend() : actx.resume();
  });
}

route();
// 手机首页的房间位置依赖导航和标题区的实际尺寸,字体加载完、窗口变化后重新计算
addEventListener('resize', route);
document.fonts?.ready.then(route);
if (MOBILE && !AMBIENT) new ResizeObserver(route).observe(document.getElementById('hero'));

// 鼠标扫过软木板:碰到哪张便签,哪张就顺着鼠标方向轻摆一次
const inPoly = (x, y, p) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2)
    if ((p[i + 1] > y) !== (p[j + 1] > y) && x < (p[j] - p[i]) * (y - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  return c;
};
const noteEls = [...layer.querySelectorAll('.note')];
noteEls.forEach(el => el.addEventListener('animationend', () => el.classList.remove('flick')));
layer.querySelector('.hs[href="#timeline"]')?.addEventListener('pointermove', e => {
  const r = layer.querySelector('.cork').getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
  NOTES.forEach(([poly], i) => {
    const el = noteEls[i];
    if (el.classList.contains('flick') || !inPoly(x, y, poly)) return;
    el.style.setProperty('--dir', e.movementX < 0 ? -1 : 1);
    el.classList.add('flick');
  });
});

// 第一次来:熊提示房间里的东西可以点
if (!AMBIENT) {
  let seen = null;
  try { seen = localStorage.getItem('fatbruin-hint'); } catch {}
  if (!seen) {
    setTimeout(() => station === 'hero' && say('点点房间里的东西吧 ✨', 3800), 1400);
    try { localStorage.setItem('fatbruin-hint', '1'); } catch {}
  }
}

const img = layer.querySelector('.room-img');
(img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(() => document.body.classList.add('ready'));
