import { listQuizzes, genId, putQuiz, putTopic, putItem, touchQuiz, defaultSrs } from "./db.js";
import seedGenerated from "./seed.generated.json";

export async function ensureSeed() {
  const quizzes = await listQuizzes();
  if (quizzes.length) return;

  const quizId = genId();
  const topicId = genId();

  const genItems = Array.isArray(seedGenerated?.items) ? seedGenerated.items : [];
  if (!genItems.length) return;

  await putQuiz(touchQuiz({
    id: quizId,
    title: seedGenerated.quizTitle || "Quiz",
    createdAt: Date.now(),
    updatedAt: Date.now()
  }));

  await putTopic({
    id: topicId,
    quizId,
    title: seedGenerated.topicTitle || "Default",
    order: 0
  });

  for (const s of genItems){
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
