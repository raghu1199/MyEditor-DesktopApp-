import './index.css';

import * as monaco from 'monaco-editor';
import Split from 'split.js';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css'; // Choose your preferred theme

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css"; // required for proper styling


import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
// ✅ Firebase config (public keys only, safe in client apps)

// Initialize
// Enable highlighting + line breaks
marked.setOptions({
  breaks: true,
  highlight: function (code, lang) {
    return hljs.highlightAuto(code).value;
  },
  langPrefix: 'hljs language-',
});







class CodeEditorApp {

  constructor() {
    this.initTopbar();
    this.showToast("");
    
    this.tabs = [];  // For multi-tab
    this.activeTabIndex = -1;
    this.untitledCounter = 1;
    this.sidebarFiles = [];
    this.currentFolderPath=null;
    this.currentTree="",
    
    this.openedFilePaths=[];
    this.outputs=""; 
    this.base_server="",
    this.base_llm="",

    this.user = {
    name: '',
    id:'',
    role: '',
    institute: ''
  };
  this.copilot=null;

    this.loadFolderToSidebar = this.loadFolderToSidebar.bind(this);

    this.showWelcomePage();
    this.loadapi();
    this.facultyCache = new Map();  // key = institute, value = [faculties]
    this.subjectCache = new Map();  // key = `${institute}_${faculty}`, value = [subjects]
    this.classCache = new Map();  // key = `${institute}_${faculty}`, value = [subjects]
   this.term = null;
    this.fitAddon = null;
    this._outputHandler = null;
    this._resizeHandler = null;
    this._resizeTimeout = null;
    this._inputHandler=null;
    
  }

  




  async loadapi() {
    // Helper function to initialize Firebase and load config
    const initFirebase = async () => {
        try {
            const firebaseConfig = {
                apiKey: "AIzaSyDjkTMgbF-tBHu9r7Gy4tCPjEL6wKLf5cc",
                authDomain: "editor-6e2cd.firebaseapp.com",
                databaseURL: "https://editor-6e2cd-default-rtdb.firebaseio.com",
                projectId: "editor-6e2cd",
                storageBucket: "editor-6e2cd.firebasestorage.app",
                messagingSenderId: "90183978485",
                appId: "1:90183978485:web:09aefe00e4e228b8e864bc",
                measurementId: "G-9RG7PXFZBY"
            };

            const app = initializeApp(firebaseConfig);
            const db = getFirestore(app);

            const ref = doc(db, "config", "config");
            const snapshot = await getDoc(ref);

            if (!snapshot.exists()) {
                throw new Error("Config document not found");
            }

            const config = snapshot.data();
            console.log("✅ Loaded remote config:", config);

            this.base_server = config.server_api;
            this.base_llm = config.llm_api;
            console.log("llm and base:",this.base_llm,this.base_server);

        } catch (err) {
            console.error("❌ Failed to load config:", err);
            this.showToast("❌ Failed to load remote config. Try Guest Mode.");
        }
    };

    // Function to check actual internet connection
    const checkInternet = async () => {
        if (!navigator.onLine) return false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
            await fetch("https://www.gstatic.com/generate_204", { method: "GET", mode: "no-cors", signal: controller.signal });
            clearTimeout(timeoutId);
            return true;
        } catch {
            return false;
        }
    };

    // Initial check
    if (await checkInternet()) {
        await initFirebase();
    } else {
        this.showToast("⚠️ No internet detected. You are in Guest Mode.");
        console.log("Guest mode activated due to no internet.");
    }

    // Listen for internet reconnection
    window.addEventListener("online", async () => {
        console.log("🌐 Internet reconnected, initializing Firebase...");
        this.showToast("🌐 Internet detected! Loading remote config...");
        await initFirebase();
    });
}


initTopbar() {
  const topbar = document.getElementById('topbar');
  topbar.innerHTML = `
    <div class="flex items-center justify-between bg-[#1e1e1e] text-gray-200 px-4 h-10 w-full border-b border-[#3c3c3c]">
      <div id="editorActions" class="relative flex space-x-4">
        <div class="relative">
          <button id="fileBtn" class="hover:text-teal-400">File</button>
          <div id="fileMenu" class="hidden absolute left-0 mt-1 w-48 bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-lg z-50">
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="newFile">New File ▸</div>
            <div id="newFileTypeMenu" class="hidden absolute left-full top-0 mt-0 ml-0 w-40 bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-lg z-50">
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="py">Python File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="js">JavaScript File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="c">C File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="cpp">C++ File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="txt">Text File</div>
            </div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="openFile">Open File</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="openFolder">Open Folder</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="saveFile">Save</div>

            <!-- Moved buttons inside File menu -->
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer hidden" data-action="exportFile">📤 Export</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer hidden" data-action="viewMySubmissions">📥 My Submissions</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer hidden" data-action="viewJoinRequests">📥 View Join Requests</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer hidden" data-action="myClasses">  My Classes </div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="logout">Logout</div>
          </div>
        </div>


        <button id="joinClassBt" class="hover:text-teal-400 hidden">🎓 Join Class</button>
        <button id="getQuestionBtn" class="hover:text-teal-400 hidden">📥 Get Question</button>
        <button id="postQuestionBtn" class="hover:text-teal-400 hidden">📝 Post Question</button>
        <button id="uploadBtn" class="hover:text-teal-400 hidden">📤 Upload Session</button>
        <button id="viewClassSubmissionsBtn" class="hover:text-teal-400 hidden">📚 View Class Submissions</button>
        <button id="generateExcelBtn" class="hover:text-teal-400 hidden">📊 Generate Report</button>

        <button id="runBtn" class="hover:text-teal-400">▶Run</button>
        <button id="copilotToggleFromMenu" class="hover:text-teal-400">🤖Kodin</button>
      </div>

      <!-- USER INFO + WINDOW BUTTONS -->
      <div class="flex items-center space-x-4">
        <div id="topBarUserInfo" class="text-sm text-gray-300"></div>
        <div class="flex space-x-2">
          <button id="min-btn" class="hover:text-gray-400">—</button>
          <button id="max-btn" class="hover:text-gray-400">▢</button>
          <button id="close-btn" class="hover:text-red-400">✕</button>
        </div>
      </div>
    </div>
  `;

  // Window Controls
  document.getElementById('min-btn').onclick = () => window.electronAPI.windowControl('minimize');
  document.getElementById('max-btn').onclick = () => window.electronAPI.windowControl('maximize');
  document.getElementById('close-btn').onclick = () => window.electronAPI.windowControl('close');
  // document.getElementById('logoutBtn').onclick = () => location.reload();
  document.getElementById('runBtn').onclick = () => this.runCode();

      

  const fileBtn = document.getElementById('fileBtn');
  const fileMenu = document.getElementById('fileMenu');
  const newFileTypeMenu = document.getElementById('newFileTypeMenu');

    document.addEventListener("keydown", (event) => {
      // Check if Ctrl + R is pressed
      if (event.ctrlKey && event.key.toLowerCase() === "r") {
          event.preventDefault(); // Prevent browser refresh
          this.runCode(); // Call your runCode function
      }
  });



  const getQuestionBtn = document.getElementById('getQuestionBtn');
    getQuestionBtn.classList.remove('hidden'); // Make it visible
    getQuestionBtn.onclick = () => {
      this.showQuestionModal();
    };

    

      fileBtn.onclick = (e) => {
        e.stopPropagation();
        fileMenu.classList.toggle('hidden');
        newFileTypeMenu.classList.add('hidden');
      };

      // Close menus when clicking outside
      document.body.addEventListener('click', () => {
        fileMenu.classList.add('hidden');
        newFileTypeMenu.classList.add('hidden');
      });

      // Bind actions once
      this.handleFileMenuActions();


  window.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      this.saveCurrentFile();
      this.showToast("✅File Saved.")
    }
  });

        document.getElementById("copilotForm")?.addEventListener("submit", (e) => {
          e.preventDefault(); // ✅ Stop page reload

          const input = document.getElementById("copilotInput");
          const prompt = input.value.trim();

          if (prompt) {
            this.fetchCopilotResponse(prompt);
            input.value = ''; // Optionally clear input
          }
        });


      document.getElementById("closeCopilotBtn")?.addEventListener("click", () => {
        this.hideCopilotPane();
      });

      // document.getElementById("copilotToggleBtn")?.addEventListener("click", () => {
      //   this.toggleCopilotPane();
      // });
              document.addEventListener("click", (e) => {
      if (e.target?.id === "copilotToggleFromMenu") {
        this.toggleCopilotPane();
      }
      });

}


handleFileMenuActions() {
  const fileMenu = document.getElementById('fileMenu');
  const newFileTypeMenu = document.getElementById('newFileTypeMenu');


  

  // 1️⃣ File menu click listener
  fileMenu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const action = e.target.dataset.action;

    switch (action) {
      case 'newFile':
        newFileTypeMenu.classList.toggle('hidden');
        break;

      case 'openFile': {
        const file = await window.electronAPI.openFile();
        if (!file.canceled) {
          const fileName = file.filePath.split(/[/\\]/).pop();
          this.openTab(fileName, file.content, file.filePath);

          if (!this.openedFilePaths.includes(file.filePath)) {
            this.openedFilePaths.push(file.filePath);
          }

          if (!this.sidebarFiles.find(f => f.path === file.filePath)) {
            this.sidebarFiles.push({ name: fileName, path: file.filePath, type: 'file' });
            this.refreshSidebar();
          }
        }
        fileMenu.classList.add('hidden');
        break;
      }

      case 'openFolder': {
        const folder = await window.electronAPI.openFolder();
        if (folder.canceled) break;  // ← skip only if user canceled
        this.currentFolderPath = folder.folderPath;
        this.currentTree = folder.tree;
        if (!this.editorInstance) this.showEditor();
        this.loadFolderToSidebar(folder.tree);
        fileMenu.classList.add('hidden');
        break;
      }

      case 'saveFile':
        this.saveCurrentFile();
        fileMenu.classList.add('hidden');
        break;

      default:
        break;
    }
  });

  // 2️⃣ New file type submenu click
  newFileTypeMenu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ext = e.target.dataset.type;
    if (!ext) return;

    const untitledCount = this.tabs.filter(t => t.name.startsWith('untitled')).length;
    const newName = `untitled-${untitledCount + 1}.${ext}`;
    let filePath;

    if (this.currentFolderPath) {
      filePath = await window.electronAPI.joinPath(this.currentFolderPath, newName);
      await window.electronAPI.saveFile(filePath, '');
      const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
      this.loadFolderToSidebar(refreshed);
    } else {
      const result = await window.electronAPI.saveTempFile(newName);
      if (result.canceled) return;
      filePath = result.filePath;

      if (!this.sidebarFiles.find(f => f.path === filePath)) {
        this.sidebarFiles.push({ name: newName, path: filePath, type: 'file', isUnsaved: true });
      }
    }

    if (!this.editorInstance) this.showEditor();
    this.openTab(newName, '', filePath);

    if (!this.openedFilePaths.includes(filePath)) {
      this.openedFilePaths.push(filePath);
    }

    this.refreshSidebar();
    newFileTypeMenu.classList.add('hidden');
    fileMenu.classList.add('hidden');
  });
}


async handleExportFile() {
  const openedFiles = this.openedFilePaths || [];
  const currentUser = this.user?.name || "unknown_user";
  const currentFolder = this.currentFolderPath || "";

  // Write outputs to temp file
  const tempFilePath = await window.electronAPI.writeOutputToTempFile(this.outputs);
  const outputPath = tempFilePath;

  if (!outputPath) {
    alert("⚠️ No output to export. Please run code first.");
    return;
  }

  try {
    const result = await window.electronAPI.exportReport(
      openedFiles,
      currentUser,
      currentFolder,
      outputPath
    );

    if (result.success) {
      alert("✅ PDF exported successfully!");
    } else {
      alert("❌ Export failed. Check console.");
      console.error(result.error);
    }
  } catch (err) {
    console.error("Unexpected export error:", err);
    alert("❌ Unexpected error occurred during export.");
  }

  // Refresh folder tree in sidebar
  if (this.currentFolderPath) {
    const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
    if (refreshed) {
      requestIdleCallback(() => {
        this.loadFolderToSidebar(refreshed);
      });
    }
  }
}

deleteFileFromTree(tree, filePath) {
  if (!tree || !tree.children) return;

  for (let i = tree.children.length - 1; i >= 0; i--) {
    const item = tree.children[i];
    if (item.type === 'file' && item.path === filePath) {
      tree.children.splice(i, 1); // remove the file
    } else if (item.type === 'folder') {
      this.deleteFileFromTree(item, filePath); // recursive
    }
  }
}




initFileMenuUserActions() {
  if (!this.user) return; // safety check

  const fileMenu = document.getElementById('fileMenu');

  // Hide all role-specific items first
  fileMenu.querySelectorAll(
    '[data-action="exportFile"], [data-action="viewJoinRequests"], [data-action="viewMySubmissions"], [data-action="logout"], [data-action="myClasses"]'
  ).forEach(el => {
    el.classList.add('hidden');
  });

  // Role-based visibility
  if (this.user.role === 'teacher') {
    fileMenu.querySelector('[data-action="viewJoinRequests"]').classList.remove('hidden');
    fileMenu.querySelector('[data-action="myClasses"]').classList.remove('hidden'); // ✅ show My Classes
  } else if (this.user.role === 'student') {
    fileMenu.querySelector('[data-action="viewMySubmissions"]').classList.remove('hidden');
  }

  // Export and logout for all users
  fileMenu.querySelector('[data-action="exportFile"]').classList.remove('hidden');
  fileMenu.querySelector('[data-action="logout"]').classList.remove('hidden');

  // Attach click handlers (replacing to remove old listeners)
  fileMenu.querySelectorAll(
    '[data-action="exportFile"], [data-action="viewJoinRequests"], [data-action="viewMySubmissions"], [data-action="logout"], [data-action="myClasses"]'
  ).forEach(item => {
    item.replaceWith(item.cloneNode(true));
  });

  fileMenu.querySelectorAll(
    '[data-action="exportFile"], [data-action="viewJoinRequests"], [data-action="viewMySubmissions"], [data-action="logout"], [data-action="myClasses"]'
  ).forEach(item => {
    item.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      switch(action) {
        case 'viewJoinRequests':
          this.askSubjectAndViewRequests();
          break;
        case 'viewMySubmissions':
          this.viewMySubmissions();
          break;
        case 'exportFile':
          this.handleExportFile();
          break;
        case 'logout':
          this.logout();
          break;
        case 'myClasses': // ✅ Trigger My Classes modal
          this.showMyClassesModal();
          break;
      }
    });
  });
}


