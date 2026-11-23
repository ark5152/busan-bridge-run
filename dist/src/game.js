// 러너 상태마다 독립된 시트를 사용하며, 한 칸은 132×132 픽셀이다.
const SPR = {
  "female": {
    "run": "assets/sprites/runner_female_run.webp",
    "heat": "assets/sprites/runner_female_heat.webp",
    "uphill": "assets/sprites/runner_female_uphill.webp",
    "collision": "assets/sprites/runner_female_collision.webp",
    "pain": "assets/sprites/runner_female_pain.webp"
  },
  "male": {
    "run": "assets/sprites/runner_male_run.webp",
    "heat": "assets/sprites/runner_male_heat.webp",
    "uphill": "assets/sprites/runner_male_uphill.webp",
    "collision": "assets/sprites/runner_male_collision.webp",
    "pain": "assets/sprites/runner_male_pain.webp"
  }
};
const RUNNER_CELL = 132;
const VW = 384, VH = 216;
const world = document.createElement('canvas');
const w = world.getContext('2d', {alpha:false});
const screen = document.getElementById('screen'); const s = screen.getContext('2d');
const stage = document.getElementById('stage');
const touchDevice = matchMedia('(any-pointer: coarse)');
let SC = 3;
function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1,touchDevice.matches ? 2.5 : Infinity);
  const fit = Math.min(stage.clientWidth / VW, stage.clientHeight / VH);
  const css = !touchDevice.matches && fit >= 1 ? Math.floor(fit) : fit;
  screen.style.width = (VW*css)+'px'; screen.style.height = (VH*css)+'px';
  stage.style.setProperty('--game-width', (VW*css)+'px');
  stage.style.setProperty('--game-height', (VH*css)+'px');
  SC = css*dpr; screen.width = Math.round(VW*SC); screen.height = Math.round(VH*SC);
  const scale = Math.max(2, Math.min(touchDevice.matches ? 3 : 5, Math.ceil(SC)));
  if (world.width !== VW*scale || world.height !== VH*scale) {
    world.width = VW*scale;
    world.height = VH*scale;
    w.setTransform(scale,0,0,scale,0,0);
    w.imageSmoothingQuality = 'medium';
  }
}
new ResizeObserver(resize).observe(stage);
resize();

const imgs = Object.fromEntries(Object.entries(SPR).map(([gender,paths]) => [
  gender,Object.fromEntries(Object.entries(paths).map(([mode,path]) => {
    const image = new Image();
    image.src = path;
    return [mode,image];
  }))
]));

