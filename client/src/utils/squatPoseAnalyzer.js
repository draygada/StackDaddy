import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_VARIANTS = [
  {
    label: 'mediapipe_pose_landmarker_full',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task'
  },
  {
    label: 'mediapipe_pose_landmarker_lite',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'
  }
]

const LANDMARKS = {
  nose: 0,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32
}

const FAULT_PRIORITY = {
  'knee cave': 1,
  'shallow depth': 2,
  'chest forward': 3,
  'no lockout': 4,
  'stance too narrow': 5,
  'stance too wide': 6,
  'uneven squat': 7,
  'heels rising': 8
}

function confidence(point) {
  return point?.visibility ?? point?.presence ?? 1
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value))
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null
}

function median(values) {
  const valid = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!valid.length) return null

  const midpointIndex = Math.floor(valid.length / 2)
  return valid.length % 2
    ? valid[midpointIndex]
    : (valid[midpointIndex - 1] + valid[midpointIndex]) / 2
}

function topPercent(values, percent = 0.2) {
  const valid = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)
  const count = Math.max(3, Math.ceil(valid.length * percent))
  return valid.slice(0, count)
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  }
}

function medianPoint(points) {
  const valid = points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
  if (!valid.length) return null

  return {
    x: median(valid.map((point) => point.x)),
    y: median(valid.map((point) => point.y))
  }
}

