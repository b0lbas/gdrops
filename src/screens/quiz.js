import { h, btn, modal, toast, pillGroup } from "../ui.js";
import { nav } from "../router.js";
import { getQuiz, putQuiz, listTopicsByQuiz, calcTopicProgress, listItemsByQuiz } from "../db.js";
import { exportQuizToFile, importQuizFromFile } from "../exportImport.js";

export async function QuizScreen(ctx, quizId){
  const quiz = await getQuiz(quizId);
  if (!quiz) return h("div", { class:"wrap" }, h("div",{class:"sub"},"missing"));

  const MIN_KEY = "geodrops:lastMinutes";
  let minutes = parseInt(localStorage.getItem(MIN_KEY) || "5", 10) || 5;
  if (![2,5,10].includes(minutes)) minutes = 5;

  const topics = await listTopicsByQuiz(quizId);

  const pills = pillGroup([{value:"2",label:"2"},{value:"5",label:"5"},{value:"10",label:"10"}], String(minutes), (v)=>{
    minutes = parseInt(v, 10);
    localStorage.setItem(MIN_KEY, String(minutes));
    // quick UI update
    [...pills.children].forEach(b=>b.classList.toggle("on", b.textContent===String(minutes)));
  });

  const top = h("div", { class:"topbar" },
    h("div", { class:"row" },
      btn("←", ()=>nav("/"), "btn"),
      h("div", {},
        h("div", { class:"title" }, quiz.title || "Quiz"),
      )
    ),
    h("div", { class:"row", style:"justify-content:space-between;" },
      h("div", { class:"row" },
        pills,
        btn("Dojo", ()=>nav(`/practice`, { quizId, mode:"dojo", minutes:String(minutes), autostart:"1" })),
      ),
      h("div", { class:"row" },
        btn("Edit", ()=>nav(`/quiz/${quizId}/edit`)),
        btn("Export", ()=>exportQuizToFile(quizId), "btn"),
        btn("Import", ()=>openImport(), "btn")
      )
    )
  );

  const topicList = h("div", { class:"list" });

  for (const t of topics){
    const prog = await calcTopicProgress(t.id);
    const row = h("button", { class:"cardBtn", onclick: ()=>nav(`/practice`, { quizId, topicId: t.id, mode:"topic", minutes:String(minutes), autostart:"1" }) },
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

  function openImport(){
    let m = null;
    const node = h("div", {},
      h("div", { class:"row" },
        h("div", { class:"title" }, "Import"),
        btn("×", ()=>m.close(), "btn ghost")
      ),
      h("div", { class:"col", style:"margin-top:10px;" },
        h("input", { id:"f", type:"file", class:"input", accept:".json,application/json" }),
        h("div", { class:"row" },
          btn("Merge", async ()=>{
            const inp = node.querySelector("#f");
            const f = inp.files?.[0];
            if (!f) return toast("file");
            await importQuizFromFile(f, "merge");
            m.close();
          }),
          btn("Copy", async ()=>{
            const inp = node.querySelector("#f");
            const f = inp.files?.[0];
            if (!f) return toast("file");
            await importQuizFromFile(f, "copy");
            m.close();
          })
        )
      )
    );
    m = modal(node);
    document.body.appendChild(m.back);
  }

  return h("div", { class:"wrap" }, top, topicList);
}