async showMyClassesModal() {
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50";
  modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg mt-20 w-[500px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
      <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">My Classes</h2>

      <label class="block mb-2 font-medium">Subject:</label>
      <div class="relative">
        <input type="text" id="myClassesSubjectInput" class="w-full mb-2 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
        <div id="myClassesSubjectSuggestions" class="absolute left-0 top-full w-full bg-[#2d2d2d] border border-gray-600 rounded shadow-lg z-50 hidden max-h-48 overflow-y-auto"></div>
      </div>

      <button id="fetchClassesBtn" class="w-full bg-[#61dafb] text-black font-semibold py-2 rounded hover:bg-[#21a1f1] mb-4">Fetch Classes</button>

      <div id="myClassesList" class="max-h-60 overflow-y-auto border border-gray-600 rounded bg-[#2d2d2d] p-2 mb-4"></div>

      <button id="closeMyClassesModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);

  const subjectInput = modal.querySelector("#myClassesSubjectInput");
  const suggestionsContainer = modal.querySelector("#myClassesSubjectSuggestions");
  const classesList = modal.querySelector("#myClassesList");
  const fetchBtn = modal.querySelector("#fetchClassesBtn");
  const institute = this.user.institute;
  const faculty = this.user.id;

  // Close modal
  modal.querySelector("#closeMyClassesModalBtn").onclick = () => modal.remove();

  // ✅ Setup autocomplete inside modal
  this.setupSubjectAutocomplete(subjectInput, institute, { value: faculty }, this.base_server, suggestionsContainer);

  // ✅ Fetch classes when button clicked
  fetchBtn.onclick = async () => {
    const subject = subjectInput.value.trim();
    if (!subject) {
      this.showToast("Please enter a subject first.");
      return;
    }

    try {
      const res = await fetch(`${this.base_server}/get-classes/${encodeURIComponent(institute)}/${encodeURIComponent(faculty)}/${encodeURIComponent(subject)}`);
      if (!res.ok) throw new Error("Failed to fetch classes");
      const data = await res.json();
      const classes = data.classes || [];

      classesList.innerHTML = "";
      if (classes.length === 0) {
        classesList.innerHTML = "<div class='p-2'>No classes found</div>";
        return;
      }

      classes.forEach(cls => {
        const div = document.createElement("div");
        div.textContent = cls;
        div.className = "p-2 cursor-pointer hover:bg-[#555]";
        div.onclick = () => {
          // optional: populate input with class name
          // subjectInput.value = cls;
          classesList.innerHTML = "";
        };
        classesList.appendChild(div);
      });
    } catch (err) {
      console.error("Error fetching classes:", err);
      classesList.innerHTML = "<div class='text-red-400 p-2'>Failed to load classes</div>";
    }
  };
}



async showQuestionModal() {
  // remove any leftover suggestion lists
  ["faculty-list", "subject-list", "class-list"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  let modal = document.getElementById("getQuestionModal");

  // Create modal if it doesn't exist
  if (!modal) {
    const modalHTML = `
      <div id="getQuestionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96 relative">
          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Get Question</h2>
          
          <label class="block text-sm text-white mb-1">Faculty:</label>
          <div class="relative w-full mb-4">
            <input id="facultyInput" type="text" autocomplete="off" spellcheck="false" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <label class="block text-sm text-white mb-1">Subject:</label>
          <div class="relative w-full mb-4">
            <input id="subjectInput" type="text" autocomplete="off" spellcheck="false" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <label class="block text-sm text-white mb-1">Class ID:</label>
          <div class="relative w-full mb-4">
            <input id="classIdInput" type="text" autocomplete="off" spellcheck="false" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <div class="flex justify-end space-x-2">
            <button id="cancelQuestionBtn" class="text-white hover:text-red-400">Cancel</button>
            <button id="fetchQuestionBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">Fetch</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    modal = document.getElementById("getQuestionModal");
  }

  const facultyInput = document.getElementById("facultyInput");
  const subjectInput = document.getElementById("subjectInput");
  const classIdInput = document.getElementById("classIdInput");
  const cancelBtn = document.getElementById("cancelQuestionBtn");
  const fetchBtn = document.getElementById("fetchQuestionBtn");

  // Reset fields and show modal
  facultyInput.value = "";
  subjectInput.value = "";
  classIdInput.value = "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  // small helpers
  const cleanupLists = () => {
    ["faculty-list", "subject-list", "class-list"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  };

  const onFacultyChangeClear = () => {
    // when faculty changes, subject and class must be cleared
    subjectInput.value = "";
    classIdInput.value = "";
    const s = document.getElementById("subject-list"); if (s) s.remove();
    const c = document.getElementById("class-list"); if (c) c.remove();
  };

  const onSubjectChangeClear = () => {
    // when subject changes, class must be cleared
    classIdInput.value = "";
    const c = document.getElementById("class-list"); if (c) c.remove();
  };

  // Hook up your existing autocomplete functions (they will append dropdowns to input.parentNode)
  try {
    cleanupLists();
    // ensure we pass the same institute & base_server you use elsewhere
    const institute = this.user?.institute;
    const base_server = this.base_server;

    // use your already-built functions
    this.setupFacultyAutocomplete(facultyInput, institute, base_server);
    this.setupSubjectAutocomplete(subjectInput, institute, facultyInput, base_server);
    this.setupClassAutocomplete(classIdInput, institute, facultyInput, subjectInput, base_server);

    // clear dependent fields when parent changes
    facultyInput.addEventListener("input", onFacultyChangeClear);
    subjectInput.addEventListener("input", onSubjectChangeClear);
  } catch (err) {
    console.error("Error initializing autocompletes:", err);
  }

  // Cancel button: cleanup and close
  cancelBtn.onclick = () => {
    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    facultyInput.removeEventListener("input", onFacultyChangeClear);
    subjectInput.removeEventListener("input", onSubjectChangeClear);
  };

  // Fetch button: validate + call fetchQuestion
  fetchBtn.onclick = () => {
    const faculty = facultyInput.value.trim();
    const subject = subjectInput.value.trim();
    const classId = classIdInput.value.trim();

    // cleanup UI, remove modal
    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    facultyInput.removeEventListener("input", onFacultyChangeClear);
    subjectInput.removeEventListener("input", onSubjectChangeClear);

    this.fetchQuestion(faculty, subject, classId);
  };
}




async fetchQuestion(faculty, subject, classId) {
  const institute = this.user.institute || '';
  if (!faculty || !subject || !classId || !institute) {
    this.showToast("Faculty, subject, class ID, or institute is missing.");
    return;
  }

  try {
    const response = await fetch(
      `${this.base_server}/get_question?faculty=${faculty}&subject=${subject}&class_id=${classId}&institute=${institute}`
    );
    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const questionText = data.question || "No question returned.";

    const folderPath = await window.electronAPI.saveQuestionFiles({ questionText });
    if (!folderPath) throw new Error("Failed to save question files.");

    const refreshed = await window.electronAPI.getFolderTree(folderPath);
    if (!refreshed) {
      console.error("getFolderTree returned null. Path:", folderPath);
      this.showToast("Failed to load folder structure.");
      return;
    }

    this.currentFolderPath = folderPath;

    setTimeout(() => {
      requestIdleCallback(() => {
        console.log("before sidebar load");
        this.loadFolderToSidebar(refreshed);
        console.log("after sidebar load");

        requestAnimationFrame(() => {
          setTimeout(() => {
            this.showToast("✅ Question folder created and loaded!");
          }, 50);
        });
      });
    }, 100);

  } catch (error) {
    console.error("Fetch error:", error);
    this.showToast("Failed to fetch question: " + error.message);
  }
}




showToast(message, duration = 2500) {
  const toast = document.createElement('div');
  toast.innerText = message;

  // Apply inline styles for top-center position and animation
  toast.style.cssText = `
    position: fixed;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #2d2d2d;
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 9999;
    pointer-events: none;
  `;

  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  // Fade out after delay
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300); // Match fade-out transition duration
  }, duration);
}



// ✅ Global caches
// const facultyCache = new Map();  // key = institute, value = [faculties]
// const subjectCache = new Map();  // key = `${institute}_${faculty}`, value = [subjects]

// ✅ Reusable: Autocomplete for faculties
async setupFacultyAutocomplete(inputEl, institute, base_server) {
    inputEl.addEventListener("input", async () => {
        const query = inputEl.value.trim().toLowerCase();
        if (!query) return;

        try {
            // Check cache first
            let faculties;
            if (this.facultyCache.has(institute)) {
                faculties = this.facultyCache.get(institute);
            } else {
                const res = await fetch(`${base_server}/get-faculties/${institute}`);
                
                const data = await res.json();
                faculties = data.faculties || [];
                this.facultyCache.set(institute, faculties);
            }

            // Filter locally instead of server query
            const filtered = faculties.filter(f => f.toLowerCase().includes(query));

            let list = document.getElementById("faculty-list");
            if (!list) {
                list = document.createElement("div");
                list.id = "faculty-list";
                list.className = "absolute bg-[#444] border border-gray-600 mt-1 w-full max-h-40 overflow-y-auto rounded z-50";
                inputEl.parentNode.appendChild(list);
            }
            list.innerHTML = "";

            filtered.forEach(f => {
                const option = document.createElement("div");
                option.className = "p-2 cursor-pointer hover:bg-[#555]";
                option.textContent = f;
                option.onclick = () => {
                    inputEl.value = f;
                    list.innerHTML = "";
                };
                list.appendChild(option);
            });
        } catch (err) {
            console.error("Error fetching faculties:", err);
        }
    });
}

// ✅ Reusable: Autocomplete for subjects
async setupSubjectAutocomplete(inputEl, institute, facultyInput, base_server) {
    inputEl.addEventListener("input", async () => {
        const query = inputEl.value.trim().toLowerCase();
        const faculty = facultyInput.value.trim();
        if (!query || !faculty) return;

        try {
            const key = `${institute}_${faculty}`;
            let subjects;
            if (this.subjectCache.has(key)) {
                subjects = this.subjectCache.get(key);
            } else {
                const res = await fetch(`${base_server}/get-subjects/${institute}/${encodeURIComponent(faculty)}`);
                const data = await res.json();
                subjects = data.subjects || [];
                this.subjectCache.set(key, subjects);
            }

            // Filter locally
            const filtered = subjects.filter(s => s.toLowerCase().includes(query));

            let list = document.getElementById("subject-list");
            if (!list) {
                list = document.createElement("div");
                list.id = "subject-list";
                list.className = "absolute bg-[#444] border border-gray-600 mt-1 w-full max-h-40 overflow-y-auto rounded z-50";
                inputEl.parentNode.appendChild(list);
            }
            list.innerHTML = "";

            filtered.forEach(s => {
                const option = document.createElement("div");
                option.className = "p-2 cursor-pointer hover:bg-[#555]";
                option.textContent = s;
                option.onclick = () => {
                    inputEl.value = s;
                    list.innerHTML = "";
                };
                list.appendChild(option);
            });
        } catch (err) {
            console.error("Error fetching subjects:", err);
        }
    });
}


async setupClassAutocomplete(inputEl, institute, facultyInput, subjectInput, base_server) {
  inputEl.addEventListener("input", async () => {
    const query = inputEl.value.trim().toLowerCase();
    const faculty = facultyInput.value.trim();
    const subject = subjectInput.value.trim();
    if (!query || !faculty || !subject) return;

    try {
      const key = `${institute}_${faculty}_${subject}`;
      let classes;
      if (this.classCache?.has(key)) {
        classes = this.classCache.get(key);
      } else {
        const res = await fetch(`${base_server}/get-classes/${encodeURIComponent(institute)}/${encodeURIComponent(faculty)}/${subject}`);
        const data = await res.json();
        classes = data.classes || [];
        if (!this.classCache) this.classCache = new Map();
        this.classCache.set(key, classes);
      }

      // Filter locally
      const filtered = classes.filter(c => c.toLowerCase().includes(query));

      let list = document.getElementById("class-list");
      if (!list) {
        list = document.createElement("div");
        list.id = "class-list";
        list.className = "absolute bg-[#444] border border-gray-600 mt-1 w-full max-h-40 overflow-y-auto rounded z-50";
        inputEl.parentNode.appendChild(list);
      }
      list.innerHTML = "";

      filtered.forEach(c => {
        const option = document.createElement("div");
        option.className = "p-2 cursor-pointer hover:bg-[#555]";
        option.textContent = c;
        option.onclick = () => {
          inputEl.value = c;
          list.innerHTML = "";
        };
        list.appendChild(option);
      });
    } catch (err) {
      console.error("Error fetching classes:", err);
    }
  });
}


async joinClass() {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">Join Class</h2>

            <div class="relative mb-4">
                <label class="block mb-2 font-medium">Faculty:</label>
                <input type="text" id="faculty" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <div class="relative mb-6">
                <label class="block mb-2 font-medium">Subject:</label>
                <input type="text" id="subject" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <button id="joinClassBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">Join</button>
            <button id="closeJoinModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    // Close modal
    document.getElementById("closeJoinModalBtn").onclick = () => modal.remove();

    // Setup autocomplete
    const facultyInput = document.getElementById("faculty");
    const subjectInput = document.getElementById("subject");
    const institute = this.user.institute;

    this.setupFacultyAutocomplete(facultyInput, institute, this.base_server);
    this.setupSubjectAutocomplete(subjectInput, institute, facultyInput, this.base_server);

    // Handle Join
    document.getElementById("joinClassBtn").onclick = async () => {
        const faculty = facultyInput.value.trim();
        const subject = subjectInput.value.trim();

        const student_id = this.user.id;
        const student_name = this.user.name || "";
        const college = this.user.institute;

        if (!faculty || !subject) {
            this.showToast("Please fill all fields.");
            return;
        }

        try {
            const res = await fetch(`${this.base_server}/join-class`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id, student_name, college, faculty, subject })
            });
            const data = await res.json();

            if (data.message) {
                this.showToast("✅ " + data.message);
                modal.remove();
            } else {
                this.showToast(data.message || "Failed to join class.");
            }
        } catch (err) {
            this.showToast("Error joining class.");
            console.error(err);
        }
    };
}




async askSubjectAndViewRequests() {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">View Join Requests</h2>

            <label class="block mb-2 font-medium">Subject:</label>
            <input type="text" id="requestSubject" class="w-full mb-4 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" placeholder="Enter Subject"/>

            <div id="requestList" class="space-y-4 max-h-64 overflow-y-auto mb-4"></div>

            <button id="fetchRequestsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1] mb-2">Fetch Requests</button>
            <button id="approveSelectedBtn" class="w-full bg-green-500 text-white font-semibold py-2 rounded hover:bg-green-600 hidden mb-4">Approve Selected</button>
            <button id="closeRequestsModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    const requestList = document.getElementById("requestList");
    const approveBtn = document.getElementById("approveSelectedBtn");

    // Close modal
    document.getElementById("closeRequestsModalBtn").onclick = () => modal.remove();

    // Fetch requests
    document.getElementById("fetchRequestsBtn").onclick = async () => {
        const subject = document.getElementById("requestSubject").value.trim();
        const faculty = this.user.id; // or id depending on your API
        const college = this.user.institute;

        if (!subject) {
            this.showToast("Please enter a subject.");
            return;
        }

        try {
            const res = await fetch(`${this.base_server}/get-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, faculty, college })
            });
            const data = await res.json();
            console.log("sent for get-requests:",{ subject, faculty, college });

            requestList.innerHTML = "";

            if (data.requests && data.requests.length > 0) {
                data.requests.forEach(req => {
                    const div = document.createElement("div");
                    div.className = "flex justify-between items-center bg-[#444] p-3 rounded";
                    div.innerHTML = `
                        <span>${req.student_name} (${req.student_id})</span>
                        <input type="checkbox" class="request-check" value="${req.student_id}" />
                    `;
                    requestList.appendChild(div);
                });
                approveBtn.classList.remove("hidden"); // show approve button
            } else {
                requestList.innerHTML = `<p class="text-gray-400">No pending requests.</p>`;
                approveBtn.classList.add("hidden");
            }
        } catch (err) {
            this.showToast("Error fetching requests.");
            console.error(err);
        }
    };

    // Approve selected requests
    approveBtn.onclick = async () => {
        const checked = [...document.querySelectorAll(".request-check:checked")].map(c => c.value);
        if (checked.length === 0) {
            this.showToast("Select at least one request");
            return;
        }

        const subject = document.getElementById("requestSubject").value.trim();
        const faculty = this.user.id;
        const college = this.user.institute;

        try {
            const res = await fetch(`${this.base_server}/approve-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ college, faculty, subject, approved_ids: checked })
            });
            const data = await res.json();
            console.log("sent for approve-requests:",{ college, faculty, subject, approved_ids: checked });

            if (res.ok) {
                this.showToast("Requests approved ✅");
                // remove approved rows
                checked.forEach(id => {
                    const el = document.querySelector(`.request-check[value="${id}"]`).parentNode;
                    el.remove();
                });
                if (requestList.children.length === 0) approveBtn.classList.add("hidden");
            } else {
                this.showToast("Failed: " + data.error);
            }
        } catch (err) {
            this.showToast("Error approving requests.");
            console.error(err);
        }
    };
}


async viewMySubmissions() {
    // remove any leftover lists from other modals
    const oldFacultyList = document.getElementById("faculty-list");
    if (oldFacultyList) oldFacultyList.remove();
    const oldSubjectList = document.getElementById("subject-list");
    if (oldSubjectList) oldSubjectList.remove();

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">View My Submissions</h2>

            <label class="block mb-2 font-medium">Faculty:</label>
            <div class="relative w-full mb-4">
                <input type="text" id="faculty" 
                    class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <label class="block mb-2 font-medium">Subject:</label>
            <div class="relative w-full mb-6">
                <input type="text" id="subject" 
                    class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <button id="loadReportsBtn" 
                class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">
                Load My Reports
            </button>

            <button id="closeModalBtn" 
                class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    const facultyInput = document.getElementById("faculty");
    const subjectInput = document.getElementById("subject");
    const closeBtn = document.getElementById("closeModalBtn");
    const loadBtn = document.getElementById("loadReportsBtn");

    // Clean up suggestion lists before setting up new autocomplete
    const cleanupLists = () => {
        const f = document.getElementById("faculty-list");
        if (f) f.remove();
        const s = document.getElementById("subject-list");
        if (s) s.remove();
    };

    // If faculty changes, clear subject to avoid mismatch
    const onFacultyChangeClearSubject = () => {
        subjectInput.value = "";
        const s = document.getElementById("subject-list");
        if (s) s.remove();
    };

    // Hook up autocomplete using your functions
    try {
        cleanupLists();

        this.setupFacultyAutocomplete(facultyInput, this.user.institute, this.base_server);
        this.setupSubjectAutocomplete(subjectInput, this.user.institute, facultyInput, this.base_server);

        facultyInput.addEventListener("input", onFacultyChangeClearSubject);
    } catch (err) {
        console.error("Error initializing autocompletes:", err);
    }

    // Close modal and cleanup
    closeBtn.onclick = () => {
        cleanupLists();
        modal.remove();
        facultyInput.removeEventListener("input", onFacultyChangeClearSubject);
    };

    // Load reports handler
    loadBtn.onclick = async () => {
        const college = this.user.institute;
        const faculty = facultyInput.value.trim();
        const subject = subjectInput.value.trim();
        const student_id = this.user.id; // ✅ using student_id

        if (!college || !faculty || !subject || !student_id) {
            this.showToast("Please fill all fields.");
            return;
        }

        try {
            const res = await fetch(
                `${this.base_server}/get-my-reports?college=${encodeURIComponent(college)}&faculty=${encodeURIComponent(faculty)}&subject=${encodeURIComponent(subject)}&student_id=${encodeURIComponent(student_id)}`
            );
            const data = await res.json();
            const reports = data.reports || [];

            cleanupLists();
            modal.remove();
            facultyInput.removeEventListener("input", onFacultyChangeClearSubject);

            this.showReportViewerModal(subject, reports, college, faculty, student_id);
        } catch (err) {
            this.showToast("❌Failed to load reports.");
            console.error(err);
        }
    };
}



showReportViewerModal(subject, reports, college, faculty, student_id) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

    const reportCards = reports.map((r) => `
        <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
            <div class="flex flex-col">
                <span class="text-[#61dafb] font-semibold">${r.pdf_name || 'Unnamed PDF'}</span>
                <span class="text-gray-300 text-sm mt-1">Class: ${r.class || 'N/A'}</span>
                <span class="text-gray-300 text-sm">Marks: ${r.marks ?? 0}</span>
            </div>
            <div class="mt-3 flex justify-end">
                <button 
                    class="download-btn bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1] font-semibold" 
                    data-path="${r.storage_path}"
                >
                    Download
                </button>
            </div>
        </div>
    `).join("");

    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-16 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">My Reports for ${subject}</h2>

            ${reports.length === 0 ? `<p>No reports found.</p>` : reportCards}

            ${reports.length > 0 ? `
                <button id="mergeReportsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1] mt-6">
                    Generate Final Report
                </button>
            ` : ''}

            <button id="closeModalBtn2" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#closeModalBtn2").onclick = () => modal.remove();

    const downloadButtons = modal.querySelectorAll(".download-btn");
    downloadButtons.forEach(btn => {
        const path = btn.dataset.path;
        btn.onclick = () => this.downloadReport(path);
    });

    if (reports.length > 0) {
        modal.querySelector("#mergeReportsBtn").onclick = async () => {
            const payload = {
                storage_paths: reports.map(r => r.storage_path),
                output_name: "final_report",
                college,
                faculty,
                subject,
                student_id
            };
            try {
                const res = await fetch(`${this.base_server}/merge-reports`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                if (result.signed_url) {
                    window.open(result.signed_url, "_blank");
                    this.showToast("✅ Final Report generated and uploaded.");
                } else {
                    this.showToast("❌Failed to generate final report.");
                }
            } catch (err) {
                this.showToast("❌Error merging reports.");
                console.error(err);
            }
        };
    }
}


async downloadReport(path) {
    try {
        const res = await fetch(`${this.base_server}/get-signed-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storage_path: path })
        });

        const result = await res.json();
        if (result.signed_url) {
            const a = document.createElement('a');
            a.href = result.signed_url;
            a.download = path.split('/').pop(); // optional: sets filename from path
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.showToast("✅Report Downloaded");
        } else {
            this.showToast("Unable to fetch download link.");
        }
    } catch (err) {
        this.showToast("❌Download failed.");
        console.error(err);
    }
}




