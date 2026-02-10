import { h } from "../ui.js";
import { listQuizzes } from "../db.js";
import { nav } from "../router.js";

const FOLDER_ICONS = {
  language: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M4 5h7M7 4c0 4.846 0 7 .5 8"/><path d="M10 8.5c0 2.286-2 4.5-3.5 4.5S4 11.865 4 11q0-3 3-3c3 0 5 .57 5 2.857q0 2.286-2 3.143m2 6l4-9l4 9m-.9-2h-6.2"/></g></svg>`,
  divisions: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><path fill="currentColor" d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7A2.5 2.5 0 0 1 14 4.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 11.5zM4.5 3A1.5 1.5 0 0 0 3 4.5V5h4.5V3zm4 0v7H13V4.5A1.5 1.5 0 0 0 11.5 3zm4.5 8H8.5v2h3a1.5 1.5 0 0 0 1.5-1.5zm-5.5 2V6H3v5.5A1.5 1.5 0 0 0 4.5 13z"/></svg>`
};

function loadFolders(){
  try {
    const raw = localStorage.getItem("geodrops:folders");
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

export async function HomeScreen(ctx, query){
  const quizzes = await listQuizzes();
  const folders = loadFolders();

  // Current navigation state (3 levels)
  const currentFolder = query.get("folder") || null;
  const currentSubfolder = query.get("subfolder") || null;
  const currentSubsubfolder = query.get("subsubfolder") || null;

  const top = h("div", { class:"topbar" });

  // Build breadcrumb
  const breadcrumb = h("div", { class:"row", style:"margin-bottom:8px;" });
  
  if (currentSubsubfolder && currentSubfolder && currentFolder) {
    // Inside a language (level 3) - back goes to India
    breadcrumb.appendChild(h("button", { class:"btn ghost", onclick: ()=>nav("/", { folder: currentFolder, subfolder: currentSubfolder }) }, "Back"));
  } else if (currentSubfolder && currentFolder) {
    // Inside a country (level 2) - back goes to folder
    breadcrumb.appendChild(h("button", { class:"btn ghost", onclick: ()=>nav("/", { folder: currentFolder }) }, "Back"));
  } else if (currentFolder) {
    // Inside a folder (level 1) - back goes to home
    breadcrumb.appendChild(h("button", { class:"btn ghost", onclick: ()=>nav("/") }, "Back"));
  }

  const list = h("div", { class:"list" });

  if (!currentFolder && !currentSubfolder && !currentSubsubfolder) {
    // Root level - show main folders
    for (const folder of folders) {
      const iconHtml = FOLDER_ICONS[folder.id] || "";
      const iconEl = h("span", { class:"folderIcon" });
      iconEl.innerHTML = iconHtml;
      list.appendChild(h("button", { class:"cardBtn folderCard", onclick: ()=>nav("/", { folder: folder.id }) },
        h("div", { class:"row", style:"justify-content:space-between;align-items:center;" },
          h("div", { class:"row", style:"align-items:center;gap:14px;" },
            iconEl,
            h("div", { class:"folderName" }, folder.name)
          ),
          h("div", { class:"sub" }, "›")
        )
      ));
    }

    // Show uncategorized quizzes
    const uncategorized = quizzes.filter(q => !q.folder).sort((a,b) => (a.title||'').localeCompare(b.title||''));
    if (uncategorized.length) {
      list.appendChild(h("hr"));
      for (const q of uncategorized) {
        list.appendChild(h("button", { class:"cardBtn", onclick: ()=>nav(`/quiz/${q.id}`) },
          h("div", { class:"row", style:"justify-content:space-between;" },
            h("div", { class:"title" }, q.title || "Quiz"),
            h("div", { class:"sub" }, "›")
          )
        ));
      }
    }
  } else if (currentFolder && !currentSubfolder) {
    // Folder level - show subfolders (countries)
    const folderData = folders.find(f => f.id === currentFolder);
    if (folderData && folderData.subfolders) {
      for (const sub of folderData.subfolders) {
        const flag = h("span", { class: `fi fi-${sub.id}`, style: "margin-right:10px;" });
        list.appendChild(h("button", { class:"cardBtn countryCard", onclick: ()=>nav("/", { folder: currentFolder, subfolder: sub.id }) },
          h("div", { class:"row", style:"justify-content:space-between;align-items:center;" },
            h("div", { class:"row", style:"align-items:center;" },
              flag,
              h("div", { class:"countryName" }, sub.name)
            ),
            h("div", { class:"sub" }, "›")
          )
        ));
      }
    }
  } else if (currentFolder && currentSubfolder && !currentSubsubfolder) {
    // Subfolder level - check if it has children (nested folders) or quizzes
    const folderData = folders.find(f => f.id === currentFolder);
    const subfolderData = folderData?.subfolders?.find(s => s.id === currentSubfolder);
    
    if (subfolderData?.children) {
      // Has nested folders (like India with languages)
      for (const child of subfolderData.children) {
        const flag = h("span", { class: `fi fi-${currentSubfolder}`, style: "margin-right:10px;" });
        list.appendChild(h("button", { class:"cardBtn countryCard", onclick: ()=>nav("/", { folder: currentFolder, subfolder: currentSubfolder, subsubfolder: child.id }) },
          h("div", { class:"row", style:"justify-content:space-between;align-items:center;" },
            h("div", { class:"row", style:"align-items:center;" },
              flag,
              h("div", { class:"countryName" }, child.name)
            ),
            h("div", { class:"sub" }, "›")
          )
        ));
      }
    } else {
      // No children - show quizzes directly
      const folderQuizzes = quizzes.filter(q => q.folder === currentFolder && q.subfolder === currentSubfolder && !q.subsubfolder).sort((a,b) => (a.title||'').localeCompare(b.title||''));
      for (const q of folderQuizzes) {
        list.appendChild(h("button", { class:"cardBtn", onclick: ()=>nav(`/quiz/${q.id}`) },
          h("div", { class:"row", style:"justify-content:space-between;" },
            h("div", { class:"title" }, q.title || "Quiz"),
            h("div", { class:"sub" }, "›")
          )
        ));
      }
      if (!folderQuizzes.length) {
        list.appendChild(h("div", { class:"card" }, h("div", { class:"sub" }, "No quizzes yet")));
      }
    }
  } else if (currentFolder && currentSubfolder && currentSubsubfolder) {
    // Subsubfolder level - show quizzes
    const folderQuizzes = quizzes.filter(q => 
      q.folder === currentFolder && 
      q.subfolder === currentSubfolder && 
      q.subsubfolder === currentSubsubfolder
    ).sort((a,b) => (a.title||'').localeCompare(b.title||''));
    
    for (const q of folderQuizzes) {
      list.appendChild(h("button", { class:"cardBtn", onclick: ()=>nav(`/quiz/${q.id}`) },
        h("div", { class:"row", style:"justify-content:space-between;" },
          h("div", { class:"title" }, q.title || "Quiz"),
          h("div", { class:"sub" }, "›")
        )
      ));
    }

    if (!folderQuizzes.length) {
      list.appendChild(h("div", { class:"card" }, h("div", { class:"sub" }, "No quizzes yet")));
    }
  }

  if (!folders.length && !quizzes.length) {
    list.appendChild(h("div", { class:"card" }, h("div", { class:"sub" }, "empty")));
  }

  return h("div", { class:"wrap" }, top, breadcrumb, list);
}