function pointDistance(a, b) {
  if (!a || !b) return null
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function sampleFootCenter(sample) {
  return medianPoint([
    sample.points.leftAnkle,
    sample.points.rightAnkle,
    sample.points.leftFoot,
    sample.points.rightFoot
  ])
}

function distanceX(a, b) {
  return Math.abs(a.x - b.x)
}

function angleDegrees(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const magA = Math.hypot(ab.x, ab.y)
  const magC = Math.hypot(cb.x, cb.y)

  if (!magA || !magC) return null

  const cosine = Math.max(-1, Math.min(1, dot / (magA * magC)))
  return (Math.acos(cosine) * 180) / Math.PI
}

function torsoLeanDegrees(hipMid, shoulderMid) {
  const vector = {
    x: shoulderMid.x - hipMid.x,
    y: shoulderMid.y - hipMid.y
  }
  const magnitude = Math.hypot(vector.x, vector.y)
  if (!magnitude) return null

  const verticalUp = { x: 0, y: -1 }
  const cosine = Math.max(
    -1,
    Math.min(1, (vector.x * verticalUp.x + vector.y * verticalUp.y) / magnitude)
  )

  return (Math.acos(cosine) * 180) / Math.PI
}

function compactPoint(point) {
  if (!point) return null

  return {
    x: Number(point.x.toFixed(4)),
    y: Number(point.y.toFixed(4)),
    c: Number(confidence(point).toFixed(2))
  }
}

function compactLandmarks(landmarks) {
  return Object.fromEntries(
    Object.entries(LANDMARKS).map(([key, index]) => [
      key,
      compactPoint(landmarks[index])
    ])
  )
}

function getVisible(landmarks, key) {
  const point = landmarks[LANDMARKS[key]]
  return point && confidence(point) >= 0.45 ? point : null
}

function deriveMetrics(landmarks, timestampMs) {
  const leftHip = getVisible(landmarks, 'leftHip')
  const rightHip = getVisible(landmarks, 'rightHip')
  const leftKnee = getVisible(landmarks, 'leftKnee')
  const rightKnee = getVisible(landmarks, 'rightKnee')
  const leftAnkle = getVisible(landmarks, 'leftAnkle')
  const rightAnkle = getVisible(landmarks, 'rightAnkle')
  const leftHeel = getVisible(landmarks, 'leftHeel')
  const rightHeel = getVisible(landmarks, 'rightHeel')
  const leftFoot = getVisible(landmarks, 'leftFoot')
  const rightFoot = getVisible(landmarks, 'rightFoot')
  const leftShoulder = getVisible(landmarks, 'leftShoulder')
  const rightShoulder = getVisible(landmarks, 'rightShoulder')

  const needed = [
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftShoulder,
    rightShoulder
  ]
  const visibleCount = needed.filter(Boolean).length
  if (visibleCount < 6) return null

  const leftKneeAngle =
    leftHip && leftKnee && leftAnkle
      ? angleDegrees(leftHip, leftKnee, leftAnkle)
      : null
  const rightKneeAngle =
    rightHip && rightKnee && rightAnkle
      ? angleDegrees(rightHip, rightKnee, rightAnkle)
      : null

  const avgKneeAngle = average([leftKneeAngle, rightKneeAngle])
  if (!avgKneeAngle) return null

  const leftHipAngle =
    leftShoulder && leftHip && leftKnee
      ? angleDegrees(leftShoulder, leftHip, leftKnee)
      : null
  const rightHipAngle =
    rightShoulder && rightHip && rightKnee
      ? angleDegrees(rightShoulder, rightHip, rightKnee)
      : null
  const avgHipAngle = average([leftHipAngle, rightHipAngle])

  const hipMid = midpoint(leftHip || rightHip, rightHip || leftHip)
  const kneeMid = midpoint(leftKnee || rightKnee, rightKnee || leftKnee)
  const ankleMid = midpoint(leftAnkle || rightAnkle, rightAnkle || leftAnkle)
  const shoulderMid = midpoint(
    leftShoulder || rightShoulder,
    rightShoulder || leftShoulder
  )

  const hipWidth = leftHip && rightHip ? distanceX(leftHip, rightHip) : null
  const kneeWidth = leftKnee && rightKnee ? distanceX(leftKnee, rightKnee) : null
  const ankleWidth =
    leftAnkle && rightAnkle ? distanceX(leftAnkle, rightAnkle) : null
  const heelRise = average([
    leftHeel && leftFoot ? leftHeel.y - leftFoot.y : null,
    rightHeel && rightFoot ? rightHeel.y - rightFoot.y : null
  ])

  return {
    timestamp_ms: timestampMs,
    points: compactLandmarks(landmarks),
    confidence: visibleCount / needed.length,
    knee_angle: avgKneeAngle,
    left_knee_angle: leftKneeAngle,
    right_knee_angle: rightKneeAngle,
    knee_angle_asymmetry:
      leftKneeAngle && rightKneeAngle ? Math.abs(leftKneeAngle - rightKneeAngle) : null,
    hip_angle: avgHipAngle,
    hip_knee_y_delta: hipMid.y - kneeMid.y,
    hip_rel:
      Math.abs(ankleMid.y - shoulderMid.y) > 0.001
        ? (hipMid.y - shoulderMid.y) / Math.abs(ankleMid.y - shoulderMid.y)
        : null,
    hip_y: hipMid.y,
    body_center_x: average([shoulderMid.x, hipMid.x, kneeMid.x]),
    body_center_y: average([shoulderMid.y, hipMid.y, kneeMid.y]),
    body_height: Math.abs(ankleMid.y - shoulderMid.y),
    torso_lean: torsoLeanDegrees(hipMid, shoulderMid),
    knee_ankle_width_ratio:
      kneeWidth && ankleWidth && ankleWidth > 0.04 ? kneeWidth / ankleWidth : null,
    ankle_hip_width_ratio:
      ankleWidth && hipWidth && hipWidth > 0.04 ? ankleWidth / hipWidth : null,
    ankle_width: ankleWidth,
    hip_width: hipWidth,
    heel_rise_proxy: heelRise
  }
}

function baselineFromSamples(samples) {
  const mostlyStandingAngles = topPercent(
    samples.map((sample) => sample.knee_angle),
    0.25
  )
  const standingCutoff = Math.max(132, median(mostlyStandingAngles) || 145)
  const candidates = samples.filter(
    (sample) => sample.knee_angle >= standingCutoff && sample.body_height > 0.2
  )
  const source =
    candidates.length >= 3
      ? candidates
      : [...samples]
          .sort((a, b) => b.knee_angle - a.knee_angle)
          .slice(0, Math.max(3, Math.ceil(samples.length * 0.2)))

  return {
    knee_angle:
      median(topPercent(source.map((sample) => sample.knee_angle), 0.5)) || 168,
    left_knee_angle: median(source.map((sample) => sample.left_knee_angle)) || 168,
    right_knee_angle: median(source.map((sample) => sample.right_knee_angle)) || 168,
    hip_rel: median(source.map((sample) => sample.hip_rel)) || 0.48,
    hip_knee_y_delta:
      median(source.map((sample) => sample.hip_knee_y_delta)) || -0.16,
    body_center_x: median(source.map((sample) => sample.body_center_x)) || 0.5,
    body_height: median(source.map((sample) => sample.body_height)) || 0.5,
    ankle_width: median(source.map((sample) => sample.ankle_width)) || 0.18,
    left_ankle: medianPoint(source.map((sample) => sample.points.leftAnkle)),
    right_ankle: medianPoint(source.map((sample) => sample.points.rightAnkle)),
    left_foot: medianPoint(source.map((sample) => sample.points.leftFoot)),
    right_foot: medianPoint(source.map((sample) => sample.points.rightFoot))
  }
}

function smoothAngles(samples) {
  const baseline = baselineFromSamples(samples)
  const smoothed = samples.map((sample, index) => {
    const neighbors = samples.slice(Math.max(0, index - 2), index + 3)
    return {
      ...sample,
      smooth_knee_angle: average(neighbors.map((item) => item.knee_angle)),
      smooth_left_knee_angle: average(neighbors.map((item) => item.left_knee_angle)),
      smooth_right_knee_angle: average(neighbors.map((item) => item.right_knee_angle)),
      smooth_hip_y_delta: average(neighbors.map((item) => item.hip_knee_y_delta)),
      smooth_hip_rel: average(neighbors.map((item) => item.hip_rel)),
      smooth_body_center_x: average(neighbors.map((item) => item.body_center_x)),
      smooth_body_height: average(neighbors.map((item) => item.body_height))
    }
  })

  const enrichSample = (sample) => {
    const leftKneeDrop = Number.isFinite(sample.smooth_left_knee_angle)
      ? baseline.left_knee_angle - sample.smooth_left_knee_angle
      : null
    const rightKneeDrop = Number.isFinite(sample.smooth_right_knee_angle)
      ? baseline.right_knee_angle - sample.smooth_right_knee_angle
      : null
    const leftAnkleDrift = pointDistance(sample.points.leftAnkle, baseline.left_ankle)
    const rightAnkleDrift = pointDistance(sample.points.rightAnkle, baseline.right_ankle)
    const leftFootDrift = pointDistance(sample.points.leftFoot, baseline.left_foot)
    const rightFootDrift = pointDistance(sample.points.rightFoot, baseline.right_foot)
    const footDrift = average([
      leftAnkleDrift,
      rightAnkleDrift,
      leftFootDrift,
      rightFootDrift
    ])
    const normalizedFootDrift =
      footDrift === null || baseline.body_height <= 0
        ? 0
        : footDrift / baseline.body_height
    const footSpreadChange =
      sample.ankle_width && baseline.ankle_width
        ? Math.abs(sample.ankle_width - baseline.ankle_width) / baseline.ankle_width
        : 0

    return {
      ...sample,
      baseline,
      knee_angle_drop: baseline.knee_angle - sample.smooth_knee_angle,
      left_knee_drop: leftKneeDrop,
      right_knee_drop: rightKneeDrop,
      two_knee_drop:
        Number.isFinite(leftKneeDrop) && Number.isFinite(rightKneeDrop)
          ? Math.min(leftKneeDrop, rightKneeDrop)
          : Math.max(leftKneeDrop || 0, rightKneeDrop || 0),
      knee_bend_balance:
        Number.isFinite(leftKneeDrop) && Number.isFinite(rightKneeDrop)
          ? Math.abs(leftKneeDrop - rightKneeDrop)
          : 0,
      hip_drop_proxy: sample.smooth_hip_y_delta - baseline.hip_knee_y_delta,
      hip_rel_rise: sample.smooth_hip_rel - baseline.hip_rel,
      body_drift_x: Math.abs(sample.smooth_body_center_x - baseline.body_center_x),
      body_scale_change:
        baseline.body_height > 0
          ? Math.abs(sample.smooth_body_height - baseline.body_height) /
            baseline.body_height
          : 0,
      foot_drift: normalizedFootDrift,
      foot_spread_change: footSpreadChange,
      planted_feet:
        normalizedFootDrift < 0.16 &&
        footSpreadChange < 0.35
    }
  }

  return smoothed.map((sample, index) => {
    const enriched = enrichSample(sample)
    const previous = smoothed[index - 1]
    if (!previous) {
      return { ...enriched, knee_velocity_deg_s: 0, phase_hint: 'lockout' }
    }

    const dt = Math.max(1, sample.timestamp_ms - previous.timestamp_ms) / 1000
    const velocity = (sample.smooth_knee_angle - previous.smooth_knee_angle) / dt

    return {
      ...enriched,
      knee_velocity_deg_s: velocity,
      phase_hint:
        velocity < -24
          ? 'descent'
          : velocity > 24
            ? 'ascent'
            : enriched.knee_angle_drop > 24
              ? 'bottom'
              : 'lockout'
    }
  })
}

function segmentReps(samples) {
  const clusters = []
  let active = []

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]
    const squatPosture =
      sample.confidence >= 0.5 &&
      sample.body_height > 0.2 &&
      sample.body_scale_change < 0.75 &&
      sample.knee_angle_drop > 12 &&
      sample.hip_rel_rise > 0.025 &&
      sample.smooth_knee_angle < 158 &&
      (sample.two_knee_drop > 6 ||
        sample.knee_bend_balance < 75 ||
        sample.smooth_knee_angle < 135)

    if (squatPosture) {
      active.push({ index: i, sample })
      continue
    }

    if (active.length) {
      clusters.push(active)
      active = []
    }
  }

  if (active.length) {
    clusters.push(active)
  }

  const reps = clusters
    .map((cluster) => {
      const first = cluster[0]
      const last = cluster[cluster.length - 1]
      const duration = last.sample.timestamp_ms - first.sample.timestamp_ms
      const bottom = cluster.reduce((best, item) => {
        const score =
          item.sample.knee_angle_drop +
          item.sample.hip_rel_rise * 240 -
          item.sample.body_scale_change * 12
        const bestScore =
          best.sample.knee_angle_drop +
          best.sample.hip_rel_rise * 240 -
          best.sample.body_scale_change * 12
        return score > bestScore ? item : best
      }, first)
      const footCenters = cluster
        .map((item) => sampleFootCenter(item.sample))
        .filter(Boolean)
      const footMedian = medianPoint(footCenters)
      const maxFootCenterDrift =
        footMedian && footCenters.length
          ? Math.max(
              ...footCenters.map((point) => pointDistance(point, footMedian) || 0)
            ) / Math.max(0.2, bottom.sample.body_height)
          : 0
      const maxFootSpreadChange = Math.max(
        ...cluster.map((item) => item.sample.foot_spread_change || 0)
      )
      const maxHipRelRise = Math.max(
        ...cluster.map((item) => item.sample.hip_rel_rise || 0)
      )
      const maxTwoKneeDrop = Math.max(
        ...cluster.map((item) => item.sample.two_knee_drop || 0)
      )
      const minKneeAngle = Math.min(
        ...cluster.map((item) => item.sample.smooth_knee_angle || 180)
      )
      const minKneeBalance = Math.min(
        ...cluster.map((item) => item.sample.knee_bend_balance || 0)
      )
      const squatLike =
        duration >= 300 &&
        maxHipRelRise > 0.045 &&
        (maxTwoKneeDrop > 7 || minKneeAngle < 135 || minKneeBalance < 78) &&
        bottom.sample.knee_angle_drop > 18 &&
        maxFootCenterDrift < 0.16 &&
        maxFootSpreadChange < 0.48 &&
        bottom.sample.body_scale_change < 0.78

      if (!squatLike) return null

      let startIndex = first.index
      while (
        startIndex > 0 &&
        samples[startIndex].knee_angle_drop > 8 &&
        samples[startIndex].hip_rel_rise > 0.018
      ) {
        startIndex -= 1
      }

      let endIndex = last.index
      while (
        endIndex < samples.length - 1 &&
        samples[endIndex].knee_angle_drop > 10
      ) {
        endIndex += 1
      }

      return {
        startIndex,
        bottomIndex: bottom.index,
        endIndex,
        duration,
        maxFootCenterDrift,
        maxFootSpreadChange
      }
    })
    .filter(Boolean)

  if (reps.length) return reps

  return fallbackRepFromDeepestFrame(samples)
}