// ---------- storage (runner name and best time) ----------
function load(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }
function save(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

// ---------- race rules ----------
const ITEMS = {
  gukbap: {name:'국밥', stamina:30, heat:24},
  milmyeon: {name:'밀면', stamina:19, heat:-25},
  eomuk: {name:'오뎅', stamina:9, heat:8},
  water: {name:'물', stamina:6, heat:-10},
  gel: {name:'에너지젤', stamina:8, heat:0},
};
const FOOD = ['eomuk','milmyeon','eomuk','gukbap','milmyeon','eomuk'];
const HEAT_POSE = 70, HEAT_WARNING = 85;
const SUPPORTER_STATIONS = [
  [10,1,['화이팅!!']], [24,2,['콜라!콜라!']],
  [34,1,['걷지말고 뛰라!!','마!']], [40,2,['다와간다!']]
];
const CHEER_ZONES = SUPPORTER_STATIONS.map(([km])=>{
  const d=worldAt(km);
  return [d-105,d+105];
});
let raceNumber=0;
const RECOIL_TIME = .18, RECOVERY_TIME = .42;
const bounded = value => Math.max(0, Math.min(100, value));

const bridgeCrests = PROFILE.filter(([km,height],i) =>
  i > 0 && i < PROFILE.length-1 && onBridge(worldAt(km)) &&
  height >= PROFILE[i-1][1] && height >= PROFILE[i+1][1] &&
  (height > PROFILE[i-1][1] || height > PROFILE[i+1][1]));
const doubleJumpVisible = d => !onBridge(d) || (
  roadY(d) >= 108 && bridgeCrests.every(([km]) => Math.abs(kmAt(d)-km) >= .65)
);

let G;
function newGame(char, name = '러너', crew = ''){
  const obstacles = [];
  let gullCount = 0;
  for (let d = 755, i = 0; d < LEN-300; d += 465 + (i++ % 4)*64) {
    if (onBridge(d-95) !== onBridge(d+95)) continue;
    const gull = onBridge(d);
    obstacles.push({d, kind:gull ? 'gull' : 'cone', angry:gull && ++gullCount%3===0, hit:false});
  }

  const clear = d => obstacles.every(o => Math.abs(d-o.d) > 105);
  const items = [];
  const deferredFood = [];
  for (let d = 440, i = 0; d < LEN-160; d += 1060, i++) {
    const position = [0,135,-135,220,-220,300,-300,355,-355]
      .map(offset => d+offset)
      .find(candidate => clear(candidate) && candidate > (items.at(-1)?.d ?? 0)+155);
    if (position === undefined) continue;
    if (i < 2) {
      deferredFood.push(FOOD[i]);
      items.push({d:position, kind:'water', high:false, got:false});
    } else {
      items.push({d:position, kind:FOOD[i%FOOD.length], high:false, got:false});
    }
  }
  for (const [i,km] of [31.5,36].entries()) {
    const anchor = worldAt(km);
    const position = [0,70,-70,140,-140,210,-210,280,-280,350,-350]
      .map(offset => anchor+offset)
      .find(candidate => clear(candidate) && items.every(it => Math.abs(it.d-candidate)>155));
    if (position !== undefined && deferredFood[i]) {
      items.push({d:position, kind:deferredFood[i], high:false, got:false});
    }
  }
  const foodItems = items.filter(it => FOOD.includes(it.kind)).sort((a,b) => a.d-b.d);
  for (const [i,item] of foodItems.entries()) item.high = i % 4 === 2;
  for (const [i,d] of WATER.entries()) {
    const position = [d,d-45,d+45,d-135,d+135,d-180,d+180]
      .find(candidate => clear(candidate) && items.every(it => Math.abs(it.d-candidate)>52));
    if (position !== undefined) items.push({d:position, kind:i%4===3 ? 'gel' : 'water', airborne:i===1 || i===3 || i===5 || i===7, high:i===5 || i===7, got:false});
  }
  for (const item of items.filter(it => it.high && !doubleJumpVisible(it.d))) {
    const nearby = [70,-70,140,-140,210,-210,280,-280,350,-350,420,-420,490,-490,560,-560,630,-630]
      .map(offset => item.d+offset)
      .find(d => d > 200 && d < LEN-200 && doubleJumpVisible(d) &&
        obstacles.every(o => Math.abs(o.d-d) >= 140) &&
        items.every(it => it === item || Math.abs(it.d-d) >= 125));
    if (nearby !== undefined) {
      item.d = nearby;
      continue;
    }
    const replacement = items.filter(it => !it.high && doubleJumpVisible(it.d) &&
      (FOOD.includes(item.kind) ? FOOD.includes(it.kind) : it.kind === item.kind))
      .sort((a,b) => Math.abs(a.d-item.d)-Math.abs(b.d-item.d))[0];
    item.high = false;
    if (!replacement) continue;
    replacement.high = true;
    if (item.airborne) {
      item.airborne = Boolean(replacement.airborne);
      replacement.airborne = true;
    }
  }
  for (let d = 1420; d < LEN-300; d += 900) {
    if (onBridge(d-95) !== onBridge(d+95) ||
        obstacles.some(o => Math.abs(o.d-d) < 205) ||
        items.some(it => Math.abs(it.d-d) < 140) ||
        SUPPORTER_STATIONS.some(([km]) => Math.abs(worldAt(km)-d) < 170)) continue;
    const gull = onBridge(d);
    obstacles.push({d, kind:gull ? 'gull' : 'cone', angry:gull && ++gullCount%3===0, hit:false});
  }
  for (const km of [1.5, 26, 41]) {
    const anchor = worldAt(km);
    const d = [0, 80, -80, 160, -160, 240, -240, 320, -320]
      .map(offset => anchor+offset)
      .find(d => d > 300 && d < LEN-200 &&
        !onBridge(d-95) && !onBridge(d) && !onBridge(d+95) &&
        obstacles.every(o => Math.abs(o.d-d) >= 200) &&
        items.every(it => Math.abs(it.d-d) >= 125) &&
        SUPPORTER_STATIONS.every(([station]) => Math.abs(worldAt(station)-d) >= 170));
    if (d !== undefined) obstacles.push({d, kind:'cone', angry:false, hit:false});
  }
  // At the fastest allowed pace, a jump covers under 125 course units.
  // Keep 165 units between the pair so the runner can land and jump again.
  for (const [kind,km] of [['cone',6],['gull',32]]) {
    const anchor = worldAt(km);
    const starters = obstacles.filter(o => o.kind === kind)
      .sort((a,b) => Math.abs(a.d-anchor)-Math.abs(b.d-anchor));
    for (const first of starters) {
      const d = [first.d+165,first.d-165].find(candidate =>
        candidate > 350 && candidate < LEN-250 &&
        [-95,0,95].every(offset => onBridge(candidate+offset) === (kind === 'gull')) &&
        obstacles.every(o => Math.abs(o.d-candidate) >= 165) &&
        items.every(it => Math.abs(it.d-candidate) >= 125) &&
        SUPPORTER_STATIONS.every(([station]) => Math.abs(worldAt(station)-candidate) >= 170));
      if (d === undefined) continue;
      obstacles.push({d,kind,angry:false,hit:false});
      break;
    }
  }
  const highConeAnchor = worldAt(25);
  const highConePosition = Array.from({length:140}, (_,i) => highConeAnchor + (i-70)*25)
    .sort((a,b) => Math.abs(a-highConeAnchor)-Math.abs(b-highConeAnchor))
    .find(d => [-95,0,95].every(offset => !onBridge(d+offset)) &&
      obstacles.every(o => Math.abs(o.d-d) >= 140) &&
      items.every(it => Math.abs(it.d-d) >= 125) &&
      SUPPORTER_STATIONS.every(([km]) => Math.abs(worldAt(km)-d) >= 170));
  if (highConePosition !== undefined) obstacles.push({d:highConePosition,kind:'cone',high:true,hit:false});
  for (const km of [8, 38]) {
    const anchor = worldAt(km);
    const lead = obstacles.filter(o => o.kind === 'gull' && !o.angry && !o.pattern &&
      Math.abs(o.d-anchor) < worldAt(2.5) && onBridge(o.d+70) && doubleJumpVisible(o.d+36) &&
      obstacles.every(other => other === o || other.d <= o.d-165 || other.d >= o.d+36+210) &&
      items.every(it => Math.abs(it.d-o.d-36) >= 80))
      .sort((a,b) => Math.abs(a.d-anchor)-Math.abs(b.d-anchor))[0];
    if (!lead) continue;
    lead.pattern = 'gull-pair';
    obstacles.push({d:lead.d+36,kind:'gull',high:true,pattern:'gull-pair',hit:false});
  }
  for (const [km,offset] of [[16,235],[32,-245]]) {
    const anchor = worldAt(km);
    const sequence = obstacles.filter(o => o.kind === 'gull' && !o.pattern &&
      Math.abs(o.d-anchor) < worldAt(3.5))
      .sort((a,b) => Math.abs(a.d-anchor)-Math.abs(b.d-anchor))
      .flatMap(normal => [0,15,-15,30,-30,45,-45].map(adjustment => ({
        normal, d: normal.d+offset+adjustment
      })))
      .find(({normal,d}) => Math.abs(normal.d-d) >= 220 && doubleJumpVisible(d) &&
        [-45,45].every(shift => onBridge(d+shift)) &&
        obstacles.every(other => other === normal || Math.abs(other.d-d) >= 200) &&
        items.every(it => Math.abs(it.d-d) >= 120));
    if (!sequence) {
      if (offset > 0) continue;
      const ordered = [...obstacles].sort((a,b) => a.d-b.d);
      const first = ordered.find((o,i) => {
        const next = ordered[i+1];
        return o.kind === 'gull' && !o.pattern && doubleJumpVisible(o.d) && next?.kind === 'gull' && !next.pattern &&
          next.d-o.d >= 225 && next.d-o.d <= 680 &&
          o.d-(ordered[i-1]?.d ?? 0) >= 175 &&
          items.every(it => Math.abs(it.d-o.d) >= 150);
      });
      if (first) {
        first.high = true;
        first.pattern = 'gull-sequence';
        ordered[ordered.indexOf(first)+1].pattern = 'gull-sequence';
      }
      continue;
    }
    sequence.normal.pattern = 'gull-sequence';
    obstacles.push({d:sequence.d,kind:'gull',high:true,pattern:'gull-sequence',hit:false});
  }
  const crossing = STAGES.find(([km,,,bridge],i) => {
    if (!i || !bridge || STAGES[i-1][3] || !doubleJumpVisible(worldAt(km)+22)) return false;
    const d = worldAt(km);
    return obstacles.every(o => Math.abs(o.d-d) >= 140) &&
      items.every(it => Math.abs(it.d-d) >= 125) &&
      SUPPORTER_STATIONS.every(([station]) => Math.abs(worldAt(station)-d) >= 170);
  });
  if (crossing) {
    const d = worldAt(crossing[0]);
    obstacles.push({d:d-22,kind:'cone',pattern:'cone-gull',hit:false});
    obstacles.push({d:d+22,kind:'gull',high:true,pattern:'cone-gull',hit:false});
  }
  obstacles.sort((a,b) => a.d-b.d);
  const supporters = SUPPORTER_STATIONS.map(([km,art,quotes])=>{
    const station=worldAt(km);
    const position=[0,10,-10,20,-20,30,-30,40,-40,50,-50,60,-60,70,-70,80,-80,90,-90,100,-100,110,-110,120,-120,145,-145]
      .map(offset=>station+offset)
      .find(d=>items.every(it=>Math.abs(it.d-d)>59)&&
               obstacles.every(o=>o.kind!=='cone'||Math.abs(o.d-d)>59));
    return {position:position??station,station,artKey:'supporter-'+art,quote:quotes[raceNumber%quotes.length]};
  });
  G = {state:'play', char, name, crew, d:0, v:0, t:0, jy:0, vy:0, doubleJumped:false, stam:100, pendingRecovery:0, exhaustionCount:0, heat:0, overheated:false,
       lives:3, items, obstacles, supporters, cheer:-1, cheerBubble:null, wind:false, msgs:[],
       frame:1, ft:0, impact:0, furthest:0, panDistance:null, harborHeart:null};
}

function windAt(d){
  const [start,,,bridge] = STAGES[stageIndex(d)];
  const local = d - worldAt(start);
  return bridge && local >= 290 && (local-290)%790 < 270;
}

const requiresJump = item => item.airborne || FOOD.includes(item.kind);
const itemHeight = item => item.high ? 82 : requiresJump(item) ? 42 : 17;


// ---------- input ----------
let boostKey = false, menuChar = 'female', scene = 'title';
function jump(){
  const g = G;
  if (scene !== 'play' || paused || g.state !== 'play') return;
  if (g.jy === 0 && g.vy === 0) {
    g.vy = -212;
    beep(520,.06);
  } else if (!g.doubleJumped) {
    g.doubleJumped = true;
    g.vy = -275;
    beep(690,.06);
  }
}
const nameForm = document.getElementById('runnerForm');
const nameInput = document.getElementById('runnerName');
const pauseButton = document.getElementById('pauseButton');
const crewInput = document.getElementById('crewName');
crewInput.value = load('bbr_crew_name') || '';
const rankButton = document.getElementById('rankButton');
const ranking = document.getElementById('ranking');
const rankTable = document.getElementById('rankTable');
const rankKey = 'bbr_pc_course_ranking';
const rankingEndpoint = document.querySelector('meta[name="ranking-endpoint"]')?.content;
const rankStatus = document.getElementById('rankEmpty');

async function fetchRanking(options) {
  const response = await fetch(rankingEndpoint, options);
  if (!response.ok) throw Error('Ranking request failed');
  return response.json();
}
let rankingSubmission = Promise.resolve();

rankButton.addEventListener('click', async () => {
  ranking.showModal();
  rankStatus.hidden = false;
  rankStatus.textContent = rankingEndpoint ? '공용 랭킹 불러오는 중…' : '아직 완주 기록이 없어요.';
  rankTable.hidden = true;
  let records = load(rankKey) || [];
  if (rankingEndpoint) {
    try {
      await rankingSubmission;
      records = await fetchRanking();
      rankStatus.textContent = '아직 완주 기록이 없어요.';
    } catch {
      rankStatus.textContent = '공용 랭킹을 불러오지 못했어요.';
      return;
    }
  }
  const body = rankTable.tBodies[0];
  body.replaceChildren();
  records.forEach(({crew,name,time}, i) => {
    const row = body.insertRow();
    for (const value of [i+1, crew, name, elapsed(time)]) row.insertCell().textContent = value;
  });
  rankTable.hidden = records.length === 0;
  rankStatus.hidden = records.length !== 0;
});

const motionButton = document.getElementById('motionButton');
let reducedMotion = load('bbr_reduce_motion') ?? true;

function syncMotionButton(){
  motionButton.setAttribute('aria-pressed',String(reducedMotion));
  motionButton.textContent = '화면 움직임 줄이기 · '+(reducedMotion ? '켜짐' : '꺼짐');
}
syncMotionButton();
motionButton.addEventListener('click',()=>{
  reducedMotion=!reducedMotion;
  save('bbr_reduce_motion',reducedMotion);
  syncMotionButton();
});
const bgm = new Audio('assets/audio/race.wav');
const launchGuide=document.getElementById('launchGuide');
const launchStatus=document.getElementById('launchStatus');
const launchHint=document.getElementById('launchHint');
const cancelLaunch=document.getElementById('cancelLaunch');
const landscape=matchMedia('(orientation: landscape)');
let countdown=3, launchSequence=0;
let gameFullscreen=false;
let orientationWaiting=false;

function showGuide(status,hint,canCancel) {
  launchGuide.hidden=false;
  if (launchStatus.textContent!==status) launchStatus.textContent=status;
  if (launchHint.textContent!==hint) launchHint.textContent=hint;
  cancelLaunch.hidden=!canCancel;
}

async function tryLandscape(sequence) {
  const orientation=window.screen.orientation;
  const root=document.documentElement;
  if (typeof orientation?.lock!=='function') return;
  try {
    if (!document.fullscreenElement && root.requestFullscreen) {
      await root.requestFullscreen({navigationUI:'hide'});
      if (sequence!==launchSequence) {
        if (document.fullscreenElement===root) document.exitFullscreen?.().catch(()=>{});
        return;
      }
      gameFullscreen=true;
    }
    await orientation.lock('landscape');
    if (sequence!==launchSequence) orientation.unlock?.();
  } catch {
    // Rotation via the phone still works when the browser disallows a lock.
  }
}

function closeLaunch(){
  launchSequence++;
  orientationWaiting=false;
  launchGuide.hidden=true;
  window.screen.orientation?.unlock?.();
  if (gameFullscreen && document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
  gameFullscreen=false;
}

cancelLaunch.addEventListener('click',()=>{
  if (scene!=='ready') return;
  bgm.pause();
  bgm.muted=false;
  showTitle();
});
bgm.loop = true;
bgm.volume = .22;
let paused = false;
pauseButton.addEventListener('click', () => setPaused(!paused));

function setPaused(value){
  if (scene !== 'play') return;
  paused = value;
  boostKey = false;
  releaseBoost();
  pauseButton.textContent = value ? '계속하기' : '일시정지';
  pauseButton.setAttribute('aria-pressed', String(value));
  mobileControls.classList.toggle('show', !value);
  if (value) {
    bgm.pause();
    if (AC?.state === 'running') AC.suspend().catch(()=>{});
  } else {
    last = performance.now();
    if (AC?.state === 'suspended') AC.resume().catch(()=>{});
    bgm.play().catch(()=>{});
    pauseButton.blur();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene === 'play' && !paused) setPaused(true);
});
nameInput.value = load('bbr_runner_name') || '';

function showTitle(){
  closeLaunch();
  rankButton.hidden=false;
  scene = 'title';
  G = null;
  nameForm.hidden = false;
  pauseButton.hidden = true;
  motionButton.hidden = false;
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (scene === 'title') start();
});
addEventListener('keydown', e => {
  if (e.isComposing || ranking.open || e.target === rankButton || nameForm.contains(e.target) || e.target === motionButton || (e.target === pauseButton && ['Space','Enter'].includes(e.code)) || e.repeat && scene !== 'play') return;
  if (['Space','ArrowUp','ArrowRight','ArrowLeft','KeyW'].includes(e.code)) e.preventDefault();
  if (scene === 'title'){
    if (e.code==='ArrowLeft'||e.code==='ArrowRight') menuChar = menuChar==='female'?'male':'female';
    if (e.code==='Space'||e.code==='Enter') start();
    return;
  }
  if (scene === 'ready') {
    if (!e.repeat && e.code==='Escape') cancelLaunch.click();
    return;
  }
  if (scene === 'end'){ if (e.code==='Space'||e.code==='Enter') { showTitle(); } return; }
  if (e.code==='KeyP'||e.code==='Escape') {
    if (!e.repeat) setPaused(!paused);
    return;
  }
  if (paused || e.target === pauseButton) return;
  if (!e.repeat && (e.code==='ArrowUp'||e.code==='KeyW'||e.code==='Space')) jump();
  if (e.code==='ArrowRight'||e.code==='KeyD'||e.code==='ShiftLeft') {
    boostKey = true;
  }
});
addEventListener('keyup', e => { if (e.code==='ArrowRight'||e.code==='KeyD'||e.code==='ShiftLeft') boostKey = false; });

