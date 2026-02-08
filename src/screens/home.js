import { h, btn } from "../ui.js";
import { listQuizzes, genId, putQuiz, touchQuiz } from "../db.js";
import { nav } from "../router.js";

export async function HomeScreen(ctx){
  const quizzes = await listQuizzes();

  const top = h("div", { class:"topbar" },
    h("div", { class:"title" }, "GeoDrops"),
    h("div", { class:"row" },
      btn("New", async ()=>{
        const id = genId();
        await putQuiz(touchQuiz({ id, title:"New quiz", createdAt: Date.now(), updatedAt: Date.now() }));
        nav(`/quiz/${id}`);
      })
    )
  );

  const list = h("div", { class:"list" },
    quizzes.map(q => h("button", { class:"cardBtn", onclick: ()=>nav(`/quiz/${q.id}`) },
      h("div", { class:"row", style:"justify-content:space-between;" },
        h("div", {}, h("div", {class:"title"}, q.title || "Quiz"), h("div",{class:"sub"}, new Date(q.updatedAt||q.createdAt||Date.now()).toLocaleDateString())),
        h("div", { class:"sub" }, "›")
      )
    ))
  );

  if (!quizzes.length){
    list.appendChild(h("div", { class:"card" }, h("div", { class:"sub" }, "empty")));
  }

  return h("div", { class:"wrap" }, top, list);
}