async viewClassSubmissions() {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">View Class Submissions</h2>

            <label class="block mb-2 font-medium">Subject:</label>
            <div class="relative w-full mb-4">
                <input type="text" id="subject" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <label class="block mb-2 font-medium">Class:</label>
            <div class="relative w-full mb-6">
                <input type="text" id="classId" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <button id="loadClassReportsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">Load Class Reports</button>
            <button id="closeModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    const subjectInput = modal.querySelector("#subject");
    const classInput = modal.querySelector("#classId");
    const closeBtn = modal.querySelector("#closeModalBtn");
    const loadBtn = modal.querySelector("#loadClassReportsBtn");

    const college = this.user.institute;
    const faculty = this.user.id; // teacher's ID

    // Hook up autocomplete with proper suggestion positioning
    this.setupSubjectAutocomplete(subjectInput, college, { value: faculty }, this.base_server);
    this.setupClassAutocomplete(classInput, college, { value: faculty }, subjectInput, this.base_server);

    // Close modal
    closeBtn.onclick = () => modal.remove();

    // Load reports handler
    loadBtn.onclick = async () => {
        const subject = subjectInput.value.trim();
        const classId = classInput.value.trim();

        if (!college || !faculty || !subject || !classId) {
            this.showToast("Please fill all fields.");
            return;
        }

        try {
            const res = await fetch(`${this.base_server}/get-reports?college=${college}&faculty=${faculty}&subject=${subject}&class=${classId}`);
            const data = await res.json();
            const reports = data.reports || [];

            modal.remove();
            this.showClassReportViewerModal(subject, reports, college, faculty, classId);
        } catch (err) {
            this.showToast("❌Failed to load class reports.");
            console.error(err);
        }
    };
}

// showClassReportViewerModal(subject, reports, college, faculty, classId) {
//     const modal = document.createElement("div");
//     modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

//     // Group reports by student_id
//     const grouped = reports.reduce((acc, r) => {
//         if (!acc[r.student_id]) acc[r.student_id] = [];
//         acc[r.student_id].push(r);
//         return acc;
//     }, {});

//     const reportCards = Object.entries(grouped).map(([studentId, studentReports]) => {
//         const studentName = studentReports[0]?.student_name || "Unknown";
//         const pdfList = studentReports.map(r => `
//             <div class="flex justify-between items-center mt-2">
//                 <span class="text-sm text-gray-300">${r.pdf_name || 'session.pdf'}</span>
//                 <button 
//                     class="download-btn bg-[#61dafb] text-black px-2 py-1 rounded hover:bg-[#21a1f1]" 
//                     data-path="${r.storage_path}">
//                     Download
//                 </button>
//             </div>
//         `).join("");

//         return `
//             <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
//                 <p class="text-[#61dafb] font-semibold">${studentName}</p>
//                 <p class="text-gray-400 text-sm">ID: ${studentId}</p>
//                 ${pdfList}
//                 <div class="mt-3">
//                     <input 
//                         type="number" 
//                         min="0" max="100" 
//                         class="marks-input w-20 p-1 rounded bg-[#444] border border-gray-600 text-white text-center" 
//                         data-student-id="${studentId}" 
//                         placeholder="Marks"
//                         value="${studentReports[0]?.marks || ''}"
//                     />
//                 </div>
//             </div>
//         `;
//     }).join("");

//     modal.innerHTML = `
//         <div class="bg-[#333333] rounded-lg mt-16 w-[650px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
//             <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Class Submissions for ${subject} - ${classId}</h2>

//             ${reports.length === 0 ? `<p>No reports found.</p>` : reportCards}

//             ${reports.length > 0 ? `
//             <button id="updateMarksBtn" class="mt-4 w-full bg-green-500 text-black font-semibold py-2 rounded hover:bg-green-400">
//                 Update Marks
//             </button>` : ""}

//             <button id="closeModalBtn2" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//         </div>
//     `;
//     document.body.appendChild(modal);

//     modal.querySelector("#closeModalBtn2").onclick = () => modal.remove();

//     // Download handlers
//     modal.querySelectorAll(".download-btn").forEach(btn => {
//         const path = btn.dataset.path;
//         btn.onclick = () => this.downloadReport(path);
//     });

//     // Update marks
//     const updateBtn = modal.querySelector("#updateMarksBtn");
//     if (updateBtn) {
//         updateBtn.onclick = async () => {
//             const marksData = [];
            
//             modal.querySelectorAll(".marks-input").forEach(input => {
//                 const studentId = input.dataset.studentId;
//                 const studentReport = reports.find(r => r.student_id === studentId);
//                 const studentName = studentReport?.student_name || "";

//                 marksData.push({
//                     student_id: studentId,
//                     student_name: studentName,
//                     marks: input.value
//                 });
//             });

