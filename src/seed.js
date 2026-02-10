import { listQuizzes, genId, putQuiz, putTopic, putItem, touchQuiz, defaultSrs, deleteQuiz } from "./db.js";

const SEEDED_KEY = "geodrops:seededSeedFiles";
const MIGRATION_KEY = "geodrops:migration:india-subsubfolder";
const TITLES_VERSION_KEY = "geodrops:titlesVersion";
const CURRENT_TITLES_VERSION = 2; // Increment this to force re-seeding with new titles

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

// Migration: reset seeded quizzes when titles version changes
async function migrateTitlesVersion() {
  const storedVersion = parseInt(localStorage.getItem(TITLES_VERSION_KEY) || "0", 10);
  if (storedVersion >= CURRENT_TITLES_VERSION) return;
  
  // Delete all seeded quizzes and reset seeded set to re-import with new titles
  const quizzes = await listQuizzes();
  const seeded = loadSeededSet();
  
  for (const q of quizzes) {
    // Only delete quizzes that came from seeds (have folder set)
    if (q.folder) {
      await deleteQuiz(q.id);
    }
  }
  
  // Clear seeded set
  saveSeededSet(new Set());
  localStorage.setItem(TITLES_VERSION_KEY, String(CURRENT_TITLES_VERSION));
}

// Migration: fix old Indian quizzes that have subfolder="in-*" instead of subsubfolder
async function migrateIndiaQuizzes() {
  if (localStorage.getItem(MIGRATION_KEY)) return;
  
  const quizzes = await listQuizzes();
  const seeded = loadSeededSet();
  let changed = false;
  
  for (const q of quizzes) {
    // Old structure: folder="language", subfolder="in-hindi" (should be subfolder="in", subsubfolder="in-hindi")
    if (q.folder === "language" && q.subfolder && q.subfolder.startsWith("in-") && !q.subsubfolder) {
      // Delete old quiz so it can be re-seeded with correct structure
      await deleteQuiz(q.id);
      // Remove from seeded set so it gets re-created
      const seedFile = `seeds/${q.subfolder}-alphabet.json`;
      const seedFile2 = `seeds/${q.subfolder}-cities.json`;
      seeded.delete(seedFile);
      seeded.delete(seedFile2);
      changed = true;
    }
  }
  
  if (changed) {
    saveSeededSet(seeded);
  }
  
  localStorage.setItem(MIGRATION_KEY, "done");
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
      const subsubfolder = typeof f === "object" ? f.subsubfolder : null;
      try {
        const res = await fetch("/" + String(path).replace(/^\/+/, ""));
        if (!res.ok) continue;
        const data = await res.json();
        if (data && Array.isArray(data.items)) out.push({ file: String(path), folder, subfolder, subsubfolder, data });
      } catch {}
    }
    return { folders, seeds: out };
  } catch {
    return { folders: [], seeds: [] };
  }
}

export async function ensureSeed() {
  // Run migrations
  await migrateTitlesVersion();
  await migrateIndiaQuizzes();
  
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
      subsubfolder: seed.subsubfolder || null,
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
