import { listQuizzes, genId, putQuiz, putTopic, putItem, touchQuiz, defaultSrs } from "./db.js";

function svgData(svg){
  const s = svg.replace(/\s+/g," ").trim();
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}

export async function ensureSeed() {
  const quizzes = await listQuizzes();
  if (quizzes.length) return;

  const quizId = genId();
  const topicId = genId();

  await putQuiz(touchQuiz({
    id: quizId,
    title: "Spain provinces",
    createdAt: Date.now(),
    updatedAt: Date.now()
  }));

  await putTopic({
    id: topicId,
    quizId,
    title: "Mixed",
    order: 0
  });

  const samples = [
    { name:"Barcelona", flag: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#c00"/><rect y="40" width="320" height="40" fill="#ffd24d"/><rect y="120" width="320" height="40" fill="#ffd24d"/></svg>`) },
    { name:"Madrid", flag: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#7b0000"/><rect x="140" y="70" width="40" height="60" fill="#fff"/></svg>`) },
    { name:"Valencia", flag: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#ffd24d"/><rect y="0" width="320" height="60" fill="#e00000"/><rect y="140" width="320" height="60" fill="#2f8f2f"/></svg>`) },
    { name:"Sevilla", flag: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#fff"/><rect x="0" width="80" height="200" fill="#2f8f2f"/><rect x="240" width="80" height="200" fill="#2f8f2f"/></svg>`) },
    { name:"Zaragoza", flag: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#111"/><circle cx="160" cy="100" r="46" fill="#fff"/></svg>`) },
    { name:"Bilbao", flag: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#003a8c"/><path d="M0,0 L320,200" stroke="#fff" stroke-width="28"/><path d="M320,0 L0,200" stroke="#fff" stroke-width="28"/></svg>`) },
  ];

  // 3 items: text -> image (promptText, answerImage)
  for (let i=0;i<3;i++){
    const s = samples[i];
    await putItem({
      id: genId(),
      quizId,
      topicId,
      promptText: s.name,
      promptImage: null,
      answerText: null,
      answerImage: s.flag,
      altAnswers: [s.name.toLowerCase()],
      tags: { country:"ES", subdivisionType:"province", script:"latin" },
      ...defaultSrs()
    });
  }

  // 3 items: image -> text (promptImage, answerText)
  for (let i=3;i<6;i++){
    const s = samples[i];
    await putItem({
      id: genId(),
      quizId,
      topicId,
      promptText: null,
      promptImage: s.flag,
      answerText: s.name,
      answerImage: null,
      altAnswers: [s.name.toLowerCase()],
      tags: { country:"ES", subdivisionType:"province", script:"latin" },
      ...defaultSrs()
    });
  }
}