function toView(e){ const r = screen.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*VW, y:(e.clientY-r.top)/r.height*VH}; }
screen.addEventListener('pointerdown', e => {
  initAudio();
  const p = toView(e);
  if (scene === 'title'){
    if (p.y >= 58 && p.y <= 160) {
      if (p.x >= 92 && p.x <= 179) menuChar = 'female';
      else if (p.x >= 204 && p.x <= 291) menuChar = 'male';
    }
    return;
  }
  if (scene === 'end'){ showTitle(); return; }
  if (scene !== 'play' || paused) return;
  if (e.pointerType === 'mouse') {
    if (e.button === 2) {
      boostKey = true;
    } else jump();
  }
});
screen.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('pointerup', e => { if (e.pointerType==='mouse' && e.button===2) boostKey=false; });
const bJ = document.getElementById('bJump'), bB = document.getElementById('bBoost');
const mobileControls = document.getElementById('mobileControls');
let boostPointer = null;
bJ.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
bB.addEventListener('pointerdown', e => {
  if (paused || boostPointer !== null || e.button !== 0) return;
  e.preventDefault();
  boostPointer = e.pointerId;
  bB.setPointerCapture(e.pointerId);
  bB.classList.add('held');
});
function releaseBoost(){
  boostPointer = null;
  bB.classList.remove('held');
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  bB.addEventListener(event, e => { if (e.pointerId === boostPointer) releaseBoost(); });
}
addEventListener('blur', () => { boostKey = false; releaseBoost(); });
function start(){
  boostKey = false;
  releaseBoost();
  initAudio();
  const name = nameInput.value.trim() || '러너';
  nameInput.blur();
  nameForm.hidden = true;
  motionButton.hidden = true;
  rankButton.hidden = true;
  save('bbr_runner_name', nameInput.value.trim());
  const crew = crewInput.value.trim();
  save('bbr_crew_name', crew);
  newGame(menuChar, name, crew);
  raceNumber++;
  if (!touchDevice.matches) {
    beginRace();
    return;
  }
  countdown=3;
  scene='ready';
  bgm.muted=true;
  bgm.currentTime=0;
  bgm.playbackRate=1;
  bgm.play().catch(()=>{});
  const sequence=++launchSequence;
  tryLandscape(sequence);
  progressLaunch(0);
}

