const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const DAY_MS = 86400000;
const J2000_DAY = 2451543.5;
const GATE_WHEEL_START = 302;
const GATE_ORDER = [
  41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,
  27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,
  31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,
  28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60,
];

const ELEMENTS = Object.freeze({
  Mercury: d => ({ N:48.3313+3.24587e-5*d, i:7.0047+5e-8*d, w:29.1241+1.01444e-5*d, a:.387098, e:.205635+5.59e-10*d, M:168.6562+4.0923344368*d }),
  Venus: d => ({ N:76.6799+2.46590e-5*d, i:3.3946+2.75e-8*d, w:54.8910+1.38374e-5*d, a:.72333, e:.006773-1.302e-9*d, M:48.0052+1.6021302244*d }),
  Mars: d => ({ N:49.5574+2.11081e-5*d, i:1.8497-1.78e-8*d, w:286.5016+2.92961e-5*d, a:1.523688, e:.093405+2.516e-9*d, M:18.6021+.5240207766*d }),
  Jupiter: d => ({ N:100.4542+2.76854e-5*d, i:1.3030-1.557e-7*d, w:273.8777+1.64505e-5*d, a:5.20256, e:.048498+4.469e-9*d, M:19.8950+.0830853001*d }),
  Saturn: d => ({ N:113.6634+2.38980e-5*d, i:2.4886-1.081e-7*d, w:339.3939+2.97661e-5*d, a:9.55475, e:.055546-9.499e-9*d, M:316.9670+.0334442282*d }),
  Uranus: d => ({ N:74.0005+1.3978e-5*d, i:.7733+1.9e-8*d, w:96.6612+3.0565e-5*d, a:19.18171-1.55e-8*d, e:.047318+7.45e-9*d, M:142.5905+.011725806*d }),
  Neptune: d => ({ N:131.7806+3.0173e-5*d, i:1.7700-2.55e-7*d, w:272.8461-6.027e-6*d, a:30.05826+3.313e-8*d, e:.008606+2.15e-9*d, M:260.2471+.005995147*d }),
});

export function normalizeLongitude(value) {
  return ((Number(value) % 360) + 360) % 360;
}

function daysSinceEpoch(date) {
  return date.getTime() / DAY_MS + 2440587.5 - J2000_DAY;
}

function eccentricAnomaly(meanDeg, eccentricity) {
  const m = normalizeLongitude(meanDeg) * DEG;
  let e = m + eccentricity * Math.sin(m) * (1 + eccentricity * Math.cos(m));
  for (let i = 0; i < 12; i += 1) {
    const next = e - (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e));
    if (Math.abs(next - e) < 1e-10) return next;
    e = next;
  }
  return e;
}

function orbitalPosition(elements) {
  const N = elements.N * DEG;
  const i = elements.i * DEG;
  const w = elements.w * DEG;
  const E = eccentricAnomaly(elements.M, elements.e);
  const xv = elements.a * (Math.cos(E) - elements.e);
  const yv = elements.a * Math.sqrt(1 - elements.e * elements.e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  return {
    x: r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)),
    y: r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)),
    z: r * Math.sin(v + w) * Math.sin(i),
    r,
    v,
  };
}

function sunPosition(d) {
  const w = (282.9404 + 4.70935e-5 * d) * DEG;
  const e = .016709 - 1.151e-9 * d;
  const M = 356.0470 + .9856002585 * d;
  const E = eccentricAnomaly(M, e);
  const xv = Math.cos(E) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const lon = v + w;
  return { x: r * Math.cos(lon), y: r * Math.sin(lon), z: 0, lon: normalizeLongitude(lon * RAD), r, M };
}

