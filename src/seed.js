import { listQuizzes, genId, putQuiz, putTopic, putItem, touchQuiz, defaultSrs } from "./db.js";

const SEEDED_KEY = "geodrops:seededSeedFiles";

function loadSeededSet(){
  try {
    const raw = localStorage.getItem(SEEDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(v => String(v)));
  } catch {
    return new Set();
  }
}

function saveSeededSet(set){
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify([...set]));
  } catch {}
}

async function loadSeedQuizzes(){
  try {
    const idxRes = await fetch("/seeds/index.json");
    if (!idxRes.ok) return [];
    const idx = await idxRes.json();
    const files = Array.isArray(idx?.files) ? idx.files : [];
    const out = [];
    for (const f of files){
      try {
        const res = await fetch("/" + String(f).replace(/^\/+/, ""));
        if (!res.ok) continue;
        const data = await res.json();
        if (data && Array.isArray(data.items)) out.push({ file: String(f), data });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function ensureSeed() {
  const quizzes = await listQuizzes();
  const existingTitles = new Set(quizzes.map(q => (q.title || "").trim().toLowerCase()).filter(Boolean));
  const seeded = loadSeededSet();

  const seeds = await loadSeedQuizzes();
  const usable = seeds.filter(s => Array.isArray(s.data?.items) && s.data.items.length);
  if (!usable.length) return;

  let changed = false;

  for (const seed of usable){
    const key = seed.file;
    if (seeded.has(key)) continue;

    const title = (seed.data.quizTitle || "").trim().toLowerCase();
    if (title && existingTitles.has(title)) {
      seeded.add(key);
      changed = true;
      continue;
    }

    const quizId = genId();
    const topicId = genId();

    await putQuiz(touchQuiz({
      id: quizId,
      title: seed.data.quizTitle || "Quiz",
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));

    await putTopic({
      id: topicId,
      quizId,
      title: seed.data.topicTitle || "Default",
      order: 0
    });

    for (const s of seed.data.items){
      await putItem({
        id: genId(),
        quizId,
        topicId,
        promptText: null,
        promptImage: s.promptImage || null,
        answerText: s.answerText || null,
        answerImage: null,
        altAnswers: s.altAnswers && s.altAnswers.length ? s.altAnswers : [String(s.answerText||"").toLowerCase()],
        tags: s.tags || { country:"", subdivisionType:"", script:"" },
        ...defaultSrs()
      });
    }

    seeded.add(key);
    changed = true;
  }

  if (changed) saveSeededSet(seeded);
}