//             try {
//                 const res = await fetch(`${this.base_server}/update-marks`, {
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({
//                         college,
//                         faculty,
//                         subject,
//                         classId,
//                         marksData
//                     })
//                 });
//                 const data = await res.json();
//                 this.showToast(data.message || "Marks updated successfully");
//             } catch (err) {
//                 console.error(err);
//                 this.showToast("❌Failed to update marks.");
//             }
//         };
//     }
// }

showClassReportViewerModal(subject, reports, college, faculty, classId) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

    // Group reports by student_id
    const grouped = reports.reduce((acc, r) => {
        if (!acc[r.student_id]) acc[r.student_id] = [];
        acc[r.student_id].push(r);
        return acc;
    }, {});

    const reportCards = Object.entries(grouped).map(([studentId, studentReports]) => {
        const studentName = studentReports[0]?.student_name || "Unknown";
        const pdfList = studentReports.map(r => `
            <div class="flex justify-between items-center mt-2">
                <span class="text-sm text-gray-300">${r.pdf_name || 'session.pdf'}</span>
                <div class="flex gap-2">
                    <button 
                        class="view-btn bg-yellow-400 text-black px-2 py-1 rounded hover:bg-yellow-300"
                        data-path="${r.storage_path}">
                        View
                    </button>
                    <button 
                        class="download-btn bg-[#61dafb] text-black px-2 py-1 rounded hover:bg-[#21a1f1]" 
                        data-path="${r.storage_path}">
                        Download
                    </button>
                </div>
            </div>
        `).join("");

        return `
            <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
                <p class="text-[#61dafb] font-semibold">${studentName}</p>
                <p class="text-gray-400 text-sm">ID: ${studentId}</p>
                ${pdfList}
                <div class="mt-3">
                    <input 
                        type="number" 
                        min="0" max="100" 
                        class="marks-input w-20 p-1 rounded bg-[#444] border border-gray-600 text-white text-center" 
                        data-student-id="${studentId}" 
                        placeholder="Marks"
                        value="${studentReports[0]?.marks || ''}"
                    />
                </div>
            </div>
        `;
    }).join("");

    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-16 w-[650px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Class Submissions for ${subject} - ${classId}</h2>

            ${reports.length === 0 ? `<p>No reports found.</p>` : reportCards}

            ${reports.length > 0 ? `
            <button id="updateMarksBtn" class="mt-4 w-full bg-green-500 text-black font-semibold py-2 rounded hover:bg-green-400">
                Update Marks
            </button>` : ""}

            <button id="closeModalBtn2" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#closeModalBtn2").onclick = () => modal.remove();

    // Download handlers
    modal.querySelectorAll(".download-btn").forEach(btn => {
        const path = btn.dataset.path;
        btn.onclick = () => this.downloadReport(path);
    });

    // View handlers
    // View handlers
          // View handlers
modal.querySelectorAll(".view-btn").forEach(btn => {
    const path = btn.dataset.path;
    btn.onclick = async () => {
        try {
            const res = await fetch(`${this.base_server}/get-view-url`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storage_path: path })
            });

            const result = await res.json();
            if (result.signed_url) {
              console.log("signed url:",result.signed_url);
                  this.openPdfViewer(result.signed_url);
                  // window.open(result.signed_url, "_blank");
            }

        
        } catch (err) {
            console.error(err);
            this.showToast("❌ Failed to load PDF.");
        }
    };
});

    // Update marks
    const updateBtn = modal.querySelector("#updateMarksBtn");
    if (updateBtn) {
        updateBtn.onclick = async () => {
            const marksData = [];
            
            modal.querySelectorAll(".marks-input").forEach(input => {
                const studentId = input.dataset.studentId;
                const studentReport = reports.find(r => r.student_id === studentId);
                const studentName = studentReport?.student_name || "";

                marksData.push({
                    student_id: studentId,
                    student_name: studentName,
                    marks: input.value
                });
            });

            try {
                const res = await fetch(`${this.base_server}/update-marks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        college,
                        faculty,
                        subject,
                        classId,
                        marksData
                    })
                });
                const data = await res.json();
                this.showToast(data.message || "Marks updated successfully");
            } catch (err) {
                console.error(err);
                this.showToast("❌Failed to update marks.");
            }
        };
    }
}

openPdfViewer(url) {
    const viewerModal = document.createElement("div");
    viewerModal.className =
        "fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50";

    viewerModal.innerHTML = `
        <div class="bg-[#1e1e1e] rounded-lg w-[80%] h-[90%] p-4 shadow-lg relative flex flex-col">
            <button class="absolute top-2 right-3 text-gray-300 hover:text-white text-2xl">&times;</button>
            <embed src="${url}" type="application/pdf" class="flex-1 w-full h-full rounded" />
        </div>
    `;

    document.body.appendChild(viewerModal);

    // Close handler
    viewerModal.querySelector("button").onclick = () => viewerModal.remove();
}


async generateMarksReport() {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-20 w-[500px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">Generate Marks Report</h2>

            <label class="block mb-2 font-medium">Subject:</label>
            <div class="relative w-full mb-6">
                <input type="text" id="subjectInput" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <button id="generateExcelBtn" class="w-full bg-green-500 text-black font-semibold py-2 rounded hover:bg-green-400">Generate Excel</button>

            <button id="closeModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;

    document.body.appendChild(modal);

    const subjectInput = document.getElementById("subjectInput");
    const college = this.user.institute;
    const faculty = this.user.id;

    // Hook up autocomplete for subject
    this.setupSubjectAutocomplete(subjectInput, college, { value: faculty }, this.base_server);

    modal.querySelector("#closeModalBtn").onclick = () => modal.remove();

    modal.querySelector("#generateExcelBtn").onclick = async () => {
        const subject = subjectInput.value.trim();

        if (!college || !faculty || !subject) {
            this.showToast("Please enter the subject.");
            return;
        }

        try {
            const res = await fetch(`${this.base_server}/generate_marks_excel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ college, faculty, subject })
            });

            if (!res.ok) throw new Error("Failed to generate Excel");

            // Blob download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${subject}_marks.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            this.showToast("Excel file generated successfully!");
            modal.remove();
        } catch (err) {
            console.error(err);
            this.showToast("❌Failed to generate report.");
        }
    };
}





async showPostQuestionModal() {
  let modal = document.getElementById("postQuestionModal");

  if (!modal) {
    const modalHTML = `
      <div id="postQuestionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-start z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96 mt-20">
          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Post a Question</h2>
          
          <label class="block text-sm text-white mb-1">Subject:</label>
          <div class="relative w-full mb-4">
            <input id="postSubjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
          </div>

          <label class="block text-sm text-white mb-1">Class ID:</label>
          <div class="relative w-full mb-4">
            <input id="postClassIdInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
          </div>

          <label class="block text-sm text-white mb-1">Question:</label>
          <textarea id="postQuestionInput" rows="4" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4 resize-none"></textarea>

          <div class="flex justify-end space-x-2">
            <button id="cancelPostBtn" class="text-white hover:text-red-400">Cancel</button>
            <button id="submitPostBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">Submit</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    modal = document.getElementById("postQuestionModal");
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const subjectInput = document.getElementById("postSubjectInput");
  const classInput = document.getElementById("postClassIdInput");
  const questionInput = document.getElementById("postQuestionInput");
  const cancelBtn = document.getElementById("cancelPostBtn");
  const submitBtn = document.getElementById("submitPostBtn");

  const institute = this.user.institute;
  const faculty = this.user.id;

  // Hook up autocomplete
  this.setupSubjectAutocomplete(subjectInput, institute, { value: faculty }, this.base_server);
  this.setupClassAutocomplete(classInput, institute, { value: faculty }, subjectInput, this.base_server);

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  submitBtn.onclick = async () => {
    const subject = subjectInput.value.trim();
    const classId = classInput.value.trim();
    const questionText = questionInput.value.trim();

    if (!subject || !classId || !questionText || !faculty || !institute) {
      this.showToast("❌ Please fill all fields before submitting.");
      return;
    }

    try {
      const response = await fetch(`${this.base_server}/post_question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, classId, faculty, question: questionText, institute })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      this.showToast("✅ Question posted successfully.");
    } catch (error) {
      console.error("Post error:", error);
      this.showToast("❌ Failed to post question: " + error.message);
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };
}





