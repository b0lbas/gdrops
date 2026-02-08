import { h, btn } from "../ui.js";
import { nav } from "../router.js";
import { getQuiz, putQuiz, listTopicsByQuiz, calcTopicProgress, listItemsByQuiz } from "../db.js";

export async function QuizScreen(ctx, quizId){
  const quiz = await getQuiz(quizId);
  if (!quiz) return h("div", { class:"wrap" }, h("div",{class:"sub"},"missing"));

  const topics = await listTopicsByQuiz(quizId);

  const top = h("div", { class:"topbar" },
    h("div", { class:"row" },
      btn("←", ()=>nav("/"), "btn"),
      h("div", {},
        h("div", { class:"title" }, quiz.title || "Quiz"),
      )
    ),
    h("div", { class:"row", style:"justify-content:space-between;" },
      h("div", { class:"row" },
        btn("Dojo", ()=>nav(`/practice`, { quizId, mode:"dojo", autostart:"1" })),
      ),
      h("div", { class:"row" },
        btn("Edit", ()=>nav(`/quiz/${quizId}/edit`))
      )
    )
  );

  const topicList = h("div", { class:"list" });

  for (const t of topics){
    const prog = await calcTopicProgress(t.id);
    const row = h("button", { class:"cardBtn", onclick: ()=>nav(`/practice`, { quizId, topicId: t.id, mode:"topic", autostart:"1" }) },
      h("div", { class:"row", style:"justify-content:space-between;" },
        h("div", {},
          h("div", { class:"title" }, t.title || "Topic"),
          h("div", { class:"sub" }, `${prog.mastered}/${prog.total}`)
        ),
        h("div", { class:"sub" }, "›")
      ),
      h("div", { class:"progress" }, h("div", { style:`width:${Math.round((prog.pct||0)*100)}%` }))
    );
    topicList.appendChild(row);
  }

  if (!topics.length){
    topicList.appendChild(h("div", { class:"card" }, h("div", { class:"sub" }, "no topics")));
  }

  return h("div", { class:"wrap" }, top, topicList);
}
