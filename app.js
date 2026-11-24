// 루터 굿즈 룰렛 (빌드 없이 그대로 열리는 순수 JS)
// 입력창에 "키링*27, 띠부씰*30, 간식*43" 처럼 적으면 그 개수만큼 칸이 생김 (칸 하나 = 1개)
// 돌리면 칸 하나를 무작위로 골라 그 칸에 멈추게 회전 → 개수가 많을수록 잘 나옴
// 당첨돼도 칸·개수는 줄지 않음 (그대로 계속 돌림)

const SPIN_MS = 5600;
const STORE_KEY = "rooter-roulette-v6";

const $ = (id) => document.getElementById(id);
const wheel = $("wheel");
const pointer = $("pointer");
const spinBtn = $("spin");
const entries = $("entries");

// 칸 색: 일반 칸은 차례로, 간식 칸은 연한 살구색
const COLORS = ["#F6482D", "#FFE252", "#ADD3FF", "#81E468", "#FF81C4", "#5283FF", "#FF9452"];
const LOSE_COLOR = "#FFE4D8";
const DARK_TEXT_ON = new Set(["#FFE252", "#ADD3FF", "#81E468", "#FF81C4", "#FF9452", LOSE_COLOR]);
// 간식 칸(못 맞힌 칸): 입력창 아래 칸 이름 버튼으로 직접 정함. 아직 안 정한 이름은 '간식'·'꽝'이 들어가면 간식 칸으로 짐작
const guessLose = (name) => /꽝|간식/.test(name);
const isLose = (name) => (name in state.lose ? state.lose[name] : guessLose(name));

// 간식 칸에 걸리면 이 확률로 '한 번 더' 기회 (1인당 한 번: 다시 돌려서 또 간식이면 간식 2개)
const RETRY_CHANCE = 0.2;

// '우리 굿즈로 채우기' (피그마 '배너' 파일 기준, 1인당 1개)
// 아크릴 키링 7종 28 - AI 로봇 1 = 27 (Hyphen 키링은 팀원용이라 제외), 띠부씰 8종 30. 간식은 준비한 만큼 직접 추가
const PRESET_TEXT = "아크릴 키링*27, 띠부씰*30, 간식*";

// ---------- 저장 ----------
// units: 판에 그려지는 칸 이름 배열(순서 그대로). 입력창 글자는 여기서 다시 만들어 씀
const defaults = { text: "", units: [], lose: {}, stats: { total: 0, win: 0, lose: 0, retry: 0, double: 0 } };
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    return s ? { ...structuredClone(defaults), ...s } : structuredClone(defaults);
  } catch {
    return structuredClone(defaults);
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

// ---------- 입력 ↔ 칸 ----------
/** "키링*27, 띠부씰*30\n간식*43, 스티커" → [{name, count}] (같은 이름은 합침, 개수 없으면 1) */
function parse(text) {
  const map = new Map();
  for (const raw of text.split(/[,\n，]/)) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^(.*?)\s*[*xX×]\s*(\d+)\s*$/);
    const name = (m ? m[1] : t).trim();
    const count = m ? parseInt(m[2], 10) : 1;
    if (!name || !(count > 0)) continue;
    map.set(name, (map.get(name) ?? 0) + count);
  }
  return [...map].map(([name, count]) => ({ name, count }));
}

/** 남은 칸 → "키링*26, 간식*43" (1개면 이름만, 0개면 빠짐). 이름 순서는 원래 입력 순서 유지 */
function serialize(units, prevText = "") {
  const map = new Map(parse(prevText).map(({ name }) => [name, 0]));
  for (const u of units) map.set(u, (map.get(u) ?? 0) + 1);
  for (const [n, c] of map) if (c === 0) map.delete(n);
  return [...map].map(([n, c]) => (c === 1 ? n : `${n}*${c}`)).join(", ");
}

/** 고르게 섞기: 이름마다 조각을 원 둘레에 같은 간격으로 놓고 위치 순으로 합침 → 같은 칸이 몰리지 않음 */
function spread(list) {
  return list
    .flatMap(({ name, count }, order) => Array.from({ length: count }, (_, k) => ({ name, pos: (k + 0.5) / count + order * 1e-7 })))
    .sort((a, b) => a.pos - b.pos)
    .map((p) => p.name);
}

/** 무작위로 섞기 (Fisher–Yates) */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 이름별 색: 입력 순서대로 (간식 칸은 살구색) */
function colorMap() {
  const map = new Map();
  let k = 0;
  for (const { name } of parse(state.text)) map.set(name, isLose(name) ? LOSE_COLOR : COLORS[k++ % COLORS.length]);
  for (const u of state.units) if (!map.has(u)) map.set(u, isLose(u) ? LOSE_COLOR : COLORS[k++ % COLORS.length]);
  return map;
}