async showUploadSessionModal() {
  let modal = document.getElementById("uploadSessionModal");

  if (!modal) {
    const modalHTML = `
      <div id="uploadSessionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96">
          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Upload Session</h2>
          
          <label class="block text-sm text-white mb-1">Faculty:</label>
          <div class="relative w-full mb-4">
            <input id="uploadFacultyInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <label class="block text-sm text-white mb-1">Subject:</label>
          <div class="relative w-full mb-4">
            <input id="uploadSubjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <label class="block text-sm text-white mb-1">Class:</label>
          <div class="relative w-full mb-4">
            <input id="uploadClassInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <div class="flex justify-end space-x-2">
            <button id="cancelUploadBtn" class="text-white hover:text-red-400">Cancel</button>
            <button id="submitUploadBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">Upload</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    modal = document.getElementById("uploadSessionModal");
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const facultyInput = document.getElementById("uploadFacultyInput");
  const subjectInput = document.getElementById("uploadSubjectInput");
  const classInput = document.getElementById("uploadClassInput");

  // ✅ Clean up dropdown lists
  const cleanupLists = () => {
    ["faculty-list", "subject-list", "class-list"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  };

  // ✅ Clear subject + class when faculty changes
  facultyInput.addEventListener("input", () => {
    subjectInput.value = "";
    classInput.value = "";
    cleanupLists();
  });

  // ✅ Clear class when subject changes
  subjectInput.addEventListener("input", () => {
    classInput.value = "";
    const c = document.getElementById("class-list");
    if (c) c.remove();
  });

  // ✅ Setup autocomplete
  try {
    cleanupLists();
    this.setupFacultyAutocomplete(facultyInput, this.user.institute, this.base_server);
    this.setupSubjectAutocomplete(subjectInput, this.user.institute, facultyInput, this.base_server);
    this.setupClassAutocomplete(classInput, this.user.institute, facultyInput, subjectInput, this.base_server);
  } catch (err) {
    console.error("Error initializing autocompletes:", err);
  }

  document.getElementById("cancelUploadBtn").onclick = () => {
    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  document.getElementById("submitUploadBtn").onclick = async () => {
    const faculty = facultyInput.value.trim();
    const subject = subjectInput.value.trim();
    const classId = classInput.value.trim();

    const studentId = this.user.id;
    const studentName = this.user.name || "default";
    const college = this.user.institute;
    const openedFiles = this.openedFilePaths || [];
    const currentFolder = this.currentFolderPath || "";

    if (!faculty || !subject || !classId || !college || !studentName || !studentId) {
      this.showToast("⚠️ Please fill all required fields.");
      return;
    }

    try {
      // Step 1: Export PDF
      const tempFilePath = await window.electronAPI.writeOutputToTempFile(this.outputs);
      const exportResult = await window.electronAPI.exportReport(
        openedFiles,
        studentName,
        currentFolder,
        tempFilePath
      );

      if (!exportResult.success || !exportResult.path) {
        this.showToast("❌ Failed to generate session PDF.");
        return;
      }

      // Step 2: Read PDF as Blob
      const pdfBlob = await window.electronAPI.readFileAsBlob(exportResult.path);

      // Step 3: Upload to Flask API
      const formData = new FormData();
      formData.append("file", pdfBlob, "session.pdf");
      formData.append("college", college);
      formData.append("faculty", faculty);
      formData.append("subject", subject);
      formData.append("class", classId);
      formData.append("pdf_name", studentName);
      formData.append("student_name", studentName);
      formData.append("student_id", studentId);

      const response = await fetch(`${this.base_server}/upload-report`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Upload failed:", errorText);
        this.showToast("❌ Upload failed: " + errorText);
      } else {
        const result = await response.json();
        console.log("✅ Upload success:", result);
        this.showToast("✅ Session uploaded successfully!");
      }
    } catch (err) {
      console.error("Upload error:", err);
      this.showToast("❌ Upload error: " + err.message);
    }

    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");

    const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
    if (refreshed) {
      requestIdleCallback(() => {
        this.loadFolderToSidebar(refreshed);
      });
    }
  };
}







  toggleEditorActions(show) {
    document.getElementById('editorActions').classList.toggle('hidden', !show);
  }


  showWelcomePage() {
  this.toggleEditorActions(false);
  // const app = document.getElementById('app');
  // app.classList.remove('hidden');
  // document.getElementById('editorLayout').classList.add('hidden');

  document.getElementById('editorLayout').classList.add('hidden');
  
  const app = document.getElementById('app');
  app.classList.remove('hidden');

  app.innerHTML = `
    <div class="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950 px-4">
      <h1 class="text-6xl font-extrabold mb-14 text-white">Welcome to <span class="text-teal-400">Kodin</span></h1>
      <div class="flex flex-col space-y-6 w-full max-w-xs">
        ${this.button('Student', 'student')}
        ${this.button('Teacher', 'teacher')}
        ${this.button('Proceed as Guest', 'guest')}
        ${this.button('Signup', 'signup')}
      </div>
    </div>
  `;

   

  document.querySelectorAll('button[data-role]').forEach(btn => {
    const role = btn.dataset.role;
    btn.onclick = () => {
      if (role === 'guest') this.showEditor();
      else if (role === 'signup') this.showSignupRoleSelect();
      else this.showLoginForm(role);
    }; 
  });

}
  button(label, role) {
    return `
      <button data-role="${role}" class="w-full py-4 px-8 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-xl font-bold text-white">
        ${label}
      </button>
    `;
  }


showSignupRoleSelect() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950 px-4">
      <h2 class="text-4xl font-extrabold mb-10 text-white">Choose Signup Role</h2>
      <div class="flex flex-col space-y-6 w-full max-w-xs">
        ${this.button('Student Signup', 'student-signup')}
        ${this.button('Teacher Signup', 'teacher-signup')}
        ${this.button('Back', 'back')}
      </div>
    </div>
  `;

  document.querySelectorAll('button[data-role]').forEach(btn => {
    const role = btn.dataset.role;
    if (role === 'student-signup') btn.onclick = () => this.showSignupForm('student');
    else if (role === 'teacher-signup') btn.onclick = () => this.showSignupForm('teacher');
    else if (role === 'back') btn.onclick = () => this.showWelcomePage();
  });
}

showSignupForm(role) {
  this.user.role = role;
  const isStudent = role === "student";
  const title = `${role.charAt(0).toUpperCase() + role.slice(1)} Signup`;

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="h-full w-full flex items-center justify-center px-4 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950">
      <div class="bg-gray-800/80 p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-700">
        <h2 class="text-4xl font-extrabold mb-8 text-white text-center">${title}</h2>
        <form id="signupForm" class="space-y-6">
          ${this.inputField('Institute', 'text')}
          ${isStudent ? this.inputField('Roll Number', 'text') : ''}
          ${isStudent ? this.inputField('Name', 'text') : ''}
          ${this.inputField('Email', 'email')}
          ${this.inputField('Password', 'password')}
          <button type="submit"
            class="w-full py-4 px-6 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-lg font-bold text-white">
            Signup
          </button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('signupForm').onsubmit = async e => {
    e.preventDefault();

    const payload = {
      institute: document.querySelector('#signupForm input[placeholder="Institute"]').value.trim(),
      email: document.querySelector('#signupForm input[placeholder="Email"]').value.trim(),
      password: document.querySelector('#signupForm input[placeholder="Password"]').value.trim(),
      role
    };

    if (isStudent) {
      payload.roll_number = document.querySelector('#signupForm input[placeholder="Roll Number"]').value.trim();
      payload.name = document.querySelector('#signupForm input[placeholder="Name"]').value.trim();
    }

    try {
      const res = await fetch(`${this.base_server}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log("sent payload:",JSON.stringify(payload))
      const data = await res.json().catch(() => null);
      console.log("recieved payload:",data)

      
      if (data.success){

        this.showWelcomePage();
        this.showToast('✅Signup Completed');
      }
      else{
        this.showToast('❌ Student Already Exists');
      }
         
    } catch (err) {
      console.error(err);
      this.showToast('❌Signup failed');
    }
  };
}


async fetchInstitutesFromBackend() {
  // Cache institutes to avoid repeated network calls
  if (!window.allInstitutesCache) {
    try {
      const res = await fetch(`${this.base_server}/institutes`); // Flask endpoint returning all institute names
     
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();
      // Assuming backend returns: { institutes: ["Institute1", "Institute2", ...] }
      window.allInstitutesCache = data.institutes || [];
    } catch (err) {
      console.error("Failed to fetch institutes:", err);
      window.allInstitutesCache = [];
    }
  }
  return window.allInstitutesCache;
}

setupInstituteAutocomplete(inputElement, fetchInstitutesFunc) {
  // Create suggestions box dynamically
  let suggestionsBox = document.createElement('div');
  suggestionsBox.id = 'suggestions';
  inputElement.parentElement.appendChild(suggestionsBox);

  // Apply dark theme CSS dynamically
  Object.assign(suggestionsBox.style, {
    background: 'rgba(31, 41, 55, 0.9)', // matches bg-gray-800/80
    color: '#f9fafb',                     // text-white-like
    border: '1px solid #4b5563',          // border-gray-700
    borderRadius: '1rem',                  // same as login input radius
    maxHeight: '200px',
    overflowY: 'auto',
    width: inputElement.offsetWidth + 'px',
    display: 'none',
    position: 'absolute',
    zIndex: '50',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)' // subtle shadow like card
  });


  function positionSuggestions() {
    suggestionsBox.style.top = (inputElement.offsetTop + inputElement.offsetHeight) + 'px';
    suggestionsBox.style.left = inputElement.offsetLeft + 'px';
    suggestionsBox.style.width = inputElement.offsetWidth + 'px';
  }

  positionSuggestions();
  window.addEventListener('resize', positionSuggestions);

  let selectedIndex = -1;

  inputElement.addEventListener('input', async () => {
    const value = inputElement.value.trim().toLowerCase();
    if (!value) {
      suggestionsBox.style.display = 'none';
      suggestionsBox.innerHTML = '';
      selectedIndex = -1;
      return;
    }

    const institutes = await fetchInstitutesFunc();
    const filtered = institutes.filter(name => name.toLowerCase().startsWith(value));

    if (!filtered.length) {
      suggestionsBox.style.display = 'none';
      suggestionsBox.innerHTML = '';
      selectedIndex = -1;
      return;
    }

    suggestionsBox.innerHTML = filtered.map(name =>
      `<div class="suggestion-item" style="padding:0.5rem 0.75rem; cursor:pointer;">${name}</div>`
    ).join('');
    suggestionsBox.style.display = 'block';
    selectedIndex = -1;

    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    items.forEach((item, index) => {
      item.onmouseover = () => { selectedIndex = index; highlight(items, selectedIndex); };
      item.onclick = () => { inputElement.value = item.textContent; suggestionsBox.style.display = 'none'; };
    });
  });

  inputElement.addEventListener('keydown', e => {
    const items = suggestionsBox.querySelectorAll('.suggestion-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      highlight(items, selectedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      highlight(items, selectedIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        inputElement.value = items[selectedIndex].textContent;
        suggestionsBox.style.display = 'none';
      }
    }
  });

  document.addEventListener('click', e => {
    if (!suggestionsBox.contains(e.target) && e.target !== inputElement) {
      suggestionsBox.style.display = 'none';
      selectedIndex = -1;
    }
  });

  function highlight(items, index) {
    items.forEach((item, i) => item.style.background = i === index ? '#3a3a3a' : '#2b2b2b');
  }
}


showLoginForm(role) {
  this.user.role = role;
  const isStudent = role === "student";
  const title = `${role.charAt(0).toUpperCase() + role.slice(1)} Login`;

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="h-full w-full flex items-center justify-center px-4 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950">
      <div class="bg-gray-800/80 p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-700 relative">
        <h2 class="text-4xl font-extrabold mb-8 text-white text-center">${title}</h2>
        <form id="loginForm" class="space-y-6">
          ${this.inputField('Institute', 'text', 'instituteInput')}
          ${isStudent ? this.inputField('Roll Number', 'text') : this.inputField('Email', 'email')}
          ${this.inputField('Password', 'password')}
          <button type="submit"
            class="w-full py-4 px-6 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-lg font-bold text-white">
            Login
          </button>
          <button type="button" id="backBtn"
            class="w-full py-4 px-6 mt-4 rounded-full bg-gray-700 hover:bg-gray-600 text-lg font-bold text-white">
            Back
          </button>
        </form>
        <div id="suggestions" class="absolute bg-white text-black w-full mt-1 rounded shadow max-h-48 overflow-y-auto z-50 hidden"></div>
      </div>
    </div>
  `;

  // Bind Back button
  document.getElementById('backBtn').onclick = () => this.showWelcomePage();

  // Setup autocomplete
  const instituteInput = document.getElementById('loginForm').querySelector('input[placeholder="Institute"]');
  this.setupInstituteAutocomplete(instituteInput, () => this.fetchInstitutesFromBackend());


  // Form submit logic remains the same...
  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const institute = instituteInput.value.trim();
    const password = document.querySelector('#loginForm input[placeholder="Password"]').value.trim();
    const email_or_roll = isStudent
      ? document.querySelector('#loginForm input[placeholder="Roll Number"]').value.trim()
      : document.querySelector('#loginForm input[placeholder="Email"]').value.trim();

    const payload = { institute, role, email_or_roll, password };

    try {
      const res = await fetch(`${this.base_server}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => null);

      if (data?.success) {
        this.user.institute = institute;
        if (role === "student") this.user.name = data.data.name;
        this.user.id = role === "student" ? data.data.student_id : data.data.email;
        this.user.role = role;
       
        this.showEditor();
        this.showToast('✅ Login successful');
      } else {
        this.showToast(`❌ ${data?.message || 'Login failed'}`);
      }
    } catch (err) {
      console.error(err);
      this.showToast('❌ Login failed');
    }
  };
}


async logout() {
  try {
    // 🔹 Clear user info in topbar
    const topBarU = document.getElementById('topBarUserInfo');
    if (topBarU) topBarU.innerText = '';

      const buttons = [
      "joinClassBt",
      "getQuestionBtn",
      "postQuestionBtn",
      "uploadBtn",
      "viewClassSubmissionsBtn",
      "generateExcelBtn"
    ];

    buttons.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.add("hidden");
    });

    

    // 🔹 Dispose editor instance
    if (this.editorInstance) {
      this.editorInstance.dispose();
      this.editorInstance = null;
    }

    // 🔹 Abort ongoing async tasks
    // if (this.copilot?.abort) this.copilot.abort();
    // if (this.currentFetchController) this.currentFetchController.abort();

    // 🔹 TERMINAL CLEANUP FIRST (important order!)
    if (this.term) {
      try {
        this.term.dispose();
      } catch (e) {
        console.warn("Terminal dispose failed:", e);
      }
    }
    this.term = null;
    this.fitAddon = null;

    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._outputHandler && window.electronAPI.removeOutputListener) {
      window.electronAPI.removeOutputListener(this._outputHandler);
      this._outputHandler = null;
    }
    if (this._inputHandler) {
      try {
        this.term?.offData(this._inputHandler);
      } catch (_) {}
      this._inputHandler = null;
    }
    await window.electronAPI.logout();
    // 🔹 Clear container
    const container = document.getElementById("output");
    if (container) container.innerHTML = "";

    // 🔹 Reset runtime state
    this.user = { name: '', id: '', role: '', institute: '' };
    this.tabs = [];
    this.activeTabIndex = -1;
    this.untitledCounter = 1;
    this.sidebarFiles = [];
    this.currentFolderPath = null;
    this.openedFilePaths = [];
    this.outputs = "";
    this.copilot = null;

    // 🔹 Clear caches
    this.facultyCache.clear();
    this.subjectCache.clear();
    this.classCache.clear();

    // 🔹 Clear persistent storage
    localStorage.removeItem('user');
    localStorage.removeItem('editorState');
    sessionStorage.clear();

    // 🔹 Reset topbar menu items
    const fileMenu = document.getElementById('fileMenu');
    if (fileMenu) {
      fileMenu.querySelectorAll('[data-action]').forEach(item => {
        const roleActions = ["exportFile", "viewJoinRequests", "viewMySubmissions", "logout"];
        if (roleActions.includes(item.dataset.action)) item.classList.add('hidden');
      });
    }

    // 🔹 Clear editor UI + sidebar
    const editorContainer = document.getElementById('editorContainer');
    if (editorContainer) editorContainer.innerHTML = '';
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.innerHTML = '';

    // await window.electronAPI.logout();
    // 🔹 Show welcome page
    this.showWelcomePage();

    // 🔹 Notify user
    this.showToast('✅ Logged out successfully');
    console.log("✅ Logout completed: terminal + state cleared");
  } catch (err) {
    console.error("Error during logout:", err);
    this.showToast('⚠️ Logout encountered an issue. Please refresh.');
  }
}


  inputField(label, type) {
    return `
      <div>
        <label class="block text-sm mb-1 text-gray-200">${label}</label>
        <input type="${type}" placeholder="${label}" class="w-full p-3 rounded-lg bg-gray-700/60 border border-gray-600 text-white placeholder-gray-400">
      </div>
    `;
  }

  async showEditor() {
    this.toggleEditorActions(true);
    document.getElementById('app').classList.add('hidden');
    document.getElementById('editorLayout').classList.remove('hidden');
  //   document.getElementById('app').classList.add('hidden');      // hide welcome/login
  // document.getElementById('editorLayout').classList.remove('hidden'); // show editor

    console.log("inside showeditor");
    await window.electronAPI.login();
    
    console.log("inside showeditor");

    this.setupSidebar();
    this.setupTabArea();
    this.setupEditor();
    
    this.setupOutput();
    this.setupSplit();
    

    const topBar = document.getElementById('topBarUserInfo');
    if (topBar) {
      topBar.innerText = `👤 ${this.user.name} (${this.user.role})`;
    }


    // post button only for teacher
    const postQuestionBtn = document.getElementById('postQuestionBtn');
    if (this.user.role === 'teacher') {
      postQuestionBtn.classList.remove('hidden');
      postQuestionBtn.onclick = () => {
        this.showPostQuestionModal();
      };
      }; 
      // <button id="joinClassBtn" class="hover:text-teal-400 hidden">🎓 Join Class</button>

      const jcBtn = document.getElementById('joinClassBt');
        if (this.user.role === 'student') {
          jcBtn.classList.remove('hidden');
          jcBtn.onclick = () => {
            this.joinClass();
          };
        }

        this.initFileMenuUserActions(); 

    const vcBtn = document.getElementById('viewClassSubmissionsBtn');
    if (this.user.role === 'teacher') {
      vcBtn.classList.remove('hidden');
      vcBtn.onclick = () => {
        this.viewClassSubmissions();
      };
    };

    this.toggleCopilotPane();

    const gbtn = document.getElementById("generateExcelBtn");
    if (this.user.role === "teacher") {
    
    gbtn.classList.remove("hidden"); // show the button
    gbtn.onclick = () => this.generateMarksReport();
    }


    const uploadBtn = document.getElementById("uploadBtn");
    if (this.user.role !== "teacher") {
    uploadBtn.classList.remove("hidden");
    uploadBtn.onclick = () => this.showUploadSessionModal();;
    }



        document.addEventListener("click", (e) => {
      if (e.target?.id === "copilotToggleFromMenu") {
        this.toggleCopilotPane();
      }
      })

    const copilotToggleBtn = document.getElementById("copilotToggleFromMenu");
      if (copilotToggleBtn) {
        copilotToggleBtn.addEventListener("click", () => this.toggleCopilotPane());
      }
    
          document.addEventListener('DOMContentLoaded', () => {
      const form = document.getElementById('copilotForm');
      const input = document.getElementById('copilotInput');

      form.addEventListener('submit', (e) => {
        e.preventDefault(); // ✅ Prevent form reload

        const prompt = input.value.trim();
        if (prompt) {
          this.fetchCopilotResponse(prompt);
          input.value = ""; // Optionally clear input
    }
  });
});

};


setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  console.log("✅ setupSidebar called");

  const fileListContainer = document.getElementById('fileList');
  fileListContainer.innerHTML = ''; // clear old files

  this.sidebarFiles.forEach((file) => {
    const item = document.createElement('li');
    item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded sidebar-item';
    item.innerText = file.name;
    item.dataset.path = file.path;
    item.dataset.type = file.type || "file";

    // Left click → open file
    item.onclick = async () => {
      if (!this.editorInstance) this.showEditor();

      fileListContainer.querySelectorAll('li').forEach(li => li.classList.remove('bg-gray-700'));
      item.classList.add('bg-gray-700');

      let content = `// Opened ${file.name}`;
      try {
        content = await window.electronAPI.readFile(file.path);
      } catch (err) {
        console.error('File read error:', err);
      }

      this.openTab(file.name, content, file.path);
    };

    fileListContainer.appendChild(item);
  });

  this.setupSidebarContextMenu();
}



setupSidebarContextMenu() {
  const contextMenu = document.getElementById("sidebarContextMenu");
  let currentRightClicked = null;

  const sidebar = document.getElementById("sidebar");

  // Right-click handler
  sidebar.addEventListener("contextmenu", (e) => {
    const item = e.target.closest(".sidebar-item");
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();

    // console.log("👉 Right-clicked:", item.dataset.path);

    currentRightClicked = item;

    // Position menu
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.classList.remove("hidden");
  });

  // DELETE action
  document.getElementById("deleteFile").addEventListener("click", async () => {
    if (!currentRightClicked) return;
    const filePath = currentRightClicked.dataset.path;
    // console.log("🗑️ Deleting:", filePath);
    try {
      await window.electronAPI.deleteFile(filePath);

      // remove from in-memory list
      // this.sidebarFiles = this.sidebarFiles.filter(f => f.path !== filePath);
      const index = this.sidebarFiles.findIndex(f => f.path === filePath);
      if (index !== -1) {
        // Remove it directly from the array
        this.sidebarFiles.splice(index, 1);
      }
      console.log("sidebar files:",this.sidebarFiles);
      this.deleteFileFromTree(this.currentTree, filePath);

      const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);

    // Rebuild sidebar from updated tree
    this.loadFolderToSidebar(refreshed);
      this.showToast("File deleted");

      // rebuild sidebar UI
      // this.setupSidebar();
      


    } catch (err) {
      console.error("❌ Delete failed:", err);
      this.showToast("File deletion Failed");
      
    }

    contextMenu.classList.add("hidden");
    currentRightClicked = null;
  });

       document.getElementById("renameFile").addEventListener("click", async () => {
      if (!currentRightClicked) return;

      const filePath = currentRightClicked.dataset.path;
      const file = this.sidebarFiles.find(f => f.path === filePath);
      if (!file) return;

      // Start inline rename immediately
      await  this.startInlineRename(currentRightClicked, file);

      
        const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
        this.currentTree = refreshed;
        this.loadFolderToSidebar(refreshed);

      // Hide context menu
      contextMenu.classList.add("hidden");
      currentRightClicked = null;
    });



  // OPEN action
 

  // Hide menu when clicking elsewhere
  document.addEventListener("click", () => {
    contextMenu.classList.add("hidden");
    currentRightClicked = null;
  });
}

startInlineRename(fileItem, file) {
  return new Promise((resolve) => {  // <-- wrap in Promise
    fileItem.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = file.name;
    input.className = 'bg-gray-800 text-white p-1 rounded w-full';

    const commitRename = async () => {
      const newName = input.value.trim();
      if (!newName || newName === file.name) {
        fileItem.textContent = file.name;
        resolve();  // <-- resolve even if nothing changed
        return;
      }

      const oldPath = file.path;
      const dirParts = oldPath.split(/[/\\]/);
      dirParts.pop();
      const dirPath = dirParts.join('/');
      const newPath = await window.electronAPI.joinPath(dirPath, newName);
      const exists = await window.electronAPI.fileExists(newPath);
      if (exists) {
        alert('A file or folder with this name already exists.');
        fileItem.textContent = file.name;
        resolve();
        return;
      }

      const success = await window.electronAPI.renameFileOrFolder(oldPath, newPath);
      if (!success) {
        alert('Failed to rename file.');
        fileItem.textContent = file.name;
        resolve();
        return;
      }

      // Update file object and sidebar item
      file.name = newName;
      file.path = newPath;
      fileItem.textContent = newName;

      // Update open tab if any
      const tabIndex = this.tabs.findIndex(tab => tab.filePath === oldPath);
      if (tabIndex !== -1) {
        const tabBtn = document.querySelectorAll('.tab-item')[tabIndex];
        if (tabBtn) tabBtn.innerText = newName;
        this.tabs[tabIndex].name = newName;
        this.tabs[tabIndex].filePath = newPath;
      }

      resolve(); // <-- important: resolve after rename
    };

    input.onblur = commitRename;
    input.onkeydown = async (e) => {
      if (e.key === 'Enter') await commitRename();
      if (e.key === 'Escape') {
        fileItem.textContent = file.name;
        resolve();
      }
    };

    fileItem.appendChild(input);
    input.focus();
  });
}



// startInlineRename(fileItem, file) {
//   // Clear existing content and create input
//   fileItem.innerHTML = '';
//   const input = document.createElement('input');
//   input.type = 'text';
//   input.value = file.name;
//   input.className = 'bg-gray-800 text-white p-1 rounded w-full';

//   const commitRename = async () => {
//     const newName = input.value.trim();
//     if (!newName || newName === file.name) {
//       fileItem.textContent = file.name;
//       return;
//     }

//     const oldPath = file.path;
//     const dirParts = oldPath.split(/[/\\]/);
//     dirParts.pop();
//     const dirPath = dirParts.join('/');
//     const newPath = await window.electronAPI.joinPath(dirPath, newName);
//     const exists = await window.electronAPI.fileExists(newPath);
//     if (exists) {
//       alert('A file or folder with this name already exists.');
//       fileItem.textContent = file.name;
//       return;
//     }

//     const success = await window.electronAPI.renameFileOrFolder(oldPath, newPath);
//     if (!success) {
//       alert('Failed to rename file.');
//       fileItem.textContent = file.name;
//       return;
//     }

//     file.name = newName;
//     file.path = newPath;
//     fileItem.textContent = newName;

//     // Update tab if open
//     const tabIndex = this.tabs.findIndex(tab => tab.filePath === oldPath);
//     if (tabIndex !== -1) {
//       const tabBtn = document.querySelectorAll('.tab-item')[tabIndex];
//       if (tabBtn) tabBtn.innerText = newName;
//       this.tabs[tabIndex].name = newName;
//       this.tabs[tabIndex].filePath = newPath;
//     }
//   };

//   input.onblur = commitRename;
//   input.onkeydown = async (e) => {
//     if (e.key === 'Enter') await commitRename();
//     if (e.key === 'Escape') fileItem.textContent = file.name;
//   };

//   fileItem.appendChild(input);
//   input.focus();
// }




setupTabArea() {
  const tabBar = document.getElementById('tabBar');
  tabBar.innerHTML = ''; // Clear previous tabs
}

openTab(name, content, fullPath = null, tempPath = null) {
  const self = this; // capture 'this' for inner functions

  // Avoid reopening same file using filePath or tempPath
  const existingIndex = this.tabs.findIndex(tab =>
    (fullPath && tab.filePath === fullPath) ||
    (tempPath && tab.tempPath === tempPath) ||
    (!fullPath && !tempPath && !tab.filePath && tab.name === name)
  );
  if (existingIndex !== -1) {
    this.switchTab(existingIndex);
    return;
  }

  const uri = monaco.Uri.file(fullPath || tempPath || `untitled-${Date.now()}-${name}`);
  const model = monaco.editor.getModel(uri) || monaco.editor.createModel(content, this.detectLang(name), uri);

  const tab = {
    name,
    model,
    filePath: fullPath || null,
    tempPath: tempPath || null
  };
  this.tabs.push(tab);
  const index = this.tabs.length - 1;

  // Create tab button
  const tabBtn = document.createElement('div');
  tabBtn.className = 'tab px-4 flex items-center h-full cursor-pointer bg-[#2d2d2d] hover:bg-[#373737] border-r border-[#3c3c3c] tab-item';
  tabBtn.innerHTML = `
    <span>${name}</span>
    <span class="tab-close ml-2 text-sm text-gray-400 hover:text-red-400 cursor-pointer">×</span>
  `;
  tabBtn.dataset.index = index;

  tabBtn.onclick = function(e) {
    const i = parseInt(this.dataset.index);
    if (e.target.classList.contains('tab-close')) {
      self.closeTab(i); // use 'self' to access class method
    } else {
      self.switchTab(i);
    }
  };

  document.getElementById('tabBar').appendChild(tabBtn);
  this.switchTab(index);

  // Make tab visually active
  document.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
  tabBtn.classList.add('active');
}

switchTab(index) {
  if (index < 0 || index >= this.tabs.length) return;

  this.activeTabIndex = index;

  const tab = this.tabs[index];
  this.editorInstance.setModel(tab.model);

  // Remove highlight and .active class from all tabs
  document.querySelectorAll('.tab-item').forEach(el => {
    el.classList.remove('bg-[#373737]', 'text-teal-400', 'active');
  });

  // Highlight the active tab
  const tabBar = document.getElementById('tabBar');
  const activeBtn = tabBar.children[index];
  if (activeBtn) {
    activeBtn.classList.add('bg-[#373737]', 'text-teal-400', 'active');
  }
}

// New closeTab function
closeTab(index) {
  if (index < 0 || index >= this.tabs.length) return;

  const tab = this.tabs[index];

  // Dispose Monaco model if needed
  if (tab.model) tab.model.dispose();

  // Remove tab from array
  this.tabs.splice(index, 1);

  // Remove tab button from DOM
  const tabBar = document.getElementById('tabBar');
  if (tabBar.children[index]) tabBar.removeChild(tabBar.children[index]);

  // Update remaining tab buttons' indices
  Array.from(tabBar.children).forEach((btn, i) => btn.dataset.index = i);

  // Switch to previous tab or first tab
  if (this.tabs.length > 0) {
    const newIndex = index === 0 ? 0 : index - 1;
    this.switchTab(newIndex);
  } else {
    this.activeTabIndex = -1;
    this.editorInstance.setModel(null); // no tabs open
  }
}





loadFolderToSidebar(tree) { 
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `<h3 class="text-lg font-bold mb-4">Explorer</h3>`;

  const iconBase = 'text-xs font-mono px-1 border border-gray-500 rounded hover:border-teal-400 cursor-pointer';
  this.sidebarFiles = []; // clear previous list
  this.currentTree = tree; // ✅ store the tree for later refresh

  const renderTree = (items, parent) => {
    queueMicrotask(() => {
      items.forEach(item => {
        const el = document.createElement('li');
        el.className = 'ml-2';

        if (item.type === 'folder') {
          const folderHeader = document.createElement('div');
          folderHeader.className = 'flex items-center justify-between cursor-pointer font-bold hover:text-teal-400';

          const labelSpan = document.createElement('span');
          labelSpan.innerText = `📁 ${item.name}`;
          labelSpan.className = 'ml-1 font-normal text-sm';

          const childrenContainer = document.createElement('ul');
          childrenContainer.className = 'ml-4 space-y-1 hidden';

          labelSpan.onclick = () => childrenContainer.classList.toggle('hidden');

          const actions = document.createElement('div');
          actions.className = 'space-x-2 flex text-gray-400 text-xs';

          const addFileIcon = document.createElement('span');
          addFileIcon.innerText = '＋';
          addFileIcon.title = 'New File';
          addFileIcon.className = iconBase;
          addFileIcon.onclick = (e) => {
            e.stopPropagation();
            setTimeout(() => this.createInlineInput(item.path, 'file', childrenContainer), 10);
          };

          const addFolderIcon = document.createElement('span');
          addFolderIcon.innerText = '▣';
          addFolderIcon.title = 'New Folder';
          addFolderIcon.className = iconBase;
          addFolderIcon.onclick = (e) => {
            e.stopPropagation();
            setTimeout(() => this.createInlineInput(item.path, 'folder', childrenContainer), 10);
          };

          actions.appendChild(addFileIcon);
          actions.appendChild(addFolderIcon);

          folderHeader.appendChild(labelSpan);
          folderHeader.appendChild(actions);

          el.appendChild(folderHeader);
          el.appendChild(childrenContainer);

          requestIdleCallback(() => renderTree(item.children || [], childrenContainer));
        } else if (item.type === 'file') {
          const fileItem = document.createElement('div');
          fileItem.className = 'cursor-pointer hover:text-teal-400 ml-1 font-normal text-sm sidebar-item';
          fileItem.innerText = `📄 ${item.name}`;

          // ✅ Add dataset info for context menu
          fileItem.dataset.path = item.path;
          fileItem.dataset.name = item.name;
          fileItem.dataset.type = 'file';

          // ✅ Immediately add to sidebarFiles (no need to wait for click)
          if (!this.sidebarFiles.some(f => f.path === item.path)) {
            this.sidebarFiles.push({ name: item.name, path: item.path, type: 'file' });
          }

          fileItem.onclick = async () => {
            if (!this.editorInstance) this.showEditor();
            try {
              const content = await window.electronAPI.readFile(item.path);
              const existingTab = this.tabs.find(t => t.filePath === item.path);
              if (!existingTab) {
                this.openTab(item.name, content, item.path);
              } else {
                const index = this.tabs.indexOf(existingTab);
                this.switchTab(index);
              }
            } catch (err) {
              console.error("Error reading file:", item.path, err);
            }
          };

          this.enableInlineRename(fileItem, item);
          el.appendChild(fileItem);
        }

        parent.appendChild(el);
      });
    });
  };

  const rootContainer = document.createElement('div');

  const rootHeader = document.createElement('div');
  rootHeader.className = 'flex justify-between items-center mb-1';

  const rootLabel = document.createElement('span');
  rootLabel.className = 'font-semibold cursor-pointer';
  const safePath = this.currentFolderPath || tree.path || '';
  rootLabel.innerText = `📁 ${safePath.split(/[\\/]/).pop()}`;

  const rootChildren = document.createElement('ul');
  rootChildren.className = 'ml-2 space-y-1';
  rootLabel.onclick = () => rootChildren.classList.toggle('hidden');

  const rootActions = document.createElement('div');
  rootActions.className = 'space-x-2 flex text-gray-400 text-xs';

  const rootAddFile = document.createElement('span');
  rootAddFile.innerText = '＋';
  rootAddFile.title = 'New File';
  rootAddFile.className = iconBase;
  rootAddFile.onclick = (e) => {
    e.stopPropagation();
    this.createInlineInput(this.currentFolderPath, 'file', rootChildren);
  };

  const rootAddFolder = document.createElement('span');
  rootAddFolder.innerText = '▣';
  rootAddFolder.title = 'New Folder';
  rootAddFolder.className = iconBase;
  rootAddFolder.onclick = (e) => {
    e.stopPropagation();
    this.createInlineInput(this.currentFolderPath, 'folder', rootChildren);
  };

  rootActions.appendChild(rootAddFile);
  rootActions.appendChild(rootAddFolder);

  rootHeader.appendChild(rootLabel);
  rootHeader.appendChild(rootActions);

  rootContainer.appendChild(rootHeader);
  rootContainer.appendChild(rootChildren);

  sidebar.appendChild(rootContainer);

  renderTree(tree.children || tree, rootChildren);
}




createInlineInput(folderPath, type, container) {
  const li = document.createElement('li');
  li.className = 'ml-2';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = type === 'file' ? 'newFile.txt' : 'newFolder';
  input.className = 'px-1 py-0.5 text-xs rounded w-40 bg-gray-800 text-white border border-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-400';

  const cleanup = () => {
    li.remove();
  };

  input.onkeydown = async (e) => {
    const name = input.value.trim();

    if (e.key === 'Enter') {
      if (!name) {
        cleanup();
        return;
      }
      try {
        if (type === 'file') {
          await window.electronAPI.createFileInFolder({ folderPath, fileName: name });
        } else {
          await window.electronAPI.createFolderInFolder({ folderPath, folderName: name });
        }

        const updatedTree = await window.electronAPI.getFolderTree(this.currentFolderPath);
        this.loadFolderToSidebar(updatedTree);
      } catch (err) {
        console.error(`Error creating ${type}:`, err);
      }
    } else if (e.key === 'Escape') {
      cleanup();
    }
  };

  input.onblur = () => {
    const name = input.value.trim();
    if (!name) {
      cleanup();
    }
  };

  li.appendChild(input);
  container.prepend(li);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      input.focus(); // NOW focus is safe even after fetchQuestion
    });
  });
  
}





