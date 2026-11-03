/**
 * PULSE — JACK RUSSELL MOTION ENGINE (dogs.js)
 * Version 3.2 | Authentic RunCat "Terrier" Silhouette + Classic Jack Russell Tan Markings (#D98B48)
 *
 * Target ViewBox: 0 0 120 80 (Ground at y = 74, Dog within x = 8..112)
 * CSP Compliant: No inline style attributes, no <style> elements inside SVG,
 * no SMIL, no eval, no innerHTML with user input.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
export const GAIT_CONFIG = {
  stand:  { period: 1.60, dutyF: 1.00, dutyH: 1.00, label: 'Natural Stand',  hrRange: '~56%' },
  walk:   { period: 1.20, dutyF: 0.64, dutyH: 0.64, label: '4-Beat Walk',    hrRange: '57–63%' },
  bike:   { period: 0.70, dutyF: 0.44, dutyH: 0.44, label: '2-Beat Trot',    hrRange: '64–76%' },
  run:    { period: 0.45, dutyF: 0.34, dutyH: 0.35, label: '3-Beat Canter',  hrRange: '77–95%' },
  sprint: { period: 0.32, dutyF: 0.24, dutyH: 0.24, label: 'RunCat Terrier Gallop', hrRange: '96%+' }
};
export const ANATOMY = {
  groundY: 74.0,
  foreUpperLen: 7.4,
  foreLowerLen: 6.8,
  forePawLen: 2.8,
  hindUpperLen: 8.2,
  hindLowerLen: 7.2,
  hindPawLen: 3.0
};
const instanceMap = new WeakMap();
let reducedMotionQuery = null;
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function wrapPhase(p) {
  return ((p % 1) + 1) % 1;
}
function fmt(n) {
  return Number(n).toFixed(2);
}
function solveTwoBoneIK(rootX, rootY, targetX, targetY, L1, L2, bendSign) {
  let dx = targetX - rootX;
  let dy = targetY - rootY;
  let dist = Math.hypot(dx, dy);
  const maxReach = (L1 + L2) * 0.996;
  const minReach = Math.abs(L1 - L2) + 0.8;
  if (dist > maxReach) {
    const scale = maxReach / dist;
    dx *= scale;
    dy *= scale;
    targetX = rootX + dx;
    targetY = rootY + dy;
    dist = maxReach;
  } else if (dist < minReach) {
    const scale = minReach / (dist || 0.001);
    dx *= scale;
    dy *= scale;
    targetX = rootX + dx;
    targetY = rootY + dy;
    dist = minReach;
  }
  const baseAngle = Math.atan2(dy, dx);
  const cosAngle1 = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const angle1 = baseAngle + bendSign * Math.acos(cosAngle1);
  const midX = rootX + L1 * Math.cos(angle1);
  const midY = rootY + L1 * Math.sin(angle1);
  return {
    root: { x: rootX, y: rootY },
    mid:  { x: midX,  y: midY },
    end:  { x: targetX, y: targetY }
  };
}
function buildClosedSmoothPath(points, tension = 0.21) {
  const n = points.length;
  if (n < 3) return '';
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = Math.min(ANATOMY.groundY, p1.y + (p2.y - p0.y) * tension);
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = Math.min(ANATOMY.groundY, p2.y - (p3.y - p1.y) * tension);
    d += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d + ' Z';
}
function computeFootTarget(localPhase, cfg) {
  const {
    duty,
    homeX,
    strideFront,
    strideBack,
    liftHeight,
    groundY,
    isFore
  } = cfg;
  const p = wrapPhase(localPhase);
  let pawX, pawY, wristX, wristY, isStance, stanceProgress, swingProgress;
  if (p < duty) {
    isStance = true;
    stanceProgress = p / duty;
    swingProgress = 0;
    pawX = lerp(homeX + strideFront, homeX - strideBack, stanceProgress);
    pawY = groundY;
    const loadFlex = Math.sin(stanceProgress * Math.PI);
    if (isFore) {
      const pasternDx = lerp(1.0, -1.1, stanceProgress);
      const pasternDy = lerp(2.0, 1.8, loadFlex * 0.5);
      wristX = pawX - pasternDx;
      wristY = pawY - pasternDy;
    } else {
      const hockDx = lerp(-1.2, -2.6, stanceProgress);
      const hockHeight = lerp(4.6, 5.2, stanceProgress) - loadFlex * 0.5;
      wristX = pawX + hockDx;
      wristY = pawY - hockHeight;
    }
  } else {
    isStance = false;
    stanceProgress = 1;
    swingProgress = (p - duty) / (1 - duty);
    const s = swingProgress;
    const forwardEase = s - 0.10 * Math.sin(s * TAU);
    pawX = lerp(homeX - strideBack, homeX + strideFront, forwardEase);
    const sinS = Math.sin(s * Math.PI);
    const broadArch = Math.pow(sinS, 0.56);
    pawY = groundY - liftHeight * broadArch;
    pawY = Math.min(pawY, groundY);
    if (isFore) {
      const baseDx = lerp(-1.1, 1.0, s);
      const baseDy = lerp(1.8, 2.0, s);
      const wristFoldDx = -1.2 * sinS;
      const wristFoldDy = 1.0 * sinS;
      wristX = pawX - (baseDx + wristFoldDx);
      wristY = pawY - baseDy - wristFoldDy;
    } else {
      const baseHockDx = lerp(-2.6, -1.2, s);
      const baseHockDy = lerp(5.2, 4.6, s);
      const hockFoldDx = -1.0 * sinS;
      const hockFoldDy = 0.7 * sinS;
      wristX = pawX + baseHockDx + hockFoldDx;
      wristY = pawY - baseHockDy + hockFoldDy;
    }
  }
  return {
    paw: { x: pawX, y: clamp(pawY, 24, groundY) },
    distal: { x: wristX, y: clamp(wristY, 22, groundY - 1.4) },
    isStance,
    stanceProgress,
    swingProgress
  };
}
function computeRunCatSprintLimb(t, isFore, isFar, anchorX, groundY) {
  const pairOffset = isFar ? -0.042 : 0.022;
  const p = wrapPhase(t + pairOffset);
  const extAngle = (p - 0.42) * TAU;
  const rawCos = Math.cos(extAngle);
  const swingWave = Math.sign(rawCos) * Math.pow(Math.abs(rawCos), 0.76);
  if (isFore) {
    const pawX = anchorX + 1.0 + 16.5 * swingWave + (isFar ? 1.8 : -0.8);
    const stanceBell = Math.exp(-Math.pow(wrapPhase(p - 0.64 + 0.5) - 0.5, 2) / 0.014);
    const airborneY = lerp(68.5, 57.5, (swingWave + 1) * 0.5) - 2.0 * Math.pow(Math.sin(extAngle), 2);
    const pawY = clamp(lerp(airborneY, groundY, stanceBell), 46, groundY);
    const wristDx = lerp(-2.2, 2.2, (swingWave + 1) * 0.5);
    const wristDy = lerp(1.6, 2.1, stanceBell);
    return {
      paw: { x: pawX, y: pawY },
      distal: { x: pawX - wristDx, y: clamp(pawY - wristDy, 42, groundY - 1.5) },
      isStance: stanceBell > 0.6
    };
  } else {
    const pawX = anchorX - 0.5 - 17.2 * swingWave + (isFar ? 1.8 : -0.8);
    const stanceBell = Math.exp(-Math.pow(wrapPhase(p - 0.16 + 0.5) - 0.5, 2) / 0.014);
    const airborneY = lerp(68.0, 56.0, (swingWave + 1) * 0.5) - 2.0 * Math.pow(Math.sin(extAngle), 2);
    const pawY = clamp(lerp(airborneY, groundY, stanceBell), 46, groundY);
    const hockDx = lerp(2.2, -1.6, (swingWave + 1) * 0.5);
    const hockDy = lerp(2.8, 3.4, (swingWave + 1) * 0.5);
    return {
      paw: { x: pawX, y: pawY },
      distal: { x: pawX + hockDx, y: clamp(pawY - hockDy, 42, groundY - 1.5) },
      isStance: stanceBell > 0.6
    };
  }
}
export function computeKinematics(gaitKey, rawPhase) {
  const t = wrapPhase(rawPhase);
  const angle = t * TAU;
  const groundY = ANATOMY.groundY;
  let bodyX = 56.0;
  let bodyY = 53.0;
  let spineFlex = 0.0;
  let bodyPitch = 0.0;
  let breathExp = 0.0;
  let headNod = 0.0;
  let headPitch = 0.0;
  let earBounce = 0.0;
  let tailWag = 0.0;
  let mouthOpen = 0.0;
  let phases = { LF: 0, RF: 0, LH: 0, RH: 0 };
  let dutyF = 1.0, dutyH = 1.0;
  let strideF = { front: 0, back: 0, lift: 0 };
  let strideH = { front: 0, back: 0, lift: 0 };
  if (gaitKey === 'stand') {
    breathExp = 0.55 * Math.sin(angle);
    bodyY = 53.0 - 0.25 * Math.sin(angle);
    spineFlex = 0.03 * Math.sin(angle);
    bodyPitch = -0.015 * Math.cos(angle);
    headNod = -0.30 * Math.sin(angle - 0.4);
    headPitch = 0.02 * Math.sin(angle - 0.5);
    earBounce = 0.06 * Math.sin(angle - 0.8);
    tailWag = 0.18 * Math.sin(angle * 2);
    mouthOpen = 0.35;
  } else if (gaitKey === 'walk') {
    dutyF = 0.64;
    dutyH = 0.64;
    phases = {
      LH: t,
      LF: t - 0.25,
      RH: t - 0.50,
      RF: t - 0.75
    };
    strideF = { front: 5.2, back: 5.0, lift: 3.4 };
    strideH = { front: 5.4, back: 5.2, lift: 3.2 };
    bodyY = 52.8 + 0.65 * Math.cos(angle * 2 - 0.4);
    bodyPitch = 0.024 * Math.sin(angle * 2);
    spineFlex = 0.08 * Math.sin(angle * 2);
    headNod = 0.95 * Math.sin(angle * 2 - 0.9);
    headPitch = 0.04 * Math.sin(angle * 2 - 0.7);
    earBounce = 0.18 * Math.sin(angle * 2 - 1.3);
    tailWag = 0.22 * Math.cos(angle * 2 - 0.6);
    mouthOpen = 0.48;
  } else if (gaitKey === 'bike') {
    dutyF = 0.44;
    dutyH = 0.44;
    phases = {
      RF: t,
      LH: t - 0.02,
      LF: t - 0.50,
      RH: t - 0.52
    };
    strideF = { front: 8.2, back: 7.8, lift: 5.2 };
    strideH = { front: 8.4, back: 8.2, lift: 5.0 };
    const bounce2 = Math.sin(angle * 2 - 0.65);
    bodyY = 52.0 + 1.55 * bounce2;
    bodyPitch = 0.032 * Math.cos(angle * 2);
    spineFlex = 0.14 * bounce2;
    headNod = 1.15 * Math.sin(angle * 2 - 1.2);
    headPitch = 0.05 * Math.sin(angle * 2 - 1.1);
    earBounce = 0.35 * Math.sin(angle * 2 - 1.6);
    tailWag = 0.26 * Math.sin(angle * 2 - 1.4);
    mouthOpen = 0.75;
  } else if (gaitKey === 'run') {
    dutyF = 0.34;
    dutyH = 0.35;
    phases = {
      LH: t - 0.00,
      RH: t - 0.12,
      LF: t - 0.18,
      RF: t - 0.36
    };
    strideF = { front: 11.8, back: 11.2, lift: 7.8 };
    strideH = { front: 12.0, back: 11.8, lift: 7.5 };
    bodyX = 56.0 + 1.4 * Math.sin(angle - 0.4);
    bodyY = 51.2 + 2.0 * Math.sin(angle - 0.9);
    bodyPitch = 0.115 * Math.sin(angle - 0.15);
    spineFlex = -0.52 * Math.cos(angle - 0.35);
    headNod = 1.45 * Math.sin(angle - 1.2);
    headPitch = -0.08 * Math.sin(angle - 0.5);
    earBounce = 0.52 * Math.sin(angle - 1.7);
    tailWag = 0.32 * Math.sin(angle - 1.5);
    mouthOpen = 0.95;
  } else if (gaitKey === 'sprint') {
    const rawCos = Math.cos((t - 0.92) * TAU);
    spineFlex = rawCos > 0 ? Math.pow(rawCos, 0.82) * 1.15 : -Math.pow(-rawCos, 0.82) * 1.20;
    bodyPitch = -0.14 * Math.cos((t - 0.36) * TAU);
    bodyY = 50.2 - 1.8 * Math.cos((t - 0.42) * TAU) - 0.9 * Math.cos((t - 0.42) * 2 * TAU);
    bodyX = 56.0 + 2.2 * Math.sin((t - 0.18) * TAU);
    headNod = 1.5 * Math.sin((t - 0.58) * TAU);
    headPitch = -0.09 * spineFlex + 0.05;
    earBounce = 0.85 + 0.45 * Math.sin((t - 0.22) * TAU);
    tailWag = -0.35 * spineFlex;
    mouthOpen = 1.30;
  }
  const halfTorso = gaitKey === 'sprint'
    ? 12.6 - 3.4 * Math.max(0, spineFlex) + 3.8 * Math.max(0, -spineFlex)
    : 12.2 - 1.9 * Math.max(0, spineFlex) + 1.7 * Math.max(0, -spineFlex);
  const cosP = Math.cos(bodyPitch);
  const sinP = Math.sin(bodyPitch);
  const chestX = bodyX + halfTorso * cosP;
  const chestY = bodyY + halfTorso * sinP;
  const pelvisX = bodyX - halfTorso * cosP;
  const pelvisY = bodyY - halfTorso * sinP;
  const lumbarX = (chestX + pelvisX) * 0.5 - 0.4;
  const lumbarY = (chestY + pelvisY) * 0.5 - (gaitKey === 'sprint' ? 0.4 : 0.8) - (gaitKey === 'sprint' ? 3.5 : 2.8) * spineFlex;
  const foreStandHomeX = chestX - 0.4;
  const hindStandHomeX = pelvisX - 0.4;
  let footLF, footRF, footLH, footRH;
  if (gaitKey === 'stand') {
    footRF = {
      paw: { x: foreStandHomeX + 1.1, y: groundY },
      distal: { x: foreStandHomeX + 0.1, y: groundY - 2.0 },
      isStance: true
    };
    footLF = {
      paw: { x: foreStandHomeX - 1.8, y: groundY },
      distal: { x: foreStandHomeX - 2.8, y: groundY - 2.0 },
      isStance: true
    };
    footRH = {
      paw: { x: hindStandHomeX - 1.4, y: groundY },
      distal: { x: hindStandHomeX - 3.2, y: groundY - 4.8 },
      isStance: true
    };
    footLH = {
      paw: { x: hindStandHomeX + 1.6, y: groundY },
      distal: { x: hindStandHomeX - 0.2, y: groundY - 4.8 },
      isStance: true
    };
  } else if (gaitKey === 'sprint') {
    footRF = computeRunCatSprintLimb(t, true,  false, chestX, groundY);
    footLF = computeRunCatSprintLimb(t, true,  true,  chestX, groundY);
    footRH = computeRunCatSprintLimb(t, false, false, pelvisX, groundY);
    footLH = computeRunCatSprintLimb(t, false, true,  pelvisX, groundY);
  } else {
    footRF = computeFootTarget(phases.RF, {
      duty: dutyF, homeX: foreStandHomeX + 0.8,
      strideFront: strideF.front, strideBack: strideF.back, liftHeight: strideF.lift,
      groundY, isFore: true, gaitKey
    });
    footLF = computeFootTarget(phases.LF, {
      duty: dutyF, homeX: foreStandHomeX - 0.5,
      strideFront: strideF.front, strideBack: strideF.back, liftHeight: strideF.lift,
      groundY, isFore: true, gaitKey
    });
    footRH = computeFootTarget(phases.RH, {
      duty: dutyH, homeX: hindStandHomeX - 1.0,
      strideFront: strideH.front, strideBack: strideH.back, liftHeight: strideH.lift,
      groundY, isFore: false, gaitKey
    });
    footLH = computeFootTarget(phases.LH, {
      duty: dutyH, homeX: hindStandHomeX + 0.3,
      strideFront: strideH.front, strideBack: strideH.back, liftHeight: strideH.lift,
      groundY, isFore: false, gaitKey
    });
  }
  const maxScapShift = gaitKey === 'sprint' ? 4.2 : 2.2;
  const scapShiftRF = clamp((footRF.paw.x - chestX) * (gaitKey === 'sprint' ? 0.26 : 0.17), -maxScapShift, maxScapShift);
  const scapShiftLF = clamp((footLF.paw.x - chestX) * (gaitKey === 'sprint' ? 0.26 : 0.17), -maxScapShift, maxScapShift);
  const shoulderRF = {
    x: chestX - 0.4 + scapShiftRF,
    y: chestY + 3.8 - Math.abs(scapShiftRF) * 0.18
  };
  const shoulderLF = {
    x: chestX - 1.1 + scapShiftLF,
    y: chestY + 3.5 - Math.abs(scapShiftLF) * 0.18
  };
  const maxHipShift = gaitKey === 'sprint' ? 3.8 : 1.8;
  const hipShiftRH = clamp((footRH.paw.x - pelvisX) * (gaitKey === 'sprint' ? 0.22 : 0.12), -maxHipShift, maxHipShift);
  const hipShiftLH = clamp((footLH.paw.x - pelvisX) * (gaitKey === 'sprint' ? 0.22 : 0.12), -maxHipShift, maxHipShift);
  const hipRH = {
    x: pelvisX + 0.5 + hipShiftRH,
    y: pelvisY + 2.0
  };
  const hipLH = {
    x: pelvisX + 0.0 + hipShiftLH,
    y: pelvisY + 1.6
  };
  const ikRF = solveTwoBoneIK(
    shoulderRF.x, shoulderRF.y,
    footRF.distal.x, footRF.distal.y,
    ANATOMY.foreUpperLen, ANATOMY.foreLowerLen,
    +1
  );
  const ikLF = solveTwoBoneIK(
    shoulderLF.x, shoulderLF.y,
    footLF.distal.x, footLF.distal.y,
    ANATOMY.foreUpperLen, ANATOMY.foreLowerLen,
    +1
  );
  const ikRH = solveTwoBoneIK(
    hipRH.x, hipRH.y,
    footRH.distal.x, footRH.distal.y,
    ANATOMY.hindUpperLen, ANATOMY.hindLowerLen,
    -1
  );
  const ikLH = solveTwoBoneIK(
    hipLH.x, hipLH.y,
    footLH.distal.x, footLH.distal.y,
    ANATOMY.hindUpperLen, ANATOMY.hindLowerLen,
    -1
  );
  const speedFactor = gaitKey === 'sprint' ? 1.0 : gaitKey === 'run' ? 0.72 : gaitKey === 'bike' ? 0.38 : gaitKey === 'walk' ? 0.15 : 0.0;
  const neckReachX = gaitKey === 'sprint'
    ? 10.6 + Math.max(0, -spineFlex) * 1.8 - Math.max(0, spineFlex) * 0.4
    : lerp(6.4, 9.6, speedFactor) + Math.max(0, -spineFlex) * 1.1;
  const neckRiseY = gaitKey === 'sprint'
    ? -6.8 + headNod * 0.42 + Math.max(0, -spineFlex) * 0.6
    : lerp(-10.0, -7.2, speedFactor) + headNod * 0.45;
  const headPivot = {
    x: chestX + neckReachX,
    y: chestY + neckRiseY
  };
  const totalHeadAngle = bodyPitch * 0.42 + headPitch + (gaitKey === 'sprint' ? 0.08 : lerp(0.01, 0.08, speedFactor));
  const tailBase = {
    x: pelvisX - 3.8,
    y: pelvisY - 3.2 - Math.max(0, spineFlex) * 0.6
  };
  const baseTailAngle = gaitKey === 'sprint'
    ? -2.35 + tailWag - bodyPitch * 0.35
    : lerp(-1.80, -2.20, speedFactor) + tailWag - bodyPitch * 0.35;
  const tailLen = 10.6;
  const tailMid = {
    x: tailBase.x + (tailLen * 0.52) * Math.cos(baseTailAngle),
    y: tailBase.y + (tailLen * 0.52) * Math.sin(baseTailAngle)
  };
  const tipAngle = baseTailAngle + 0.12 + earBounce * 0.22;
  const tailTip = {
    x: tailMid.x + (tailLen * 0.48) * Math.cos(tipAngle),
    y: tailMid.y + (tailLen * 0.48) * Math.sin(tipAngle)
  };
  return {
    gaitKey,
    phase: t,
    body: {
      center: { x: bodyX, y: bodyY },
      chest: { x: chestX, y: chestY },
      lumbar: { x: lumbarX, y: lumbarY },
      pelvis: { x: pelvisX, y: pelvisY },
      spineFlex,
      bodyPitch,
      breathExp,
      speedFactor
    },
    head: {
      pivot: headPivot,
      angle: totalHeadAngle,
      earBounce,
      mouthOpen
    },
    tail: {
      base: tailBase,
      mid: tailMid,
      tip: tailTip
    },
    limbs: {
      RF: { shoulder: ikRF.root, elbow: ikRF.mid, wrist: ikRF.end, paw: footRF.paw, isStance: footRF.isStance },
      LF: { shoulder: ikLF.root, elbow: ikLF.mid, wrist: ikLF.end, paw: footLF.paw, isStance: footLF.isStance },
      RH: { hip: ikRH.root, stifle: ikRH.mid, hock: ikRH.end, paw: footRH.paw, isStance: footRH.isStance },
      LH: { hip: ikLH.root, stifle: ikLH.mid, hock: ikLH.end, paw: footLH.paw, isStance: footLH.isStance }
    }
  };
}
export function buildSilhouettePaths(pose) {
  const { body, head, tail, limbs } = pose;
  const { chest, lumbar, pelvis, spineFlex, breathExp } = body;
  const hp = head.pivot;
  const ha = head.angle;
  const cosH = Math.cos(ha);
  const sinH = Math.sin(ha);
  const rotHead = (lx, ly) => ({
    x: hp.x + lx * cosH - ly * sinH,
    y: hp.y + lx * sinH + ly * cosH
  });
  const earFlap = clamp(head.earBounce, 0, 1.2);
  const occiput     = rotHead(-4.0, -5.2);
  const earBackBase = rotHead(-2.2 - earFlap * 0.8, -6.2);
  const earTopPeak  = rotHead(0.6 - earFlap * 1.8, -9.4 + earFlap * 1.1);
  const earFrontFold= rotHead(3.2 - earFlap * 1.2, -6.2 + earFlap * 0.4);
  const brow        = rotHead(5.8, -4.8);
  const stop        = rotHead(7.0, -2.4);
  const noseBridge  = rotHead(11.0, -2.0);
  const noseTip     = rotHead(13.2, -1.2);
  const muzzleFront = rotHead(12.8, 1.8);
  const mouthCleft  = rotHead(9.0, 2.0);
  const jawDrop = head.mouthOpen * 1.10;
  const beardFront  = rotHead(11.6, 2.8 + jawDrop);
  const beardBottom = rotHead(9.2, 4.4 + jawDrop * 0.7);
  const beardBack   = rotHead(6.2, 3.8 + jawDrop * 0.4);
  const throat      = rotHead(2.6, 4.6);
  const withers = {
    x: chest.x - 1.6,
    y: chest.y - 6.0 - Math.max(0, spineFlex) * 1.1
  };
  const backMid = {
    x: lumbar.x + 1.5,
    y: lumbar.y - 5.1 - Math.max(0, spineFlex) * 0.4 + Math.max(0, -spineFlex) * 0.3
  };
  const loinArch = {
    x: lumbar.x - 3.2,
    y: lumbar.y - 4.9 - Math.max(0, spineFlex) * 0.5 + Math.max(0, -spineFlex) * 0.4
  };
  const croup = {
    x: pelvis.x - 1.0,
    y: pelvis.y - 5.0 - Math.max(0, spineFlex) * 0.8
  };
  const tailFront = {
    x: (tail.base.x + tail.mid.x) * 0.5 + 1.6,
    y: (tail.base.y + tail.mid.y) * 0.5 - 0.3
  };
  const tailApex = {
    x: tail.tip.x,
    y: tail.tip.y
  };
  const tailBack = {
    x: (tail.base.x + tail.mid.x) * 0.5 - 1.7,
    y: (tail.base.y + tail.mid.y) * 0.5 + 0.4
  };
  const buttock = {
    x: pelvis.x - 5.4,
    y: pelvis.y + 1.5
  };
  const rumpMerge = {
    x: pelvis.x - 1.4,
    y: pelvis.y + 5.2
  };
  const flankTuck = {
    x: lumbar.x - 1.8,
    y: lumbar.y + 4.0 - Math.max(0, spineFlex) * 1.2 + Math.max(0, -spineFlex) * 0.5
  };
  const rearBrisket = {
    x: chest.x - 3.8,
    y: chest.y + 7.8 + breathExp - Math.max(0, spineFlex) * 0.8
  };
  const deepBrisket = {
    x: chest.x + 2.0,
    y: chest.y + 8.2 + breathExp - Math.max(0, spineFlex) * 0.6
  };
  const prosternum = {
    x: chest.x + 7.0,
    y: chest.y + 4.2 + breathExp * 0.4
  };
  const neckFront = {
    x: (prosternum.x + throat.x) * 0.5 + 0.6,
    y: (prosternum.y + throat.y) * 0.5
  };
  const neckBack = {
    x: (withers.x + occiput.x) * 0.5 - 0.6,
    y: (withers.y + occiput.y) * 0.5 + 0.6
  };
  const torsoPoints = [
    withers,
    neckBack,
    occiput,
    earBackBase,
    earTopPeak,
    earFrontFold,
    brow,
    stop,
    noseBridge,
    noseTip,
    muzzleFront,
    mouthCleft,
    beardFront,
    beardBottom,
    beardBack,
    throat,
    neckFront,
    prosternum,
    deepBrisket,
    rearBrisket,
    flankTuck,
    rumpMerge,
    buttock,
    tailBack,
    tailApex,
    tailFront,
    croup,
    loinArch,
    backMid
  ];
  const torsoPath = buildClosedSmoothPath(torsoPoints, 0.19);
  function buildForelimbPath(limb, isFar) {
    const { shoulder, elbow, wrist, paw } = limb;
    const scale = isFar ? 0.88 : 1.0;
    const uAngle = Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x);
    const lAngle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
    const pAngle = Math.atan2(paw.y - wrist.y, paw.x - wrist.x);
    const uNx = -Math.sin(uAngle);
    const uNy = Math.cos(uAngle);
    const lNx = -Math.sin(lAngle);
    const lNy = Math.cos(lAngle);
    const pDx = Math.cos(pAngle);
    const pDy = Math.sin(pAngle);
    const topCap = {
      x: shoulder.x - Math.cos(uAngle) * (3.6 * scale),
      y: shoulder.y - Math.sin(uAngle) * (3.6 * scale)
    };
    const upperFront = {
      x: (shoulder.x + elbow.x) * 0.5 + uNx * (3.4 * scale),
      y: (shoulder.y + elbow.y) * 0.5 + uNy * (3.4 * scale)
    };
    const elbowFront = {
      x: elbow.x + lNx * (2.4 * scale),
      y: elbow.y + lNy * (2.4 * scale)
    };
    const forearmFront = {
      x: (elbow.x + wrist.x) * 0.5 + lNx * (2.0 * scale),
      y: (elbow.y + wrist.y) * 0.5 + lNy * (2.0 * scale)
    };
    const wristFront = {
      x: wrist.x + lNx * (1.6 * scale),
      y: wrist.y + lNy * (1.6 * scale)
    };
    const pawToe = {
      x: paw.x + lNx * (2.0 * scale) + pDx * (1.2 * scale),
      y: Math.min(ANATOMY.groundY, paw.y + lNy * (2.0 * scale) + pDy * (1.2 * scale))
    };
    const pawPad = {
      x: paw.x + pDx * (1.4 * scale),
      y: Math.min(ANATOMY.groundY, paw.y + pDy * (1.4 * scale))
    };
    const pawHeel = {
      x: paw.x - lNx * (1.5 * scale) + pDx * (0.4 * scale),
      y: Math.min(ANATOMY.groundY, paw.y - lNy * (1.5 * scale) + pDy * (0.4 * scale))
    };
    const wristBack = {
      x: wrist.x - lNx * (1.5 * scale),
      y: wrist.y - lNy * (1.5 * scale)
    };
    const forearmBack = {
      x: (elbow.x + wrist.x) * 0.5 - lNx * (1.8 * scale),
      y: (elbow.y + wrist.y) * 0.5 - lNy * (1.8 * scale)
    };
    const olecranon = {
      x: elbow.x - uNx * (2.8 * scale) - 0.4,
      y: elbow.y - uNy * (2.8 * scale) - 0.2
    };
    const tricepsBack = {
      x: (shoulder.x + elbow.x) * 0.5 - uNx * (3.6 * scale),
      y: (shoulder.y + elbow.y) * 0.5 - uNy * (3.6 * scale)
    };
    return buildClosedSmoothPath([
      topCap,
      upperFront,
      elbowFront,
      forearmFront,
      wristFront,
      pawToe,
      pawPad,
      pawHeel,
      wristBack,
      forearmBack,
      olecranon,
      tricepsBack
    ], 0.20);
  }
  function buildHindlimbPath(limb, isFar) {
    const { hip, stifle, hock, paw } = limb;
    const scale = isFar ? 0.88 : 1.0;
    const uAngle = Math.atan2(stifle.y - hip.y, stifle.x - hip.x);
    const lAngle = Math.atan2(hock.y - stifle.y, hock.x - stifle.x);
    const mAngle = Math.atan2(paw.y - hock.y, paw.x - hock.x);
    const uNx = -Math.sin(uAngle);
    const uNy = Math.cos(uAngle);
    const lNx = -Math.sin(lAngle);
    const lNy = Math.cos(lAngle);
    const mNx = -Math.sin(mAngle);
    const mNy = Math.cos(mAngle);
    const mDx = Math.cos(mAngle);
    const mDy = Math.sin(mAngle);
    const hipCap = {
      x: hip.x - Math.cos(uAngle) * (4.2 * scale),
      y: hip.y - Math.sin(uAngle) * (4.2 * scale)
    };
    const thighFront = {
      x: (hip.x + stifle.x) * 0.5 + uNx * (4.2 * scale),
      y: (hip.y + stifle.y) * 0.5 + uNy * (4.2 * scale)
    };
    const stifleFront = {
      x: stifle.x + uNx * (2.6 * scale),
      y: stifle.y + uNy * (2.6 * scale)
    };
    const shinFront = {
      x: (stifle.x + hock.x) * 0.5 + lNx * (2.2 * scale),
      y: (stifle.y + hock.y) * 0.5 + lNy * (2.2 * scale)
    };
    const hockFront = {
      x: hock.x + mNx * (1.8 * scale),
      y: hock.y + mNy * (1.8 * scale)
    };
    const pawToe = {
      x: paw.x + mNx * (2.0 * scale) + mDx * (1.1 * scale),
      y: Math.min(ANATOMY.groundY, paw.y + mNy * (2.0 * scale) + mDy * (1.1 * scale))
    };
    const pawPad = {
      x: paw.x + mDx * (1.3 * scale),
      y: Math.min(ANATOMY.groundY, paw.y + mDy * (1.3 * scale))
    };
    const pawHeel = {
      x: paw.x - mNx * (1.5 * scale) + mDx * (0.3 * scale),
      y: Math.min(ANATOMY.groundY, paw.y - mNy * (1.5 * scale) + mDy * (0.3 * scale))
    };
    const metaBack = {
      x: (hock.x + paw.x) * 0.5 - mNx * (1.6 * scale),
      y: (hock.y + paw.y) * 0.5 - mNy * (1.6 * scale)
    };
    const calcaneus = {
      x: hock.x - lNx * (2.2 * scale) - 0.3,
      y: hock.y - lNy * (2.2 * scale) - 0.2
    };
    const gaskinBack = {
      x: (stifle.x + hock.x) * 0.5 - lNx * (2.6 * scale),
      y: (stifle.y + hock.y) * 0.5 - lNy * (2.6 * scale)
    };
    const hamstringBack = {
      x: (hip.x + stifle.x) * 0.5 - uNx * (4.6 * scale) - 0.6,
      y: (hip.y + stifle.y) * 0.5 - uNy * (4.6 * scale)
    };
    return buildClosedSmoothPath([
      hipCap,
      thighFront,
      stifleFront,
      shinFront,
      hockFront,
      pawToe,
      pawPad,
      pawHeel,
      metaBack,
      calcaneus,
      gaskinBack,
      hamstringBack
    ], 0.20);
  }
  const earOuterPath = buildClosedSmoothPath([
    rotHead(-1.6, -5.8),
    rotHead(1.2 - earFlap * 1.4, -8.8 + earFlap * 1.0),
    rotHead(3.4 - earFlap * 1.1, -5.8 + earFlap * 0.4),
    rotHead(-0.4, -4.6)
  ], 0.18);
  const tanHeadPath = buildClosedSmoothPath([
    occiput,
    earBackBase,
    earTopPeak,
    earFrontFold,
    brow,
    rotHead(7.8, -2.8),
    rotHead(7.4, -0.4),
    rotHead(4.2,  0.4),
    rotHead(0.4, -0.8),
    rotHead(-3.2, -2.6)
  ], 0.20);
  const croupYOffset = Math.max(0, spineFlex) * 0.8;
  const tanRumpPath = buildClosedSmoothPath([
    { x: pelvis.x + 2.2, y: pelvis.y - 5.0 - croupYOffset },
    { x: pelvis.x - 1.2, y: pelvis.y - 5.3 - croupYOffset },
    { x: tail.base.x + 0.6, y: tail.base.y - 0.4 },
    { x: pelvis.x - 5.2, y: pelvis.y + 0.8 },
    { x: pelvis.x - 1.4, y: pelvis.y + 1.8 },
    { x: pelvis.x + 2.4, y: pelvis.y - 1.4 - croupYOffset * 0.5 }
  ], 0.22);
  const vBackTop = rotHead(-0.6 - earFlap * 0.7, -5.2 + earFlap * 0.2);
  const vApex    = rotHead(3.4 - earFlap * 1.6, -2.5 - earFlap * 0.8);
  const vFrontTop= rotHead(2.4 - earFlap * 0.8, -5.4 + earFlap * 0.2);
  const vInner   = rotHead(2.8 - earFlap * 1.3, -3.3 - earFlap * 0.6);
  const earCutoutPath = `M ${fmt(vBackTop.x)} ${fmt(vBackTop.y)} L ${fmt(vApex.x)} ${fmt(vApex.y)} L ${fmt(vFrontTop.x)} ${fmt(vFrontTop.y)} L ${fmt(vInner.x)} ${fmt(vInner.y)} Z`;
  const eyeFront = rotHead(6.9, -2.5);
  const eyeTop   = rotHead(5.9, -3.4);
  const eyeBack  = rotHead(4.9, -2.6);
  const eyeBot   = rotHead(5.9, -1.7);
  const eyeCutoutPath = buildClosedSmoothPath([eyeFront, eyeTop, eyeBack, eyeBot], 0.28);
  let tonguePath = '';
  if (head.mouthOpen > 0.15) {
    const tScale = clamp(head.mouthOpen, 0.30, 1.35);
    const tRoot = rotHead(9.4, 1.8);
    const tMid  = rotHead(11.8 + tScale * 1.35, 2.2 + tScale * 1.05 - head.earBounce * 0.30);
    const tTip  = rotHead(13.0 + tScale * 1.75, 3.1 + tScale * 1.55 - head.earBounce * 0.55);
    const tLow  = rotHead(10.6 + tScale * 0.95, 2.9 + tScale * 1.25 - head.earBounce * 0.30);
    tonguePath = buildClosedSmoothPath([tRoot, tMid, tTip, tLow], 0.25);
  }
  return {
    farForePath:  buildForelimbPath(limbs.LF, true),
    farHindPath:  buildHindlimbPath(limbs.LH, true),
    torsoPath,
    tanHeadPath,
    tanRumpPath,
    nearHindPath: buildHindlimbPath(limbs.RH, false),
    nearForePath: buildForelimbPath(limbs.RF, false),
    earOuterPath,
    earCutoutPath,
    eyeCutoutPath,
    tonguePath
  };
}
function blendPoses(poseA, poseB, alpha) {
  const w = smoothstep(0, 1, alpha);
  const lerpPt = (p1, p2) => ({ x: lerp(p1.x, p2.x, w), y: lerp(p1.y, p2.y, w) });
  const lerpLimbF = (l1, l2) => ({
    shoulder: lerpPt(l1.shoulder, l2.shoulder),
    elbow:    lerpPt(l1.elbow, l2.elbow),
    wrist:    lerpPt(l1.wrist, l2.wrist),
    paw:      lerpPt(l1.paw, l2.paw),
    isStance: w < 0.5 ? l1.isStance : l2.isStance
  });
  const lerpLimbH = (l1, l2) => ({
    hip:      lerpPt(l1.hip, l2.hip),
    stifle:   lerpPt(l1.stifle, l2.stifle),
    hock:     lerpPt(l1.hock, l2.hock),
    paw:      lerpPt(l1.paw, l2.paw),
    isStance: w < 0.5 ? l1.isStance : l2.isStance
  });
  return {
    gaitKey: poseB.gaitKey,
    phase: poseB.phase,
    body: {
      center: lerpPt(poseA.body.center, poseB.body.center),
      chest:  lerpPt(poseA.body.chest, poseB.body.chest),
      lumbar: lerpPt(poseA.body.lumbar, poseB.body.lumbar),
      pelvis: lerpPt(poseA.body.pelvis, poseB.body.pelvis),
      spineFlex: lerp(poseA.body.spineFlex, poseB.body.spineFlex, w),
      bodyPitch: lerp(poseA.body.bodyPitch, poseB.body.bodyPitch, w),
      breathExp: lerp(poseA.body.breathExp, poseB.body.breathExp, w),
      speedFactor: lerp(poseA.body.speedFactor, poseB.body.speedFactor, w)
    },
    head: {
      pivot: lerpPt(poseA.head.pivot, poseB.head.pivot),
      angle: lerp(poseA.head.angle, poseB.head.angle, w),
      earBounce: lerp(poseA.head.earBounce, poseB.head.earBounce, w),
      mouthOpen: lerp(poseA.head.mouthOpen, poseB.head.mouthOpen, w)
    },
    tail: {
      base: lerpPt(poseA.tail.base, poseB.tail.base),
      mid:  lerpPt(poseA.tail.mid, poseB.tail.mid),
      tip:  lerpPt(poseA.tail.tip, poseB.tail.tip)
    },
    limbs: {
      RF: lerpLimbF(poseA.limbs.RF, poseB.limbs.RF),
      LF: lerpLimbF(poseA.limbs.LF, poseB.limbs.LF),
      RH: lerpLimbH(poseA.limbs.RH, poseB.limbs.RH),
      LH: lerpLimbH(poseA.limbs.LH, poseB.limbs.LH)
    }
  };
}
function ensureSvgStructure(svgEl) {
  svgEl.setAttribute('viewBox', '0 0 120 80');
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgEl.classList.add('pulse-dog-svg');
  while (svgEl.firstChild) {
    svgEl.removeChild(svgEl.firstChild);
  }
  const createEl = (tag, cls) => {
    const el = document.createElementNS(SVG_NS, tag);
    if (cls) el.setAttribute('class', cls);
    return el;
  };
  const groundGroup = createEl('g', 'dog-ground-group');
  const groundLine = createEl('line', 'dog-ground-line');
  groundLine.setAttribute('x1', '10');
  groundLine.setAttribute('y1', '74.3');
  groundLine.setAttribute('x2', '110');
  groundLine.setAttribute('y2', '74.3');
  groundGroup.appendChild(groundLine);
  const stageGroup = createEl('g', 'dog-stage-group');
  const farHind = createEl('path', 'dog-limb-far dog-hind-far');
  const farFore = createEl('path', 'dog-limb-far dog-fore-far');
  const tongue = createEl('path', 'dog-tongue');
  const earOuter = createEl('path', 'dog-ear-outer dog-tan-patch');
  const torso = createEl('path', 'dog-torso');
  const tanRump = createEl('path', 'dog-tan-patch dog-tan-rump');
  const tanHead = createEl('path', 'dog-tan-patch dog-tan-head');
  const nearHind = createEl('path', 'dog-limb-near dog-hind-near');
  const nearFore = createEl('path', 'dog-limb-near dog-fore-near');
  const earCutout = createEl('path', 'dog-cutout dog-ear-cutout');
  const eyeCutout = createEl('path', 'dog-cutout dog-eye-cutout');
  stageGroup.appendChild(farHind);
  stageGroup.appendChild(farFore);
  stageGroup.appendChild(tongue);
  stageGroup.appendChild(earOuter);
  stageGroup.appendChild(torso);
  stageGroup.appendChild(tanRump);
  stageGroup.appendChild(tanHead);
  stageGroup.appendChild(nearHind);
  stageGroup.appendChild(nearFore);
  stageGroup.appendChild(earCutout);
  stageGroup.appendChild(eyeCutout);
  svgEl.appendChild(groundGroup);
  svgEl.appendChild(stageGroup);
  return {
    groundGroup,
    stageGroup,
    farHind,
    farFore,
    tongue,
    earOuter,
    torso,
    tanRump,
    tanHead,
    nearHind,
    nearFore,
    earCutout,
    eyeCutout
  };
}
function applyPathsToDom(nodes, paths) {
  nodes.farFore.setAttribute('d', paths.farForePath);
  nodes.farHind.setAttribute('d', paths.farHindPath);
  nodes.torso.setAttribute('d', paths.torsoPath);
  nodes.tanHead.setAttribute('d', paths.tanHeadPath);
  nodes.tanRump.setAttribute('d', paths.tanRumpPath);
  nodes.earOuter.setAttribute('d', paths.earOuterPath);
  nodes.nearHind.setAttribute('d', paths.nearHindPath);
  nodes.nearFore.setAttribute('d', paths.nearForePath);
  nodes.earCutout.setAttribute('d', paths.earCutoutPath);
  nodes.eyeCutout.setAttribute('d', paths.eyeCutoutPath);
  nodes.tongue.setAttribute('d', paths.tonguePath || 'M 0 0');
}
function isPausedState(svgEl) {
  if (reducedMotionQuery && reducedMotionQuery.matches) {
    return true;
  }
  if (svgEl.classList.contains('paused')) {
    return true;
  }
  if (typeof svgEl.closest === 'function') {
    const pausedAncestor = svgEl.closest('.figure.paused, .paused');
    if (pausedAncestor) return true;
  }
  return false;
}
function destroyInstance(svgEl) {
  const inst = instanceMap.get(svgEl);
  if (!inst) return;
  if (inst.rafId) {
    cancelAnimationFrame(inst.rafId);
    inst.rafId = 0;
  }
  if (inst.fadeTimer) {
    clearTimeout(inst.fadeTimer);
    inst.fadeTimer = 0;
  }
  if (inst.observer) {
    inst.observer.disconnect();
    inst.observer = null;
  }
  if (inst.visHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', inst.visHandler);
    inst.visHandler = null;
  }
  instanceMap.delete(svgEl);
}
export function renderDog(svgEl, key) {
  if (!svgEl || typeof svgEl.setAttribute !== 'function') {
    return;
  }
  const normalizedKey = typeof key === 'string' ? key.trim() : '';
  if (!normalizedKey || !GAIT_CONFIG[normalizedKey]) {
    destroyInstance(svgEl);
    while (svgEl.firstChild) {
      svgEl.removeChild(svgEl.firstChild);
    }
    svgEl.removeAttribute('data-gait');
    return;
  }
  let inst = instanceMap.get(svgEl);
  if (inst && inst.currentKey === normalizedKey) {
    inst.checkStateAndRender(performance.now());
    return;
  }
  if (!inst) {
    const nodes = ensureSvgStructure(svgEl);
    inst = {
      svgEl,
      nodes,
      currentKey: normalizedKey,
      prevKey: null,
      phase: 0,
      prevPhase: 0,
      lastTime: performance.now(),
      transitionStart: 0,
      transitionDuration: 180,
      rafId: 0,
      fadeTimer: 0,
      isVisible: true,
      observer: null,
      visHandler: null,
      lastPose: null,
      checkStateAndRender: null
    };
    if (typeof IntersectionObserver === 'function') {
      inst.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          inst.isVisible = entry.isIntersecting;
        }
        if (inst.isVisible && !inst.rafId) {
          inst.lastTime = performance.now();
          inst.rafId = requestAnimationFrame(tick);
        }
      }, { threshold: 0.01 });
      inst.observer.observe(svgEl);
    }
    if (typeof document !== 'undefined') {
      inst.visHandler = () => {
        if (!document.hidden && inst.isVisible && !inst.rafId) {
          inst.lastTime = performance.now();
          inst.rafId = requestAnimationFrame(tick);
        }
      };
      document.addEventListener('visibilitychange', inst.visHandler);
    }
    const renderStaticRepresentativePose = () => {
      const pose = computeKinematics('stand', 0.0);
      const paths = buildSilhouettePaths(pose);
      applyPathsToDom(inst.nodes, paths);
      inst.lastPose = pose;
    };
    const tick = (now) => {
      inst.rafId = 0;
      if (!svgEl.isConnected && inst.hasBeenConnected) {
        destroyInstance(svgEl);
        return;
      }
      if (svgEl.isConnected) {
        inst.hasBeenConnected = true;
      }
      const paused = isPausedState(svgEl);
      if (paused) {
        renderStaticRepresentativePose();
        return;
      }
      const dt = clamp((now - inst.lastTime) / 1000, 0, 0.1);
      inst.lastTime = now;
      const cfg = GAIT_CONFIG[inst.currentKey];
      inst.phase = wrapPhase(inst.phase + dt / cfg.period);
      let activePose = computeKinematics(inst.currentKey, inst.phase);
      if (inst.prevKey && now - inst.transitionStart < inst.transitionDuration) {
        const prevCfg = GAIT_CONFIG[inst.prevKey];
        inst.prevPhase = wrapPhase(inst.prevPhase + dt / prevCfg.period);
        const prevPose = computeKinematics(inst.prevKey, inst.prevPhase);
        const alpha = (now - inst.transitionStart) / inst.transitionDuration;
        activePose = blendPoses(prevPose, activePose, alpha);
      } else {
        inst.prevKey = null;
      }
      const paths = buildSilhouettePaths(activePose);
      applyPathsToDom(inst.nodes, paths);
      inst.lastPose = activePose;
      if (inst.isVisible && (!document || !document.hidden)) {
        inst.rafId = requestAnimationFrame(tick);
      }
    };
    inst.checkStateAndRender = (now) => {
      if (isPausedState(svgEl)) {
        renderStaticRepresentativePose();
      } else if (!inst.rafId) {
        inst.lastTime = now;
        inst.rafId = requestAnimationFrame(tick);
      }
    };
    instanceMap.set(svgEl, inst);
    svgEl.setAttribute('data-gait', normalizedKey);
    if (isPausedState(svgEl)) {
      renderStaticRepresentativePose();
    } else {
      const initialPose = computeKinematics(normalizedKey, 0.42);
      applyPathsToDom(inst.nodes, buildSilhouettePaths(initialPose));
      inst.lastPose = initialPose;
    }
    inst.rafId = requestAnimationFrame(tick);
  } else {
    inst.prevKey = inst.currentKey;
    inst.prevPhase = inst.phase;
    inst.currentKey = normalizedKey;
    inst.transitionStart = performance.now();
    svgEl.setAttribute('data-gait', normalizedKey);
    inst.nodes.stageGroup.classList.remove('dog-stage-fading');
    void inst.nodes.stageGroup.getBoundingClientRect();
    inst.nodes.stageGroup.classList.add('dog-stage-fading');
    if (inst.fadeTimer) clearTimeout(inst.fadeTimer);
    inst.fadeTimer = setTimeout(() => {
      if (inst.nodes && inst.nodes.stageGroup) {
        inst.nodes.stageGroup.classList.remove('dog-stage-fading');
      }
    }, 185);
    inst.checkStateAndRender(performance.now());
  }
}
export function renderDogFrameAtPhase(svgEl, key, phase) {
  if (!svgEl || !GAIT_CONFIG[key]) return null;
  destroyInstance(svgEl);
  const nodes = ensureSvgStructure(svgEl);
  svgEl.setAttribute('data-gait', key);
  const pose = computeKinematics(key, phase);
  const paths = buildSilhouettePaths(pose);
  applyPathsToDom(nodes, paths);
  return { pose, paths };
}
