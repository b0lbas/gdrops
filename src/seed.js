import { listQuizzes, genId, putQuiz, putTopic, putItem, touchQuiz, defaultSrs } from "./db.js";

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
        if (data && Array.isArray(data.items)) out.push(data);
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function ensureSeed() {
  const quizzes = await listQuizzes();
  if (quizzes.length) return;

  const seeds = await loadSeedQuizzes();
  const usable = seeds.filter(s => Array.isArray(s.items) && s.items.length);
  if (!usable.length) return;

  for (const seed of usable){
    const quizId = genId();
    const topicId = genId();

    await putQuiz(touchQuiz({
      id: quizId,
      title: seed.quizTitle || "Quiz",
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));

    await putTopic({
      id: topicId,
      quizId,
      title: seed.topicTitle || "Default",
      order: 0
    });

    for (const s of seed.items){
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
  }
}