function moonPosition(d) {
  const N = 125.1228 - .0529538083 * d;
  const i = 5.1454;
  const w = 318.0634 + .1643573223 * d;
  const a = 60.2666;
  const e = .0549;
  const M = 115.3654 + 13.0649929509 * d;
  const pos = orbitalPosition({ N, i, w, a, e, M });
  let lon = Math.atan2(pos.y, pos.x) * RAD;
  let lat = Math.atan2(pos.z, Math.hypot(pos.x, pos.y)) * RAD;

  const sun = sunPosition(d);
  const Ls = normalizeLongitude(sun.M + 282.9404 + 4.70935e-5*d);
  const Lm = normalizeLongitude(M + w + N);
  const D = normalizeLongitude(Lm - Ls);
  const F = normalizeLongitude(Lm - N);
  lon += -1.274 * Math.sin((M - 2*D)*DEG)
    + .658 * Math.sin(2*D*DEG)
    - .186 * Math.sin(sun.M*DEG)
    - .059 * Math.sin((2*M - 2*D)*DEG)
    - .057 * Math.sin((M - 2*D + sun.M)*DEG)
    + .053 * Math.sin((M + 2*D)*DEG)
    + .046 * Math.sin((2*D - sun.M)*DEG)
    + .041 * Math.sin((M - sun.M)*DEG)
    - .035 * Math.sin(D*DEG)
    - .031 * Math.sin((M + sun.M)*DEG)
    - .015 * Math.sin((2*F - 2*D)*DEG)
    + .011 * Math.sin((M - 4*D)*DEG);
  lat += -.173 * Math.sin((F - 2*D)*DEG)
    - .055 * Math.sin((M - F - 2*D)*DEG)
    - .046 * Math.sin((M + F - 2*D)*DEG)
    + .033 * Math.sin((F + 2*D)*DEG)
    + .017 * Math.sin((2*M + F)*DEG);
  return { longitude: normalizeLongitude(lon), latitude: lat, node: normalizeLongitude(N) };
}

function plutoLongitude(d) {
  const S = 50.03 + .033459652*d;
  const P = 238.95 + .003968789*d;
  const lon = 238.9508 + .00400703*d
    - 19.799*Math.sin(P*DEG) + 19.848*Math.cos(P*DEG)
    + .897*Math.sin(2*P*DEG) - 4.956*Math.cos(2*P*DEG)
    + .610*Math.sin(3*P*DEG) + 1.211*Math.cos(3*P*DEG)
    - .341*Math.sin(4*P*DEG) - .190*Math.cos(4*P*DEG)
    + .128*Math.sin(5*P*DEG) - .034*Math.cos(5*P*DEG)
    - .038*Math.sin(6*P*DEG) + .031*Math.cos(6*P*DEG)
    + .020*Math.sin(S-P*DEG) - .010*Math.cos(S-P*DEG);
  return normalizeLongitude(lon);
}

export function eclipticLongitude(body, timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid timestamp');
  const d = daysSinceEpoch(date);
  const sun = sunPosition(d);
  if (body === 'Sun') return sun.lon;
  if (body === 'Earth') return normalizeLongitude(sun.lon + 180);
  if (body === 'Moon') return moonPosition(d).longitude;
  if (body === 'North Node') return moonPosition(d).node;
  if (body === 'South Node') return normalizeLongitude(moonPosition(d).node + 180);
  if (body === 'Pluto') return plutoLongitude(d);
  const factory = ELEMENTS[body];
  if (!factory) throw new Error(`Unknown body: ${body}`);
  const helio = orbitalPosition(factory(d));
  return normalizeLongitude(Math.atan2(helio.y + sun.y, helio.x + sun.x) * RAD);
}

export function humanDesignResolution(longitude) {
  const angle = normalizeLongitude(longitude - GATE_WHEEL_START);
  const gateIndex = Math.floor(angle / 5.625);
  let remainder = angle % 5.625;
  const line = Math.floor(remainder / .9375) + 1;
  remainder %= .9375;
  const color = Math.floor(remainder / .15625) + 1;
  remainder %= .15625;
  const tone = Math.floor(remainder / (.15625 / 6)) + 1;
  remainder %= .15625 / 6;
  const base = Math.min(5, Math.floor(remainder / (.15625 / 6 / 5)) + 1);
  return { gate: GATE_ORDER[gateIndex], line, color, tone, base };
}

export function faganBradleyAyanamsa(date) {
  const timestamp = date instanceof Date ? date : new Date(date);
  const tropicalYears = (timestamp.getTime() - Date.UTC(2000,0,1,12)) / (365.2425 * DAY_MS);
  return normalizeLongitude(24.7366667 + (50.290966 / 3600) * tropicalYears);
}

function signedAngleDelta(a, b) {
  return ((a - b + 540) % 360) - 180;
}