function beginRace(){
  launchGuide.hidden=true;
  scene='play';
  pauseButton.hidden=false;
  bgm.currentTime=0;
  bgm.playbackRate=1;
  bgm.muted=false;
  setPaused(false);
}

function progressLaunch(dt){
  if (!landscape.matches) {
    countdown=3;
    showGuide('휴대폰을 가로로 돌려주세요','화면이 회전하지 않으면 회전 잠금을 해제해 주세요.',true);
    return;
  }
  if (!document.hidden) countdown=Math.max(0,countdown-dt);
  if (countdown===0) beginRace();
  else showGuide(String(Math.ceil(countdown)),'잠시 후 출발합니다',true);
}

function checkRaceOrientation(){
  if (scene!=='play' || !touchDevice.matches) return;
  if (!landscape.matches) {
    if (!paused) setPaused(true);
    orientationWaiting=true;
    showGuide('휴대폰을 가로로 돌려주세요','가로 화면에서 계속하기를 누르면 이어서 달립니다.',false);
  } else if (orientationWaiting) {
    orientationWaiting=false;
    launchGuide.hidden=true;
  }
}

// ---------- audio ----------
let AC = null;
function initAudio(){ if (!AC) { try { AC = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} } }
function beep(f, dur, type='square', vol=.05){
  if (!AC) return;
  try { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
    g.gain.value = vol; g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime+dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime+dur); } catch(e){}
}

// ---------- update ----------
function msg(t, col='#fff', compact=false){
  G.msgs = [...G.msgs.filter(m => m.t !== t), {t, col, compact, life:1.6}].slice(-2);
}

function update(dt){
  const g = G;
  if (g.state !== 'play') return;
  const hold = g.impact === 0 && (boostKey || boostPointer !== null);
  const grade = gradeAt(g.d);
  const previousDistance = g.d;
  const wasWindy = g.wind;
  const wasCheering = g.cheer;
  g.wind = windAt(g.d);
  g.cheer = CHEER_ZONES.findIndex(([a,b]) => g.d >= a && g.d < b);
  if (g.wind && !wasWindy) msg('맞바람 · 감속 / 냉각 강화', '#bfe3ff',true);
  if (g.cheer >= 0 && g.cheer !== wasCheering) {

    beep(660,.08,'triangle');
  }

  const climb = Math.max(0,grade);
  const descent = Math.max(0,-grade);
  const climbPenalty = Math.min(.43,climb*.105);
  const slopeFactor = 1-climbPenalty+Math.min(.32,descent*.115);
  const exhausted = g.stam <= 0;
  const climbShare = Math.min(1,climb/2.5);
  const walkSpeed = speedForPace(WALK_PACE+40*climbShare);
  const cruise = g.overheated ? 84 : g.impact > 0 ? 88 : RUN_SPEED;
  let terrain = slopeFactor;
  if (climb > 0 && !hold && !exhausted && g.impact === 0 && !g.overheated) {
    const uphillSeconds = 30*climbShare;
    terrain = 1/(1+uphillSeconds*cruise/(clockSec(1)*worldAt(1)));
  }
  const terrainPaceLimit = grade > .65 ? 220 : grade < -.65 ? 185 : 200;
  const fatiguePaceLimit = g.exhaustionCount >= 2 ? 345 : g.exhaustionCount === 1 ? 255 : 0;
  const speedLimit = speedForPace(Math.max(terrainPaceLimit, fatiguePaceLimit));
  const target = Math.min(hold && !g.overheated ? speedLimit : cruise*terrain, speedLimit) - (g.wind ? 24 : 0);
  const recoil = Math.min(dt, Math.max(0, g.impact-RECOVERY_TIME));
  const forward = dt-recoil;
  g.impact = Math.max(0,g.impact-dt);
  const buildingBoost = hold && !g.overheated && target > g.v;
  const speedBlend = buildingBoost ? -Math.expm1(-forward*.55) : Math.min(1,forward*2.2);
  g.v = exhausted ? walkSpeed : Math.min(speedLimit,g.v+(target-g.v)*speedBlend);
  g.d = Math.max(0,previousDistance-82*recoil);
  const forwardStart = g.d;
  g.d = Math.min(LEN,g.d+g.v*forward);
  g.t += g.d === LEN ? recoil+(LEN-forwardStart)/g.v : dt;
  if (g.furthest < TURN && g.d >= TURN) msg('충무동사거리 반환! 벡스코로', '#fff6a8');
  if (g.furthest < worldAt(30) && g.d >= worldAt(30)) {
    bgm.playbackRate = 1.5;
    msg('30 km의 벽 · 부산항대교 정상까지!', '#fff6a8');
  }
  g.furthest = Math.max(g.furthest,g.d);
  if (g.panDistance === null) g.panDistance = previousDistance;
  // Let scenery catch up gradually when the runner accelerates or recoils.
  const followTime = reducedMotion ? .82 : .24;
  g.panDistance += (g.d-g.panDistance)*(1-Math.exp(-dt/followTime));

  const climbDrain = climb*.88;
  const drain = (.82 + climbDrain + (hold ? 1.9 : 0)) * (g.overheated ? 2.25 : 1);
  if (g.pendingRecovery > 0) {
    const recovered = Math.min(g.pendingRecovery,5*dt);
    g.pendingRecovery -= recovered;
    g.stam = bounded(g.stam+recovered);
  }
  if (g.cheer < 0) g.stam = bounded(g.stam - drain*dt);
  if (g.stam === 0) {
    g.v = walkSpeed;
    if (!exhausted) {
      g.exhaustionCount++;
      const notice = g.exhaustionCount >= 2 ? '체력회복 지연' : '체력 고갈';
      msg(notice, '#ffd27a', true);
    }
  }
  const heatRate = hold ? (g.wind ? 6 : 8) : (g.wind ? -23 : -14);
  g.heat = bounded(g.heat + heatRate*dt);

  g.vy += 620*dt;
  g.jy = Math.max(0, g.jy - g.vy*dt);
  if (g.jy === 0) {
    g.vy = 0;
    g.doubleJumped = false;
  }
  g.ft += dt*g.v/(g.stam === 0 ? 19 : 11);
  g.frame = 1 + Math.floor(g.ft)%5;

  for (const obstacle of g.obstacles) {
    if (obstacle.hit || obstacle.avoided) continue;
    const gull = obstacle.kind === 'gull';
    if (onBridge(g.d) !== gull) continue;
    if (obstacle.high) {
      if (previousDistance >= obstacle.d || g.d < obstacle.d) continue;
      if (g.doubleJumped && g.jy >= 40) {
        obstacle.avoided = true;
        continue;
      }
    } else if (gull && g.stam <= 0) {
      // At very low speed the overlap can outlast a jump. Judge the pass once at its center.
      if (previousDistance >= obstacle.d || g.d < obstacle.d) continue;
      if (g.jy >= 13) {
        obstacle.avoided = true;
        continue;
      }
    } else if (Math.abs(obstacle.d-g.d) >= 9 || g.jy >= (gull ? 19 : 14)) {
      continue;
    }
    obstacle.hit = true;
    g.lives--;
    if (g.stam > 0) g.v *= .24;
    g.impact = RECOIL_TIME+RECOVERY_TIME;
    msg((obstacle.angry ? '분노 갈매기' : gull ? '갈매기' : obstacle.high ? '높은 라바콘' : '라바콘') + ' 충돌 · 감속 / 라이프 −1', '#ffd27a',true);
    beep(140,.16,'sawtooth');
    if (g.lives === 0) { finish(false); return; }
  }

  for (const it of g.items) {
    const height = itemHeight(it);
    if (it.got || Math.abs(it.d-g.d) >= 18) continue;
    if (requiresJump(it)) {
      if (it.high ? !g.doubleJumped || g.jy < 40 : g.jy < 12 || g.jy > 54) continue;
    } else if (height < g.jy-9 || height > g.jy+48) continue;
    it.got = true;
    const item = ITEMS[it.kind];
    const delayed = g.exhaustionCount >= 2;
    if (delayed) {
      g.pendingRecovery = Math.min(g.pendingRecovery+item.stamina,100-g.stam);
    } else {
      g.stam = bounded(g.stam + item.stamina);
    }
    g.heat = bounded(g.heat + item.heat);
    const heat = item.heat === 0 ? '' : ' · 열기 ' + (item.heat > 0 ? '+' : '−') + Math.abs(item.heat);
    msg(item.name + (delayed ? ' · 체력회복 지연' : ' · 체력 +' + item.stamina) + heat, '#fff6a8',true);
    beep(880,.07);
  }

  if (!g.overheated && g.heat >= 100) {
    g.overheated = true;
    msg('오버페이스 · 가속 제한 / 체력 급소모', '#ffb0a8',true);
  } else if (g.overheated && g.heat <= 70) {
    g.overheated = false;
  }

  for (const m of g.msgs) m.life -= dt;
  g.msgs = g.msgs.filter(m => m.life > 0);
  if (g.d === LEN) finish(true);
}