// ---------- 룰렛 판 ----------
function drawWheel() {
  const r = 100;
  const rad = (d) => (d * Math.PI) / 180;
  const units = state.units;
  const colors = colorMap();
  let html = `<circle r="108" fill="#FFF6EF"/>`;

  if (units.length === 0) {
    const msg = state.text.trim() ? "남은 칸이 없어요" : "왼쪽에 칸을 입력해 주세요";
    html += `<text class="empty-msg" x="0" y="-60" font-size="10" text-anchor="middle">${msg}</text>`;
  } else if (units.length === 1) {
    const fill = colors.get(units[0]);
    html += `<circle r="${r}" fill="${fill}"/>`;
    html += `<text x="0" y="-66" fill="${DARK_TEXT_ON.has(fill) ? "#212530" : "#fff"}" font-size="14" text-anchor="middle" dominant-baseline="central">${escapeHtml(units[0])}</text>`;
  } else {
    const n = units.length;
    const step = 360 / n;
    const longest = Math.max(...units.map((u) => u.length));
    // 글자는 중심→바깥 방향으로, 칸 길이(약 66)와 폭에 맞춰 크기 조절. 칸이 많으면 아주 작아져도 그대로 (빽빽한 맛)
    const fs = Math.max(1.6, Math.min(14, 66 / Math.max(1, longest), 64 * rad(step) * 0.62));
    const sw = n > 80 ? 0.35 : n > 40 ? 0.7 : n > 20 ? 1.2 : 2;
    units.forEach((name, k) => {
      const a0 = rad(k * step - 90 - step / 2);
      const a1 = rad(k * step - 90 + step / 2);
      const mid = rad(k * step - 90);
      const fill = colors.get(name);
      const tx = 66 * Math.cos(mid);
      const ty = 66 * Math.sin(mid);
      html += `<path d="M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 0 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z" fill="${fill}" stroke="#FFF6EF" stroke-width="${sw}"/>`;
      html += `<text x="${tx}" y="${ty}" fill="${DARK_TEXT_ON.has(fill) ? "#212530" : "#fff"}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" transform="rotate(${k * step - 90} ${tx} ${ty})">${escapeHtml(name)}</text>`;
    });
  }
  wheel.innerHTML = html;
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** 입력창 아래 요약: 이름별 남은 개수 + 총 칸 수 */
function renderSummary() {
  const colors = colorMap();
  const counts = new Map(parse(state.text).map(({ name }) => [name, 0])); // 입력 순서대로
  for (const u of state.units) counts.set(u, (counts.get(u) ?? 0) + 1);
  for (const [n, c] of counts) if (c === 0) counts.delete(n);
  $("summary").innerHTML =
    [...counts]
      .map(
        ([n, c]) => `<button type="button" class="tag${isLose(n) ? " lose" : ""}" data-name="${escapeHtml(n)}">
          <i style="background:${colors.get(n)}"></i><b>${escapeHtml(n)}</b>${c}칸<em>${isLose(n) ? "간식" : "당첨"}</em></button>`,
      )
      .join("");
  const st = state.stats;
  $("stats").innerHTML = `총 참여 <b>${st.total}</b>명 · 당첨 <b>${st.win}</b> · 간식 <b>${st.lose}</b> · 한 번 더 <b>${st.retry ?? 0}</b>번 · 간식 2개 <b>${st.double ?? 0}</b>번`;
  // (안내 문구 없음)
}

// ---------- 소리 (Web Audio, 파일 없이) ----------
let audio;
let lastBeep = 0;
function beep(freq, dur, type = "square", vol = 0.05) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  } catch {}
}
const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, "triangle", 0.08), i * 110));
const womp = () => [392, 330].forEach((f, i) => setTimeout(() => beep(f, 0.3, "triangle", 0.07), i * 180));
const chanceSound = () => [392, 330, 660, 880].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.08), i * (i < 2 ? 180 : 110)));

// ---------- 전구 테두리 ----------
// 판 둘레에 작은 전구를 놓고 3개마다 하나씩 켜서 빙글빙글 도는 것처럼 보이게 함
// 평소엔 천천히, 돌릴 땐 빠르게, 당첨되면 전체가 깜빡임
const BULBS = 28;
const BULB_COLORS = ["#F6482D", "#FFE252"];
const lightsEl = $("lights");
lightsEl.innerHTML =
  `<circle r="105" fill="none" stroke="#212530" stroke-width="10"/>` +
  Array.from({ length: BULBS }, (_, i) => {
    const a = (i / BULBS) * 2 * Math.PI - Math.PI / 2;
    return `<circle class="bulb" cx="${(105 * Math.cos(a)).toFixed(2)}" cy="${(105 * Math.sin(a)).toFixed(2)}" r="2.7"/>`;
  }).join("");