async saveCurrentFile() {
  const activeTab = this.tabs[this.activeTabIndex];
  if (!activeTab) {
    this.showToast('No file is open.');
    return;
  }
  // et ext = activeTab.name.includes('.') ? activeTab.name.split('.').pop() : 'txt';

  const content = this.editorInstance.getValue();
  const currentFolder = this.currentFolderPath;

  // CASE 1: New or temp file
  if (!activeTab.filePath || activeTab.isTemp) {
    let filePath;
    let baseName = activeTab.name.replace(/\.\w+$/, '') || 'untitled';
    let ext = activeTab.name.includes('.') ? activeTab.name.split('.').pop() : 'txt';

    if (currentFolder) {
      filePath = await window.electronAPI.joinPath(currentFolder, `${baseName}.${ext}`);

      const success = await window.electronAPI.saveFile(filePath, content);
      if (!success) {
        alert('Error saving file.');
        return;
      }
    } else {
      const result = await window.electronAPI.saveAsFile(content);
      if (!result?.filePath) {
        alert('Save canceled.');
        return;
      }
      filePath = result.filePath;
    }

    const newName = filePath.split(/[/\\]/).pop();

    // ✅ Update tab
    activeTab.filePath = filePath;
    activeTab.name = newName;
    delete activeTab.isTemp;

    // ✅ Update tab button
    const tabBtn = document.querySelectorAll('.tab-item')[this.activeTabIndex];
    if (tabBtn) tabBtn.innerText = newName;

    // ✅ Update sidebar with folder tree
    if (currentFolder && filePath.startsWith(currentFolder)) {
      const relativePath = filePath.replace(currentFolder + require('path').sep, '');
      const parts = relativePath.split(require('path').sep);
      let current = this.sidebarFiles;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;

        let existing = current.find(f => f.name === part);

        if (!existing) {
          const newNode = {
            name: part,
            path: isLast ? filePath : null,
            type: isLast ? 'file' : 'folder',
            children: isLast ? undefined : []
          };
          current.push(newNode);
          existing = newNode;
        }

        if (!isLast && !existing.children) {
          existing.children = [];
        }

        if (!isLast) current = existing.children;
      }
    } else {
      // Fallback: flat list
      this.sidebarFiles.push({ name: newName, path: filePath, type: 'file' });
    }

    this.refreshSidebar();
    this.showToast("✅File is saved.");

  } else {
    // CASE 2: Already saved file
    const success = await window.electronAPI.saveFile(activeTab.filePath, content);
    if (!success) this.showToast('Failed to save file.');
  }
}