const clockSec = t => t * 87;
const RUN_SPEED = 100.25;
const WALK_PACE = 540;
const speedForPace = seconds => clockSec(1)*worldAt(1)/seconds;
const paceForSpeed = speed => speed > 0 ? pace(clockSec(1)*worldAt(1)/speed,1) : '–:––';
const pad = value => String(value).padStart(2,'0');
function elapsed(seconds){
  const t = Math.round(seconds);
  return [Math.floor(t/3600), Math.floor(t/60)%60, t%60].map(pad).join(':');
}
function pace(seconds, km){
  if (km < .02) return '–:––';
  const t = Math.round(seconds/km);
  return Math.floor(t/60) + ':' + pad(t%60);
}
function finish(completed){
  const g = G;
  if (g.state === 'done') return;
  g.state = 'done';
  g.completed = completed;
  g.final = clockSec(g.t);
  scene = 'end';
  paused = false;
  pauseButton.hidden = true;
  bgm.pause();
  boostKey = false;
  releaseBoost();
  mobileControls.classList.remove('show');
  rankButton.hidden = false;
  if (!completed) return;
  const result = {name:g.name,crew:g.crew,time:g.final};
  if (rankingEndpoint) {
    rankingSubmission = fetchRanking({
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(result)
    }).catch(() => msg('공용 랭킹에 기록을 저장하지 못했어요.', '#ffd27a', true));
  }
  const records = load(rankKey) || [];
  const previous = records.findIndex(record => record.name === g.name && record.crew === g.crew);
  if (previous < 0 || g.final < records[previous].time) {
    if (previous >= 0) records.splice(previous,1);
    records.push(result);
    records.sort((a,b) => a.time-b.time);
    save(rankKey,records);
  }
  const key = 'bbr_pc_balance_best_' + g.char + ':' + g.name;
  const best = load(key);
  g.newBest = !best || g.final < best;
  if (g.newBest) save(key,g.final);
  beep(523,.12); setTimeout(()=>beep(659,.12),120); setTimeout(()=>beep(784,.25),240);
}


// ---------- drawing helpers ----------
const R = (x,y,ww,hh,c) => { w.fillStyle = c; w.fillRect(Math.round(x),Math.round(y),ww,hh); };
const artPaths = {
  'supporter-1':'assets/props/supporter-1.webp', 'supporter-2':'assets/props/supporter-2.webp',
  selection:'assets/ui/selection.webp', ending:'assets/ui/ending.webp',
  'finish-female':'assets/ui/finish-female.webp', 'finish-male':'assets/ui/finish-male.webp',
  "coast-docks": "assets/backgrounds/coast-docks.webp",
  "coast-finish": "assets/backgrounds/coast-finish.webp",
  "coast-gwangan-return": "assets/backgrounds/coast-gwangan-return.webp",
  "coast-industrial": "assets/backgrounds/coast-industrial.webp",
  "coast-market-return": "assets/backgrounds/coast-market-return.webp",
  "coast-market": "assets/backgrounds/coast-market.webp",
  "coast-namhang": "assets/backgrounds/coast-namhang.webp",
  "coast-port-return": "assets/backgrounds/coast-port-return.webp",
  "coast-port": "assets/backgrounds/coast-port.webp",
  "coast-start": "assets/backgrounds/coast-start.webp",
  "bukangi": "assets/props/bukangi.webp",
  "cone": "assets/props/cone.webp",
  "eomuk": "assets/props/eomuk.webp",
  "gel": "assets/props/gel.webp",
  "gukbap": "assets/props/gukbap.webp",
  "gull-angry": "assets/props/gull-angry.webp",
  "gull-normal": "assets/props/gull-normal.webp",
  "milmyeon": "assets/props/milmyeon.webp",
  "water": "assets/props/water.webp"
};
const art = Object.fromEntries(Object.entries(artPaths).map(([key,path]) => {
  const image = new Image();
  image.src = path;
  return [key,image];
}));

function drawProp(key, center, bottom, height){
  const image = art[key];
  if (!image.naturalWidth) return;
  const width = height*image.naturalWidth/image.naturalHeight;
  const x = center-width/2, y = bottom-height;
  w.drawImage(image, x, y, width, height);
}

// Panoramas are keyed to race distance. The road and props remain in world space.
const SCENERY = [
  [0,'coast-start'], [10,'coast-docks'], [12.9,'coast-port',208],
  [18.5,'coast-namhang'], [21.2,'coast-market'],
  [23.1,'coast-market-return'], [28.8,'coast-port-return',205],
  [33.3,'coast-industrial'], [36.6,'coast-gwangan-return'], [39.1,'coast-finish']
];

function sceneryIndex(distance){
  return SCENERY.findLastIndex(([km]) => distance >= worldAt(km));
}

// Continuous panorama. Only the narrow overlaps are blended.
const SEAM_OVERLAPS = [0,24,56,26,28,36,56,28,52,28];
// Keep the intersection in view but skip some of the repeated market facade.
const MARKET_CROPS = {'coast-market':[.28,0],'coast-market-return':[0,.10]};
let panoramaLayout;
function getPanoramaLayout(){
  if (panoramaLayout) return panoramaLayout;
  if (!SCENERY.every(([,key])=>art[key].naturalWidth)) return null;
  let end=0;
  const panels=SCENERY.map(([km,key],i)=>{
    const image=art[key];
    const overlap=SEAM_OVERLAPS[i];
    const left=end-overlap;
    const scale=VH/image.naturalHeight;
    const [trimStart,trimEnd]=MARKET_CROPS[key] ?? [0,0];
    const sourceLeft=image.naturalWidth*trimStart;
    const sourceWidth=image.naturalWidth*(1-trimStart-trimEnd);
    end=left+sourceWidth*scale;
    return {km,image,overlap,left,right:end,scale,sourceLeft};
  });
  const stations=[{d:0,center:VW/2},
    ...panels.slice(1).map(p=>({d:worldAt(p.km),center:p.left+p.overlap/2})),
    {d:LEN,center:end-VW/2}];
  const slopes=stations.slice(1).map((s,i)=>
    (s.center-stations[i].center)/(s.d-stations[i].d));
  const rates=stations.map((_,i)=>{
    const a=slopes[i-1], b=slopes[i];
    return a===undefined ? b : b===undefined ? a : 2*a*b/(a+b);
  });
  panoramaLayout={panels,stations,rates};
  return panoramaLayout;
}

function drawPanorama(distance){
  const layout=getPanoramaLayout();
  if (!layout) return;
  const {panels,stations,rates}=layout;
  const index=Math.min(sceneryIndex(distance),stations.length-2);
  const a=stations[index], b=stations[index+1];
  const progress=Math.max(0,Math.min(1,(distance-a.d)/(b.d-a.d)));
  const t=progress,t2=t*t,t3=t2*t,span=b.d-a.d;
  const center=(2*t3-3*t2+1)*a.center+(t3-2*t2+t)*span*rates[index]+
    (-2*t3+3*t2)*b.center+(t3-t2)*span*rates[index+1];
  const camera=center-VW/2;
  const far=camera+VW;
  const paint=(panel,start,stop,opacity)=>{
    const left=Math.max(start,camera),right=Math.min(stop,far);
    if (left>=right) return;
    w.globalAlpha=opacity;
    const sx=panel.sourceLeft+(left-panel.left)/panel.scale, sw=(right-left)/panel.scale;
    w.drawImage(panel.image,sx,0,sw,panel.image.naturalHeight,left-camera,0,right-left+.02,VH);
  };
  for (const panel of panels) {
    if (panel.right<=camera || panel.left>=far) continue;
    const overlapEnd=panel.left+panel.overlap;
    const bands=8;
    for (let i=0;i<bands && panel.overlap;i++) {
      const step=panel.overlap/bands;
      paint(panel,panel.left+i*step,panel.left+(i+1)*step,(i+.5)/bands);
    }
    paint(panel,overlapEnd,panel.right,1);
  }
  w.globalAlpha=1;
}

