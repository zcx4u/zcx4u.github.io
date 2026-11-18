/* 小屋环境音:全部用 Web Audio 实时合成,不加载任何音频文件。
   由 scene2d.js 在打开「环境音」开关时动态加载;AudioContext 由调用方在点击事件里创建后传入
   (Safari 要求在用户手势内创建并 resume)。
   env: { wx, night, mood(): 当前熊的状态, bear: 熊的元素(用来读动画进度,让键盘声 / 鼾声跟画面同步) } */
let ctx, master, env, tick;
let live = [];
const buffers = new WeakMap();

const rand = (a, b) => a + Math.random() * (b - a);
const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filter = (type, freq, q = 0.7) => {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
};
const chain = (...nodes) => nodes.reduce((a, b) => (a.connect(b), b));

// 2 秒的白噪 / 褐噪循环,每个 AudioContext 只生成一次
function noise(brown) {
  let set = buffers.get(ctx);
  if (!set) buffers.set(ctx, set = {});
  const key = brown ? 'brown' : 'white';
  if (!set[key]) {
    const len = ctx.sampleRate * 2;
    const buf = set[key] = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = set[key];
  src.loop = true;
  src.start(0, Math.random() * 2);
  return src;
}

// 持续的底噪层
function bed(brown, filters, vol) {
  const src = noise(brown);
  live.push(src);
  chain(src, ...filters, gain(vol), master);
}

// 一次性的短音:噪声经滤波后按包络起落
function burst(filt, vol, attack, release, brown) {
  const t = ctx.currentTime, g = gain(0), src = noise(brown);
  chain(src, filt, g, master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  src.stop(t + attack + release + 0.05);
  return g;
}

// 一声正弦滑音,鸟鸣和虫鸣都用它
function chirp(at, f0, f1, dur, vol) {
  const o = ctx.createOscillator(), g = gain(0);
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + dur * 0.3);
  g.gain.linearRampToValueAtTime(0, at + dur);
  chain(o, g, master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

const SOUND = {
  // 台灯开关:一声脆响
  lamp: () => burst(filter('highpass', 1800), 0.12, 0.001, 0.03),
  // 键盘:每次音高略有不同
  key: () => burst(filter('bandpass', rand(1500, 3200), 1.4), 0.3, 0.002, 0.035),
  // 鼾声:低频噪声慢起慢落,叠一层颤动
  snore: (vol = 1) => {
    const g = burst(filter('bandpass', 180, 2), 0.5 * vol, 1.1, 1.3, true);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 26;
    chain(lfo, gain(0.15 * vol), g.gain);
    lfo.start();
    lfo.stop(ctx.currentTime + 2.6);
  },
  // 鸟:两到四声上滑的短鸣
  bird: () => {
    const t = ctx.currentTime, base = rand(2500, 3300);
    for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
      chirp(t + i * 0.16, base, base * rand(1.3, 1.5), 0.11, 0.06);
    }
  },
  // 蟋蟀:三下等高的短脉冲
  cricket: () => {
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) chirp(t + i * 0.075, 4300, 4350, 0.045, 0.03);
  },
};
// 播放一个短音;环境音没开时什么也不做
export function blip(name, ...args) {
  if (master) SOUND[name]?.(...args);
}

// CSS 动画当前走到一个周期的哪里(0–1);动画不存在(如开启了「减少动态效果」)时返回 -1
function phase(el, name) {
  const a = el?.getAnimations?.().find(x => x.animationName === name);
  const dur = a?.effect?.getTiming().duration;
  return a && dur ? (a.currentTime % dur) / dur : -1;
}

export function start(e, audioCtx) {
  stop();
  env = e;
  ctx = audioCtx;
  master = gain(0);
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);

  bed(true, [filter('lowpass', 420)], 0.015);                // 室内底噪
  if (env.wx === 'rain') {
    bed(false, [filter('highpass', 900), filter('lowpass', 7000)], 0.02);   // 雨丝
    bed(true, [filter('lowpass', 900)], 0.14);                              // 远处的雨幕
  } else if (env.wx !== 'sun') {
    bed(true, [filter('bandpass', 320, 0.6)], 0.1);          // 雪天 / 多云:一点风声
  }

  let nextCall = ctx.currentTime + rand(1.5, 4), lastBreath = 1;
  tick = setInterval(() => {
    const now = ctx.currentTime, mood = env.mood();
    // 晴天:白天鸟鸣,夜里虫鸣
    if (env.wx === 'sun' && now > nextCall) {
      blip(env.night ? 'cricket' : 'bird');
      nextCall = now + (env.night ? (Math.random() < 0.15 ? rand(2, 4) : rand(0.5, 0.9)) : rand(4, 11));
    }
    if (mood === 'sleep' || mood === 'nap') {
      // 每次呼吸开始时打一声鼾
      const p = phase(env.bear, 'breathe');
      if (p >= 0 && p < lastBreath) blip('snore', mood === 'nap' ? 0.55 : 1);
      if (p >= 0) lastBreath = p;
    } else {
      // 写码:只在身体做「敲键盘」抖动的那一小段出声
      const p = phase(env.bear.firstElementChild, 'typing');
      if (p > 0.58 && p < 0.82 && Math.random() < 0.7) blip('key');
    }
  }, 100);
}

export function stop() {
  clearInterval(tick);
  if (!master) return;
  const m = master, t = ctx.currentTime, srcs = live;
  master = null;
  live = [];
  m.gain.cancelScheduledValues(t);
  m.gain.setTargetAtTime(0, t, 0.12);
  srcs.forEach(s => s.stop(t + 0.7));
  setTimeout(() => m.disconnect(), 800);
}