const bulbEls = [...lightsEl.querySelectorAll(".bulb")];
let lightMode = "idle"; // idle | spin | win
let lightStep = 0;
let lightLast = 0;
function lightsFrame(now) {
  const interval = lightMode === "spin" ? 55 : lightMode === "win" ? 180 : 220;
  if (now - lightLast >= interval) {
    lightLast = now;
    lightStep++;
    bulbEls.forEach((b, i) => {
      const k = i + lightStep;
      const on = lightMode === "win" ? k % 2 === 0 : k % 3 === 0;
      b.classList.toggle("on", on);
      // 켜진 전구 색: 루터 주황·노랑 번갈아. 같은 불빛은 돌아가는 동안 같은 색 유지
      if (on) b.style.setProperty("--c", BULB_COLORS[Math.floor(k / (lightMode === "win" ? 2 : 3)) % BULB_COLORS.length]);
    });
  }
  requestAnimationFrame(lightsFrame);
}
requestAnimationFrame(lightsFrame);

// ---------- 돌리기 ----------
let rotation = 0;
let spinning = false;

let retryRound = false; // 지금 돌리는 게 '한 번 더' 기회인지
let retryOffered = false; // 결과 창에 '한 번 더' 가 떠 있는지

function spin() {
  if (spinning || !$("result").hidden || !$("settings").hidden) return;
  if (state.units.length === 0) {
    entries.focus();
    return;
  }
  spinning = true;
  lightMode = "spin";
  spinBtn.disabled = true;
  $("shuffle").disabled = true;
  $("resetAll").disabled = true;
  entries.disabled = true;

  // 칸 하나를 똑같은 확률로 고름 = 이름별로는 남은 개수 비율대로
  const n = state.units.length;
  const step = 360 / n;
  const k = Math.floor(Math.random() * n);
  const offset = (Math.random() - 0.5) * step * 0.7; // 칸 경계에 걸리지 않게 가운데 70% 안
  const turns = 6 + Math.floor(Math.random() * 3);

  // 회전 θ 일 때 위 바늘 아래 칸의 가운데 c 는 (c + θ) ≡ 0 (mod 360)
  const start = rotation;
  const base = Math.ceil(start / 360) * 360 + turns * 360;
  const target = base - (k * step + offset);
  const t0 = performance.now();
  let lastSeg = Math.floor((start + step / 2) / step);

  const ease = (t) => 1 - Math.pow(1 - t, 4);
  function frame(now) {
    const t = Math.min(1, (now - t0) / SPIN_MS);
    rotation = start + (target - start) * ease(t);
    wheel.style.transform = `rotate(${rotation}deg)`;

    const seg = Math.floor((rotation + step / 2) / step);
    if (seg !== lastSeg) {
      lastSeg = seg;
      if (now - lastBeep > 45) {
        lastBeep = now;
        beep(1200, 0.03, "square", 0.03);
        pointer.classList.remove("tick");
        void pointer.offsetWidth;
        pointer.classList.add("tick");
      }
    }
    if (t < 1) requestAnimationFrame(frame);
    else finish(k);
  }
  requestAnimationFrame(frame);
}

function finish(k) {
  const name = state.units[k];
  const win = !isLose(name);
  const chance = !win && !retryRound && Math.random() < RETRY_CHANCE;
  retryOffered = chance;
  lightMode = win ? "win" : "idle";

  if (chance) {
    // 간식 칸이지만 럭키 찬스: 아직 결과 확정 아님 (통계는 다시 돌린 결과로 셈)
    state.stats.retry = (state.stats.retry ?? 0) + 1;
    $("resultTitle").textContent = "간식…? 잠깐!";
    $("resultTitle").className = "result-title chance";
    $("resultSub").textContent = "럭키 찬스! 한 번 더 돌릴 수 있어요";
    $("closeResult").textContent = "한 번 더 돌리기";
  } else {
    state.stats.total++;
    win ? state.stats.win++ : state.stats.lose++;
    // 한 번 더 기회까지 간식이면 간식 2개
    const double = !win && retryRound;
    if (double) state.stats.double = (state.stats.double ?? 0) + 1;
    $("resultTitle").textContent = win ? `${name} 당첨!` : double ? "간식 2개 드려요!" : "아쉽지만 간식!";
    $("resultTitle").className = "result-title" + (win ? " win" : double ? " chance" : "");
    $("resultSub").textContent = win ? "축하해요! 루터 굿즈를 받아 가세요" : double ? "두 번 연속 간식이라 하나 더 챙겨 드릴게요" : "맛있는 간식을 드릴게요";
    $("closeResult").textContent = "확인";
  }
  save();
  renderSummary();
  $("result").hidden = false;
  if (win) { fanfare(); confetti(); } else if (chance) chanceSound(); else womp();
}

