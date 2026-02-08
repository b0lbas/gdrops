import { h, btn, modal, toast } from "../ui.js";
import { listQuizzes, genId, putQuiz, touchQuiz } from "../db.js";
import { nav } from "../router.js";
import { importQuizFromFile } from "../exportImport.js";

export async function HomeScreen(ctx){
  const quizzes = await listQuizzes();

  const top = h("div", { class:"topbar" },
    h("div", { class:"title" }, "GeoDrops"),
    h("div", { class:"row" },
      btn("New", async ()=>{
        const id = genId();
        await putQuiz(touchQuiz({ id, title:"New quiz", createdAt: Date.now(), updatedAt: Date.now() }));
        nav(`/quiz/${id}`);
      }),
      btn("Import", ()=>openImport())
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
          }, "btn")
        )
      )
    );
    m = modal(node);
    document.body.appendChild(m.back);
  }

  return h("div", { class:"wrap" }, top, list);
}