function fallbackRepFromDeepestFrame(samples) {
  if (!samples.length) return []

  const bottomIndex = samples.reduce((bestIndex, sample, index) => {
    const best = samples[bestIndex]
    const score = sample.knee_angle_drop + sample.hip_rel_rise * 260
    const bestScore = best.knee_angle_drop + best.hip_rel_rise * 260
    return score > bestScore ? index : bestIndex
  }, 0)
  const bottom = samples[bottomIndex]
  const squatLike =
    bottom.knee_angle_drop > 22 &&
    bottom.hip_rel_rise > 0.05 &&
    (bottom.two_knee_drop > 6 ||
      bottom.smooth_knee_angle < 132 ||
      bottom.knee_bend_balance < 78) &&
    bottom.body_scale_change < 0.8

  if (!squatLike) return []

  return [
    {
      startIndex: Math.max(0, bottomIndex - 4),
      bottomIndex,
      endIndex: Math.min(samples.length - 1, bottomIndex + 4)
    }
  ]
}

function buildFault(repNumber, rep, type, explanation, cue, confidenceScore) {
  return {
    rep: repNumber,
    timestamp_start: Math.max(0, rep.start.timestamp_ms / 1000 - 0.35),
    timestamp_end: rep.end.timestamp_ms / 1000 + 0.35,
    fault_type: type,
    fault: type,
    explanation,
    cue,
    confidence: Number(confidenceScore.toFixed(2)),
    source: 'local_joint_analysis'
  }
}