/** 결과 창 닫기 (칸·개수는 그대로 둠) */
function closeResult() {
  if ($("result").hidden) return;
  $("result").hidden = true;
  stopConfetti();
  lightMode = "idle";
  spinning = false;
  spinBtn.disabled = false;
  $("shuffle").disabled = false;
  $("resetAll").disabled = false;
  entries.disabled = false;
  if (retryOffered) {
    // 럭키 찬스: 바로 한 번 더 돌림
    retryOffered = false;
    retryRound = true;
    spin();
  } else {
    retryRound = false;
  }
}

// ---------- 폭죽 ----------
let confettiRaf;
function confetti() {
  const cv = $("confetti");
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const palette = [...COLORS, "#FFFFFF"];
  const parts = Array.from({ length: 180 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight / 2,
    vx: (Math.random() - 0.5) * 18,
    vy: -Math.random() * 18 - 6,
    r: Math.random() * 360,
    vr: (Math.random() - 0.5) * 20,
    w: 6 + Math.random() * 8,
    h: 10 + Math.random() * 10,
    c: palette[Math.floor(Math.random() * palette.length)],
  }));
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = false;
    for (const p of parts) {
      p.vy += 0.45;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      if (p.y < innerHeight + 40) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.r * Math.PI) / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) confettiRaf = requestAnimationFrame(tick);
  };
  stopConfetti();
  tick();
}
function stopConfetti() {
  cancelAnimationFrame(confettiRaf);
  const cv = $("confetti");
  cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
}

// ---------- 입력창 · 섞기 ----------
/** 입력창 글자 → 칸 (고르게 섞음) */
function applyText(text) {
  state.text = text;
  state.units = spread(parse(text));
  save();
  drawWheel();
  renderSummary();
}
entries.addEventListener("input", () => applyText(entries.value));
$("summary").addEventListener("click", (e) => {
  const t = e.target.closest(".tag[data-name]");
  if (!t || spinning) return;
  const name = t.dataset.name;
  state.lose[name] = !isLose(name);
  save();
  drawWheel();
  renderSummary();
});
$("shuffle").addEventListener("click", () => {
  if (spinning || state.units.length < 2) return;
  state.units = shuffle(state.units);
  save();
  wheel.classList.remove("shuffled");
  void wheel.offsetWidth;
  wheel.classList.add("shuffled");
  drawWheel();
});

// ---------- 운영 패널 (S) ----------
$("preset").addEventListener("click", () => {
  entries.value = PRESET_TEXT;
  applyText(PRESET_TEXT);
  toggleSettings(false);
  entries.focus();
  entries.setSelectionRange(PRESET_TEXT.length, PRESET_TEXT.length); // 간식 개수만 바로 입력
});
$("resetStats").addEventListener("click", (e) => {
  if (!confirmReset(e.currentTarget, "통계 초기화")) return;
  state.stats = { total: 0, win: 0, lose: 0, retry: 0, double: 0 };
  save();
  renderSummary();
});
// 판 초기화: 입력·칸·간식 지정을 비움 (통계는 그대로, 통계는 운영 패널에서 따로 초기화)
$("resetAll").addEventListener("click", (e) => {
  if (spinning || !confirmReset(e.currentTarget.querySelector("span"), "초기화")) return;
  state.lose = {};
  entries.value = "";
  applyText("");
  entries.focus();
});
// confirm() 창 대신 두 번 누르기로 확인 (버튼마다 따로)
const armedAt = new WeakMap();
function confirmReset(el, label) {
  if (Date.now() - (armedAt.get(el) ?? 0) < 2500) { armedAt.delete(el); el.textContent = label; return true; }
  armedAt.set(el, Date.now());
  el.textContent = "한 번 더 누르면 초기화";
  setTimeout(() => (el.textContent = label), 2500);
  return false;
}
function toggleSettings(force) {
  $("settings").hidden = typeof force === "boolean" ? !force : !$("settings").hidden;
}
$("closeSettings").addEventListener("click", () => toggleSettings(false));

// ---------- 키보드 ----------
spinBtn.addEventListener("click", spin);
document.querySelector(".hub").addEventListener("click", spin); // 가운데 루터 얼굴 눌러도 돌림
$("closeResult").addEventListener("click", closeResult);
$("result").addEventListener("click", (e) => { if (e.target.id === "result") closeResult(); });

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (!$("result").hidden) closeResult();
    else spin();
  } else if (e.code === "Escape") {
    if (!$("result").hidden) closeResult();
    else toggleSettings(false);
  } else if (e.code === "KeyF") {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  } else if (e.code === "KeyS") toggleSettings();
});

entries.value = state.text;
drawWheel();
renderSummary();