function drawHarborSwimmer(distance,time){
  const [start,,waterLine]=SCENERY[sceneryIndex(distance)];
  if (!waterLine) return null;
  const swim=(kmAt(distance)-start)*125+time*13;
  const pass=Math.floor(swim/480);
  const x=swim-pass*480-48;
  drawAnimated('bukangi',Math.floor(time*8)%8,158,86,x,waterLine,33);
  return {x,waterLine,key:start+':'+pass};
}

const HARBOR_HEART = [
  '.11.11.',
  '1221221',
  '1222221',
  '.12221.',
  '..121..',
  '...1...'
];
function harborHeartVisible(g,swimmer){
  if (!swimmer || swimmer.x < 12 || swimmer.x > VW-12) {
    g.harborHeart = null;
    return false;
  }
  if (g.harborHeart?.key !== swimmer.key) {
    g.harborHeart={key:swimmer.key,started:g.t};
  }
  return g.harborHeart?.key===swimmer.key && g.t-g.harborHeart.started<2;
}
function drawHarborHeart(swimmer){
  const x=Math.round(swimmer.x), y=swimmer.waterLine-47;
  // Pixel silhouette with a short tail pointing down at the fin.
  R(x-10,y,20,21,'#2e304c');
  R(x-12,y+3,24,15,'#2e304c');
  R(x-9,y+1,18,18,'#fff7ee');
  R(x-11,y+4,22,13,'#fff7ee');
  R(x-3,y+19,7,3,'#2e304c');
  R(x-2,y+19,5,2,'#fff7ee');
  R(x-1,y+22,3,3,'#2e304c');
  for (const [row,line] of HARBOR_HEART.entries()) {
    for (const [column,pixel] of [...line].entries()) {
      if (pixel!=='.') R(x-7+column*2,y+4+row*2,2,2,pixel==='1'?'#98233e':'#ff5e88');
    }
  }
  R(x-3,y+7,2,2,'#ffd1df');
}

function drawAnimated(key, frame, sourceWidth, sourceHeight, center, bottom, width){
  const im = art[key];
  if (!im.naturalWidth) return;
  const height = width*sourceHeight/sourceWidth;
  w.drawImage(im,frame*sourceWidth,0,sourceWidth,sourceHeight,
              center-width/2,bottom-height,width,height);
}

function runnerMotion(g){
  if (g.impact > RECOVERY_TIME) {
    return ['collision',(RECOIL_TIME+RECOVERY_TIME-g.impact)/RECOIL_TIME];
  }
  if (g.impact > 0) return ['pain',1-g.impact/RECOVERY_TIME];
  const mode = g.heat >= HEAT_POSE ? 'heat' :
               gradeAt(g.d) >= 1.15 ? 'uphill' : 'run';
  return [mode,g.jy > 0 ? 6 : g.frame];
}

function drawRunner(context, image, frame, x, y, size){
  if (!image.naturalWidth) return;
  context.drawImage(image,frame*RUNNER_CELL,0,RUNNER_CELL,RUNNER_CELL,x,y,size,size);
}

function drawProfile(d){
  s.save();
  drawPanel(167,5,109,51);
  const left = 173, width = 97, bottom = 35, height = 21;
  const profileY = meters => bottom - meters / 80 * height;
  s.lineWidth = 1.1;
  for (let i = 1; i < PROFILE.length; i++) {
    const [a, h1] = PROFILE[i - 1], [b, h2] = PROFILE[i];
    const grade = (h2 - h1) / ((b - a) * 10);
    s.strokeStyle = grade > .65 ? '#ffc37c' : grade < -.65 ? '#91dcff' : '#c5a9b1';
    s.beginPath();
    s.moveTo(left + a / KM * width, profileY(h1));
    s.lineTo(left + b / KM * width, profileY(h2));
    s.stroke();
  }
  const x = left + d / LEN * width;
  s.fillStyle = '#fff6ee';
  s.fillRect(x - 1, 12, 2, 24);
  const grade = gradeAt(d);
  s.fillStyle = grade > .65 ? '#ffc37c' : grade < -.65 ? '#91dcff' : '#fff6ee';
  s.font = '9px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  const status = grade > .65 ? '업힐 +' : grade < -.65 ? '다운힐 −' : '평지 ';
  s.fillText(status + Math.abs(grade).toFixed(1) + '%  ·  추정', left, 41);
  s.restore();
}