enableInlineRename(fileItem, file) {
  fileItem.ondblclick = () => {
    queueMicrotask(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = file.name;
      input.className = 'bg-gray-800 text-white p-1 rounded w-full';

      input.onblur = async () => {
        const newName = input.value.trim();
        if (newName && newName !== file.name) {
          const oldPath = file.path;
          const dirParts = oldPath.split(/[/\\]/);
          dirParts.pop();
          const dirPath = dirParts.join('/');

          const newPath = await window.electronAPI.joinPath(dirPath, newName);
          const exists = await window.electronAPI.fileExists(newPath);
          if (exists) {
            alert('A file or folder with this name already exists.');
            fileItem.textContent = file.name;
            return;
          }

          const success = await window.electronAPI.renameFileOrFolder(file.path, newPath);
          if (!success) {
            alert('Failed to rename file.');
            fileItem.textContent = file.name;
            return;
          }

          file.name = newName;
          file.path = newPath;
          fileItem.textContent = newName;

          const tabIndex = this.tabs.findIndex(tab => tab.filePath === file.path);
          if (tabIndex !== -1) {
            const tabBtn = document.querySelectorAll('.tab-item')[tabIndex];
            if (tabBtn) tabBtn.innerText = newName;
            this.tabs[tabIndex].name = newName;
            this.tabs[tabIndex].filePath = newPath;
          }
        } else {
          fileItem.textContent = file.name;
        }
      };

      fileItem.innerHTML = '';
      fileItem.appendChild(input);
      input.focus();
    });
  };
}

// refreshSidebar() {
//   const fileListContainer = document.getElementById('fileList');
//   if (!fileListContainer) return;

//   requestIdleCallback(() => {
//     fileListContainer.innerHTML = '';

//     this.sidebarFiles.forEach((file, index) => {
//       const item = document.createElement('div');
//       item.textContent = file.name;
//       item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded';
//       item.dataset.index = index;
//       item.dataset.path = file.path || file.tempPath || '';

//       item.onclick = async () => {
//         const tabIndex = this.tabs.findIndex(t => {
//           if (file.path) return t.filePath === file.path;
//           if (file.tempPath) return t.tempPath === file.tempPath;
//           return !t.filePath && t.name === file.name;
//         });

//         if (tabIndex !== -1) {
//           this.switchTab(tabIndex);
//         } else if (file.path) {
//           try {
//             const content = await window.electronAPI.readFile(file.path);
//             this.openTab(file.name, content, file.path);
//           } catch (err) {
//             console.error("Failed to open file:", file.path, err);
//           }
//         }

//         document.querySelectorAll('#fileList div').forEach(el => el.classList.remove('bg-gray-700'));
//         item.classList.add('bg-gray-700');
//       };

//       this.enableInlineRename(item, file);
//       fileListContainer.appendChild(item);
//     });
//   });
// }

refreshSidebar() {
  const fileListContainer = document.getElementById('fileList');
  if (!fileListContainer) return;

  if (!this.currentTree) return; // no tree loaded yet
  this.loadFolderToSidebar(this.currentTree);

  // Clear container first
  fileListContainer.innerHTML = '';

  // Rebuild sidebar immediately
  for (let i = 0; i < this.sidebarFiles.length; i++) {
    const file = this.sidebarFiles[i];
    const item = document.createElement('div');
    item.textContent = file.name;

    // Sidebar item styling
    item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded sidebar-item';

    // Dataset attributes for context menu
    item.dataset.index = i;
    item.dataset.name = file.name;
    item.dataset.path = file.path || file.tempPath || '';
    item.dataset.type = file.type || 'file';
    item.dataset.isTemp = file.tempPath ? "true" : "false";

    // Click handler to open file/tab
    item.onclick = async () => {
      const tabIndex = this.tabs.findIndex(t => {
        if (file.path) return t.filePath === file.path;
        if (file.tempPath) return t.tempPath === file.tempPath;
        return !t.filePath && t.name === file.name;
      });

      if (tabIndex !== -1) {
        this.switchTab(tabIndex);
      } else if (file.path) {
        try {
          const content = await window.electronAPI.readFile(file.path);
          this.openTab(file.name, content, file.path);
        } catch (err) {
          console.error("Failed to open file:", file.path, err);
        }
      }

      // Highlight the selected file
      document.querySelectorAll('#fileList div').forEach(el => el.classList.remove('bg-gray-700'));
      item.classList.add('bg-gray-700');
    };

    // Enable inline rename if applicable
    this.enableInlineRename(item, file);

    // Append item to sidebar
    fileListContainer.appendChild(item);
  }
}



// refreshSidebar() {
//   const fileListContainer = document.getElementById('fileList');
//   if (!fileListContainer) return;

//   // Clear container first
//   fileListContainer.innerHTML = '';

//   requestIdleCallback(() => {
//     // Rebuild sidebar from current in-memory list
//     for (let i = 0; i < this.sidebarFiles.length; i++) {
//       const file = this.sidebarFiles[i];
//       const item = document.createElement('div');
//       item.textContent = file.name;

//       // Sidebar item styling
//       item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded sidebar-item';

//       // Dataset attributes for context menu
//       item.dataset.index = i;
//       item.dataset.name = file.name;
//       item.dataset.path = file.path || file.tempPath || '';
//       item.dataset.type = file.type || 'file';
//       item.dataset.isTemp = file.tempPath ? "true" : "false";

//       // Click handler to open file/tab
//       item.onclick = async () => {
//         const tabIndex = this.tabs.findIndex(t => {
//           if (file.path) return t.filePath === file.path;
//           if (file.tempPath) return t.tempPath === file.tempPath;
//           return !t.filePath && t.name === file.name;
//         });

//         if (tabIndex !== -1) {
//           this.switchTab(tabIndex);
//         } else if (file.path) {
//           try {
//             const content = await window.electronAPI.readFile(file.path);
//             this.openTab(file.name, content, file.path);
//           } catch (err) {
//             console.error("Failed to open file:", file.path, err);
//           }
//         }

//         // Highlight the selected file
//         document.querySelectorAll('#fileList div').forEach(el => el.classList.remove('bg-gray-700'));
//         item.classList.add('bg-gray-700');
//       };

//       // Enable inline rename if applicable
//       this.enableInlineRename(item, file);

//       // Append item to sidebar
//       fileListContainer.appendChild(item);
//     }
//   });
// }


// refreshSidebar() {
//   const fileListContainer = document.getElementById('fileList');
//   if (!fileListContainer) return;

//   requestIdleCallback(() => {
//     fileListContainer.innerHTML = '';

//     this.sidebarFiles.forEach((file, index) => {
//       const item = document.createElement('div');
//       item.textContent = file.name;

//       // ✅ Added sidebar-item
//       item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded sidebar-item';

//       // ✅ Attach data attributes for context menu usage
//       item.dataset.index = index;
//       item.dataset.name = file.name;
//       item.dataset.path = file.path || file.tempPath || '';
//       item.dataset.isTemp = file.tempPath ? "true" : "false";

//       item.onclick = async () => {
//         const tabIndex = this.tabs.findIndex(t => {
//           if (file.path) return t.filePath === file.path;
//           if (file.tempPath) return t.tempPath === file.tempPath;
//           return !t.filePath && t.name === file.name;
//         });

//         if (tabIndex !== -1) {
//           this.switchTab(tabIndex);
//         } else if (file.path) {
//           try {
//             const content = await window.electronAPI.readFile(file.path);
//             this.openTab(file.name, content, file.path);
//           } catch (err) {
//             console.error("Failed to open file:", file.path, err);
//           }
//         }

//         document.querySelectorAll('#fileList div').forEach(el => el.classList.remove('bg-gray-700'));
//         item.classList.add('bg-gray-700');
//       };

//       this.enableInlineRename(item, file);
//       fileListContainer.appendChild(item);
//     });
//   });
// }