function buildTimedFault(repNumber, timestampMs, type, explanation, cue, confidenceScore) {
  const timestampSeconds = timestampMs / 1000

  return {
    rep: repNumber,
    timestamp_start: Math.max(0, timestampSeconds - 1.2),
    timestamp_end: timestampSeconds + 1.2,
    fault_type: type,
    fault: type,
    explanation,
    cue,
    confidence: Number(confidenceScore.toFixed(2)),
    source: 'local_joint_analysis'
  }
}

function faultsForRep(repNumber, rep) {
  const bottom = rep.bottom
  const start = rep.start
  const faults = []

  if (
    bottom.knee_ankle_width_ratio !== null &&
    bottom.knee_ankle_width_ratio < 0.86 &&
    bottom.ankle_hip_width_ratio !== null &&
    bottom.ankle_hip_width_ratio > 0.85
  ) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'knee cave',
        'Your knees moved inside your ankles near the bottom.',
        'Push your knees out over your toes.',
        0.82
      )
    )
  }

  if (
    bottom.knee_angle > 122 ||
    bottom.hip_rel_rise < 0.115 ||
    bottom.hip_knee_y_delta < -0.035
  ) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'shallow depth',
        'Your hips did not clearly reach knee level.',
        'Sit deeper, hips below knees.',
        0.78
      )
    )
  }

  if (bottom.torso_lean !== null && bottom.torso_lean > 32) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'chest forward',
        'Your torso tipped forward at the bottom.',
        'Chest up and brace.',
        0.74
      )
    )
  }

  if (
    start.ankle_hip_width_ratio !== null &&
    start.ankle_hip_width_ratio < 0.78
  ) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'stance too narrow',
        'Your feet started narrower than your hips.',
        'Widen your stance slightly.',
        0.68
      )
    )
  }

  if (
    start.ankle_hip_width_ratio !== null &&
    start.ankle_hip_width_ratio > 1.65
  ) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'stance too wide',
        'Your feet started much wider than your hips.',
        'Bring your feet in slightly.',
        0.66
      )
    )
  }

  if (
    bottom.knee_angle_asymmetry !== null &&
    bottom.knee_angle_asymmetry > 18
  ) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'uneven squat',
        'One knee bent much more than the other.',
        'Keep both legs even.',
        0.64
      )
    )
  }

  if (bottom.heel_rise_proxy !== null && bottom.heel_rise_proxy < -0.035) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'heels rising',
        'Your heels appeared to lift near the bottom.',
        'Keep pressure through your heels.',
        0.58
      )
    )
  }

  if (
    rep.end.knee_angle_drop > 20 &&
    rep.end.hip_rel_rise > 0.07
  ) {
    faults.push(
      buildFault(
        repNumber,
        rep,
        'no lockout',
        'You did not fully stand tall after the rep.',
        'Stand all the way up.',
        0.7
      )
    )
  }

  return faults
}

