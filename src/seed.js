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
    if (!idxRes.ok) return { folders: [], seeds: [] };
    const idx = await idxRes.json();
    const folders = Array.isArray(idx?.folders) ? idx.folders : [];
    const files = Array.isArray(idx?.files) ? idx.files : [];
    const out = [];
    for (const f of files){
      const path = typeof f === "string" ? f : f.path;
      const folder = typeof f === "object" ? f.folder : null;
      const subfolder = typeof f === "object" ? f.subfolder : null;
      try {
        const res = await fetch("/" + String(path).replace(/^\/+/, ""));
        if (!res.ok) continue;
        const data = await res.json();
        if (data && Array.isArray(data.items)) out.push({ file: String(path), folder, subfolder, data });
      } catch {}
    }
    return { folders, seeds: out };
  } catch {
    return { folders: [], seeds: [] };
  }
}

export async function ensureSeed() {
  const quizzes = await listQuizzes();
  const existingTitles = new Set(quizzes.map(q => (q.title || "").trim().toLowerCase()).filter(Boolean));
  const seeded = loadSeededSet();

  const { folders, seeds } = await loadSeedQuizzes();
  const usable = seeds.filter(s => Array.isArray(s.data?.items) && s.data.items.length);
  if (!usable.length) return;

  // Save folders to localStorage for HomeScreen
  try {
    localStorage.setItem("geodrops:folders", JSON.stringify(folders));
  } catch {}

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

    const disabledTypes = Array.isArray(seed.data.disabledTypes) ? seed.data.disabledTypes : undefined;

    await putQuiz(touchQuiz({
      id: quizId,
      title: seed.data.quizTitle || "Quiz",
      folder: seed.folder || null,
      subfolder: seed.subfolder || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(disabledTypes ? { disabledTypes } : {})
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
        promptText: s.promptText || null,
        promptImage: s.promptImage || null,
        answerText: s.answerText || null,
        answerImage: s.answerImage || null,
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