async setupOutput() {
  const container = document.getElementById("output");
  container.innerHTML = "";

  // 🔹 Dispose old terminal if it exists
  if (this.term) {
    try {
      this.term.dispose();
    } catch (e) {
      console.warn("Old terminal dispose failed:", e);
    }
    this.term = null;
    this.fitAddon = null;
  }

  // 🔹 Remove old resize handler if it exists
  if (this._resizeHandler) {
    window.removeEventListener("resize", this._resizeHandler);
    this._resizeHandler = null;
  }

  // 🔹 Create new terminal
  this.term = new Terminal({
    cursorBlink: true,
    fontFamily: "monospace",
    fontSize: 14,
    scrollback: 5000,
    convertEol: true,
    theme: { background: "#1e1e1e", foreground: "#cfcfcf" },
  });

  this.fitAddon = new FitAddon();
  this.term.loadAddon(this.fitAddon);
  this.term.open(container);

  // Initial fit and focus
  this.fitAddon.fit();
  this.term.focus();

  // 🔹 Print prompt function
  const printPrompt = async () => {
    const prompt = await window.electronAPI.printPrompt();
    this.term.write("\r\n" + prompt);
  };

  const handleClear = async () => {
    this.term.clear();
    this.term.write("\x1b[H");
    await printPrompt();
  };

  // 🔹 Forward keystrokes to backend
  this.term.onData(async (data) => {
    window.electronAPI.sendInput(data);
    const trimmed = data.trim().toLowerCase();
    if (trimmed === "cls" || trimmed === "clear") {
      await handleClear();
    }
  });

  // 🔹 Terminal output handler (safe: old listeners removed in preload)
  this._outputHandler = (text) => {
    if (!text) return;
    this.term.write(text.replace(/\r/g, "\r"));
    this.term.scrollToBottom();
  };
  window.electronAPI.onOutput(this._outputHandler);

  // 🔹 Resize handler
  this._resizeHandler = () => {
    if (this.fitAddon) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        this.fitAddon.fit();
        this.term.focus();
      }, 50);
    }
  };
  window.addEventListener("resize", this._resizeHandler);

  // 🔹 Prevent spacebar from scrolling page
  this.term.attachCustomKeyEventHandler((e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      return true;
    }
    return true;
  });

  // 🔹 Print initial prompt
  await printPrompt();
}


// 

async runCode() {
  const currentTab = this.tabs[this.activeTabIndex];
  if (!currentTab || !this.editorInstance) {
    this.term?.writeln("⚠️ No active file to run.");
    return;
  }

  const fileName = currentTab.name || '';
  const extension = (fileName.split('.').pop() || '').toLowerCase();

  if (!currentTab.filePath) {
    this.showToast("⚠️ Please save the file before running.");
    return;
  }

  // Save before run
  this.saveCurrentFile();
  if (!this.openedFilePaths.includes(currentTab.filePath)) {
    this.openedFilePaths.push(currentTab.filePath);
  }

  // 🔹 Clear previous terminal buffer
  if (this.term) {
    this.term.reset();
  }

  // Decide runner
  let execName = null;
  let args = [];
  let cleanup = null;

  const appTools = await window.electronAPI.getBundledToolsPaths();
  const ext = await window.electronAPI.getExt();

  switch (extension) {
    case 'js':
      execName = 'node';
      args = [currentTab.filePath];
      break;

    case 'py':
      execName = appTools.python || 'python';
      args = [currentTab.filePath];
      break;

    case 'c': {
      execName = appTools.gcc || 'gcc';
      const out = currentTab.filePath.replace(/\.c$/i, ext);
      args = [currentTab.filePath, '-o', out];
      cleanup = out;
      break;
    }

    case 'cpp':
    case 'cc': {
      execName = appTools.gpp || appTools.gcc || 'g++';
      const out = currentTab.filePath.replace(/\.(cpp|cc|cxx|c\+\+)$/i, ext);
      args = [currentTab.filePath, '-o', out];
      cleanup = out;
      break;
    }

    case 'java': {
      execName = appTools.javac || 'javac';
      args = [currentTab.filePath];
      break;
    }


case 'sql': {
  execName = appTools.sqlite3 || 'sqlite3';
  const tmpDb = currentTab.filePath.replace(/\.sql$/, '') + '.db';

  // Arguments for sqlite3 — just open the DB (no .read here)
  args = [tmpDb];
  cleanup = null;  // Don’t auto-delete DB unless you want it ephemeral
  break;
}

    default:
      this.term.writeln(`❌ Unsupported file type: .${extension}`);
      return;
  }

  // Utility to print into terminal
  const append = (txt) => {
    if (this.term) {
      this.term.write(txt.replace(/\n/g, '\r\n'));
      this.term.scrollToBottom();
    }
  };

  try {
    if (['c', 'cpp', 'cc'].includes(extension)) {
      append('🔧 Compiling...\n');
      const compileResult = await window.electronAPI.runCommandStream(execName, args);
      if (compileResult.code !== 0) {
        append('\n❌ Compile error:\n' + compileResult.stderr);
        return;
      }
      append('\n✅ Compile finished. Running...\n');

      const outExec = cleanup;
      const runResult = await window.electronAPI.runCommandStream(outExec, []);
      append('\n' + (runResult.stdout || '') + (runResult.stderr || ''));
      this.outputs=('\n' + (runResult.stdout || '') + (runResult.stderr || ''));
      
      return;
    }

    if (extension === 'java') {
      append('🔧 Compiling Java...\n');
      const compileResult = await window.electronAPI.runCommandStream(execName, args);
      if (compileResult.code !== 0) {
        append('\n❌ javac error:\n' + compileResult.stderr);
        return;
      }
      append('\n✅ javac finished. Running...\n');

      const filePath = currentTab.filePath;
      const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
      const fileDir = lastSlashIndex >= 0 ? filePath.substring(0, lastSlashIndex) : '.';

      const classname = fileName.replace(/\.java$/i, '');
      const javaRunner = appTools.java || 'java';

      const runResult = await window.electronAPI.runCommandStream(
        javaRunner,
        ['-cp', fileDir, classname]
      );

      append('\n' + (runResult.stdout || '') + (runResult.stderr || ''));
      this.outputs=('\n' + (runResult.stdout || '') + (runResult.stderr || ''));
      
      return;
    }
    if (extension === 'sql') {
      append('▶ Running SQL script...\n');

      const result = await window.electronAPI.runSQLStream(execName, args, currentTab.filePath);

      append((result.stdout || '') + (result.stderr || ''));
      // ✅ success message if no stderr and exit code is 0
    if (result.code === 0 && !result.stderr) {
      append('\n✅ SQL executed successfully.\n');
      this.outputs= (result.stdout || '') + (result.stderr || '')|| "✅ Finished ";
    } else {
      append('\n❌ SQL execution failed.\n');
    }
      return;
    }


    // default: py, js, sql
    append('▶ Running...\n');
    const result = await window.electronAPI.runCommandStream(execName, args);
    append((result.stdout || '') + (result.stderr || ''));
    this.outputs=((result.stdout || '') + (result.stderr || ''));
    if (result.code === 0 && !result.stderr) {
      append('\n✅  executed successfully.\n');
      
    } else {
      append('\n❌  execution failed.\n');
    }

    if (cleanup && process.platform !== 'win32') {
      try { /* delete temp file if needed */ } catch {}
    }

  } catch (err) {
    append('\n❌ Runtime Error:\n' + String(err));
  }
}




  detectLang(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.html')) return 'html';
    return 'plaintext';
  }

  getLanguageByExtension = (ext) => {
  // const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'c': return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hh':
    case 'hxx':
      return 'cpp';
    case 'py': return 'python';
    case 'java': return 'java';
    case 'js':
    case 'jsx': return 'javascript';
    case 'sql': return 'sql';
    default: return 'plaintext';
  }
}

  setupEditor() {
    const editorContainer = document.getElementById('editor');
    //delete previous editor instance if any
    if (this.editorInstance) {
    this.editorInstance.dispose();
    this.editorInstance = null;
  }


  //   const activeTab = this.tabs[this.activeTabIndex];
  //   if (!activeTab) {
  //     this.showToast('No file is open.');
      
  //   }
  // let ext = activeTab.name.includes('.') ? activeTab.name.split('.').pop() : 'txt';

    
    this.editorInstance = monaco.editor.create(editorContainer, {
      value: '',
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true
    });


          this.editorInstance.onKeyDown((e) => {
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
          e.preventDefault();
          this.showToast("🚫 Paste is disabled in the editor for students.✅Please Write your Code");
          
        }
      });

      // 🔹 Disable paste via mouse or any clipboard event
      this.editorInstance.onDidPaste((event) => {
        this.editorInstance.executeEdits(null, []); // remove pasted content
        this.showToast("🚫 Paste is disabled in the editor for students.✅Please Write your Code");
        

      });

      // 🔹 Disable right-click context menu (to avoid "Paste" option)
      this.editorInstance.updateOptions({
        contextmenu: false
        
      });

      // 🔹 Disable native paste on editor DOM node
      editorContainer.addEventListener('paste', (e) => {
        e.preventDefault();
        this.showToast("🚫 Paste is disabled in the  editor for students.✅Please Write your Code");
      });

  }





showCopilotPane() {
  const pane = document.getElementById('copilotPane');
  if (pane) pane.classList.remove('hidden');
}

hideCopilotPane() {
  const pane = document.getElementById('copilotPane');
  if (pane) pane.classList.add('hidden');
}


toggleCopilotPane() {
  let copilotPane = document.getElementById("copilotPane");
  let copilotGutter = document.getElementById("copilotGutter");
  const mainPane = document.getElementById("mainPane");

  if (!mainPane) return;

  // If copilotPane was completely removed, recreate it
  if (!copilotPane) {
    copilotPane = document.createElement("div");
    copilotPane.id = "copilotPane";
    copilotPane.className = "w-[25%] min-w-[200px] bg-gray-100 overflow-auto"; // Tailwind or your class
    mainPane.parentElement.appendChild(copilotPane);
  }

  // if (!copilotGutter) {
  //   copilotGutter = document.createElement("div");
  //   copilotGutter.id = "copilotGutter";
  //   copilotGutter.className = "gutter gutter-horizontal";
  //   mainPane.parentElement.insertBefore(copilotGutter, copilotPane);
  // }

  const isVisible = !copilotPane.classList.contains("hidden");

  if (isVisible) {
    // Hide and destroy the split
    copilotPane.classList.add("hidden");
    copilotGutter.classList.add("hidden");

    if (this.copilotSplit) {
      this.copilotSplit.destroy();
      this.copilotSplit = null;
    }

    mainPane.style.width = "100%";
  } else {
    // Show and re-split
    copilotPane.classList.remove("hidden");
    
    mainPane.style.width = "";

    this.copilotSplit = Split(["#mainPane", "#copilotPane"], {
      sizes: [80, 20],
      minSize: [300, 200],
      gutterSize: 4,
       gutterSize: 4,
    });
  }
}


clearCopilotContent() {
  const content = document.getElementById('copilotContent');
  if (content) content.innerHTML = '';
}

appendCopilotMessage(text, sender) {
  const content = document.getElementById('copilotContent');

  const msg = document.createElement('div');
  msg.className = sender === 'user'
    ? 'bg-gray-800 p-2 rounded text-blue-300'
    : 'bg-gray-700 p-2 rounded text-green-300';

  // Use `marked` to parse markdown (including code blocks)
  const html = marked.parse(text);

  msg.innerHTML = html;
  content.appendChild(msg);
  content.scrollTop = content.scrollHeight;

  // Re-highlight any code blocks
  document.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
  });
}



async fetchCopilotResponse(prompt) {
  this.appendCopilotMessage(prompt, 'user');
  this.appendCopilotMessage("Thinking...", 'copilot');

  try {
    const res = await fetch(`${this.base_llm}/copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    const reply = data?.response || "No response received.";
    
    const markdownText = reply;

  // Convert markdown to HTML (Option 1)
  const html = marked.parse(markdownText);

  // Append it to the chat/messages area
  


    const last = document.querySelector('#copilotContent .bg-gray-700:last-child');
    if (last?.textContent === "Thinking...") last.remove();

    
    this.appendCopilotMessage(html,"copilot");

  } catch (err) {
    console.error("Copilot error:", err);
    this.appendCopilotMessage("⚠️ Error reaching Copilot.", 'copilot');
  }
}


setupSplit() {

  document.querySelectorAll('.gutter').forEach(el => el.remove());
  // Sidebar and Main
  Split(['#sidebar', '#mainWithCopilot'], {
    sizes: [15, 85],
    minSize: 100,
    gutterSize: 4,
    elementStyle: (dimension, size, gutterSize) => ({
      'flex-basis': `calc(${size}% - ${gutterSize}px)`,
    }),
    gutterStyle: (dimension, gutterSize) => ({
      'flex-basis': `${gutterSize}px`,
    }),
  });

  // Editor and Output inside Main
  Split(['#editor', '#output'], {
    direction: 'vertical',
    sizes: [80, 20],
    minSize: [100, 100],
    gutterSize: 4,

    // Called continuously while dragging
    onDrag: () => {
      if (this.fitAddon) {
        this.fitAddon.fit();
      }
    },

    // Called once drag ends
    onDragEnd: () => {
      if (this.fitAddon) {
        this.fitAddon.fit();
      }
    }
  });

  // Editor and Copilot (initially only when Copilot is visible)
  this.copilotSplit = null;
}



// setupSplit() {
//   // Sidebar and Main
//   Split(['#sidebar', '#mainWithCopilot'], {
//     sizes: [10, 80],
//     minSize: 150,
//     gutterSize: 4,
//     elementStyle: (dimension, size, gutterSize) => ({
//       'flex-basis': `calc(${size}% - ${gutterSize}px)`,
//     }),
//     gutterStyle: (dimension, gutterSize) => ({
//       'flex-basis': `${gutterSize}px`,
//     }),
//   });

//   // Editor and Output inside Main
//   Split(['#editor', '#output'], {
//     direction: 'vertical',
//     sizes: [80, 20],
//     minSize: [100, 100], // prevent collapsing too small
//     gutterSize: 4,

//     onDragEnd: () => {
//     if (this.fitAddon) {
//       this.fitAddon.fit();
//     }
//   }
//   });

//   // Editor and Copilot (initially only when Copilot is visible)
//   this.copilotSplit = null;
// }



}


document.addEventListener('DOMContentLoaded', () => new CodeEditorApp());
console.log('Available APIs:', window.electronAPI);


