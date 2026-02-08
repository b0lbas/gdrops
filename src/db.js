const DB_NAME = "geodrops";
const DB_VERSION = 1;
const APP_SCHEMA_VERSION = 1;

let _db = null;
let _subs = new Set();

function notify() { for (const fn of _subs) try{ fn(); } catch {} }

export function subscribe(fn){
  _subs.add(fn);
  return ()=>_subs.delete(fn);
}

export function genId() {
  return (crypto?.randomUUID ? crypto.randomUUID() : ("id_"+Math.random().toString(16).slice(2)+Date.now().toString(16)));
}

function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("quizzes")) {
        const s = db.createObjectStore("quizzes", { keyPath: "id" });
        s.createIndex("byUpdatedAt", "updatedAt");
      }

      if (!db.objectStoreNames.contains("topics")) {
        const s = db.createObjectStore("topics", { keyPath: "id" });
        s.createIndex("byQuizId", "quizId");
      }

      if (!db.objectStoreNames.contains("items")) {
        const s = db.createObjectStore("items", { keyPath: "id" });
        s.createIndex("byQuizId", "quizId");
        s.createIndex("byTopicId", "topicId");
        s.createIndex("byDueAt", "dueAt");
      }
    };
    req.onsuccess = async () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db=null; };
      try {
        // ensure meta schema
        const meta = await getMeta("schemaVersion");
        if (!meta) await setMeta("schemaVersion", APP_SCHEMA_VERSION);
      } catch {}
      resolve(_db);
    };
    req.onerror = () => reject(req.error || new Error("db"));
  });
}

function tx(storeNames, mode="readonly") {
  return openDb().then(db => db.transaction(storeNames, mode));
}

function reqToPromise(req){
  return new Promise((resolve, reject)=> {
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error || new Error("req"));
  });
}

async function getMeta(key){
  const t = await tx(["meta"], "readonly");
  const s = t.objectStore("meta");
  const res = await reqToPromise(s.get(key));
  return res ? res.value : null;
}
async function setMeta(key, value){
  const t = await tx(["meta"], "readwrite");
  const s = t.objectStore("meta");
  await reqToPromise(s.put({key, value}));
}

export async function initDb() {
  await openDb();
  await migrateIfNeeded();
}

async function migrateIfNeeded(){
  const v = await getMeta("schemaVersion");
  if (v === null || v === undefined) {
    await setMeta("schemaVersion", APP_SCHEMA_VERSION);
    return;
  }
  if (v === APP_SCHEMA_VERSION) return;

  // simple forward migrations stub
  // future: add switch cases here
  await setMeta("schemaVersion", APP_SCHEMA_VERSION);
}

export async function listQuizzes() {
  const t = await tx(["quizzes"], "readonly");
  const s = t.objectStore("quizzes").index("byUpdatedAt");
  const all = await reqToPromise(s.getAll());
  return all.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
}

export async function getQuiz(id){
  const t = await tx(["quizzes"], "readonly");
  return reqToPromise(t.objectStore("quizzes").get(id));
}

export async function putQuiz(quiz){
  const t = await tx(["quizzes"], "readwrite");
  await reqToPromise(t.objectStore("quizzes").put(quiz));
  notify();
}

export async function deleteQuiz(id){
  const t = await tx(["quizzes","topics","items"], "readwrite");
  await reqToPromise(t.objectStore("quizzes").delete(id));

  // cascade delete topics/items
  const topics = await reqToPromise(t.objectStore("topics").index("byQuizId").getAll(id));
  for (const tp of topics) await reqToPromise(t.objectStore("topics").delete(tp.id));
  const items = await reqToPromise(t.objectStore("items").index("byQuizId").getAll(id));
  for (const it of items) await reqToPromise(t.objectStore("items").delete(it.id));

  notify();
}

export async function listTopicsByQuiz(quizId){
  const t = await tx(["topics"], "readonly");
  const all = await reqToPromise(t.objectStore("topics").index("byQuizId").getAll(quizId));
  return all.sort((a,b)=>(a.order||0)-(b.order||0));
}

export async function getTopic(id){
  const t = await tx(["topics"], "readonly");
  return reqToPromise(t.objectStore("topics").get(id));
}

export async function putTopic(topic){
  const t = await tx(["topics"], "readwrite");
  await reqToPromise(t.objectStore("topics").put(topic));
  notify();
}

export async function deleteTopic(topicId){
  const t = await tx(["topics","items"], "readwrite");
  const topic = await reqToPromise(t.objectStore("topics").get(topicId));
  if (!topic) return;
  await reqToPromise(t.objectStore("topics").delete(topicId));
  // delete items in topic
  const items = await reqToPromise(t.objectStore("items").index("byTopicId").getAll(topicId));
  for (const it of items) await reqToPromise(t.objectStore("items").delete(it.id));
  notify();
}

export async function listItemsByTopic(topicId){
  const t = await tx(["items"], "readonly");
  const all = await reqToPromise(t.objectStore("items").index("byTopicId").getAll(topicId));
  return all;
}

export async function listItemsByQuiz(quizId){
  const t = await tx(["items"], "readonly");
  const all = await reqToPromise(t.objectStore("items").index("byQuizId").getAll(quizId));
  return all;
}

export async function getItem(id){
  const t = await tx(["items"], "readonly");
  return reqToPromise(t.objectStore("items").get(id));
}

export async function putItem(item){
  const t = await tx(["items"], "readwrite");
  await reqToPromise(t.objectStore("items").put(item));
  notify();
}

export async function deleteItem(id){
  const t = await tx(["items"], "readwrite");
  await reqToPromise(t.objectStore("items").delete(id));
  notify();
}

export async function getDueItems(quizId, nowMs){
  const all = await listItemsByQuiz(quizId);
  return all.filter(it => (it.dueAt ?? 0) <= nowMs && (it.repetitions ?? 0) > 0);
}

export async function countItemsByTopic(topicId){
  const all = await listItemsByTopic(topicId);
  return all.length;
}

export async function calcTopicProgress(topicId){
  const items = await listItemsByTopic(topicId);
  if (!items.length) return { mastered:0, total:0, pct:0 };
  const mastered = items.filter(it => (it.masteredHits||0) >= 10).length;
  return { mastered, total: items.length, pct: mastered / items.length };
}

export function defaultSrs(){
  const now = Date.now();
  return {
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueAt: now,
    lastReviewedAt: 0,
    masteredHits: 0
  };
}

export function touchQuiz(quiz){
  const now = Date.now();
  quiz.updatedAt = now;
  if (!quiz.createdAt) quiz.createdAt = now;
  return quiz;
}

export { APP_SCHEMA_VERSION };