function draw(){
  const g = G;
  const cameraLag = (reducedMotion ? 4 : 8)*Math.max(0,Math.min(
    (RECOIL_TIME+RECOVERY_TIME-g.impact)/RECOIL_TIME, g.impact/RECOVERY_TIME));
  const cam = g.d - 96 + cameraLag;
  R(0,0,VW,VH,'#329add');
  const time=g.t;
  const panDistance=g.panDistance ?? g.d;
  drawPanorama(panDistance);
  const swimmer=drawHarborSwimmer(panDistance,time);
  if (g.d > TURN) R(0, 0, VW, VH, 'rgba(255,172,107,.09)');

  // Track, lane stripes and railing all follow the same elevation as the runner.
  for (let x = 0; x < VW; x += 2) {
    const d = cam + x, y = roadY(d);
    const deck = onBridge(d);
    R(x, y - 4, 2, 3, '#f1dec8');
    R(x, y - 1, 2, 2, '#455263');
    R(x, y + 1, 2, deck ? 26 : VH, '#454456');
    R(x, y + 3, 2, 20, '#55586a');
    const laneSpacing = reducedMotion ? 27 : 16;
    if (Math.floor(d/laneSpacing)%2===0) R(x,y+13,2,2,reducedMotion ? '#c4c5c9' : '#fff6ee');
    if (deck) {
      R(x, y + 23, 2, 5, '#bcc9d4');
      R(x, y + 27, 2, 3, '#2a425b');
      const pier = ((Math.floor(d) % 172) + 172) % 172;
      if (pier < 10) R(x, y + 30, 2, Math.min(58, VH - y - 30), pier < 4 ? '#c0cbd5' : '#5a7188');
      R(x, y - 13, 2, 2, '#e1edf3');
      if (Math.floor(d / 2) % 8 === 0) R(x, y - 12, 2, 8, '#9daec1');
    }
  }
  for (const [d, label] of [[TURN, '반환'], [LEN, '피니시']]) {
    const x=Math.round(d-cam);
    if (x < -50 || x > VW+50) continue;
    const y=Math.round(roadY(d)), finishFlag=d===LEN;
    const base=finishFlag?'#133a7b':'#08484e';
    const stripe=finishFlag?'#ff9147':'#72eed5';
    const ink='#0d203c';
    // Blue-and-orange/surf-teal pixel race gates with checker and U-turn motifs.
    for (const side of [-1,1]) {
      const post=x+side*28;
      R(post-2,y-36,5,36,ink);
      R(post-1,y-34,3,32,'#f5e8ce');
      R(post-1,y-30,3,5,stripe);
      R(post-3,y-3,7,3,ink);
    }
    R(x-32,y-59,64,26,ink);
    R(x-30,y-60,60,27,ink);
    R(x-30,y-58,60,23,'#fff6df');
    R(x-28,y-56,56,19,base);
    R(x-28,y-56,56,3,stripe);
    R(x-28,y-39,56,2,stripe);
    if (finishFlag) {
      for (const side of [-1,1]) for (let i=0;i<3;i++) {
        R(x+side*20-5+i*3,y-49+(i%2)*3,3,3,'#fff6df');
      }
      for (let i=-26;i<28;i+=6) {
        R(x+i,y+1,3,3,(i+26)%12===0?'#fff6df':stripe);
      }
    } else {
      R(x-24,y-50,8,2,stripe);R(x-18,y-48,2,6,stripe);
      R(x-24,y-44,7,2,stripe);R(x-25,y-46,2,5,stripe);
      R(x-27,y-45,2,3,stripe);
      R(x+17,y-49,7,2,stripe);R(x+20,y-46,7,2,stripe);
    }
    w.font='10px "NeoDunggeunmo","Malgun Gothic",sans-serif';
    w.textAlign='center';
    w.fillStyle='#fff9e6';
    w.fillText(label,x,y-42);
  }


  if (scene !== 'title') {
    g.cheerBubble=null;
    drawSupporters(g,cam);
    for (const it of g.items) {
      const x = it.d-cam;
      if (it.got || x < -24 || x > VW+24) continue;
      const y = roadY(it.d)-itemHeight(it)+Math.sin(time*4.17+it.d)*1.5;
      drawProp(it.kind,x,y+13,27);

    }
    for (const o of g.obstacles) {
      if (o.hit || g.d > o.d+35) continue;
      const gull = o.kind === 'gull';
      const d = obstacleDisplayDistance(o,g.d);
      const x = d-cam;
      if (x < -24 || x > VW+24 || (gull && !onBridge(d))) continue;
      if (gull) {
        const fps = o.angry ? 17 : 10;
        const frame = Math.floor(time*fps)%6;
        const y = roadY(d)-(o.high ? 37 : 6)-Math.sin(time*8+o.d)*2;
        drawAnimated(o.angry ? 'gull-angry' : 'gull-normal',frame,160,115,x,y,o.angry ? 42 : 38);
      } else if (o.high) {
        const bottom = roadY(d);
        drawProp('cone',x,bottom,48);
      } else {
        drawProp('cone',x,roadY(d),28);
      }

    }
  }
  if (harborHeartVisible(g,swimmer)) drawHarborHeart(swimmer);
  // runner
  const [mode,phase] = runnerMotion(g);
  const image = imgs[g.char][mode];
  const count = image.naturalWidth/RUNNER_CELL;
  const frame = mode === 'collision' || mode === 'pain' ?
    Math.min(count-1,Math.floor(phase*count)) : phase;
  drawRunner(w,image,frame,Math.round(g.d-cam-22),Math.round(roadY(g.d)-43-g.jy),44);
  // Keep the wind cue visible in both modes. Reduced motion uses a few faint, slow streaks.
  if (g.wind && onBridge(g.d)) {
    const count=reducedMotion ? 5 : 8;
    const speed=reducedMotion ? 88 : 172;
    w.fillStyle = reducedMotion ? 'rgba(220,240,255,.25)' : 'rgba(220,240,255,.38)';
    for (let i=0;i<count;i++) {
      const x=((i*83-time*speed)%VW+VW)%VW;
      w.fillRect(Math.round(x),72+(i*29)%75,reducedMotion ? 8 : 12,1);
    }
  }
}

function obstacleDisplayDistance(o,distance){
  return o.kind==='gull' ? distance+(o.d-distance)*(o.angry?2.10:1.28) : o.d;
}

function drawSupporters(g,cam){
  for (const group of g.supporters) {
    const {position,station,artKey}=group;
    const x=position-cam;
    if (x < -50 || x > VW+50) continue;
    const bottom=roadY(position)-1;
    w.save();
    w.filter='blur(0.40px)';
    drawProp(artKey,x,bottom,44);
    w.restore();
    const ahead=station-g.d;
    if (ahead >= 0 && ahead <= 150 && x>45 && x<VW-45) {
      g.cheerBubble={x,bottom,quote:group.quote};
    }
  }
}

function drawSupporterBubble(bubble){
  const {x,bottom,quote}=bubble;
  const y=Math.max(70,bottom-65);
  s.save();
  s.font='10px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.textAlign='center';
  s.textBaseline='middle';
  const width=s.measureText(quote).width+16;
  const left=Math.max(7,Math.min(VW-width-7,x-width/2));
  s.strokeStyle='#25364d';
  s.fillStyle='rgba(255,250,240,.96)';
  s.lineWidth=.8;
  s.beginPath();
  s.roundRect(left,y,width,16,5);
  s.fill();
  s.stroke();
  s.beginPath();
  s.moveTo(x-4,y+15.6);
  s.lineTo(x,y+20);
  s.lineTo(x+4,y+15.6);
  s.fill();
  s.stroke();
  s.fillStyle='#263048';
  s.fillText(quote,left+width/2,y+8.3);
  s.restore();
}



function drawPanel(x,y,width,height){
  s.fillStyle = 'rgba(13,27,43,.70)';
  s.beginPath();
  s.roundRect(x,y,width,height,4);
  s.fill();
}

function drawHUD(){
  const g = G; const k = SC;
  s.save(); s.scale(k, k);
  s.font = '12px "NeoDunggeunmo","Malgun Gothic",sans-serif'; s.textBaseline = 'top';
  const box = (x,y,ww,hh) => { s.fillStyle='rgba(13,27,43,.70)'; s.fillRect(x,y,ww,hh); };
  drawPanel(5,5,157,57);
  const km = kmAt(g.d);
  const seconds = clockSec(g.t);
  s.fillStyle = '#cfefff';
  s.fillText(STAGES[stageIndex(g.d)][1],12,11);
  s.fillStyle = '#fff6ee';
  s.fillText(km.toFixed(2)+' / 42.195 km',12,23);
  s.font = '11px "NeoDunggeunmo",monospace';
  s.fillText(elapsed(seconds)+'  ·  '+(g.stam===0 ? '걷기 ' : '현재 ')+paceForSpeed(g.v)+'/km',12,39,144);
  // bars
  const bar = (x,y,label,val,col) => { drawPanel(x,y,97,19); s.fillStyle='#fff6ee'; s.font='10px "NeoDunggeunmo","Malgun Gothic",sans-serif'; s.fillText(label, x+4, y+4);
    s.fillStyle='#304258'; s.fillRect(x+28,y+5,62,8); s.fillStyle=col; s.fillRect(x+28,y+5,62*val/100,8); };
  bar(VW-102, 5, '체력', g.stam, g.stam < 25 ? '#ff6a5a' : '#7ee07e');
  bar(VW-102, 25, g.overheated ? '과열' : '열기', g.heat, g.heat >= HEAT_WARNING ? '#ff3a3a' : '#ffb04a');
  drawPanel(VW-102,45,97,19);
  s.font = '10px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.fillStyle = '#fff6ee';
  s.fillText('라이프',VW-98,50);
  for (let i = 0; i < 3; i++) {
    s.fillStyle = i < g.lives ? '#ff8295' : '#806c72';
    s.fillText('♥',VW-64+i*13,49);
  }
  if (g.cheer >= 0) {
    drawPanel(6,64,134,17);
    s.fillStyle = '#c5ffd2';
    s.fillText('응원단 · 체력 소모 0',12,68);
  }
  if (g.wind && onBridge(g.d)) {
    drawPanel(VW-62,67,57,13);
    s.fillStyle='#bfe3ff';
    s.font='8px "NeoDunggeunmo","Malgun Gothic",sans-serif';
    s.fillText('≋ 맞바람',VW-57,69);
  }
  drawProfile(g.d);
  // Compact notices leave more room to read the course.
  s.textAlign = 'center';
  let noticeY = 65;
  for (const message of g.msgs) {
    const height = message.compact ? 12 : 16;
    s.font = (message.compact ? '9px' : '12px')+' "NeoDunggeunmo","Malgun Gothic",sans-serif';
    s.globalAlpha = Math.min(1,message.life*2);
    const width = Math.min(VW-16,s.measureText(message.t).width+12);
    s.fillStyle = 'rgba(13,27,43,.75)';
    s.fillRect((VW-width)/2,noticeY,width,height);
    s.fillStyle = message.col;
    s.fillText(message.t,VW/2,noticeY+2,width-10);
    noticeY += height+2;
  }
  s.globalAlpha = 1;
  s.textAlign = 'left';
  // controls hint (desktop)
  if (g.t < 6 && !touchDevice.matches){ s.font='10px "NeoDunggeunmo","Malgun Gothic",sans-serif'; box(6,VH-18,VW-12,14); s.fillStyle='#fff6ee';
    s.fillText('↑ / Space 점프    → 길게 누르기 가속    (P / Esc 일시정지)', 10, VH-14); }
  if (g.cheerBubble) drawSupporterBubble(g.cheerBubble);
  s.restore();
}

