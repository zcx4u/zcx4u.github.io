/* 熊的终端:首页点笔记本屏幕打开。由 scene2d.js 在首次点击时动态加载,样式在 index.html。
   文章列表读 build.js 生成的 posts.json([{ t: 标题, d: 日期, u: 链接 }],新 → 旧)。 */
let el, out, input, env;
let posts = [], listed = [];
const hist = [];
let hi = 0;

const WX_TEXT = { sun: '晴。窗边有光。', rain: '下雨。适合写代码。', snow: '下雪。熊想冬眠。', cloud: '多云。没什么可看的。' };
const MOOD_TEXT = { work: '在写代码,别吵。', coffee: '在喝今天的第一杯咖啡。', nap: '午休,打盹中。', sleep: '睡着了。小点声。' };

function line(text, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text;
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
  return d;
}

function list(items) {
  listed = items;
  if (!items.length) return line('(空的。posts.json 没读到)', 'd');
  items.forEach((p, i) => {
    const d = line(`${String(i + 1).padStart(2)}  ${p.d}  `);
    const a = document.createElement('a');
    a.href = p.u;
    a.textContent = p.t;
    d.appendChild(a);
  });
  out.scrollTop = out.scrollHeight;
}

function go(p) {
  line(`正在打开《${p.t}》…`, 'd');
  setTimeout(() => { location.href = p.u; }, 500);
}

const CMD = {
  help: () => line(
    'ls [-a]     最新 8 篇 / 全部文章\n' +
    'open <n>    打开列表里的第 n 篇\n' +
    'random      随机翻一篇\n' +
    'whoami      这是谁的电脑\n' +
    'weather     窗外天气\n' +
    'bear        熊在干嘛\n' +
    'day / night 切换晨昏\n' +
    'clear       清屏\n' +
    'exit        合上电脑'),
  ls: (a) => list(a === '-a' ? posts : posts.slice(0, 8)),
  open: (n) => {
    const p = listed[+n - 1];
    if (p) go(p); else line(`open: 没有第 ${n || '?'} 篇,先 ls 看看`);
  },
  random: () => { if (posts.length) go(posts[Math.floor(Math.random() * posts.length)]); },
  whoami: () => line('fatbruin —— 一只胖熊,写了十年代码,从 App 一路写到 Agent。'),
  weather: () => line(WX_TEXT[env.wx]),
  bear: () => line(MOOD_TEXT[env.mood()]),
  day: () => { env.night(false); line('天亮了。'); },
  night: () => { env.night(true); line('天黑了。'); },
  date: () => line(new Date().toLocaleString('zh-CN')),
  clear: () => { out.textContent = ''; },
  exit: () => close(),
  // 彩蛋
  sudo: () => line('熊不在 sudoers 文件中。此事将被报告给蜂蜜管理员。'),
  rm: () => line('rm: 想都别想。'),
  vim: () => line('进去了就出不来了,算了吧。'),
  cd: () => line('这间屋子只有一个房间。'),
  pwd: () => line('/home/bear/小屋'),
  honey: () => line('🍯 库存:0。上次补货:不记得了。'),
};
CMD.cat = CMD.open;
CMD.quit = CMD.exit;
CMD.vi = CMD.emacs = CMD.vim;

function run(raw) {
  const text = raw.trim();
  line('bear@fatbruin ~ % ' + text, 'c');
  if (!text) return;
  hist.push(text); hi = hist.length;
  const [name, ...args] = text.split(/\s+/);
  const fn = CMD[name.toLowerCase()];
  if (fn) fn(...args); else line(`zsh: command not found: ${name}(试试 help)`);
}

function close() {
  el.hidden = true;
  removeEventListener('keydown', onKey, true);
}
// 捕获阶段拦下 Esc,不让它落到小屋的「回到首页」上
function onKey(e) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  close();
}

function build() {
  el = document.createElement('div');
  el.id = 'term';
  el.innerHTML =
    '<div class="t-win" role="dialog" aria-label="熊的终端">' +
    '<div class="t-bar"><i></i><i></i><i></i><span>bear@fatbruin: ~</span><button type="button" aria-label="关闭">×</button></div>' +
    '<div class="t-out"></div>' +
    '<form class="t-in"><label for="t-input">bear@fatbruin ~ %</label>' +
    '<input id="t-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></form></div>';
  document.body.appendChild(el);
  out = el.querySelector('.t-out');
  input = el.querySelector('input');
  el.addEventListener('click', e => {
    if (e.target === el || e.target.closest('.t-bar button')) close();
    else if (!e.target.closest('a') && !getSelection().toString()) input.focus();
  });
  el.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    run(input.value);
    input.value = '';
  });
  input.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    hi = Math.max(0, Math.min(hist.length, hi + (e.key === 'ArrowUp' ? -1 : 1)));
    input.value = hist[hi] || '';
  });
}

export async function open(e) {
  env = e;
  const first = !el;
  if (first) build();
  el.hidden = false;
  addEventListener('keydown', onKey, true);
  // 触屏上不自动聚焦,免得一打开就弹键盘挡住内容
  if (!matchMedia('(pointer:coarse)').matches) input.focus();
  if (!first) return;
  try { posts = await (await fetch(new URL('posts.json', import.meta.url))).json(); } catch {}
  line('bear@fatbruin ~ % ls', 'c');
  list(posts.slice(0, 8));
  line('输入 help 看看还能干嘛;open <n> 打开文章。', 'd');
}