function chooseTopFaults(faults) {
  return [...faults]
    .sort((a, b) => {
      const priorityA = FAULT_PRIORITY[a.fault_type] || 99
      const priorityB = FAULT_PRIORITY[b.fault_type] || 99
      if (priorityA !== priorityB) return priorityA - priorityB
      return b.confidence - a.confidence
    })
    .slice(0, 2)
}

function pointFromFrame(sample, key) {
  const point = sample.points?.[key]
  return point && point.c >= 0.45 ? point : null
}

function averagePoint(a, b) {
  if (!a || !b) return a || b || null

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    c: Math.min(a.c ?? 1, b.c ?? 1)
  }
}

function lineXAtY(a, b, y) {
  const dy = b.y - a.y
  if (Math.abs(dy) < 0.001) return a.x
  const t = (y - a.y) / dy
  return a.x + (b.x - a.x) * t
}

function handstandLineForSample(sample) {
  const leftWrist = pointFromFrame(sample, 'leftWrist')
  const rightWrist = pointFromFrame(sample, 'rightWrist')
  const leftShoulder = pointFromFrame(sample, 'leftShoulder')
  const rightShoulder = pointFromFrame(sample, 'rightShoulder')
  const leftHip = pointFromFrame(sample, 'leftHip')
  const rightHip = pointFromFrame(sample, 'rightHip')
  const leftAnkle = pointFromFrame(sample, 'leftAnkle')
  const rightAnkle = pointFromFrame(sample, 'rightAnkle')

  const wristMid = averagePoint(leftWrist, rightWrist)
  const shoulderMid = averagePoint(leftShoulder, rightShoulder)
  const hipMid = averagePoint(leftHip, rightHip)
  const ankleMid = averagePoint(leftAnkle, rightAnkle)

  if (!wristMid || !shoulderMid || !hipMid || !ankleMid) return null

  const bodySpan = Math.max(0.2, wristMid.y - ankleMid.y)
  const inverted =
    wristMid.y > shoulderMid.y + 0.04 &&
    shoulderMid.y > hipMid.y + 0.02 &&
    hipMid.y > ankleMid.y + 0.02

  const shoulderOffset =
    (shoulderMid.x - lineXAtY(wristMid, ankleMid, shoulderMid.y)) / bodySpan
  const hipOffset =
    (hipMid.x - lineXAtY(wristMid, ankleMid, hipMid.y)) / bodySpan
  const ankleOffset = (ankleMid.x - wristMid.x) / bodySpan
  const stackScore = Math.abs(shoulderOffset) + Math.abs(hipOffset)
  const nearVertical =
    inverted &&
    Math.abs(shoulderOffset) < 0.28 &&
    Math.abs(hipOffset) < 0.34 &&
    Math.abs(ankleOffset) < 0.42

  return {
    inverted,
    near_vertical: nearVertical,
    stack_score: Number(stackScore.toFixed(3)),
    shoulder_offset: Number(shoulderOffset.toFixed(3)),
    hip_offset: Number(hipOffset.toFixed(3)),
    ankle_offset: Number(ankleOffset.toFixed(3))
  }
}

