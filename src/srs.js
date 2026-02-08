import { clamp } from "./ui.js";

export function updateSrs(item, { correct, quality=null }) {
  const now = Date.now();
  const q = quality ?? (correct ? 4 : 2);

  let repetitions = item.repetitions ?? 0;
  let intervalDays = item.intervalDays ?? 0;
  let easeFactor = item.easeFactor ?? 2.5;
  let masteredHits = item.masteredHits ?? 0;

  if (correct) {
    // SM-2-ish EF update
    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    easeFactor = clamp(easeFactor, 1.3, 2.8);

    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);

    repetitions += 1;
    masteredHits += 1;
  } else {
    // reset
    repetitions = 0;
    intervalDays = 1;
    easeFactor = clamp(easeFactor - 0.2, 1.3, 2.8);
    masteredHits = Math.max(0, masteredHits - 1);
  }

  item.repetitions = repetitions;
  item.intervalDays = intervalDays;
  item.easeFactor = easeFactor;
  item.lastReviewedAt = now;
  item.dueAt = now + intervalDays * 86400000;
  item.masteredHits = masteredHits;

  return item;
}

export function isNew(item){ return (item.repetitions ?? 0) === 0; }
export function isDue(item, nowMs){ return (item.dueAt ?? 0) <= nowMs && !isNew(item); }
export function isMastered(item){ return (item.masteredHits ?? 0) >= 10; }