export function findDesignTimestamp(timestamp) {
  const birth = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const target = normalizeLongitude(eclipticLongitude('Sun', birth) - 88);
  let lo = new Date(birth.getTime() - 100 * DAY_MS);
  let hi = new Date(birth.getTime() - 70 * DAY_MS);
  let best = lo;
  for (let i = 0; i < 50; i += 1) {
    const mid = new Date((lo.getTime() + hi.getTime()) / 2);
    best = mid;
    const delta = signedAngleDelta(eclipticLongitude('Sun', mid), target);
    if (Math.abs(delta) < 1e-7) break;
    const future = new Date(mid.getTime() + 3600000);
    const movingPositive = signedAngleDelta(eclipticLongitude('Sun', future), eclipticLongitude('Sun', mid)) > 0;
    if ((delta < 0) === movingPositive) lo = mid;
    else hi = mid;
  }
  return best;
}

function julianDate(date) {
  return date.getTime() / DAY_MS + 2440587.5;
}

function equalHouseAscendant(date, location = {}) {
  const longitude = Number(location.longitude ?? location.lon ?? 0);
  const latitude = Math.max(-89.9, Math.min(89.9, Number(location.latitude ?? location.lat ?? 0)));
  const jd = julianDate(date);
  const T = (jd - 2451545.0) / 36525;
  const gmst = normalizeLongitude(280.46061837 + 360.98564736629*(jd-2451545) + .000387933*T*T - T*T*T/38710000);
  const theta = normalizeLongitude(gmst + longitude) * DEG;
  const eps = (23.439291 - .0130042*T) * DEG;
  const phi = latitude * DEG;
  const lambda = Math.atan2(-Math.cos(theta), Math.sin(theta)*Math.cos(eps) + Math.tan(phi)*Math.sin(eps));
  return normalizeLongitude(lambda * RAD);
}

function zodiacBreakdown(longitude) {
  const normalized = normalizeLongitude(longitude);
  const zodiac = Math.floor(normalized / 30) + 1;
  const within = normalized % 30;
  const degree = Math.floor(within);
  const minuteFloat = (within - degree) * 60;
  const minute = Math.floor(minuteFloat);
  const second = Math.floor((minuteFloat - minute) * 60);
  return { zodiac, degree, minute, second };
}

function placement(planetary, orientation, frame, tropical, date, location, node) {
  const longitude = frame === 'tropical'
    ? tropical
    : frame === 'sidereal_fagan_bradley'
      ? normalizeLongitude(tropical - faganBradleyAyanamsa(date))
      : normalizeLongitude(tropical - node);
  const ascendant = equalHouseAscendant(date, location);
  const house = Math.floor(normalizeLongitude(longitude - ascendant) / 30) + 1;
  return {
    planetary,
    dimension: 'being',
    frame,
    orientation,
    longitude,
    ...zodiacBreakdown(longitude),
    house,
    ascendingSide: house,
    ...humanDesignResolution(longitude),
  };
}

export function calculateGeonatalChart(timestamp, location = {}) {
  const birth = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(birth.getTime())) throw new Error('Invalid timestamp');
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('location requires numeric latitude and longitude');
  const designTimestamp = findDesignTimestamp(birth);
  const placements = [];
  const bodies = ['Sun','Earth','North Node','South Node','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
  for (const orientation of ['personality','design']) {
    const date = orientation === 'personality' ? birth : designTimestamp;
    const node = eclipticLongitude('North Node', date);
    for (const planetary of bodies) {
      const tropical = eclipticLongitude(planetary, date);
      for (const frame of ['tropical','sidereal_fagan_bradley','draconic_tropical_true']) {
        placements.push(placement(planetary, orientation, frame, tropical, date, location, node));
      }
    }
  }
  const perspectives = Object.fromEntries(['being','movement','evolution','design','space']
    .map(dimension => [dimension, placements.map(item => ({ ...item, dimension }))]));
  return {
    timestamp: birth.toISOString(),
    designTimestamp: designTimestamp.toISOString(),
    location: { ...location, latitude, longitude },
    houseMethod: 'equal',
    trueNodeLongitude: eclipticLongitude('North Node', birth),
    faganBradleyAyanamsa: faganBradleyAyanamsa(birth),
    placements,
    perspectives,
    methods: {
      ephemeris: 'dependency-free low-precision orbital elements with lunar perturbations',
      sidereal: 'Fagan-Bradley J2000 offset with general-precession rate',
      draconic: 'tropical longitude minus approximate ascending lunar node',
      design: 'timestamp at 88 degrees of prior solar longitude',
      houses: 'equal houses from local sidereal-time ascendant',
    },
  };
}

export default calculateGeonatalChart;