function stableHandstandHoldSamples(lineSamples) {
  let bestRun = []
  let currentRun = []

  for (const sample of lineSamples) {
    if (!sample.handstand_line.near_vertical) {
      if (currentRun.length > bestRun.length) bestRun = currentRun
      currentRun = []
      continue
    }

    const previous = currentRun[currentRun.length - 1]
    if (previous && sample.timestamp_ms - previous.timestamp_ms > 260) {
      if (currentRun.length > bestRun.length) bestRun = currentRun
      currentRun = []
    }

    currentRun.push(sample)
  }

  if (currentRun.length > bestRun.length) bestRun = currentRun
  if (bestRun.length < 2) return []

  const duration =
    bestRun[bestRun.length - 1].timestamp_ms - bestRun[0].timestamp_ms

  return duration >= 1000 ? bestRun : []
}

function analyzeSamples(rawSamples, modelLabel) {
  const samples = smoothAngles(
    rawSamples.filter((sample) => sample.confidence >= 0.5)
  )
  const reps = segmentReps(samples)
  const repSummaries = reps.map((rep, index) => {
    const descentSamples = samples
      .slice(rep.startIndex, rep.bottomIndex + 1)
      .filter((sample) => sample.phase_hint === 'descent')
    const ascentSamples = samples
      .slice(rep.bottomIndex, rep.endIndex + 1)
      .filter((sample) => sample.phase_hint === 'ascent')
    const summary = {
      rep: index + 1,
      start: samples[rep.startIndex],
      bottom: samples[rep.bottomIndex],
      end: samples[rep.endIndex]
    }

    return {
      rep: summary.rep,
      timestamp_start: summary.start.timestamp_ms / 1000,
      timestamp_bottom: summary.bottom.timestamp_ms / 1000,
      timestamp_end: summary.end.timestamp_ms / 1000,
      min_knee_angle: Number(summary.bottom.knee_angle.toFixed(1)),
      min_hip_angle:
        summary.bottom.hip_angle === null
          ? null
          : Number(summary.bottom.hip_angle.toFixed(1)),
      torso_lean: Number((summary.bottom.torso_lean || 0).toFixed(1)),
      depth_delta: Number(summary.bottom.hip_knee_y_delta.toFixed(3)),
      knee_angle_asymmetry:
        summary.bottom.knee_angle_asymmetry === null
          ? null
          : Number(summary.bottom.knee_angle_asymmetry.toFixed(1)),
      knee_ankle_width_ratio:
        summary.bottom.knee_ankle_width_ratio === null
          ? null
          : Number(summary.bottom.knee_ankle_width_ratio.toFixed(2)),
      ankle_hip_width_ratio:
        summary.start.ankle_hip_width_ratio === null
          ? null
          : Number(summary.start.ankle_hip_width_ratio.toFixed(2)),
      heel_rise_proxy:
        summary.bottom.heel_rise_proxy === null
          ? null
          : Number(summary.bottom.heel_rise_proxy.toFixed(3)),
      descent_duration_ms:
        summary.bottom.timestamp_ms - summary.start.timestamp_ms,
      ascent_duration_ms:
        summary.end.timestamp_ms - summary.bottom.timestamp_ms,
      avg_descent_velocity_deg_s: Number(
        (average(descentSamples.map((sample) => sample.knee_velocity_deg_s)) || 0).toFixed(1)
      ),
      avg_ascent_velocity_deg_s: Number(
        (average(ascentSamples.map((sample) => sample.knee_velocity_deg_s)) || 0).toFixed(1)
      ),
      faults: faultsForRep(summary.rep, summary)
    }
  })

  const faults = chooseTopFaults(repSummaries.flatMap((rep) => rep.faults))
  const activeFrames = samples.filter(
    (sample) =>
      Math.abs(sample.knee_velocity_deg_s) > 20 &&
      sample.knee_angle_drop > 12 &&
      sample.hip_rel_rise > 0.035 &&
      (sample.two_knee_drop > 6 || sample.smooth_knee_angle < 140)
  ).length

  return {
    source: `local_joint_analysis_v3_${modelLabel}`,
    analysis_model: 'joint_rules_v2',
    total_reps: reps.length,
    tracked_frames: rawSamples.length,
    usable_frames: samples.length,
    motion_active_ratio: Number((activeFrames / Math.max(1, samples.length)).toFixed(2)),
    average_confidence: Number(
      (average(samples.map((sample) => sample.confidence)) || 0).toFixed(2)
    ),
    squat_gate: {
      baseline_knee_angle: Number((samples[0]?.baseline?.knee_angle || 0).toFixed(1)),
      baseline_hip_delta: Number(
        (samples[0]?.baseline?.hip_knee_y_delta || 0).toFixed(3)
      ),
      rule:
        'Finds sustained hip drop plus knee bend; rejects walking with foot-center drift.'
    },
    faults,
    frames: samples.map((sample) => ({
      timestamp_ms: Number(sample.timestamp_ms.toFixed(1)),
      phase: sample.phase_hint,
      knee_angle: Number(sample.knee_angle.toFixed(1)),
      hip_rel: Number((sample.hip_rel || 0).toFixed(3)),
      points: sample.points
    })),
    reps: repSummaries,
    guidance:
      reps.length === 0
        ? 'Keep your full body visible from a side or slight front angle.'
        : 'Local pose metrics were used for squat form detection.'
  }
}