function drawTitle(){
  s.save();
  s.scale(SC,SC);
  s.fillStyle = '#0b4c9a';
  s.fillRect(0,0,VW,VH);
  const title = art.selection;
  if (title.naturalWidth) {
    const width = VH*title.naturalWidth/title.naturalHeight;
    s.drawImage(title,(VW-width)/2,0,width,VH);
  }
  s.textAlign = 'center';
  s.textBaseline = 'top';
  s.font = '8px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.fillStyle = '#fff6ee';
  s.shadowColor = '#153763';
  s.shadowBlur = 3;
  s.fillText('with. 에고런',192,48);
  s.shadowBlur = 0;
  for (const [char,cx] of [['female',135.5],['male',247.5]]) {
    const selected = menuChar === char;
    if (selected) {
      s.beginPath();
      s.roundRect(cx-42,59,84,101,11);
      s.strokeStyle = '#ffe27d';
      s.lineWidth = 2.2;
      s.stroke();
    }
    const frame = selected ? 1+Math.floor(performance.now()/100)%5 : 0;
    drawRunner(s,imgs[char].run,frame,cx-41,62,82);
  }
  s.fillStyle='rgba(13,27,43,.76)';
  s.beginPath();
  s.roundRect(263,199,78,13,4);
  s.fill();
  s.font='7px "NeoDunggeunmo",monospace';
  s.fillStyle='#fff6ee';
  s.textAlign='right';
  s.fillText('made by. @mixed52',336,201);
  s.restore();
}

function finishStamp(seconds){
  const finishTime=Math.round(seconds);
  if(finishTime<=10799) return ['SUB 3',3];
  if(finishTime<=11399) return ['Single',2];
  if(finishTime<=14399) return ['SUB4',1];
  return ['완주!',0];
}

function drawFinishStamp(seconds){
  const [label,stars]=finishStamp(seconds);
  const ink='#a91e36',paper='#fff3df';
  s.save();
  s.translate(265,104);
  s.rotate(-Math.PI/21);
  const r=(x,y,w,h,color)=>{s.fillStyle=color;s.fillRect(x,y,w,h);};
  const disc=(radius,color)=>{
    for(let y=-radius;y<radius;y+=2){
      const half=Math.floor(Math.sqrt(radius*radius-(y+1)*(y+1))/2)*2;
      r(-half,y,half*2,2,color);
    }
  };
  disc(23,ink);
  disc(20,paper);
  disc(18,ink);
  disc(17,paper);
  r(-12,-8,24,1,ink);
  r(-12,7,24,1,ink);
  const count=Math.max(1,stars);
  for(let i=0;i<count;i++){
    const x=(i-(count-1)/2)*6;
    r(x-1,-15,2,5,ink);r(x-2,-14,4,2,ink);
  }
  for(const offset of [-7,0,7]) r(offset-1,11,2,2,ink);
  r(15,-17,3,1,paper);r(-20,8,2,1,paper);
  s.font='12px "NeoDunggeunmo","Malgun Gothic",monospace';
  s.fillStyle=ink;
  s.textAlign='center';
  s.textBaseline='middle';
  s.fillText(label,0,0,37);
  s.restore();
}



function drawEnd(){
  const g = G, distance = kmAt(g.d), ending = art.ending;
  s.save();
  s.scale(SC,SC);
  s.fillStyle = '#193570';
  s.fillRect(0,0,VW,VH);
  if (ending.naturalWidth) s.drawImage(ending,0,0,VW,VH);
  if (!g.completed) {
    s.textAlign='center';
    s.textBaseline='middle';
    s.fillStyle='#fff6ee';
    s.font='12px "NeoDunggeunmo",sans-serif';
    s.fillText('레이스 종료',192,72);
    s.fillStyle='#172e52';
    s.font='9px "NeoDunggeunmo",sans-serif';
    s.fillText(g.name+' · '+distance.toFixed(2)+' km',192,88,148);
    s.save();
    s.translate(192,109);
    s.rotate(-.102);
    s.strokeStyle='#a8162c';
    s.lineWidth=2.4;
    s.strokeRect(-41,-13,82,26);
    s.lineWidth=.7;
    s.strokeRect(-38,-10,76,20);
    s.font='23px "NeoDunggeunmo",monospace';
    s.fillStyle='#a8162c';
    s.fillText('DNF',0,1);
    for (const [x,y,w] of [[-38,-13,7],[28,13,6],[-30,12,5],[32,-13,4],[-39,1,2],[39,-7,2]]) {
      s.fillStyle='#fff2e8';
      s.fillRect(x,y,w,.65);
    }
    s.restore();
    s.fillStyle='#1c3256';
    s.font='9px "NeoDunggeunmo",sans-serif';
    s.fillText('경과 '+elapsed(g.final)+'  ·  라이프 0',192,137);
    s.font='8px "NeoDunggeunmo",sans-serif';
    s.fillText('클릭 또는 Enter로 다시 시작',192,151);
    s.restore();
    return;
  }

  const runner = art['finish-'+g.char];
  if (runner.naturalWidth) {
    const height = 122, width = height*runner.naturalWidth/runner.naturalHeight;
    s.save();
    s.shadowColor = 'rgba(10,24,47,.56)';
    s.shadowBlur = 3*SC;
    s.shadowOffsetY = 1.5*SC;
    s.drawImage(runner,(g.char==='female' ? 96 : 58)-width/2,190-height,width,height);
    s.restore();
  }
  s.textAlign = 'center';
  s.textBaseline = 'top';
  s.font = '11px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.fillStyle = '#fff';
  s.fillText('풀코스 완주',192,67);
  s.fillStyle = '#142950';
  s.font = '9px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.fillText([g.crew,g.name,'42.195 km'].filter(Boolean).join('  ·  '),192,87,149);
  s.font = '650 25px "NeoDunggeunmo",monospace';
  s.fillText(elapsed(g.final),192,99,153);
  s.font = '9px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.fillText('평균 페이스  '+pace(g.final,distance)+'/km',192,126);
  drawFinishStamp(g.final);
  s.fillStyle='rgba(16,35,65,.88)';
  s.fillRect(147,170,90,12);
  s.fillStyle='#fff6ee';
  s.font='8px "NeoDunggeunmo",sans-serif';
  s.fillText('클릭 또는 Enter로 다시 시작',192,172,84);
  s.restore();
}

function drawPause(){
  s.save();
  s.scale(SC,SC);
  s.fillStyle = 'rgba(10,20,42,.72)';
  s.fillRect(0,0,VW,VH);
  s.textAlign = 'center';
  s.textBaseline = 'middle';
  s.fillStyle = '#fff6ee';
  s.font = '24px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.fillText('일시정지',VW/2,97);
  s.font = '11px "NeoDunggeunmo","Malgun Gothic",sans-serif';
  s.fillText('P / Esc 또는 계속하기 버튼',VW/2,125);
  s.restore();
}

const PLAYBACK_PACE = 1.166;
let last = performance.now();
function loop(now){
  const dt = Math.max(0,Math.min(.05,(now-last)/1000));
  last = now;
  if (scene === 'title') drawTitle();
  else if (scene === 'end') drawEnd();
  else if (scene === 'ready') {
    drawTitle();
    progressLaunch(dt);
  } else {
    checkRaceOrientation();
    if (!paused) update(Math.min(.05,dt*PLAYBACK_PACE));
    if (scene === 'end') drawEnd();
    else {
      draw();
      s.drawImage(world,0,0,screen.width,screen.height);
      drawHUD();
      if (paused) drawPause();
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);












