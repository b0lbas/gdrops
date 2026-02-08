import "../styles.css";
import { mount } from "./ui.js";
import { parseHash, routeMatch } from "./router.js";
import { initDb, subscribe } from "./db.js";
import { ensureSeed } from "./seed.js";
import { exportQuizToFile } from "./exportImport.js";

import { HomeScreen } from "./screens/home.js";
import { QuizScreen } from "./screens/quiz.js";
import { EditorScreen } from "./screens/editor.js";
import { PracticeScreen } from "./screens/practice.js";

const root = document.getElementById("app");

const state = {
  editorTopicId: null
};

const ctx = {
  state,
  refresh: () => render(),
  actions: {
    exportQuiz: exportQuizToFile
  }
};

async function render(){
  const { path, query } = parseHash();

  let node = null;

  // routes
  if (path === "/" || path === ""){
    node = await HomeScreen(ctx);
  } else {
    const mQuiz = routeMatch(path, "/quiz/:id");
    const mEdit = routeMatch(path, "/quiz/:id/edit");
    const mPractice = routeMatch(path, "/practice");

    if (mEdit){
      node = await EditorScreen(ctx, mEdit.id);
    } else if (mQuiz){
      node = await QuizScreen(ctx, mQuiz.id);
    } else if (path === "/practice"){
      node = await PracticeScreen(ctx, query);
    } else {
      node = await HomeScreen(ctx);
    }
  }

  mount(root, node);
}

async function boot(){
  await initDb();
  await ensureSeed();

  subscribe(() => {
    if (state.practiceActive) return;
    render();
  });
  window.addEventListener("hashchange", () => render());
  if (!location.hash) location.hash = "#/";
  await render();
}

boot();