function analyzeHandstandSamples(rawSamples, modelLabel) {
  const samples = smoothAngles(
    rawSamples.filter((sample) => sample.confidence >= 0.45)
  )
  const lineSamples = samples
    .map((sample) => ({
      ...sample,
      handstand_line: handstandLineForSample(sample)
    }))
    .filter((sample) => sample.handstand_line)

  const activeSamples = stableHandstandHoldSamples(lineSamples)
  const totalReps = activeSamples.length ? 1 : 0
  const worstLine = [...activeSamples].sort(
    (a, b) => b.handstand_line.stack_score - a.handstand_line.stack_score
  )[0]
  const faults = []

  if (totalReps && worstLine) {
    const line = worstLine.handstand_line

    if (Math.abs(line.shoulder_offset) > 0.1) {
      faults.push(
        buildTimedFault(
          1,
          worstLine.timestamp_ms,
          'shoulders not stacked',
          'Your shoulders drifted away from your wrist line.',
          'Push tall through your shoulders.',
          0.78
        )
      )
    }

    if (Math.abs(line.hip_offset) > 0.12) {
      faults.push(
        buildTimedFault(
          1,
          worstLine.timestamp_ms,
          'arched handstand line',
          'Your hips moved off the shoulder-to-ankle line.',
          'Stack ribs over hips.',
          0.74
        )
      )
    }

    const elbowAngles = activeSamples.flatMap((sample) => [
      sample.points.leftShoulder &&
      sample.points.leftElbow &&
      sample.points.leftWrist
        ? angleDegrees(
            sample.points.leftShoulder,
            sample.points.leftElbow,
            sample.points.leftWrist
          )
        : null,
      sample.points.rightShoulder &&
      sample.points.rightElbow &&
      sample.points.rightWrist
        ? angleDegrees(
            sample.points.rightShoulder,
            sample.points.rightElbow,
            sample.points.rightWrist
          )
        : null
    ])
    const avgElbowAngle = average(elbowAngles)

    if (avgElbowAngle !== null && avgElbowAngle < 155) {
      faults.push(
        buildTimedFault(
          1,
          worstLine.timestamp_ms,
          'bent elbows',
          'Your elbows softened during the hold.',
          'Lock your elbows and press tall.',
          0.68
        )
      )
    }
  }

  const chosenFaults = chooseTopFaults(faults)

  return {
    source: `local_handstand_line_v1_${modelLabel}`,
    analysis_model: 'handstand_line_rules_v1',
    total_reps: totalReps,
    tracked_frames: rawSamples.length,
    usable_frames: samples.length,
    motion_active_ratio: Number((activeSamples.length / Math.max(1, samples.length)).toFixed(2)),
    average_confidence: Number(
      (average(samples.map((sample) => sample.confidence)) || 0).toFixed(2)
    ),
    faults: chosenFaults,
    frames: lineSamples.map((sample) => {
      const inStableHold =
        activeSamples.length > 0 &&
        sample.timestamp_ms >= activeSamples[0].timestamp_ms &&
        sample.timestamp_ms <= activeSamples[activeSamples.length - 1].timestamp_ms

      return {
      timestamp_ms: Number(sample.timestamp_ms.toFixed(1)),
      phase: inStableHold ? 'hold' : 'kickup',
      knee_angle: Number(sample.knee_angle.toFixed(1)),
      handstand_line: sample.handstand_line,
      points: sample.points
      }
    }),
    reps:
      totalReps && worstLine
        ? [
            {
              rep: 1,
              timestamp_start: activeSamples[0].timestamp_ms / 1000,
              timestamp_end: activeSamples[activeSamples.length - 1].timestamp_ms / 1000,
              worst_stack_score: worstLine.handstand_line.stack_score,
              shoulder_offset: worstLine.handstand_line.shoulder_offset,
              hip_offset: worstLine.handstand_line.hip_offset
            }
          ]
        : [],
    guidance:
      totalReps === 0
        ? 'Keep wrists, shoulders, hips, and ankles visible from the side.'
        : 'Local handstand line metrics were used for alignment overlays.'
  }
}

