import { h, btn, input, textarea, select, filePicker, readFileAsDataURL, modal, toast, pillGroup } from "../ui.js";
import { nav } from "../router.js";
import { getQuiz, putQuiz, touchQuiz, deleteQuiz, listTopicsByQuiz, putTopic, deleteTopic, listItemsByTopic, putItem, deleteItem, genId, defaultSrs } from "../db.js";

export async function EditorScreen(ctx, quizId){
  const quiz = await getQuiz(quizId);
  if (!quiz) return h("div", { class:"wrap" }, h("div",{class:"sub"},"missing"));

  const topics = await listTopicsByQuiz(quizId);
  const state = ctx.state;
  let selectedTopicId = state.editorTopicId || (topics[0]?.id || null);
  if (selectedTopicId && !topics.find(t=>t.id===selectedTopicId)) selectedTopicId = topics[0]?.id || null;
  state.editorTopicId = selectedTopicId;

  const top = h("div", { class:"topbar" },
    h("div", { class:"row" },
      btn("←", ()=>nav(`/quiz/${quizId}`), "btn"),
      h("div", { class:"title" }, "Edit")
    ),
    h("div", { class:"row" },
      btn("Name", ()=>renameQuiz()),
      btn("Topic", ()=>addTopic()),
      btn("×", ()=>dangerMenu(), "btn danger")
    )
  );

  const topicList = h("div", { class:"list" });
  for (const t of topics){
    topicList.appendChild(h("button", {
      class:"cardBtn",
      onclick: ()=>{ state.editorTopicId = t.id; ctx.refresh(); }
    },
      h("div", { class:"row", style:"justify-content:space-between;" },
        h("div", {},
          h("div", { class:"title" }, t.title || "Topic")
        ),
        h("div", { class:"sub" }, (t.id === selectedTopicId) ? "•" : " ")
      )
    ));
  }
  if (!topics.length){
    topicList.appendChild(h("div", { class:"card" }, h("div", { class:"sub" }, "no topics")));
  }

  const itemsWrap = h("div", { class:"list" });
  if (selectedTopicId){
    const items = await listItemsByTopic(selectedTopicId);
    itemsWrap.appendChild(h("div", { class:"row", style:"justify-content:space-between;align-items:center;" },
      h("div", { class:"title" }, "Items"),
      btn("New", ()=>addItem(selectedTopicId))
    ));
    if (!items.length){
      itemsWrap.appendChild(h("div", { class:"card" }, h("div", { class:"sub" }, "empty")));
    } else {
      for (const it of items){
        itemsWrap.appendChild(h("button", { class:"cardBtn", onclick: ()=>editItem(it) },
          h("div", { class:"row", style:"justify-content:space-between;" },
            h("div", {},
              h("div", { class:"title" }, preview(it)),
              h("div", { class:"sub" }, it.answerText ? it.answerText : (it.answerImage ? "image" : ""))
            ),
            h("div", { class:"sub" }, "›")
          )
        ));
      }
    }
  }

  function preview(it){
    if (it.promptText) return it.promptText;
    if (it.promptImage) return "image";
    return "item";
  }

  function renameQuiz(){
    let name = quiz.title || "";
    let m=null;
    const node = h("div", {},
      h("div", { class:"row" },
        h("div", { class:"title" }, "Name"),
        btn("×", ()=>m.close(), "btn ghost")
      ),
      h("div", { class:"col", style:"margin-top:10px;" },
        input(name, (v)=>name=v, "title"),
        h("div", { class:"row" },
          btn("Save", async ()=>{
            quiz.title = (name||"").trim() || "Quiz";
            await putQuiz(touchQuiz(quiz));
            m.close();
            ctx.refresh();
          })
        )
      )
    );
    m = modal(node);
    document.body.appendChild(m.back);
  }

  function addTopic(){
    let title = "";
    let m=null;
    const node = h("div", {},
      h("div", { class:"row" },
        h("div", { class:"title" }, "Topic"),
        btn("×", ()=>m.close(), "btn ghost")
      ),
      h("div", { class:"col", style:"margin-top:10px;" },
        input(title, (v)=>title=v, "title"),
        h("div", { class:"row" },
          btn("Save", async ()=>{
            const order = topics.length ? Math.max(...topics.map(t=>t.order||0))+1 : 0;
            const id = genId();
            await putTopic({ id, quizId, title: (title||"").trim() || "Topic", order });
            ctx.state.editorTopicId = id;
            m.close();
            ctx.refresh();
          })
        )
      )
    );
    m = modal(node);
    document.body.appendChild(m.back);
  }

  function dangerMenu(){
    let m=null;
    const node = h("div", {},
      h("div", { class:"row" },
        h("div", { class:"title" }, "Danger"),
        btn("×", ()=>m.close(), "btn ghost")
      ),
      h("div", { class:"col", style:"margin-top:10px;" },
        selectedTopicId ? btn("Del topic", async ()=>{
          await deleteTopic(selectedTopicId);
          ctx.state.editorTopicId = null;
          m.close(); ctx.refresh();
        }, "btn danger") : null,
        btn("Del quiz", async ()=>{
          // confirm
          await deleteQuiz(quizId);
          m.close();
          nav("/", null, true);
        }, "btn danger")
      )
    );
    m = modal(node);
    document.body.appendChild(m.back);
  }

  function addItem(topicId){
    const it = {
      id: genId(),
      quizId,
      topicId,
      promptText: "",
      promptImage: null,
      answerText: "",
      answerImage: null,
      altAnswers: [],
      tags: { country:"", subdivisionType:"", script:"" },
      ...defaultSrs()
    };
    editItem(it, true);
  }

  function editItem(item, isNew=false){
    let promptType = item.promptImage ? "image" : "text";
    let answerType = item.answerImage ? "image" : "text";
    let promptText = item.promptText || "";
    let answerText = item.answerText || "";
    let promptImage = item.promptImage || null;
    let answerImage = item.answerImage || null;
    let alt = (item.altAnswers || []).join("\n");
    let country = item.tags?.country || "";
    let subdivisionType = item.tags?.subdivisionType || "";
    let script = item.tags?.script || "";

    let m=null;

    const promptPills = pillGroup([{value:"text",label:"T"},{value:"image",label:"I"}], promptType, (v)=>{ promptType=v; renderFields(); });
    const answerPills = pillGroup([{value:"text",label:"T"},{value:"image",label:"I"}], answerType, (v)=>{ answerType=v; renderFields(); });

    const fields = h("div", { class:"col", style:"margin-top:10px;" });

    function renderFields(){
      fields.innerHTML="";
      fields.appendChild(h("div",{class:"row",style:"justify-content:space-between;"}, h("div",{class:"sub"},"prompt"), promptPills));
      if (promptType==="text"){
        fields.appendChild(input(promptText, (v)=>promptText=v, "text"));
      } else {
        fields.appendChild(h("div",{class:"col"},
          filePicker(async (f)=>{ promptImage = await readFileAsDataURL(f); toast("img"); renderFields(); }, "image/*"),
          input(promptImage||"", (v)=>promptImage=v || null, "dataurl"),
          promptImage ? h("img",{src:promptImage, alt:"", style:"max-height:120px;object-fit:contain;border:1px solid var(--line);border-radius:10px;padding:8px;"}) : null
        ));
      }

      fields.appendChild(h("div",{class:"row",style:"justify-content:space-between;"}, h("div",{class:"sub"},"answer"), answerPills));
      if (answerType==="text"){
        fields.appendChild(input(answerText, (v)=>answerText=v, "text"));
      } else {
        fields.appendChild(h("div",{class:"col"},
          filePicker(async (f)=>{ answerImage = await readFileAsDataURL(f); toast("img"); renderFields(); }, "image/*"),
          input(answerImage||"", (v)=>answerImage=v || null, "dataurl"),
          answerImage ? h("img",{src:answerImage, alt:"", style:"max-height:120px;object-fit:contain;border:1px solid var(--line);border-radius:10px;padding:8px;"}) : null
        ));
      }

      fields.appendChild(h("div",{class:"sub"},"alts"));
      fields.appendChild(textarea(alt, (v)=>alt=v, "one per line"));

      fields.appendChild(h("div",{class:"row"}, 
        h("div",{style:"flex:1"}, input(country,(v)=>country=v,"country")),
        h("div",{style:"flex:1"}, input(subdivisionType,(v)=>subdivisionType=v,"type")),
        h("div",{style:"flex:1"}, input(script,(v)=>script=v,"script"))
      ));

      fields.appendChild(h("div",{class:"row",style:"justify-content:space-between;"}, 
        btn("Save", async ()=>{
          const out = { ...item };
          out.promptText = promptType==="text" ? (promptText||"").trim() : null;
          out.promptImage = promptType==="image" ? promptImage : null;
          out.answerText = answerType==="text" ? (answerText||"").trim() : null;
          out.answerImage = answerType==="image" ? answerImage : null;
          out.altAnswers = (alt||"").split("\n").map(s=>s.trim()).filter(Boolean);
          out.tags = { country: (country||"").trim(), subdivisionType:(subdivisionType||"").trim(), script:(script||"").trim() };

          // basic validity: must have prompt and answer
          if (!(out.promptText || out.promptImage) || !(out.answerText || out.answerImage)) { toast("need"); return; }

          await putItem(out);
          m.close();
          ctx.refresh();
        }),
        !isNew ? btn("Del", async ()=>{ await deleteItem(item.id); m.close(); ctx.refresh(); }, "btn danger") : null
      ));
    }

    const node = h("div", {},
      h("div", { class:"row" },
        h("div", { class:"title" }, "Item"),
        btn("×", ()=>m.close(), "btn ghost")
      ),
      fields
    );
    renderFields();
    m = modal(node);
    document.body.appendChild(m.back);
  }

  return h("div", { class:"wrap" }, top, topicList, h("hr"), itemsWrap);
}
