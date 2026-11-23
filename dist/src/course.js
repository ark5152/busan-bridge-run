// 2026 풀코스. 공식 코스 순서와 공개 고저도 추정치를 게임용 표본으로 단순화.
const KM = 42.195;
const LEN = 16000;
const worldAt = km => km / KM * LEN;
const kmAt = d => d / LEN * KM;
const TURN = worldAt(23.1);
const WATER = [5, 10, 15, 20, 25, 30, 35, 40].map(worldAt);
const PROFILE = [
  [0, 7], [4.5, 8], [5.5, 27], [7.4, 50], [7.8, 50], [10, 5],
  [12.9, 5], [14.1, 30], [14.5, 31], [15.7, 79], [17.5, 30],
  [18.5, 28], [19.1, 18], [20.1, 32], [21.2, 5], [23.1, 6],
  [25.2, 5], [26.4, 36], [27.2, 22], [28.8, 28], [30.5, 79],
  [31.7, 44], [33.3, 5], [36.6, 6], [39.1, 48], [41.9, 7], [KM, 7],
];

const STAGES = [
  [0, '벡스코 출발', 'bexco', false],
  [4.5, '광안대교', 'gwangan', true],
  [10, '용당 · 대연고가', 'park', false],
  [12.9, '부산항대교', 'port', true],
  [18.5, '남항대교', 'namhang', true],
  [21.2, '충무동사거리', 'chungmu', false],
  [25.2, '남항대교 귀환', 'namhang', true],
  [28.8, '부산항대교 귀환', 'port-return', true],
  [33.3, '용당 · 대연고가', 'park', false],
  [36.6, '광안대교 귀환', 'gwangan-return', true],
  [41.9, '벡스코 결승', 'finish', false],
];

function stageIndex(d){
  const km = kmAt(d);
  for (let i = STAGES.length - 1; i > 0; i--) {
    if (km >= STAGES[i][0]) return i;
  }
  return 0;
}

function rawElevation(km){
  for (let i = 1; i < PROFILE.length; i++) {
    const [right, high] = PROFILE[i];
    if (km <= right) {
      const [left, low] = PROFILE[i - 1];
      return low + (high - low) * Math.max(0, (km - left) / (right - left));
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

// Average across each grade break to round the road without flattening long climbs.
function elevation(km){
  return (rawElevation(km - .10) + 2 * rawElevation(km - .05) +
          3 * rawElevation(km) + 2 * rawElevation(km + .05) +
          rawElevation(km + .10)) / 9;
}

const roadY = d => 177 - (elevation(kmAt(d)) - 5) * 1.02;
const gradeAt = d => (elevation(kmAt(d) + .06) - elevation(kmAt(d) - .06)) / 1.2;
const onBridge = d => STAGES[stageIndex(d)][3];

