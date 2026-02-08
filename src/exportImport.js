import { APP_SCHEMA_VERSION, genId, defaultSrs, touchQuiz, putQuiz, putTopic, putItem, getQuiz, listTopicsByQuiz, listItemsByQuiz } from "./db.js";
import { toast } from "./ui.js";

export async function exportQuizToFile(quizId) {
  const quiz = await getQuiz(quizId);
  if (!quiz) return;
  const topics = await listTopicsByQuiz(quizId);
  const items = await listItemsByQuiz(quizId);

  const payload = {
    schemaVersion: APP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    quiz,
    topics,
    items
  };

  const name = safeFileName((quiz.title || "quiz") + ".geodrops.json");
  downloadJson(payload, name);
  toast("export");
}

export async function importQuizFromFile(file, mode="merge") {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { toast("bad"); return; }
  const err = validate(data);
  if (err) { toast("bad"); return; }

  if (mode === "copy") return importCopy(data);
  return importMerge(data);
}

function validate(data){
  if (!data || typeof data !== "object") return "bad";
  if (typeof data.schemaVersion !== "number") return "bad";
  if (!data.quiz || typeof data.quiz !== "object") return "bad";
  if (!Array.isArray(data.topics) || !Array.isArray(data.items)) return "bad";
  return null;
}

async function importMerge(data){
  await putQuiz(touchQuiz(data.quiz));
  for (const t of data.topics) await putTopic(t);
  for (const it of data.items) await putItem(it);
  toast("import");
}

async function importCopy(data){
  const oldQuiz = data.quiz;
  const newQuizId = genId();

  const quiz = { ...oldQuiz, id: newQuizId, title: (oldQuiz.title || "Quiz") + " (copy)", createdAt: Date.now(), updatedAt: Date.now() };
  await putQuiz(quiz);

  const topicMap = new Map();
  for (const t of data.topics) {
    const nid = genId();
    topicMap.set(t.id, nid);
    await putTopic({ ...t, id: nid, quizId: newQuizId });
  }

  for (const it of data.items) {
    const nid = genId();
    const base = { ...it, id: nid, quizId: newQuizId, topicId: topicMap.get(it.topicId) || null };
    // reset SRS
    const s = defaultSrs();
    await putItem({ ...base, ...s });
  }
  toast("import");
}

function downloadJson(obj, filename){
  const blob = new Blob([JSON.stringify(obj)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 800);
}

function safeFileName(name){
  return name.replace(/[\\\/:*?"<>|]+/g, "_");
}