export async function createPoseAnalyzer(exercise = 'squat') {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL)
  let landmarker = null
  let modelLabel = MODEL_VARIANTS[0].label

  for (const variant of MODEL_VARIANTS) {
    for (const delegate of ['GPU', 'CPU']) {
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: variant.url,
            delegate
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45
        })
        modelLabel = `${variant.label}_${delegate.toLowerCase()}`
        break
      } catch (error) {
        console.warn(`Pose model failed (${variant.label}, ${delegate}):`, error)
      }
    }

    if (landmarker) break
  }

  if (!landmarker) {
    throw new Error('No pose landmarker model could be loaded')
  }

  let startedAt = 0
  let samples = []

  return {
    reset() {
      startedAt = performance.now()
      samples = []
    },

    sample(video) {
      if (!video || video.readyState < 2 || !startedAt) return

      const result = landmarker.detectForVideo(video, performance.now())
      const landmarks = result.landmarks?.[0]
      if (!landmarks) return

      const metrics = deriveMetrics(landmarks, performance.now() - startedAt)
      if (metrics) {
        samples.push(metrics)
      }
    },

    finish() {
      if (exercise === 'handstand') {
        return analyzeHandstandSamples(samples, modelLabel)
      }

      return analyzeSamples(samples, modelLabel)
    },

    close() {
      landmarker.close()
    }
  }
}

export function createSquatPoseAnalyzer() {
  return createPoseAnalyzer('squat')
}
