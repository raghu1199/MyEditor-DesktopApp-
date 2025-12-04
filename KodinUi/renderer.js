import './index.css';

import * as monaco from 'monaco-editor';
import Split from 'split.js';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css'; // Choose your preferred theme

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css"; // required for proper styling
// import CryptoJS from "crypto-js"; // if using crypto-js


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
    
    this.initExamMonitoring();
    
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
    this.test_server="",
    this.quiz_server="",
    this.suspiciousSet = new Set();
    


    this.user = {
    name: '',
    id:'',
    role: '',
    institute: '',
    points:0,
    subjects:[]
  };
  this.copilot=null;
  this.fetchedfaculty='';
  this.fetchedsubject='';
  this.fetchedclassid='';
  this.selectedSubject=null;
  this.selectedFaculty=null;
  this.studentStats;

    this.loadFolderToSidebar = this.loadFolderToSidebar.bind(this);
    this.showQuizPlayerModal = this.showQuizPlayerModal.bind(this);

    this.showWelcomePage();
    this.loadapi();
    this.facultyCache = new Map();  // key = institute, value = [faculties]
    this.subjectCache = new Map();  // key = `${institute}_${faculty}`, value = [subjects]
    this.classCache = new Map();  // key = `${institute}_${faculty}`, value = [subjects]
    this.quizCache = new Map();
   this.term = null;
    this.fitAddon = null;
    this._outputHandler = null;
    this._resizeHandler = null;
    this._resizeTimeout = null;
    this._inputHandler=null;
    this.MIN_LENGTH = { c: 25, cpp: 30, java: 40, js: 20, sql: 5, py:5, default: 15 };
    this.submittedFiles = new Set();
    
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
            // console.log("✅ Loaded remote config:", config);

            // this.base_server = config.server_api;
            this.base_server = config.test_api;
            this.quiz_server=config.quizapi;
            
            this.base_llm = config.llm_api;
            this.test_server=config.test_api;
            console.log("base,quiz:",this.base_server,this.quiz_server);

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
        this.showToast("No internet detected. You are in Guest Mode.");
        // console.log("Guest mode activated due to no internet.");
    }

    // Listen for internet reconnection
    window.addEventListener("online", async () => {
        // console.log("🌐 Internet reconnected, initializing Firebase...");
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
          <button id="fileBtn" class="hover:text-teal-400">Menu</button>
          <div id="fileMenu" class="hidden absolute left-0 mt-1 w-48 bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-lg z-50">
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="newFile">New File ▸</div>
            <div id="newFileTypeMenu" class="hidden absolute left-full top-0 mt-0 ml-0 w-40 bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-lg z-50">
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="py">Python File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="js">JavaScript File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="c">C File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="cpp">C++ File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="java">Java File</div>
              <div class="px-2 py-1 hover:bg-[#3c3c3c] cursor-pointer" data-type="txt">Text File</div>
            </div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="openFile">Open File</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="openFolder">Open Folder</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="saveFile">Save</div>

            <!-- Moved buttons inside File menu -->

            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="joinClass">Join Class</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="viewClassSubmissions">View Class Submissions</div>

            
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="viewMySubmissions">My Submissions</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="viewJoinRequests">View Join Requests</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="myClasses">My Classes</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="createQuiz">
              Create Quiz
            </div>

            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="evaluateQuiz">
            Evaluate Quiz
          </div>

            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="joinQuiz">
                Join Quiz
              </div>

            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="viewQuizResults">
              View Quiz Results
            </div>


            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="exportFile">Session Report </div>
            
            

          </div>

          

        </div>


        
        <button id="getQuestionBtn" class="hover:text-teal-400 hidden">Question</button>
        <button id="postQuestionBtn" class="hover:text-teal-400 hidden">Post Question</button>
        <button id="uploadBtn" class="hover:text-teal-400 hidden">Upload Session</button>
        <!-- Upload Notes Button -->
        <button id="uploadNotesBtn" class="hover:text-teal-400 hidden">Upload Notes</button>
        <button id="getNotesBtn" class="hover:text-teal-400 hidden">Notes</button>


       
        <button id="generateExcelBtn" class="hover:text-teal-400 hidden">Generate Report</button>

        <button id="runBtn" class="hover:text-teal-400">Run</button>
        <button id="open-shell-btn" class="hover:text-teal-400 ">Terminal</button>

        <button id="copilotToggleFromMenu" class="hover:text-teal-400">Kodin</button>
        <!-- Tutorial Menu -->
        <div class="relative">
          <button id="tutorialBtn" class="hover:text-teal-400">Tutorial</button>
          <div id="tutorialMenu" class="hidden absolute left-0 mt-1 w-48 bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-lg z-50">
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="python.pdf">Python</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="c.pdf">C</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="cpp.pdf">C++</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="java.pdf">Java</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="javascript.pdf">JavaScript</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="sql.pdf">SQL</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="kodin_student.pdf">Kodin-Student</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-file="kodin_teacher.pdf">Kodin-Teacher</div>

          </div>
        </div>
        

      </div>

      <!-- USER INFO + WINDOW BUTTONS -->
   <div class="flex items-center space-x-4">
  <div id="topBarUserInfo" class="text-sm text-gray-300"></div>
  <div class="flex space-x-2">
    <button id="min-btn" 
            class="hover:text-gray-300 transition-colors duration-150">
      —
    </button>
    <button id="max-btn" 
            class="hover:text-gray-300 transition-colors duration-150">
      ▢
    </button>
    <button id="close-btn" 
            class="hover:text-red-500 transition-colors duration-150">
      ✕
    </button>
  </div>
</div>


  `;

  // Window Controls
  document.getElementById('min-btn').onclick = () => window.electronAPI.windowControl('minimize');
  document.getElementById('max-btn').onclick = () => window.electronAPI.windowControl('maximize');
  document.getElementById('close-btn').onclick = () => window.electronAPI.windowControl('close');
  // document.getElementById('logoutBtn').onclick = () => location.reload();
  document.getElementById('runBtn').onclick = () => this.runCode();
  // <button id="pdfToggleFromMenu" class="hover:text-teal-400">📄 Tutorial</button>

      

  const fileBtn = document.getElementById('fileBtn');
  const fileMenu = document.getElementById('fileMenu');
  const newFileTypeMenu = document.getElementById('newFileTypeMenu');

  document.getElementById('open-shell-btn').addEventListener('click', () => {
  this.setupShellTerminal();
});

this.handleTutorialMenuActions();

  const closeBtn = document.getElementById("copilotToggleBtn");
      if (closeBtn) {
        // bind ensures "this" refers to CopilotUI instance
        closeBtn.addEventListener("click", this.hideCopilotPane.bind(this));
      }
    



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
      this.showToast("✔File Saved.")
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

handleTutorialMenuActions() {
  const tutorialBtn = document.getElementById("tutorialBtn");
  const tutorialMenu = document.getElementById("tutorialMenu");

  // Toggle submenu
  tutorialBtn.onclick = (e) => {
    e.stopPropagation();
    tutorialMenu.classList.toggle("hidden");
  };

  // Close menu when clicking outside
  document.body.addEventListener("click", () => {
    tutorialMenu.classList.add("hidden");
  });

  // Handle submenu clicks


  tutorialMenu.addEventListener("click", async (e) => {
     e.stopPropagation();
  const fileName = e.target.dataset.file;
  if (!fileName) return;

  const pdfUrl = await window.electronAPI.resolveTutorialPdf(fileName);

  this.showPdfInPane(pdfUrl);  // ✅ iframe can load file:// now
  tutorialMenu.classList.add("hidden");
});

}

showPdfInPane(pdfUrl) {
  const pdfPane = document.getElementById("pdfPane");
  const copilotPane = document.getElementById("copilotPane");
  const mainPane = document.getElementById("mainPane");

  if (!pdfPane || !mainPane) return;

  // Inject header + iframe
  pdfPane.innerHTML = `
    <div class="pdf-header flex items-center justify-between px-3 py-2 border-b border-[#3c3c3c] bg-[#2d2d2d]">
      <span class="text-sm font-semibold text-teal-400">PDF Viewer</span>
      <button id="pdfCloseBtn" class="text-gray-400 hover:text-teal-300 text-xs">❌</button>
    </div>
<iframe src="${pdfUrl}" class="w-full h-full border-0"></iframe>
  `;

  // Hide Copilot if it’s open
  if (copilotPane && !copilotPane.classList.contains("hidden")) {
    if (this.copilotSplit) {
      this.copilotSplit.destroy();
      this.copilotSplit = null;
    }
    copilotPane.classList.add("hidden");
  }

  // Show PDF pane
  pdfPane.classList.remove("hidden");
  mainPane.style.flex = ""; // Let Split.js handle

  // Destroy old split if exists
  if (window.pdfSplit) {
    window.pdfSplit.destroy();
    window.pdfSplit = null;
  }

  // Create Split.js (resizable panes)
  window.pdfSplit = Split(["#mainPane", "#pdfPane"], {
    sizes: [60, 40],
    minSize: [100, 100],
    gutterSize: 4,
    cursor: "col-resize",
  });

  // Close button handler
  document.getElementById("pdfCloseBtn")?.addEventListener("click", () => {
    pdfPane.classList.add("hidden");

    if (window.pdfSplit) {
      window.pdfSplit.destroy();
      window.pdfSplit = null;
    }

    // Reset editor width
    mainPane.style.flex = "1 1 100%";
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

       case 'joinClass':
        this.showQuestionModal(); // keep your existing join class function
        fileMenu.classList.add('hidden');
        break;

  case 'viewClassSubmissions':
        this.showClassSubmissions(); // keep your existing view class submissions function
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

  if (!this.outputs || this.outputs.trim() === "") {
    this.showToast("⚠️ No output captured yet. Please run (Ctrl+Enter) before exporting.");
    return;
  }

  try {
    // Step 1: Write outputs to temp file
    const tempFilePath = await window.electronAPI.writeOutputToTempFile(this.outputs);
    if (!tempFilePath) {
      this.showToast("⚠️ No output to export. Please run code first.");
      return;
    }

    // Step 2: Generate PDF using exportReport
    const result = await window.electronAPI.exportReport(
      openedFiles,
      currentUser,
      currentFolder,
      tempFilePath
    );

    if (result.success && result.path) {
      this.showToast("✔ PDF exported successfully!");

      // Step 3: Read back the PDF as blob for preview
      const pdfBlob = await window.electronAPI.readFileAsBlob(result.path);
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Step 4: Open in PDF Viewer modal
      this.openPdfViewer(pdfUrl);
    } else {
      this.showToast("❌ Export failed. Check console.");
      console.error(result.error);
    }
  } catch (err) {
    console.error("Unexpected export error:", err);
    this.showToast("❌ Unexpected error occurred during export.");
  }

  // Step 5: Refresh folder tree in sidebar
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
    if (!fileMenu) return;

    // List of all role-specific buttons
    const roleButtons = [
        'exportFile', 'viewClassSubmissions', 'joinClass', 
        'viewJoinRequests', 'viewMySubmissions', 'logout', 'myClasses','createQuiz','joinQuiz','evaluateQuiz','viewQuizResults'
    ];

    // Hide all first safely
    roleButtons.forEach(action => {
        const el = fileMenu.querySelector(`[data-action="${action}"]`);
        if (el) el.classList.add('hidden');
    });

    // Create Quiz teachers only
    const createQuizBtn = fileMenu.querySelector('[data-action="createQuiz"]');
    if (createQuizBtn && this.user.role === 'teacher') {
        createQuizBtn.classList.remove('hidden');
        createQuizBtn.onclick = (e) => {
            e.stopPropagation();
            this.showQuizCreationModal(); //
            fileMenu.classList.add('hidden');
        };
    }

    const evalQuizBtn = fileMenu.querySelector('[data-action="evaluateQuiz"]');
    if (evalQuizBtn && this.user.role === 'teacher') {
        evalQuizBtn.classList.remove('hidden');
        evalQuizBtn.onclick = (e) => {
            e.stopPropagation();
            this.showEvaluateQuizModal(); // ⬅ opens the modal we built earlier
            fileMenu.classList.add('hidden');
        };
    }

      // Join Quiz - Students only
  const joinQuizBtn = fileMenu.querySelector('[data-action="joinQuiz"]');
  if (joinQuizBtn && this.user.role === 'student') {
      joinQuizBtn.classList.remove('hidden');
      joinQuizBtn.onclick = (e) => {
          e.stopPropagation();
          this.showJoinQuizModal(); // <-- Call the modal that asks for Faculty, Subject, QuizName
          fileMenu.classList.add('hidden');
      };
  }

   const viewQuizResultsBtn = fileMenu.querySelector('[data-action="viewQuizResults"]');
    if (viewQuizResultsBtn && this.user.role === 'student') {
        viewQuizResultsBtn.classList.remove('hidden');
        viewQuizResultsBtn.onclick = (e) => {
            e.stopPropagation();
            this.viewMyQuizResults(); // <-- Open modal for selecting faculty/subject and show results
            fileMenu.classList.add('hidden');
        };
    }

    // 🎓 Join Class (students only)
    const joinClassBtn = fileMenu.querySelector('[data-action="joinClass"]');
    if (joinClassBtn && this.user.role === 'student') {
        joinClassBtn.classList.remove('hidden');
        joinClassBtn.onclick = (e) => {
            e.stopPropagation();  // prevent bubbling
            this.joinClass();
            fileMenu.classList.add('hidden'); // close menu
        };
    }

    // 📚 View Class Submissions (teachers only)
    const viewClassSubmissionsBtn = fileMenu.querySelector('[data-action="viewClassSubmissions"]');
    if (viewClassSubmissionsBtn && this.user.role === 'teacher') {
        viewClassSubmissionsBtn.classList.remove('hidden');
        viewClassSubmissionsBtn.onclick = (e) => {
            e.stopPropagation();
            this.viewClassSubmissions();
            fileMenu.classList.add('hidden');
        };
    }

    // Teacher-specific buttons
    if (this.user.role === 'teacher') {
        const viewJoinRequestsBtn = fileMenu.querySelector('[data-action="viewJoinRequests"]');
        const myClassesBtn = fileMenu.querySelector('[data-action="myClasses"]');

        if (viewJoinRequestsBtn) {
            viewJoinRequestsBtn.classList.remove('hidden');
            viewJoinRequestsBtn.onclick = (e) => {
                e.stopPropagation();
                this.askSubjectAndViewRequests();
                fileMenu.classList.add('hidden');
            };
        }

        if (myClassesBtn) {
            myClassesBtn.classList.remove('hidden');
            myClassesBtn.onclick = (e) => {
                e.stopPropagation();
                this.showMyClassesModal();
                fileMenu.classList.add('hidden');
            };
        }
    }

    // Student-specific buttons
    if (this.user.role === 'student') {
        const viewMySubmissionsBtn = fileMenu.querySelector('[data-action="viewMySubmissions"]');
        if (viewMySubmissionsBtn) {
            viewMySubmissionsBtn.classList.remove('hidden');
            viewMySubmissionsBtn.onclick = (e) => {
                e.stopPropagation();
                this.viewMySubmissions();
                fileMenu.classList.add('hidden');
            };
        }
    }

    // Export and Logout for all users
    const exportBtn = fileMenu.querySelector('[data-action="exportFile"]');
    if (exportBtn) {
        exportBtn.classList.remove('hidden');
        exportBtn.onclick = (e) => {
            e.stopPropagation();
            this.handleExportFile();
            fileMenu.classList.add('hidden');
        };
    }

    const logoutBtn = fileMenu.querySelector('[data-action="logout"]');
    if (logoutBtn) {
        logoutBtn.classList.remove('hidden');
        logoutBtn.onclick = (e) => {
            e.stopPropagation();
            this.logout();
            fileMenu.classList.add('hidden');
        };
    }
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
    this.showToast("⏳ Fetching classes...");

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
      // console.error("Error fetching classes:", err);
      classesList.innerHTML = "<div class='text-red-400 p-2'>Failed to load classes</div>";
    }
  };
}

async showQuestionModal() {

  // Cleanup old dropdowns
  ["faculty-list", "subject-list", "class-list"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  let modal = document.getElementById("getQuestionModal");

  if (!modal) {
    const modalHTML = `
      <div id="getQuestionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96 relative">
          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Get Question</h2>

          <label class="block text-sm text-white mb-1">Type:</label>
          <select id="questionTypeInput" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">
            <option value="practical">Practical</option>
            <option value="assignment">Assignment</option>
          </select>

          <label class="block text-sm text-white mb-1">Faculty:</label>
          <div class="relative w-full mb-4">
            <input id="facultyInput" type="text" autocomplete="off" spellcheck="false"
              class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <label class="block text-sm text-white mb-1">Subject:</label>
          <div class="relative w-full mb-4">
            <input id="subjectInput" type="text" autocomplete="off" spellcheck="false"
              class="w-full p-2 rounded bg-[#1e1e1e] text-white">
          </div>

          <label class="block text-sm text-white mb-1">Class ID:</label>
          <div class="relative w-full mb-4">
            <input id="classIdInput" type="text" autocomplete="off" spellcheck="false"
              class="w-full p-2 rounded bg-[#1e1e1e] text-white">
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
  const typeInput = document.getElementById("questionTypeInput");

  const cancelBtn = document.getElementById("cancelQuestionBtn");
  const fetchBtn = document.getElementById("fetchQuestionBtn");

  // Reset values
  facultyInput.value = "";
  subjectInput.value = "";
  classIdInput.value = "";
  typeInput.value = "practical";

  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const cleanupLists = () => {
    ["faculty-list", "subject-list", "class-list"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  };

  const onFacultyChangeClear = () => {
    subjectInput.value = "";
    classIdInput.value = "";
    const s = document.getElementById("subject-list"); if (s) s.remove();
    const c = document.getElementById("class-list"); if (c) c.remove();
  };

  const onSubjectChangeClear = () => {
    classIdInput.value = "";
    const c = document.getElementById("class-list"); if (c) c.remove();
  };

  try {
    cleanupLists();

    const institute = this.user?.institute;
    const base_server = this.base_server;

    this.setupFacultyAutocomplete(facultyInput, institute, base_server);
    this.setupSubjectAutocomplete(subjectInput, institute, facultyInput, base_server);
    this.setupClassAutocomplete(classIdInput, institute, facultyInput, subjectInput, base_server);

    facultyInput.addEventListener("input", onFacultyChangeClear);
    subjectInput.addEventListener("input", onSubjectChangeClear);
  } catch (err) {}

  cancelBtn.onclick = () => {
    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    facultyInput.removeEventListener("input", onFacultyChangeClear);
    subjectInput.removeEventListener("input", onSubjectChangeClear);
  };

  fetchBtn.onclick = () => {
    const faculty = facultyInput.value.trim();
    const subject = subjectInput.value.trim();
    const classId = classIdInput.value.trim();
    const type = typeInput.value; // practical | assignment

    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");

    facultyInput.removeEventListener("input", onFacultyChangeClear);
    subjectInput.removeEventListener("input", onSubjectChangeClear);

    this.fetchedType = type; // store for upload modal as well
    this.showToast("⏳ Fetching Question...");

    this.fetchQuestion(faculty, subject, classId, type);
    this.startExamMonitoring(5000);
  };
}


async fetchQuestion(faculty, subject, classId, type = "practical") {

  const institute = this.user.institute || '';
  if (!faculty || !subject || !classId || !institute) {
    this.showToast("Faculty, subject, class ID, or institute is missing.");
    return;
  }

  this.fetchedfaculty = faculty;
  this.fetchedsubject = subject;
  this.fetchedclassid = classId;

  // ⚡ SWITCH SERVER
  const server = (type === "assignment")
    ? this.quiz_server
    : this.base_server;

  try {
    const response = await fetch(
      `${server}/get_question?faculty=${faculty}&subject=${subject}&class_id=${classId}&institute=${institute}`
    );
    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const questionText = data.question || "No question returned.";

    const result = await window.electronAPI.saveQuestionFiles({ questionText });
    if (!result || !result.success) throw new Error("Failed to save question files.");

    const folderPath = result.folder;
    const refreshed = await window.electronAPI.getFolderTree(folderPath);

    if (!refreshed) {
      this.showToast("Failed to load folder structure.");
      return;
    }

    this.currentFolderPath = folderPath;

    setTimeout(() => {
      requestIdleCallback(() => {
        this.loadFolderToSidebar(refreshed);

        requestAnimationFrame(() => {
          setTimeout(() => {
            this.showToast("✔ Question folder created and loaded!");
          }, 50);
        });
      });
    }, 100);

  } catch (error) {
    this.showToast("Failed to fetch question: " + error.message);
  }
}






showToast(message, duration = 3500) {
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
    }, 400); // Match fade-out transition duration
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
// ✅ Reusable: Autocomplete for quiz names (for students)
async setupQuizNameAutocomplete(inputEl, institute, facultyInput, subjectInput, base_server) {
    inputEl.addEventListener("input", async () => {
        const query = inputEl.value.trim().toLowerCase();
        const faculty = facultyInput.value.trim();
        const subject = subjectInput.value.trim();
        if (!query || !faculty || !subject) return;

        try {
            const key = `${institute}_${faculty}_${subject}`;
            let quizzes;

            // Use cache if available
            if (this.quizCache.has(key)) {
                quizzes = this.quizCache.get(key);
            } else {
                const url = new URL(`${this.quiz_server}/get-quizzes`);
                url.searchParams.append("college", institute);
                url.searchParams.append("faculty", faculty);
                url.searchParams.append("subject", subject);

                const res = await fetch(url);
                const data = await res.json();
                quizzes = data.quizzes?.map(q => q.quizName) || [];
                this.quizCache.set(key, quizzes);
            }

            // Filter locally
            const filtered = quizzes.filter(q => q.toLowerCase().includes(query));

            // Create or reuse dropdown
            let list = document.getElementById("quiz-list");
            if (!list) {
                list = document.createElement("div");
                list.id = "quiz-list";
                list.className = "absolute bg-[#444] border border-gray-600 mt-1 w-full max-h-40 overflow-y-auto rounded z-50";
                inputEl.parentNode.appendChild(list);
            }
            list.innerHTML = "";

            filtered.forEach(q => {
                const option = document.createElement("div");
                option.className = "p-2 cursor-pointer hover:bg-[#555]";
                option.textContent = q;
                option.onclick = () => {
                    inputEl.value = q;
                    list.innerHTML = "";
                };
                list.appendChild(option);
            });
        } catch (err) {
            console.error("Error fetching quizzes:", err);
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
        this.showToast("⏳ Sending Request...");

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
                this.showToast("✔ " + data.message);
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
            <div class="relative mb-4">
                <input type="text" id="requestSubject" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" placeholder="Enter Subject"/>
                <div id="subjectDropdown" class="absolute left-0 top-full w-full bg-[#555] text-white rounded shadow mt-1 z-50 hidden"></div>
            </div>

            <div id="requestList" class="space-y-4 max-h-64 overflow-y-auto mb-4"></div>

            <button id="fetchRequestsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1] mb-2">Fetch Requests</button>
            <button id="approveSelectedBtn" class="w-full bg-green-500 text-white font-semibold py-2 rounded hover:bg-green-600 hidden mb-4">Approve Selected</button>
            <button id="closeRequestsModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    const requestList = document.getElementById("requestList");
    const approveBtn = document.getElementById("approveSelectedBtn");
    const subjectInput = document.getElementById("requestSubject");
    const dropdownContainer = document.getElementById("subjectDropdown");
    const institute = this.user.institute;
    const faculty = this.user.id;

    // Hidden faculty input for autocomplete
    const fakeFacultyInput = document.createElement("input");
    fakeFacultyInput.type = "hidden";
    fakeFacultyInput.value = faculty;
    document.body.appendChild(fakeFacultyInput);

    // Setup autocomplete to use dropdownContainer
    this.setupSubjectAutocomplete(subjectInput, institute, fakeFacultyInput, this.base_server, dropdownContainer);

    // Dispatch input event to initialize autocomplete
    fakeFacultyInput.dispatchEvent(new Event("input"));

    // Close modal
    document.getElementById("closeRequestsModalBtn").onclick = () => modal.remove();

    // Fetch requests
    document.getElementById("fetchRequestsBtn").onclick = async () => {
        const subject = subjectInput.value.trim();
        this.showToast("⏳ Fetching Requests...");

        if (!subject) {
            this.showToast("Please enter a subject.");
            return;
        }

        try {
            const res = await fetch(`${this.base_server}/get-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, faculty, college: institute })
            });
            const data = await res.json();
            // console.log("sent for get-requests:", { subject, faculty, college: institute });

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
                approveBtn.classList.remove("hidden");
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

        const subject = subjectInput.value.trim();

        try {
            const res = await fetch(`${this.base_server}/approve-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ college: institute, faculty, subject, approved_ids: checked })
            });
            const data = await res.json();
            // console.log("sent for approve-requests:", { college: institute, faculty, subject, approved_ids: checked });

            if (res.ok) {
                this.showToast("Requests approved ✔");
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

async showUploadNotesModal() {
  this.startExamMonitoring(5000);
  let modal = document.getElementById("uploadNotesModal");

  if (!modal) {
    const modalHTML = `
      <div id="uploadNotesModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-start z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-[500px] mt-20 relative">
          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Upload Notes</h2>

          <!-- Hidden faculty dummy input (needed for subject autofetch) -->
          <input id="notesFacultyInput" type="hidden" />

          <label class="block text-sm text-white mb-1">Subject:</label>
          <div class="relative w-full mb-3">
            <input id="notesSubjectInput" type="text" 
              class="w-full p-2 rounded bg-[#1e1e1e] text-white"/>
            <!-- Container for autocomplete suggestions -->
            <div id="notesSubjectInput-suggestions"
              class="absolute left-0 right-0 bg-[#1e1e1e] text-white rounded shadow-lg hidden max-h-40 overflow-y-auto z-50">
            </div>
          </div>

          <label class="block text-sm text-white mb-1">Note Name:</label>
          <input id="notesNameInput" type="text" 
            class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-3"/>

          <!-- Choice -->
          <div class="mb-4">
            <label class="text-white flex items-center space-x-2">
              <input type="radio" id="generateOption" name="uploadOption" value="generate" checked />
              <span>Generate from Current Session</span>
            </label>
            <label class="text-white flex items-center space-x-2 mt-2">
              <input type="radio" id="uploadOption" name="uploadOption" value="upload" />
              <span>Upload Existing PDF</span>
            </label>
          </div>

          <!-- File input styled as button -->
          <div id="uploadFileSection" class="hidden mb-3">
            <label class="text-sm text-white block mb-2">Select PDF File:</label>
            <input id="uploadNotesFile" type="file" accept="application/pdf" class="hidden" />
            
            <label for="uploadNotesFile" 
              class="inline-block bg-[#61dafb] text-black px-4 py-2 rounded cursor-pointer hover:bg-[#21a1f1]">
              📂 Choose File
            </label>
            <span id="fileName" class="ml-2 text-gray-300 text-sm italic">No file chosen</span>
          </div>

          <div class="flex justify-end space-x-2 mt-4">
            <button id="cancelNotesBtn" class="text-white hover:text-red-400">Cancel</button>
            <button id="submitNotesBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">Upload</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    modal = document.getElementById("uploadNotesModal");
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const facultyInput = document.getElementById("notesFacultyInput");
  const subjectInput = document.getElementById("notesSubjectInput");
  const noteNameInput = document.getElementById("notesNameInput");
  const fileInput = document.getElementById("uploadNotesFile");
  const fileNameLabel = document.getElementById("fileName");
  const uploadFileSection = document.getElementById("uploadFileSection");
  const cancelBtn = document.getElementById("cancelNotesBtn");
  const submitBtn = document.getElementById("submitNotesBtn");

  const faculty = this.user.id;
  const college = this.user.institute;
  const openedFiles = this.openedFilePaths || [];
  const currentFolder = this.currentFolderPath || "";

  // Hidden faculty dummy input for autofetch
  facultyInput.value = faculty;

  // ✅ Call existing subject autocomplete (now it will attach to correct container)
  this.setupSubjectAutocomplete(subjectInput, college, facultyInput, this.base_server);

  // Toggle file input visibility
  document.getElementById("generateOption").onchange = () => {
    uploadFileSection.classList.add("hidden");
  };
  document.getElementById("uploadOption").onchange = () => {
    uploadFileSection.classList.remove("hidden");
  };

  // Show chosen filename
  fileInput.onchange = () => {
    fileNameLabel.textContent = fileInput.files.length > 0
      ? fileInput.files[0].name
      : "No file chosen";
  };

  // Cancel button
  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };
this.stopExamMonitoring();

  // Upload button
  submitBtn.onclick = async () => {
    const subject = subjectInput.value.trim();
    const noteName = noteNameInput.value.trim();
    const selectedOption = document.querySelector("input[name='uploadOption']:checked").value;

    if (!subject || !noteName || !faculty || !college) {
      this.showToast("⚠️ Please fill all required fields.");
      return;
    }

    if (selectedOption === "generate") {
      // ---------- Generate from Session ----------
      this.showToast("⏳ Generating Notes PDF...");

      try {
        const tempFilePath = await window.electronAPI.writeOutputToTempFile(this.outputs);
        const exportResult = await window.electronAPI.exportReport(
          openedFiles,
          faculty,
          currentFolder,
          tempFilePath
        );

        if (!exportResult.success || !exportResult.path) {
          this.showToast("❌ Failed to generate session PDF.");
          return;
        }

        const pdfBlob = await window.electronAPI.readFileAsBlob(exportResult.path);

        const formData = new FormData();
        formData.append("pdf_file", pdfBlob, "notes.pdf");
        formData.append("college", college);
        formData.append("faculty", faculty);
        formData.append("subject", subject);
        formData.append("note_name", noteName);
        formData.append("session_generated", "true");

        const response = await fetch(`${this.base_server}/upload_notes`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.showToast("❌ Upload failed: " + errorText);
        } else {
          this.showToast("✔ Session notes uploaded successfully!");
        }
      } catch (err) {
        console.error("Generate upload error:", err);
        this.showToast("❌ Upload error: " + err.message);
      }

    } else if (selectedOption === "upload") {
      // ---------- Upload existing PDF ----------
      const file = fileInput.files[0];
      if (!file) {
        this.showToast("⚠️ Please select a PDF file.");
        return;
      }

      this.showToast("⏳ Uploading PDF...");

      try {
        const formData = new FormData();
        formData.append("pdf_file", file, file.name);
        formData.append("college", college);
        formData.append("faculty", faculty);
        formData.append("subject", subject);
        formData.append("note_name", noteName);
        formData.append("session_generated", "false");

        const response = await fetch(`${this.base_server}/upload_notes`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.showToast("❌ Upload failed: " + errorText);
        } else {
          this.showToast("✔ Notes uploaded successfully!");
        }
      } catch (err) {
        console.error("Upload error:", err);
        this.showToast("❌ Upload error: " + err.message);
      }
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };
}

async viewNotes() {
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
  modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
      <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">Get Notes</h2>

      <label class="block mb-2 font-medium">Faculty:</label>
      <div class="relative w-full mb-4">
        <input type="text" id="facultyInput" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
      </div>

      <label class="block mb-2 font-medium">Subject:</label>
      <div class="relative w-full mb-6">
        <input type="text" id="subjectInput" class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
      </div>

      <button id="loadNotesBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">Load Notes</button>
      <button id="closeNotesModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);

  const subjectInput = modal.querySelector("#subjectInput");
  const facultyInput = modal.querySelector("#facultyInput");
  const closeBtn = modal.querySelector("#closeNotesModalBtn");
  const loadBtn = modal.querySelector("#loadNotesBtn");

  const college = this.user.institute;

  // Autocomplete hooks
  this.setupFacultyAutocomplete(facultyInput, college, this.base_server);
  this.setupSubjectAutocomplete(subjectInput, college, facultyInput, this.base_server);


  closeBtn.onclick = () => modal.remove();

  loadBtn.onclick = async () => {
    const subject = subjectInput.value.trim();
    const faculty = facultyInput.value.trim();

    if (!college || !faculty || !subject) {
      this.showToast(" Please fill all fields.");
      return;
    }

    this.showToast("⏳ Loading Notes...");

    try {
      const res = await fetch(`${this.base_server}/get-notes?college=${college}&faculty=${faculty}&subject=${subject}`);
      const data = await res.json();
      const notes = data.notes || [];

      modal.remove();
      this.showNotesViewerModal(subject, notes, college, faculty);
    } catch (err) {
      console.error(err);
      this.showToast("❌ Failed to load notes.");
    }
  };
}

showNotesViewerModal(subject, notes, college, faculty) {
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

  const noteCards = notes.map(note => `
    <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
      <p class="text-[#61dafb] font-semibold">${note.note_name}</p>
      <p class="text-gray-400 text-sm">Uploaded: ${new Date(note.timestamp?._seconds * 1000).toLocaleString()}</p>
      <div class="flex gap-2 mt-3">
        <button 
          class="view-btn bg-yellow-400 text-black px-3 py-1 rounded hover:bg-yellow-300"
          data-path="${note.storage_path}">
          View
        </button>
        <button 
          class="download-btn bg-[#61dafb] text-black px-3 py-1 rounded hover:bg-[#21a1f1]"
          data-path="${note.storage_path}">
          Download
        </button>
      </div>
    </div>
  `).join("");

  modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg mt-16 w-[650px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
      <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Notes for ${subject}</h2>
      ${notes.length === 0 ? `<p>No notes available.</p>` : noteCards}
      <button id="closeNotesViewerBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#closeNotesViewerBtn").onclick = () => modal.remove();

  // Download handler
  modal.querySelectorAll(".download-btn").forEach(btn => {
    const path = btn.dataset.path;
    btn.onclick = () => this.downloadReport(path);
  });

  // View handler
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
          this.openPdfViewer(result.signed_url);
        }
      } catch (err) {
        console.error(err);
        this.showToast("❌ Failed to load PDF.");
      }
    };
  });
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

        this.showToast("⏳ Loading submissions...");

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

const reportCards = reports.map((r) => {
    const uploadTypeColor =
        r.upload_type === "external"
            ? "bg-orange-500 text-black"
            : "bg-green-500 text-black";

    return `
        <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
            
            <!-- Top PDF Details -->
            <div class="flex flex-col">
                <span class="text-[#61dafb] font-semibold">${r.pdf_name || 'Unnamed PDF'}</span>
                <span class="text-gray-300 text-sm mt-1">Class: ${r.class || 'N/A'}</span>
                <span class="text-gray-300 text-sm">Marks: ${r.marks ?? 0}</span>
            </div>

            <!-- 🔥 Combined Row: Tags on Left, Buttons on Right -->
            <div class="flex justify-between items-center mt-3 flex-wrap gap-2">

                <!-- LEFT SIDE: Tags -->
                <div class="flex gap-2 flex-wrap">

                    <!-- Upload Type Tag -->
                    ${r.upload_type ? `
                        <span class="px-2 py-0.5 text-xs rounded ${uploadTypeColor} font-semibold">
                            ${r.upload_type === "external" ? "External Upload" : "Generated"}
                        </span>
                    ` : ""}

                    <!-- Activity Tag -->
                    ${typeof r.external_activity !== "undefined" ? `
                        <span class="px-2 py-0.5 text-xs rounded bg-white  text-black font-semibold">
                            Activity:<span class="text-red-500 font-bold"> ${r.external_activity}
                        </span>
                    ` : ""}
                </div>

                <!-- RIGHT SIDE: Buttons -->
                <div class="flex gap-2">
                    <button 
                        class="view-btn bg-yellow-400 text-black px-4 py-1 rounded hover:bg-yellow-300 font-semibold"
                        data-path="${r.storage_path}">
                        View
                    </button>
                    <button 
                        class="download-btn bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1] font-semibold"
                        data-path="${r.storage_path}">
                        Download
                    </button>
                </div>

            </div>

        </div>
    `;
}).join("");

modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg mt-16 w-[600px] max-h-[90vh] p-6 text-white shadow-xl border border-gray-700 relative flex flex-col">

        <!-- Sticky Header -->
        <div class="sticky top-0 bg-[#333333] z-50 py-2 flex items-center justify-between border-b border-gray-600">
            <h2 class="text-xl font-bold text-[#61dafb]">
                My Reports for ${subject}
            </h2>
            <button id="closeModalBtn2"
                class="text-gray-400 hover:text-white text-2xl font-bold px-2">
                &times;
            </button>
        </div>

        <!-- Scrollable Content Wrapper -->
        <div class="overflow-y-auto mt-4 pr-1" style="max-height: 60vh;">
            ${reports.length === 0 ? `<p>No reports found.</p>` : reportCards}
        </div>

        <!-- Fixed Bottom Button -->
        ${reports.length > 0 ? `
            <button id="mergeReportsBtn"
                class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1] mt-4">
                Generate Final Report
            </button>
        ` : ''}
    </div>
`;


    
    document.body.appendChild(modal);

    modal.querySelector("#closeModalBtn2").onclick = () => modal.remove();

    // Download handler
    modal.querySelectorAll(".download-btn").forEach(btn => {
        const path = btn.dataset.path;
        btn.onclick = () => this.downloadReport(path);
    });

    // View handler
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
                    this.openPdfViewer(result.signed_url);
                }
            } catch (err) {
                console.error(err);
                this.showToast("❌ Failed to load PDF.");
            }
        };
    });

    // Merge handler
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
                this.showToast("⏳ Merging Reports...");
                const result = await res.json();
                if (result.signed_url) {
                    window.open(result.signed_url, "_blank");
                    this.showToast("✔ Final Report generated and uploaded.");
                } else {
                    this.showToast("❌ Failed to generate final report.");
                }
            } catch (err) {
                this.showToast("❌ Error merging reports.");
                console.error(err);
            }
        };
    }
}



// showReportViewerModal(subject, reports, college, faculty, student_id) {
//     const modal = document.createElement("div");
//     modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

//     const reportCards = reports.map((r) => `
//         <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
//             <div class="flex flex-col">
//                 <span class="text-[#61dafb] font-semibold">${r.pdf_name || 'Unnamed PDF'}</span>
//                 <span class="text-gray-300 text-sm mt-1">Class: ${r.class || 'N/A'}</span>
//                 <span class="text-gray-300 text-sm">Marks: ${r.marks ?? 0}</span>
//             </div>
//             <div class="mt-3 flex gap-2 justify-end">
//                 <button 
//                     class="view-btn bg-yellow-400 text-black px-4 py-1 rounded hover:bg-yellow-300 font-semibold" 
//                     data-path="${r.storage_path}">
//                     View
//                 </button>
//                 <button 
//                     class="download-btn bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1] font-semibold" 
//                     data-path="${r.storage_path}">
//                     Download
//                 </button>
//             </div>
//         </div>
//     `).join("");

//     modal.innerHTML = `
//         <div class="bg-[#333333] rounded-lg mt-16 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
//             <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">My Reports for ${subject}</h2>

//             ${reports.length === 0 ? `<p>No reports found.</p>` : reportCards}

//             ${reports.length > 0 ? `
//                 <button id="mergeReportsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1] mt-6">
//                     Generate Final Report
//                 </button>
//             ` : ''}

//             <button id="closeModalBtn2" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//         </div>
//     `;
//     document.body.appendChild(modal);

//     modal.querySelector("#closeModalBtn2").onclick = () => modal.remove();

//     // Download handler
//     modal.querySelectorAll(".download-btn").forEach(btn => {
//         const path = btn.dataset.path;
//         btn.onclick = () => this.downloadReport(path);
//     });

//     // View handler
//     modal.querySelectorAll(".view-btn").forEach(btn => {
//         const path = btn.dataset.path;
//         btn.onclick = async () => {
//             try {
//                 const res = await fetch(`${this.base_server}/get-view-url`, {
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify({ storage_path: path })
//                 });
//                 const result = await res.json();
//                 if (result.signed_url) {
//                     this.openPdfViewer(result.signed_url);
//                 }
//             } catch (err) {
//                 console.error(err);
//                 this.showToast("❌ Failed to load PDF.");
//             }
//         };
//     });

//     // Merge handler
//     if (reports.length > 0) {
//         modal.querySelector("#mergeReportsBtn").onclick = async () => {
//             const payload = {
//                 storage_paths: reports.map(r => r.storage_path),
//                 output_name: "final_report",
//                 college,
//                 faculty,
//                 subject,
//                 student_id
//             };
//             try {
//                 const res = await fetch(`${this.base_server}/merge-reports`, {
//                     method: "POST",
//                     headers: { "Content-Type": "application/json" },
//                     body: JSON.stringify(payload)
//                 });
//                 this.showToast("⏳ Merging Reports...");
//                 const result = await res.json();
//                 if (result.signed_url) {
//                     window.open(result.signed_url, "_blank");
//                     this.showToast("✔ Final Report generated and uploaded.");
//                 } else {
//                     this.showToast("❌ Failed to generate final report.");
//                 }
//             } catch (err) {
//                 this.showToast("❌ Error merging reports.");
//                 console.error(err);
//             }
//         };
//     }
// }


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
            this.showToast("✔ Report Downloaded");
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
        this.showToast("⏳ Loading Submissions...");

        try {
            const res = await fetch(`${this.base_server}/get-reports?college=${college}&faculty=${faculty}&subject=${subject}&class=${classId}`);
            const data = await res.json();
            const reports = data.reports || [];

            modal.remove();
            this.showClassReportViewerModal(subject, reports, college, faculty, classId);
        } catch (err) {
            this.showToast("❌Failed to load class reports.");
            // console.error(err);
        }
    };
}


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
    const first = studentReports[0];

    // Badges
    const uploadType = first.upload_type === "external"
        ? `<span class="px-2 py-1 text-xs bg-red-500 text-white rounded">External</span>`
        : `<span class="px-2 py-1 text-xs bg-green-600 text-white rounded">Generated</span>`;

    const activityBadge = `
        <span class="px-2 py-1 text-xs bg-red-500 text-white rounded">
            Activity: ${first.external_activity || 0}
        </span>
    `;

    // PDF List
    const pdfList = studentReports.map(r => `
<div class="flex justify-between items-center mt-2 border-b border-gray-700 pb-2">
    
    <!-- Left side: Upload + Activity -->
    <div class="flex gap-2">
        ${uploadType}${activityBadge}
    </div>

    <!-- Right side: View + Download -->
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
      <p class="text-gray-400 text-sm mb-1">ID: ${studentId}</p>

      <div>${pdfList}</div>

      <div class="mt-2">
          <input 
              type="number"
              min="0" max="100"
              class="marks-input w-20 p-1 rounded bg-[#444] border border-gray-600 text-white text-center"
              data-student-id="${studentId}"
              placeholder="Marks"
              value="${studentReports[0]?.marks || ''}"
          />
      </div>
      </div>`;

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
              // console.log("signed url:",result.signed_url);
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

            this.showToast("✔ Report Excel file generated successfully!");
            modal.remove();
        } catch (err) {
            console.error(err);
            this.showToast("❌Failed to generate report.");
        }
    };
}




async viewMyQuizResults() {
    // remove any leftover lists
    const oldFacultyList = document.getElementById("faculty-list");
    if (oldFacultyList) oldFacultyList.remove();
    const oldSubjectList = document.getElementById("subject-list");
    if (oldSubjectList) oldSubjectList.remove();

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">View My Quiz Results</h2>

            <label class="block mb-2 font-medium">Faculty:</label>
            <div class="relative w-full mb-4">
                <input type="text" id="quizFaculty" 
                    class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <label class="block mb-2 font-medium">Subject:</label>
            <div class="relative w-full mb-6">
                <input type="text" id="quizSubject" 
                    class="w-full p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />
            </div>

            <button id="loadQuizResultsBtn" 
                class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">
                Load Quiz Results
            </button>

            <button id="closeQuizModalBtn" 
                class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    const facultyInput = document.getElementById("quizFaculty");
    const subjectInput = document.getElementById("quizSubject");
    const closeBtn = document.getElementById("closeQuizModalBtn");
    const loadBtn = document.getElementById("loadQuizResultsBtn");

    // cleanup function
    const cleanupLists = () => {
        const f = document.getElementById("faculty-list");
        if (f) f.remove();
        const s = document.getElementById("subject-list");
        if (s) s.remove();
    };

    // clear subject when faculty changes
    const onFacultyChangeClearSubject = () => {
        subjectInput.value = "";
        const s = document.getElementById("subject-list");
        if (s) s.remove();
    };

    // ✅ Hook up autofetch
    try {
        cleanupLists();

        this.setupFacultyAutocomplete(facultyInput, this.user.institute, this.base_server);
        this.setupSubjectAutocomplete(subjectInput, this.user.institute, facultyInput, this.base_server);

        facultyInput.addEventListener("input", onFacultyChangeClearSubject);
    } catch (err) {
        console.error("Error initializing autocompletes:", err);
    }

    closeBtn.onclick = () => {
        cleanupLists();
        modal.remove();
        facultyInput.removeEventListener("input", onFacultyChangeClearSubject);
    };

    // ✅ Load quiz results
    loadBtn.onclick = async () => {
        const college = this.user.institute;
        const faculty = facultyInput.value.trim();
        const subject = subjectInput.value.trim();
        const student_id = this.user.id;

        if (!college || !faculty || !subject) {
            this.showToast("Please fill all fields.");
            return;
        }

        this.showToast("⏳ Loading quiz results...");

        try {
            const res = await fetch(
                `${this.quiz_server}/get-my-quiz-results?college=${college}&faculty=${faculty}&subject=${subject}&student_id=${student_id}`
            );
            const data = await res.json();
            const results = data.results || [];

            cleanupLists();
            modal.remove();
            facultyInput.removeEventListener("input", onFacultyChangeClearSubject);

            this.showQuizResultsViewer(subject, results);
        } catch (err) {
            console.error(err);
            this.showToast("❌ Failed to load quiz results.");
        }
    };
}

showQuizResultsViewer(subject, results) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

    const cards = results.map(r => `
        <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
            <div class="flex flex-col">
                <span class="text-[#61dafb] font-semibold">Quiz: ${r.quizId}</span>
                <span class="text-gray-300 text-sm">Marks: ${r.marks}/${r.total}</span>
                <span class="text-gray-400 text-xs">Evaluated: ${r.evaluatedAt ? new Date(r.evaluatedAt._seconds * 1000).toLocaleString() : "Pending"}</span>
            </div>
        </div>
    `).join("");

    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-16 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Quiz Results for ${subject}</h2>
            ${results.length === 0 ? `<p>No quiz results found.</p>` : cards}
            <button id="closeQuizResultsBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector("#closeQuizResultsBtn").onclick = () => modal.remove();
}






// async showPostQuestionModal() {
//   let modal = document.getElementById("postQuestionModal");

//   if (!modal) {
//     const modalHTML = `
//       <div id="postQuestionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-start z-50">
//         <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96 mt-20">
//           <h2 class="text-lg font-bold text-[#61dafb] mb-4">Post a Question</h2>
          
//           <label class="block text-sm text-white mb-1">Subject:</label>
//           <div class="relative w-full mb-4">
//             <input id="postSubjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
//           </div>

//           <label class="block text-sm text-white mb-1">Class ID:</label>
//           <div class="relative w-full mb-4">
//             <input id="postClassIdInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
//           </div>

//           <label class="block text-sm text-white mb-1">Question:</label>
//           <textarea id="postQuestionInput" rows="4" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4 resize-none"></textarea>

//           <div class="flex justify-end space-x-2">
//             <button id="cancelPostBtn" class="text-white hover:text-red-400">Cancel</button>
//             <button id="submitPostBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">Submit</button>
//           </div>
//         </div>
//       </div>
//     `;
//     document.body.insertAdjacentHTML("beforeend", modalHTML);
//     modal = document.getElementById("postQuestionModal");
//   }

//   modal.classList.remove("hidden");
//   modal.classList.add("flex");

//   const subjectInput = document.getElementById("postSubjectInput");
//   const classInput = document.getElementById("postClassIdInput");
//   const questionInput = document.getElementById("postQuestionInput");
//   const cancelBtn = document.getElementById("cancelPostBtn");
//   const submitBtn = document.getElementById("submitPostBtn");

//   const institute = this.user.institute;
//   const faculty = this.user.id;

//   // Hook up autocomplete
//   this.setupSubjectAutocomplete(subjectInput, institute, { value: faculty }, this.base_server);
//   this.setupClassAutocomplete(classInput, institute, { value: faculty }, subjectInput, this.base_server);

//   cancelBtn.onclick = () => {
//     modal.classList.add("hidden");
//     modal.classList.remove("flex");
//   };

//   submitBtn.onclick = async () => {
//     const subject = subjectInput.value.trim();
//     const classId = classInput.value.trim();
//     const questionText = questionInput.value.trim();


//     if (!subject || !classId || !questionText || !faculty || !institute) {
//       this.showToast("❌ Please fill all fields before submitting.");
//       return;
//     }
//     this.showToast("⏳ Posting Question...");

//     try {
//       const response = await fetch(`${this.base_server}/post_question`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ subject, classId, faculty, question: questionText, institute })
//       });

//       if (!response.ok) {
//         const err = await response.text();
//         throw new Error(err);
//       }

//       this.showToast("✔ Question posted successfully.");
//     } catch (error) {
//       console.error("Post error:", error);
//       this.showToast("❌ Failed to post question: " + error.message);
//     }

//     modal.classList.add("hidden");
//     modal.classList.remove("flex");
//   };
// }

async showPostQuestionModal() {
  let modal = document.getElementById("postQuestionModal");

  if (!modal) {
    const modalHTML = `
      <div id="postQuestionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-start z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96 mt-20">

          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Post a Question</h2>

          <!-- Question Type -->
          <label class="block text-sm text-white mb-1">Type:</label>
          <select id="postTypeSelect" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">
            <option value="practical" selected>Practical</option>
            <option value="assignment">Assignment</option>
          </select>

          <label class="block text-sm text-white mb-1">Subject:</label>
          <div class="relative w-full mb-4">
            <input id="postSubjectInput" type="text"
              class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
          </div>

          <label class="block text-sm text-white mb-1">Class ID:</label>
          <div class="relative w-full mb-4">
            <input id="postClassIdInput" type="text"
              class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
          </div>

          <label class="block text-sm text-white mb-1">Question / Assignment:</label>
          <textarea id="postQuestionInput" rows="4"
            class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4 resize-none"></textarea>

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

  const typeSelect = document.getElementById("postTypeSelect");
  const subjectInput = document.getElementById("postSubjectInput");
  const classInput = document.getElementById("postClassIdInput");
  const questionInput = document.getElementById("postQuestionInput");
  const cancelBtn = document.getElementById("cancelPostBtn");
  const submitBtn = document.getElementById("submitPostBtn");

  const institute = this.user.institute;
  const faculty = this.user.id;

  // Autocompletes
  this.setupSubjectAutocomplete(subjectInput, institute, { value: faculty }, this.base_server);
  this.setupClassAutocomplete(classInput, institute, { value: faculty }, subjectInput, this.base_server);

  // Close button
  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  // Submit handler
  submitBtn.onclick = async () => {
    const subject = subjectInput.value.trim();
    const classId = classInput.value.trim();
    const text = questionInput.value.trim();
    const selectedType = typeSelect.value;

    if (!subject || !classId || !text || !faculty || !institute) {
      this.showToast("❌ Please fill all fields before submitting.");
      return;
    }

    this.showToast("⏳ Posting...");

    let url = "";
    let payload = {};

    if (selectedType === "assignment") {
      // API requires: assignment, institute, faculty, subject, classId
      url = `${this.quiz_server}/post_assignment`;
      payload = {
        assignment: text,
        institute,
        faculty,
        subject,
        classId,
      };
    } else {
      // Practical question uses your existing endpoint
      url = `${this.base_server}/post_question`;
      payload = {
        question: text,
        institute,
        faculty,
        subject,
        classId,
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await response.text());

      this.showToast(
        selectedType === "assignment"
          ? "✔ Assignment posted successfully."
          : "✔ Practical question posted successfully."
      );

    } catch (err) {
      console.error("Post error:", err);
      this.showToast("❌ Failed: " + err.message);
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };
}



// async showUploadSessionModal() {
//   let modal = document.getElementById("uploadSessionModal");

//   if (!modal) {
//     const modalHTML = `
//       <div id="uploadSessionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
//         <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96">
//           <h2 class="text-lg font-bold text-[#61dafb] mb-4">Upload Session</h2>
          
//           <label class="block text-sm text-white mb-1">Faculty:</label>
//           <div class="relative w-full mb-4">
//             <input id="uploadFacultyInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
//           </div>

//           <label class="block text-sm text-white mb-1">Subject:</label>
//           <div class="relative w-full mb-4">
//             <input id="uploadSubjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
//           </div>

//           <label class="block text-sm text-white mb-1">Class:</label>
//           <div class="relative w-full mb-4">
//             <input id="uploadClassInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
//           </div>

//           <div class="flex justify-end space-x-2">
//             <button id="cancelUploadBtn" class="text-white hover:text-red-400">Cancel</button>
//             <button id="submitUploadBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">Upload</button>
//           </div>
//         </div>
//       </div>
//     `;
//     document.body.insertAdjacentHTML("beforeend", modalHTML);
//     modal = document.getElementById("uploadSessionModal");
//   }

//   modal.classList.remove("hidden");
//   modal.classList.add("flex");

//   const facultyInput = document.getElementById("uploadFacultyInput");
//   const subjectInput = document.getElementById("uploadSubjectInput");
//   const classInput = document.getElementById("uploadClassInput");

//   // ✅ Autofill if available
//   if (this.fetchedfaculty) facultyInput.value = this.fetchedfaculty;
//   if (this.fetchedsubject) subjectInput.value = this.fetchedsubject;
//   if (this.fetchedclassid) classInput.value = this.fetchedclassid;

//   // ✅ Clean up dropdown lists
//   const cleanupLists = () => {
//     ["faculty-list", "subject-list", "class-list"].forEach(id => {
//       const el = document.getElementById(id);
//       if (el) el.remove();
//     });
//   };

//   // ✅ Clear subject + class when faculty changes
//   facultyInput.addEventListener("input", () => {
//     subjectInput.value = "";
//     classInput.value = "";
//     cleanupLists();
//   });

//   // ✅ Clear class when subject changes
//   subjectInput.addEventListener("input", () => {
//     classInput.value = "";
//     const c = document.getElementById("class-list");
//     if (c) c.remove();
//   });

//   // ✅ Setup autocomplete
//   try {
//     cleanupLists();
//     this.setupFacultyAutocomplete(facultyInput, this.user.institute, this.base_server);
//     this.setupSubjectAutocomplete(subjectInput, this.user.institute, facultyInput, this.base_server);
//     this.setupClassAutocomplete(classInput, this.user.institute, facultyInput, subjectInput, this.base_server);
//   } catch (err) {
//     console.error("Error initializing autocompletes:", err);
//   }

//   document.getElementById("cancelUploadBtn").onclick = () => {
//     cleanupLists();
//     modal.classList.add("hidden");
//     modal.classList.remove("flex");
//   };

//   document.getElementById("submitUploadBtn").onclick = async () => {
//     const faculty = facultyInput.value.trim();
//     const subject = subjectInput.value.trim();
//     const classId = classInput.value.trim();

//     const studentId = this.user.id;
//     const studentName = this.user.name || "default";
//     const college = this.user.institute;
//     const openedFiles = this.openedFilePaths || [];
//     const currentFolder = this.currentFolderPath || "";

//     if (!faculty || !subject || !classId || !college || !studentName || !studentId) {
//       this.showToast("⚠️ Please fill all required fields.");
//       return;
//     }
//     this.showToast("⏳ Uploading Your Code Session...");

//     try {
//       // Step 1: Export PDF
//       const tempFilePath = await window.electronAPI.writeOutputToTempFile(this.outputs);
//       const exportResult = await window.electronAPI.exportReport(
//         openedFiles,
//         studentName,
//         currentFolder,
//         tempFilePath
//       );

//       if (!exportResult.success || !exportResult.path) {
//         this.showToast("❌ Failed to generate session PDF.");
//         return;
//       }

//       // Step 2: Read PDF as Blob
//       const pdfBlob = await window.electronAPI.readFileAsBlob(exportResult.path);

//       // Step 3: Upload to Flask API
//       const formData = new FormData();
//       formData.append("file", pdfBlob, "session.pdf");
//       formData.append("college", college);
//       formData.append("faculty", faculty);
//       formData.append("subject", subject);
//       formData.append("class", classId);
//       formData.append("pdf_name", studentName);
//       formData.append("student_name", studentName);
//       formData.append("student_id", studentId);

//       const response = await fetch(`${this.base_server}/upload-report`, {
//         method: "POST",
//         body: formData,
//       });

//       if (!response.ok) {
//         const errorText = await response.text();
//         console.error("Upload failed:", errorText);
//         this.showToast(errorText);
//       } else {
//         const result = await response.json();
//         // console.log("✅ Upload success:", result);
//         this.user.points+=10;
//         this.showToast("✔ Session uploaded successfully!");
//       }
//     } catch (err) {
//       console.error("Upload error:", err);
//       this.showToast("❌ Upload error: " + err.message);
//     }

//     cleanupLists();
//     modal.classList.add("hidden");
//     modal.classList.remove("flex");

//     const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
//     if (refreshed) {
//       requestIdleCallback(() => {
//         this.loadFolderToSidebar(refreshed);
//       });
//     }
//   };
// }


//  initExamMonitoring() {

//   // -----------------------------------------
//   // Internal state
//   // -----------------------------------------
  
  
//   const nowISO = () => new Date().toISOString();

//   // -------------------------------------------------------
//   // START Monitor
//   // -------------------------------------------------------
//   this.startExamMonitoring = async (intervalMs = 10000) => {

//     if (this._examMonitorInterval) return; // prevent duplicates

//     this.examLog = [];
//     this._monitorStartTime = nowISO();

//     this.examLog.push({
//       time: nowISO(),
//       type: "exam_started"
//     });

//     // --------------------------
//     // Event handlers
//     // --------------------------
//     this._copyHandler = () => {
//       this.examLog.push({
//         time: nowISO(),
//         type: "copy",
//         detail: "user copied"
//       });
//     };

//     this._pasteHandler = () => {
//       this.examLog.push({
//         time: nowISO(),
//         type: "paste",
//         detail: "user pasted"
//       });
//     };

//     this._visibilityHandler = () => {
//       this.examLog.push({
//         time: nowISO(),
//         type: "visibilitychange",
//         detail: document.visibilityState
//       });
//     };

//     this._focusHandler = () => {
//       this.examLog.push({
//         time: nowISO(),
//         type: "window_focus"
//       });
//     };

//     this._blurHandler = () => {
//       this.examLog.push({
//         time: nowISO(),
//         type: "window_blur"
//       });
//     };

//     // Register event listeners
//     document.addEventListener("copy", this._copyHandler);
//     document.addEventListener("paste", this._pasteHandler);
//     document.addEventListener("visibilitychange", this._visibilityHandler);
//     window.addEventListener("focus", this._focusHandler);
//     window.addEventListener("blur", this._blurHandler);


//     // ---------------------------------------------------
//     // Periodic process scan
//     // ---------------------------------------------------
//     const performScan = async () => {
//       try {
//         const list = await window.electronAPI.scanSuspiciousProcesses();
//         const serialized = JSON.stringify(list || []);

//         if (serialized !== this._lastProcessSnapshot) {
//           this._lastProcessSnapshot = serialized;

//           if (list && list.length > 0) {
//             this.examLog.push({
//               time: nowISO(),
//               type: "suspicious_processes",
//               detail: list
//             });
//           } else {
//             this.examLog.push({
//               time: nowISO(),
//               type: "suspicious_processes_cleared"
//             });
//           }
//         }
//       } catch (err) {
//         this.examLog.push({
//           time: nowISO(),
//           type: "scan_error",
//           detail: String(err)
//         });
//       }
//     };

//     // Run now + interval
//     await performScan();
//     this._examMonitorInterval = setInterval(performScan, intervalMs);

//     console.log("📡 Exam Monitoring Started");
//   };

  
//   this.stopExamMonitoring = () => {

//     if (this._examMonitorInterval) {
//       clearInterval(this._examMonitorInterval);
//       this._examMonitorInterval = null;
//     }

//     this.examLog.push({
//       time: nowISO(),
//       type: "exam_ended"
//     });

//     document.removeEventListener("copy", this._copyHandler);
//     document.removeEventListener("paste", this._pasteHandler);
//     document.removeEventListener("visibilitychange", this._visibilityHandler);
//     window.removeEventListener("focus", this._focusHandler);
//     window.removeEventListener("blur", this._blurHandler);

//     console.log("🛑 Exam Monitoring Stopped. Total events:", this.examLog.length);
//   };

//   console.log("✔ Exam Monitoring System Initialized");
// }




initExamMonitoring() {
  this.examLog = [];
  this._examMonitorInterval = null;

  this._copyHandler = null;
  this._pasteHandler = null;
  this._visibilityHandler = null;
  this._focusHandler = null;
  this._blurHandler = null;

  this._lastProcessSnapshot = null;

  console.log("✔ Exam Monitoring System Initialized");
}

// Utility
nowISO() {
  return new Date().toISOString();
}



// ---------------------------------------------------------
// 2) Start Monitoring (CALL THIS ANYWHERE)
// // ---------------------------------------------------------
// async startExamMonitoring(intervalMs = 10000) {
//   if (this._examMonitorInterval) return; // already running

//   this.examLog = [];
//   this._monitorStartTime = this.nowISO();

//   this.examLog.push({
//     time: this.nowISO(),
//     type: "exam_started"
//   });

//   // Event Handlers
//   this._copyHandler = () => {
//     this.examLog.push({
//       time: this.nowISO(),
//       type: "copy"
//     });
//   };

//   this._pasteHandler = () => {
//     this.examLog.push({
//       time: this.nowISO(),
//       type: "paste"
//     });
//   };

//   this._visibilityHandler = () => {
//     this.examLog.push({
//       time: this.nowISO(),
//       type: "visibilitychange",
//       detail: document.visibilityState
//     });
//   };

//   this._focusHandler = () => {
//     this.examLog.push({
//       time: this.nowISO(),
//       type: "window_focus"
//     });
//   };

//   this._blurHandler = () => {
//     this.examLog.push({
//       time: this.nowISO(),
//       type: "window_blur"
//     });
//   };

//   // Attach listeners
//   document.addEventListener("copy", this._copyHandler);
//   document.addEventListener("paste", this._pasteHandler);
//   document.addEventListener("visibilitychange", this._visibilityHandler);
//   window.addEventListener("focus", this._focusHandler);
//   window.addEventListener("blur", this._blurHandler);


//   // SCAN Logic
//   const performScan = async () => {
//     try {
//       const list = await window.electronAPI.scanSuspiciousProcesses();
//       const serialized = JSON.stringify(list || []);

//       if (serialized !== this._lastProcessSnapshot) {
//         this._lastProcessSnapshot = serialized;

//         this.examLog.push({
//           time: this.nowISO(),
//           type: "suspicious_processes",
//           detail: list || []
//         });
//       }
//     } catch (err) {
//       this.examLog.push({
//         time: this.nowISO(),
//         type: "scan_error",
//         detail: String(err)
//       });
//     }
//   };

//   // Run now + repeat
//   await performScan();
//   this._examMonitorInterval = setInterval(performScan, intervalMs);

//   console.log("📡 Exam Monitoring Started");
// }


// ---------------------------------------------------------
async startExamMonitoring(intervalMs = 10000) {
  if (this._examMonitorInterval) return; // already running

  this.examLog = [];
  this._monitorStartTime = this.nowISO();

  // --- Create a Set to store unique suspicious process lists ---
  this.suspiciousSet = new Set();

  this.examLog.push({
    time: this.nowISO(),
    type: "exam_started"
  });

  // Event Handlers
  this._copyHandler = () => {
    this.examLog.push({
      time: this.nowISO(),
      type: "copy"
    });
  };

  this._pasteHandler = () => {
    this.examLog.push({
      time: this.nowISO(),
      type: "paste"
    });
  };

  this._visibilityHandler = () => {
    this.examLog.push({
      time: this.nowISO(),
      type: "visibilitychange",
      detail: document.visibilityState
    });
  };

  this._focusHandler = () => {
    this.examLog.push({
      time: this.nowISO(),
      type: "window_focus"
    });
  };

  this._blurHandler = () => {
    this.examLog.push({
      time: this.nowISO(),
      type: "window_blur"
    });
  };

  // Attach listeners
  document.addEventListener("copy", this._copyHandler);
  document.addEventListener("paste", this._pasteHandler);
  document.addEventListener("visibilitychange", this._visibilityHandler);
  window.addEventListener("focus", this._focusHandler);
  window.addEventListener("blur", this._blurHandler);

  // SCAN Logic
  const performScan = async () => {
    try {
      const list = await window.electronAPI.scanSuspiciousProcesses();

      // Create a unique-readable string for the Set
      const processKey = JSON.stringify((list || []).sort());

      // Only add if new unique scan result
      if (!this.suspiciousSet.has(processKey)) {
        this.suspiciousSet.add(processKey);

        this.examLog.push({
          time: this.nowISO(),
          type: "suspicious_processes",
          detail: list || []
        });
      }

    } catch (err) {
      this.examLog.push({
        time: this.nowISO(),
        type: "scan_error",
        detail: String(err)
      });
    }
  };

  // Run now + repeat
  await performScan();
  this._examMonitorInterval = setInterval(performScan, intervalMs);

  console.log("📡 Exam Monitoring Started");
}


// ---------------------------------------------------------
// 3) Stop Monitoring
// ---------------------------------------------------------
stopExamMonitoring() {
  if (this._examMonitorInterval) {
    clearInterval(this._examMonitorInterval);
    this._examMonitorInterval = null;
  }

  this.examLog.push({
    time: this.nowISO(),
    type: "exam_ended"
  });
  

  document.removeEventListener("copy", this._copyHandler);
  document.removeEventListener("paste", this._pasteHandler);
  document.removeEventListener("visibilitychange", this._visibilityHandler);
  window.removeEventListener("focus", this._focusHandler);
  window.removeEventListener("blur", this._blurHandler);

  console.log("🛑 Exam Monitoring Stopped. Total events:", this.examLog.length);
}

async showUploadSessionModal() {
  let modal = document.getElementById("uploadSessionModal");
  this.stopExamMonitoring();


  if (!modal) {
    const modalHTML = `
  <style>
    .autocomplete-wrapper {
      position: relative;
      width: 100%;
    }

    .autocomplete-list {
      position: absolute;
      top: 100%;
      left: 0;
      width: 100%;
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 6px;
      z-index: 9999;
      max-height: 150px;
      overflow-y: auto;
    }

    .autocomplete-item {
      padding: 8px;
      cursor: pointer;
      color: white;
    }

    .autocomplete-item:hover {
      background: #333;
    }
  </style>

  <div id="uploadSessionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-start z-50">
    <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-[500px] mt-20 relative">
      <h2 class="text-lg font-bold text-[#61dafb] mb-4">Upload Session</h2>

      <label class="block text-sm text-white mb-1">Type:</label>
      <select id="uploadTypeSelect" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">
        <option value="practical" selected>Practical</option>
        <option value="assignment">Assignment</option>
      </select>

      <!-- Faculty -->
      <label class="block text-sm text-white mb-1">Faculty:</label>
      <div class="autocomplete-wrapper mb-3">
        <input id="uploadFacultyInput" type="text"
          class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
        <div id="faculty-list" class="autocomplete-list hidden"></div>
      </div>

      <!-- Subject -->
      <label class="block text-sm text-white mb-1">Subject:</label>
      <div class="autocomplete-wrapper mb-3">
        <input id="uploadSubjectInput" type="text"
          class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
        <div id="subject-list" class="autocomplete-list hidden"></div>
      </div>

      <!-- Class -->
      <label class="block text-sm text-white mb-1">Class:</label>
      <div class="autocomplete-wrapper mb-3">
        <input id="uploadClassInput" type="text"
          class="w-full p-2 rounded bg-[#1e1e1e] text-white" />
        <div id="class-list" class="autocomplete-list hidden"></div>
      </div>

      <!-- Choice -->
      <div class="mb-4">
        <label class="text-white flex items-center space-x-2">
          <input type="radio" id="sessionGenerateOption" name="sessionUploadOption" value="generate" checked />
          <span>Generate PDF from Current Session</span>
        </label>

        <label class="text-white flex items-center space-x-2 mt-2">
          <input type="radio" id="sessionUploadOption" name="sessionUploadOption" value="upload" />
          <span>Upload Existing PDF</span>
        </label>
      </div>

      <!-- File Selector -->
      <div id="sessionFileSection" class="hidden mb-3">
        <label class="text-sm text-white block mb-2">Select PDF File:</label>
        <input id="sessionUploadFile" type="file" accept="application/pdf" class="hidden" />
        
        <label for="sessionUploadFile" 
          class="inline-block bg-[#61dafb] text-black px-4 py-2 rounded cursor-pointer hover:bg-[#21a1f1]">
          📂 Choose File
        </label>
        <span id="sessionFileName" class="ml-2 text-gray-300 text-sm italic">No file chosen</span>
      </div>

      <div class="flex justify-end space-x-2 mt-4">
        <button id="cancelUploadBtn" class="text-white hover:text-red-400">Cancel</button>
        <button id="submitUploadBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">
          Upload
        </button>
      </div>
    </div>
  </div>
`;
 
    
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    modal = document.getElementById("uploadSessionModal");
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const typeSelect = document.getElementById("uploadTypeSelect");
  const facultyInput = document.getElementById("uploadFacultyInput");
  const subjectInput = document.getElementById("uploadSubjectInput");
  const classInput = document.getElementById("uploadClassInput");

  const fileInput = document.getElementById("sessionUploadFile");
  const fileNameLabel = document.getElementById("sessionFileName");
  const fileSection = document.getElementById("sessionFileSection");

  // Populate saved values
  if (this.fetchedfaculty) facultyInput.value = this.fetchedfaculty;
  if (this.fetchedsubject) subjectInput.value = this.fetchedsubject;
  if (this.fetchedclassid) classInput.value = this.fetchedclassid;

  // Autocomplete cleanup
  const cleanupLists = () => {
    ["faculty-list", "subject-list", "class-list"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  };

  facultyInput.addEventListener("input", () => {
    subjectInput.value = "";
    classInput.value = "";
    cleanupLists();
  });

  subjectInput.addEventListener("input", () => {
    classInput.value = "";
    const c = document.getElementById("class-list");
    if (c) c.remove();
  });

  try {
    cleanupLists();
    this.setupFacultyAutocomplete(facultyInput, this.user.institute, this.base_server);
    this.setupSubjectAutocomplete(subjectInput, this.user.institute, facultyInput, this.base_server);
    this.setupClassAutocomplete(classInput, this.user.institute, facultyInput, subjectInput, this.base_server);
  } catch (err) {
    console.error("Error initializing autocompletes:", err);
  }

  // Toggle file chooser vs session generate
  document.getElementById("sessionGenerateOption").onchange = () => {
    fileSection.classList.add("hidden");
  };
  document.getElementById("sessionUploadOption").onchange = () => {
    fileSection.classList.remove("hidden");
  };

  fileInput.onchange = () => {
    fileNameLabel.textContent =
      fileInput.files.length > 0 ? fileInput.files[0].name : "No file chosen";
  };

  document.getElementById("cancelUploadBtn").onclick = () => {
    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  document.getElementById("submitUploadBtn").onclick = async () => {
    const selectedType = typeSelect.value || "practical";
    const faculty = facultyInput.value.trim();
    const subject = subjectInput.value.trim();
    const classId = classInput.value.trim();

    const studentId = this.user.id;
    const studentName = this.user.name || "default";
    const college = this.user.institute;

    const openedFiles = this.openedFilePaths || [];
    const currentFolder = this.currentFolderPath || "";

    if (!faculty || !subject || !classId) {
      this.showToast("⚠️ Please fill all required fields.");
      return;
    }

    const uploadChoice = document.querySelector("input[name='sessionUploadOption']:checked").value;

    let pdfBlob = null;

    try {
      if (uploadChoice === "generate") {
        // ---------- Generate PDF from session ----------
        this.showToast("⏳ Generating session PDF...");

        const tempFilePath = await window.electronAPI.writeOutputToTempFile(this.outputs);

        // const exportResult = await window.electronAPI.exportReport(
        //   openedFiles,
        //   studentName,
        //   currentFolder,
        //   tempFilePath
        // );
        const exportResult = await window.electronAPI.exportReport(
        openedFiles,
        studentName,
        currentFolder,
        tempFilePath,
        this.examLog || []  // <-- NEW OPTIONAL PARAM
      );

        if (!exportResult.success) {
          this.showToast("❌ Failed generating PDF.");
          return;
        }

        pdfBlob = await window.electronAPI.readFileAsBlob(exportResult.path);

      } else {
        // ---------- Upload external file ----------
        const file = fileInput.files[0];
        if (!file) {
          this.showToast("⚠️ Please choose a PDF file.");
          return;
        }
        pdfBlob = file;
      }

      // ---------- Upload to correct server ----------
      const server =
        selectedType === "assignment" ? this.quiz_server : this.base_server;

      const endpoint = `${server}/upload-report`;

      const formData = new FormData();
      // formData.append("file", pdfBlob, "session.pdf");
      formData.append("pdf_file", pdfBlob, "session.pdf");

      formData.append("college", college);
      formData.append("faculty", faculty);
      formData.append("subject", subject);
      formData.append("class", classId);
      formData.append("pdf_name", studentName);
      formData.append("student_name", studentName);
      formData.append("student_id", studentId);
      formData.append("type", selectedType);
      formData.append("uploadOption", uploadChoice);
      formData.append("session_generated", uploadChoice === "generate" ? "true" : "false");
      formData.append("upload_type", uploadChoice === "generate" ? "generated" : "external");
      formData.append("exam_log", JSON.stringify(this.examLog));

      const response = await fetch(endpoint, { method: "POST", body: formData });

      if (!response.ok) {
        const errorText = await response.text();
        this.showToast("❌ Upload failed: " + errorText);
      } else {
        if (typeof this.user.points === "number") this.user.points += 10;
        this.showToast("✔ Session uploaded successfully!");
      }
    } catch (err) {
      console.error("Upload error:", err);
      this.showToast("❌ Upload error: " + err.message);
    }

    cleanupLists();
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    // Only refresh folder tree if currentFolderPath exists
      if (this.currentFolderPath) {
        try {
          const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
          if (refreshed) {
            requestIdleCallback(() => {
              this.loadFolderToSidebar(refreshed);
            });
          }
        } catch (err) {
          console.warn("Could not refresh folder tree:", err);
        }
      } 
      else {
        console.log("No current folder open, skipping folder tree refresh.");
      }

    // const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
    // if (refreshed) {
    //   requestIdleCallback(() => {
    //     this.loadFolderToSidebar(refreshed);
    //   });
    // }
  };
}


// original
// async showUploadSessionModal() {
//   let modal = document.getElementById("uploadSessionModal");

//   if (!modal) {
//     const modalHTML = `
//       <div id="uploadSessionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
//         <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96">
//           <h2 class="text-lg font-bold text-[#61dafb] mb-4">Upload Session</h2>

//           <label class="block text-sm text-white mb-1">Type:</label>
//           <select id="uploadTypeSelect" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">
//             <option value="practical" selected>Practical</option>
//             <option value="assignment">Assignment</option>
//           </select>

//           <label class="block text-sm text-white mb-1">Faculty:</label>
//           <div class="relative w-full mb-4">
//             <input id="uploadFacultyInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
//           </div>

//           <label class="block text-sm text-white mb-1">Subject:</label>
//           <div class="relative w-full mb-4">
//             <input id="uploadSubjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
//           </div>

//           <label class="block text-sm text-white mb-1">Class:</label>
//           <div class="relative w-full mb-4">
//             <input id="uploadClassInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white">
//           </div>

//           <div class="flex justify-end space-x-2">
//             <button id="cancelUploadBtn" class="text-white hover:text-red-400">Cancel</button>
//             <button id="submitUploadBtn" class="bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1]">Upload</button>
//           </div>
//         </div>
//       </div>
//     `;
//     document.body.insertAdjacentHTML("beforeend", modalHTML);
//     modal = document.getElementById("uploadSessionModal");
//   }

//   modal.classList.remove("hidden");
//   modal.classList.add("flex");

//   const typeSelect = document.getElementById("uploadTypeSelect");
//   const facultyInput = document.getElementById("uploadFacultyInput");
//   const subjectInput = document.getElementById("uploadSubjectInput");
//   const classInput = document.getElementById("uploadClassInput");

//   // ✅ Autofill if available
//   if (this.fetchedfaculty) facultyInput.value = this.fetchedfaculty;
//   if (this.fetchedsubject) subjectInput.value = this.fetchedsubject;
//   if (this.fetchedclassid) classInput.value = this.fetchedclassid;

//   // ✅ Clean up dropdown lists
//   const cleanupLists = () => {
//     ["faculty-list", "subject-list", "class-list"].forEach(id => {
//       const el = document.getElementById(id);
//       if (el) el.remove();
//     });
//   };

//   // ✅ Clear subject + class when faculty changes
//   facultyInput.addEventListener("input", () => {
//     subjectInput.value = "";
//     classInput.value = "";
//     cleanupLists();
//   });

//   // ✅ Clear class when subject changes
//   subjectInput.addEventListener("input", () => {
//     classInput.value = "";
//     const c = document.getElementById("class-list");
//     if (c) c.remove();
//   });

//   // ✅ Setup autocomplete
//   try {
//     cleanupLists();
//     this.setupFacultyAutocomplete(facultyInput, this.user.institute, this.base_server);
//     this.setupSubjectAutocomplete(subjectInput, this.user.institute, facultyInput, this.base_server);
//     this.setupClassAutocomplete(classInput, this.user.institute, facultyInput, subjectInput, this.base_server);
//   } catch (err) {
//     console.error("Error initializing autocompletes:", err);
//   }

//   document.getElementById("cancelUploadBtn").onclick = () => {
//     cleanupLists();
//     modal.classList.add("hidden");
//     modal.classList.remove("flex");
//   };

//   document.getElementById("submitUploadBtn").onclick = async () => {
//     const selectedType = typeSelect.value || "practical"; // "practical" or "assignment"
//     const faculty = facultyInput.value.trim();
//     const subject = subjectInput.value.trim();
//     const classId = classInput.value.trim();

//     const studentId = this.user.id;
//     const studentName = this.user.name || "default";
//     const college = this.user.institute;
//     const openedFiles = this.openedFilePaths || [];
//     const currentFolder = this.currentFolderPath || "";

//     if (!faculty || !subject || !classId || !college || !studentName || !studentId) {
//       this.showToast("⚠️ Please fill all required fields.");
//       return;
//     }
//     this.showToast("⏳ Uploading Your Code Session...");

//     try {
//       // Step 1: Export PDF
//       const tempFilePath = await window.electronAPI.writeOutputToTempFile(this.outputs);
//       const exportResult = await window.electronAPI.exportReport(
//         openedFiles,
//         studentName,
//         currentFolder,
//         tempFilePath
//       );

//       if (!exportResult.success || !exportResult.path) {
//         this.showToast("❌ Failed to generate session PDF.");
//         return;
//       }

//       // Step 2: Read PDF as Blob
//       const pdfBlob = await window.electronAPI.readFileAsBlob(exportResult.path);

//       // Step 3: Upload to correct Flask API server depending on selected type
//       const server = selectedType === "assignment" ? this.quiz_server : this.base_server;
//       const endpoint = `${server}/upload-report`;

//       const formData = new FormData();
//       formData.append("file", pdfBlob, "session.pdf");
//       formData.append("college", college);
//       formData.append("faculty", faculty);
//       formData.append("subject", subject);
//       formData.append("class", classId);
//       formData.append("pdf_name", studentName);
//       formData.append("student_name", studentName);
//       formData.append("student_id", studentId);
//       formData.append("type", selectedType); // include type for backend awareness (optional)

//       const response = await fetch(endpoint, {
//         method: "POST",
//         body: formData,
//       });

//       if (!response.ok) {
//         const errorText = await response.text();
//         console.error("Upload failed:", errorText);
//         this.showToast(errorText || "❌ Upload failed");
//       } else {
//         const result = await response.json();
//         // reward points or whatever your app does
//         if (typeof this.user.points === "number") this.user.points += 10;
//         this.showToast("✔ Session uploaded successfully!");
//       }
//     } catch (err) {
//       console.error("Upload error:", err);
//       this.showToast("❌ Upload error: " + err.message);
//     }

//     cleanupLists();
//     modal.classList.add("hidden");
//     modal.classList.remove("flex");

//     const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
//     if (refreshed) {
//       requestIdleCallback(() => {
//         this.loadFolderToSidebar(refreshed);
//       });
//     }
//   };
// }



  toggleEditorActions(show) {
    document.getElementById('editorActions').classList.toggle('hidden', !show);
  }


showWelcomePage() {
  this.toggleEditorActions(false);

  document.getElementById('editorLayout').classList.add('hidden');
  
  const app = document.getElementById('app');
  app.classList.remove('hidden');

  app.innerHTML = `
    <div class="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950 px-4">
      <h1 class="text-6xl font-extrabold mb-14 text-white"><span class="text-teal-400">Kodin</span></h1>
      <div class="flex flex-col space-y-6 w-full max-w-xs">
        ${this.button('Student', 'student')}
        ${this.button('Teacher', 'teacher')}
        ${this.button('Guest', 'guest')}
      </div>
    </div>
  `;

  document.querySelectorAll('button[data-role]').forEach(btn => {
    const role = btn.dataset.role;
    btn.onclick = () => {
      if (role === 'guest') this.showEditor();
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
      // console.log("sent payload:",JSON.stringify(payload))
      const data = await res.json().catch(() => null);
      // console.log("recieved payload:",data)

      
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
      // console.error("Failed to fetch institutes:", err);
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

          <!-- Buttons row -->
          <div class="flex space-x-4 mt-4">
            <button type="button" id="forgotBtn"
              class="flex-1 py-3 rounded-full bg-gray-700 hover:bg-gray-600 text-lg font-bold text-white">
              Reset Password
            </button>
            <button type="submit"
              class="flex-1 py-3 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-lg font-bold text-white">
              Login
            </button>
          </div>

          <!-- Back button still full width -->
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
  const forgotBtn = document.getElementById('forgotBtn');
  if (forgotBtn) forgotBtn.onclick = () => this.showForgotPasswordForm(role);

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
       
        // this.showEditor();
        // this.showDashboard();
        this.showHomePage();
        this.showToast('✔ Login successful');
      } else {
        this.showToast(`❌ ${data?.message || 'Login failed'}`);
      }
    } catch (err) {
      console.error(err);
      this.showToast('❌ Login failed');
    }
  };
}


async showHomePage() {
  const app = document.getElementById('app');
  app.classList.remove('hidden');

  const res = await fetch(`${this.base_server}/get-approved-subjects?college=${this.user.institute}&student_id=${this.user.id}`);
  const data = await res.json();

  this.user.subjects = data.approved_subjects || [];
  console.log("user subjects:", this.user.subjects);

  const subjects = this.user.subjects.map(s => s.subject) || [];
  this.selectedSubject = subjects[0] || null;

 const firstSubjectObj = this.user.subjects.find(s => s.subject === this.selectedSubject);
this.selectedFaculty = firstSubjectObj?.faculty || null;

  const stats = this.studentStats?.[this.selectedSubject] || {
    assignments: { submitted: 0, pending: 0, list: { submitted: [], pending: [] } },
    practicals:  { submitted: 0, pending: 0, list: { submitted: [], pending: [] } },
    quizzes:     { submitted: 0, pending: 0, list: { submitted: [], pending: [] } },
    classes: 0,
  };

  app.innerHTML = `
    <div class="h-full w-full flex flex-col bg-[#1e1e1e] text-gray-100 font-sans">
      <!-- Topbar -->
      <div id="topbar" class="flex items-center justify-between h-10 px-4 bg-[#2d2d2d] border-b border-[#3c3c3c]">
        <div class="flex items-center space-x-3">
          <span class="text-lg font-bold text-teal-400">Kodin</span>
          <span class="text-gray-400 text-sm">Student Home</span>
        </div>
        <div class="flex items-center space-x-3">
          <span class="text-sm text-gray-300">${this.user.name || 'Student'}</span>
          <button id="logoutBtn" class="text-xs bg-[#3c3c3c] hover:bg-[#555] px-3 py-1 rounded text-gray-200">Logout</button>
        </div>
      </div>

      <!-- Home Page Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <h1 class="text-2xl font-bold mb-5 text-white">Welcome, ${this.user.name || 'Student'} 👋</h1>

        <!-- Combined Info + Performance -->
        <div class="bg-[#2d2d2d] rounded-lg p-5 mb-6 border border-[#3c3c3c] shadow">
          <div class="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
            <div class="p-2 bg-[#1e1e1e] rounded">
              <p class="text-gray-400 text-xs">Institute</p>
              <p class="text-white text-sm font-semibold">${this.user.institute || 'N/A'}</p>
            </div>
            <div class="p-2 bg-[#1e1e1e] rounded">
              <p class="text-gray-400 text-xs">Student ID</p>
              <p class="text-white text-sm font-semibold">${this.user.id}</p>
            </div>
            <div class="p-2 bg-[#1e1e1e] rounded">
              <p class="text-gray-400 text-xs">Rank</p>
              <p id="homeRank" class="text-white text-sm font-semibold">--</p>
            </div>
            <div class="p-2 bg-[#1e1e1e] rounded">
              <p class="text-gray-400 text-xs">Points</p>
              <p id="homePoints" class="text-white text-sm font-semibold">--</p>
            </div>
            <div class="p-2 bg-[#1e1e1e] rounded">
              <p class="text-gray-400 text-xs">Lines of Code</p>
              <p id="homeLOC" class="text-white text-sm font-semibold">--</p>
            </div>
            <div class="p-2 bg-[#1e1e1e] rounded">
              <p class="text-gray-400 text-xs">Unique Subs</p>
              <p id="homeUnique" class="text-white text-sm font-semibold">--</p>
            </div>
          </div>
        </div>

        <!-- Subject Selector -->
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-lg font-semibold text-white">Your Progress</h2>
          <div class="flex items-center space-x-2">
            <label for="subjectSelect" class="text-sm text-gray-300">Subject:</label>
            <select id="subjectSelect" class="bg-[#2d2d2d] text-gray-200 border border-[#3c3c3c] rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500">
              ${subjects.map(sub => `<option value="${sub}" ${sub === this.selectedSubject ? 'selected' : ''}>${sub}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Quick Stats Grid -->
        <div id="homeStatsGrid" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          ${this.homeCard('🧾','Assignments', stats.assignments.submitted, stats.assignments.pending, 'assignments')}
          ${this.homeCard('🧪','Practicals',  stats.practicals.submitted,  stats.practicals.pending,  'practicals')}
          ${this.homeCard('🧠','Quizzes',     stats.quizzes.submitted,     stats.quizzes.pending,     'quizzes')}
          ${this.homeCard('🏫','Classes Joined', stats.classes, 0, 'classes')}
        </div>

        <!-- Buttons Row -->
        <div class="flex flex-wrap justify-center gap-4">
          <button id="goToEditorBtn" class="px-6 py-2 rounded-full bg-gradient-to-r from-teal-500 to-teal-600 text-base font-semibold text-black shadow">Go to Editor</button>
          <button id="viewDashboardBtn" class="px-6 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-base font-semibold text-white">View Dashboard</button>
          <button id="refreshHomeBtn" class="px-6 py-2 rounded-full bg-[#3c3c3c] hover:bg-[#555] text-base font-semibold text-white">Refresh</button>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div id="bottombar" class="h-6 bg-gradient-to-r from-green-400 via-green-500 to-green-600 text-gray-100 flex items-center justify-between px-4 border-t border-green-700 text-xs">
        <span>Student Portal</span>
        <span>${this.user.institute || ''}</span>
      </div>

      <!-- Modal container -->
      <div id="modalRoot" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"></div>
    </div>
  `;

  // -------------------- Bind buttons --------------------
  document.getElementById('logoutBtn').onclick = () => { this.user = {}; this.showWelcomePage(); };
  document.getElementById('goToEditorBtn').onclick = () => { this.showEditor(); this.showToast('🧑‍💻 Opening editor...'); };
  document.getElementById('viewDashboardBtn').onclick = () => this.showDashboard();
  document.getElementById('refreshHomeBtn').onclick = async () => { await this.fetchStudentStats(); await this.updateHomeStatsAndProfile(); };
  
  document.getElementById('subjectSelect').addEventListener('change', async (e) => {
    this.selectedSubject = e.target.value;
    const subjObj = this.user.subjects.find(s => s.subject === this.selectedSubject);
    this.selectedFaculty = subjObj?.faculty || null;
    // await this.updateHomeStatsAndProfile();
    await this.updateHomeStats();
    this.attachHomeCardListeners(); // reattach after update
  });

  // Attach home-card title buttons
  this.attachHomeCardListeners();

  // initial data
  await this.updateHomeStatsAndProfile();
  await this.updateHomeStats();
}

// -------------------- Attach home-card title listeners --------------------
attachHomeCardListeners() {
  document.querySelectorAll('.home-title-btn').forEach(btn => {
    btn.onclick = (ev) => {
      const type = ev.currentTarget.dataset.type;
      this.showTaskModal(type);
    };
  });
}


// -------------------- homeCard --------------------
homeCard(icon, title, submitted, pending, type) {
  // title rendered as a button with data-type so it's always clickable
  const pendingLine = (pending !== undefined && type !== 'classes') ? `<p class="text-sm text-gray-400 mt-1">Pending: <span class="text-red-400 font-bold">${pending}</span></p>` : '';
  const submittedLine = (type !== 'classes') ? `<p class="text-sm text-gray-400">Submitted: <span class="text-teal-400 font-bold">${submitted}</span></p>` : `<p class="text-sm text-gray-400">Count: <span class="text-teal-400 font-bold">${submitted}</span></p>`;

  return `
    <div class="bg-[#2d2d2d] p-5 rounded-xl shadow border border-[#3c3c3c]">
      <div class="text-3xl mb-2">${icon}</div>
      <div class="mb-2">
        <button class="home-title-btn text-left w-full text-white font-semibold text-lg" data-type="${type}" type="button">
          ${title}
        </button>
      </div>
      ${submittedLine}
      ${pendingLine}
    </div>
  `;
}


showTaskModal(type) {
  const modalRoot = document.getElementById("modalRoot");
  const subject = this.selectedSubject;

  // safe access with default empty object & lists
  const stats = this.studentStats?.[subject]?.[type] || {};
  const submitted = stats.list?.submitted || [];
  const pending   = stats.list?.pending   || [];

  modalRoot.innerHTML = `
    <div class="bg-[#2d2d2d] w-[92%] max-w-2xl rounded-xl p-6 relative border border-[#3c3c3c]">
      <h3 class="text-xl font-bold text-white mb-2">
        ${type.charAt(0).toUpperCase() + type.slice(1)} — ${subject}
      </h3>

      <div class="absolute top-4 right-4">
        <select id="modalFilter" class="bg-[#1e1e1e] text-gray-200 border border-[#3c3c3c] rounded px-3 py-1">
          <option value="submitted">Submitted</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div id="modalTaskList" class="mt-6 max-h-64 overflow-y-auto space-y-2 text-sm text-gray-300"></div>

      <div class="mt-4 flex justify-end gap-2">
        <button id="modalClose" class="px-4 py-1 rounded bg-[#3c3c3c] hover:bg-[#555] text-white">Close</button>
      </div>
    </div>
  `;

  modalRoot.classList.remove("hidden");

  document.getElementById("modalClose").onclick = () => {
    modalRoot.classList.add("hidden");
    modalRoot.innerHTML = "";
  };

  const render = (mode) => {
    const container = document.getElementById("modalTaskList");
    const list = mode === "submitted" ? submitted : pending;

    if (!list.length) {
      container.innerHTML = `<p class="text-gray-400">No ${mode} ${type} found.</p>`;
      return;
    }

    container.innerHTML = list
      .map((item) => {
        if (typeof item === "string")
          return `<div class="p-2 bg-[#1e1e1e] rounded border border-[#3c3c3c]">${item}</div>`;

        return `
          <div class="p-2 bg-[#1e1e1e] rounded border border-[#3c3c3c]">
            <div class="font-semibold">${item.class_id}</div>
            <div class="text-xs text-gray-400">${item.pdf_name || ""}</div>
          </div>
        `;
      })
      .join("");
  };

  const f = document.getElementById("modalFilter");
  f.onchange = () => render(f.value);
  render("submitted");
}



async updateHomeStatsAndProfile() {
  try {
    const response = await fetch(`${this.base_server}/get-student-stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        institute: this.user.institute,
        role: this.user.role,
        student_id: this.user.id,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Error fetching home stats:", data.error);
      return;
    }

    // Update home page mini dashboard
    const rankElem = document.getElementById("homeRank");
    const pointsElem = document.getElementById("homePoints");
    const locElem = document.getElementById("homeLOC");
    const uniqueElem = document.getElementById("homeUnique");

    if (rankElem) rankElem.textContent = data.rank ?? "N/A";
    if (pointsElem) pointsElem.textContent = data.points ?? 0;
    if (locElem) locElem.textContent = data.total_lines ?? 0;
    if (uniqueElem) uniqueElem.textContent = data.unique_submissions ?? 0;
  } catch (error) {
    console.error("Failed to update home stats:", error);
  }
}

async updateHomeStats() {
  const subject = this.selectedSubject;
  const college = this.user.institute;
  const faculty = this.selectedFaculty;
  const studentID = this.user.id;

  // ------- DEFAULTS -------
  const defaultStats = { submitted: 0, pending: 0, list: { submitted: [], pending: [] } };
  let data = {
    assignments: defaultStats,
    practicals: defaultStats,
    quizzes: defaultStats,
    classes: 0
  };

  // ------- CALL BACKEND -------
  try {
    const res = await fetch(
      `${this.base_server}/get-tasks?college=${college}&faculty=${faculty}&subject=${subject}&student_id=${studentID}`
    );

    const result = await res.json();

    // Make sure each type has both numbers and list
    data.assignments = {
      submitted: result.assignments?.submitted || 0,
      pending: result.assignments?.pending || 0,
      list: result.assignments?.submitted_list && result.assignments?.pending_list
            ? { submitted: result.assignments.submitted_list, pending: result.assignments.pending_list }
            : { submitted: [], pending: [] }
    };

    data.practicals = {
      submitted: result.practicals?.submitted || 0,
      pending: result.practicals?.pending || 0,
      list: result.practicals?.submitted_list && result.practicals?.pending_list
            ? { submitted: result.practicals.submitted_list, pending: result.practicals.pending_list }
            : { submitted: [], pending: [] }
    };

    data.quizzes = {
      submitted: result.quizzes?.submitted || 0,
      pending: result.quizzes?.pending || 0,
      list: result.quizzes?.submitted_list && result.quizzes?.pending_list
            ? { submitted: result.quizzes.submitted_list, pending: result.quizzes.pending_list }
            : { submitted: [], pending: [] }
    };

    data.classes = result.classes || 0;

  } catch (err) {
    console.error("Failed to fetch tasks:", err);
  }

  // ------- STORE RESULTS SO MODAL CAN USE -------
  this.studentStats = this.studentStats || {};
  this.studentStats[subject] = data;

  // ------- UPDATE HOME GRID -------
  const grid = document.getElementById("homeStatsGrid");
  grid.innerHTML = `
    ${this.homeCard("🧾","Assignments", data.assignments.submitted, data.assignments.pending, "assignments")}
    ${this.homeCard("🧪","Practicals",  data.practicals.submitted,  data.practicals.pending,  "practicals")}
    ${this.homeCard("🧠","Quizzes",     data.quizzes.submitted,     data.quizzes.pending,     "quizzes")}
    ${this.homeCard("🏫","Classes Joined", data.classes, 0, "classes")}
  `;

  // Reattach listeners after updating grid
  this.attachHomeCardListeners();
}


// async updateHomeStats() {
//   const subject = this.selectedSubject;
//   const college = this.user.institute;
//   const faculty = this.selectedFaculty;
//   const studentID = this.user.id;

//   // ------- DEFAULTS -------
//   const defaultStats = { submitted: 0, pending: 0, list: { submitted: [], pending: [] } };
//   let data = {
//     assignments: defaultStats,
//     practicals: defaultStats,
//     quizzes: defaultStats,
//     classes: 0
//   };

//   // ------- CALL BACKEND -------
//   try {
//     const res = await fetch(
//       `${this.base_server}/get-tasks?college=${college}&faculty=${faculty}&subject=${subject}&student_id=${studentID}`
//     );

//     const result = await res.json();

//     // Ensure all types exist
//     data.assignments = result.assignments || defaultStats;
//     data.practicals  = result.practicals  || defaultStats;
//     data.quizzes     = result.quizzes     || defaultStats;
//     data.classes     = result.classes     || 0;
//   } catch (err) {
//     console.error("Failed to fetch tasks:", err);
//   }

//   // ------- STORE RESULTS SO MODAL CAN USE -------
//   this.studentStats = this.studentStats || {};
//   this.studentStats[subject] = data;

//   // ------- UPDATE HOME GRID -------
//   const grid = document.getElementById("homeStatsGrid");
//   grid.innerHTML = `
//     ${this.homeCard("🧾","Assignments", data.assignments.submitted, data.assignments.pending, "assignments")}
//     ${this.homeCard("🧪","Practicals",  data.practicals.submitted,  data.practicals.pending,  "practicals")}
//     ${this.homeCard("🧠","Quizzes",     data.quizzes.submitted,     data.quizzes.pending,     "quizzes")}
//     ${this.homeCard("🏫","Classes Joined", data.classes, 0, "classes")}
//   `;
// }








showForgotPasswordForm() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="h-full w-full flex items-center justify-center px-4 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950">
      <div class="bg-gray-800/80 p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-700 relative">
        <h2 class="text-3xl font-extrabold mb-6 text-white text-center">Forgot Password</h2>

        <form id="forgotForm" class="space-y-6">
          <select id="roleSelect" class="w-full p-3 rounded bg-gray-700 text-white">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>

          ${this.inputField('Institute', 'text', 'instituteInput')}
          <div id="dynamicFields">
            ${this.inputField('Email', 'email', 'emailInput')}
          </div>

          <button type="button" id="sendOtpBtn"
            class="w-full py-3 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-lg font-bold text-white">
            Send OTP
          </button>
          <button type="button" id="backBtnFP"
            class="w-full py-3 mt-4 rounded-full bg-gray-700 hover:bg-gray-600 text-lg font-bold text-white">
            Back
          </button>
        </form>

        <form id="verifyForm" class="space-y-6 mt-4 hidden">
          <input placeholder="OTP (6 digits)" class="w-full p-3 rounded" id="otpInput" />
          <input placeholder="New Password" type="password" class="w-full p-3 rounded" id="newPasswordInput" />
          <button type="button" id="resetPasswordBtn"
            class="w-full py-3 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-lg font-bold text-white">
            Reset Password
          </button>
        </form>
      </div>
    </div>
  `;

  // Back button
  document.getElementById('backBtnFP').onclick = () => this.showWelcomePage();

  const roleSelect = document.getElementById('roleSelect');
  const dynamicFields = document.getElementById('dynamicFields');

  // 🔹 Change input fields based on role
  roleSelect.addEventListener('change', () => {
    if (roleSelect.value === 'teacher') {
      dynamicFields.innerHTML = `
        ${this.inputField('Admin Password', 'password', 'adminPasswordInput')}
        ${this.inputField('Teacher Email', 'email', 'emailInput')}
      `;
    } else {
      dynamicFields.innerHTML = `
        ${this.inputField('Email', 'email', 'emailInput')}
      `;
    }
  });

  const instituteInput = document.getElementById('instituteInput');

  // Send OTP
  document.getElementById('sendOtpBtn').onclick = async () => {
    const institute = (instituteInput.value || '').trim();
    const role = roleSelect.value;
    const email = (document.getElementById('emailInput')?.value || '').trim();
    const adminPassword = role === "teacher" ? (document.getElementById('adminPasswordInput')?.value || '').trim() : null;

    if (!institute || !email || (role === "teacher" && !adminPassword)) {
      this.showToast('❌ Please enter all required fields');
      return;
    }

    try {
      const res = await fetch(`${this.base_server}/send-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute, role, email, admin_password: adminPassword })
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        document.getElementById('forgotForm').classList.add('hidden');
        document.getElementById('verifyForm').classList.remove('hidden');
        this.showToast(' OTP sent to email');
      } else {
        this.showToast(`❌ ${data?.message || 'Failed to send OTP'}`);
      }
    } catch (err) {
      console.error(err); 
      this.showToast('❌ Error sending OTP');
    }
  };

  // Reset password (unchanged)
  document.getElementById('resetPasswordBtn').onclick = async () => {
    const institute = (instituteInput.value || '').trim();
    const role = roleSelect.value;
    const email = (document.getElementById('emailInput')?.value || '').trim();
    const otp = (document.getElementById('otpInput').value || '').trim();
    const newPassword = (document.getElementById('newPasswordInput').value || '').trim();

    if (!otp || !newPassword) {
      this.showToast('❌ Enter OTP and new password');
      return;
    }

    try {
      const res = await fetch(`${this.base_server}/verify_reset_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute, role, email, otp, new_password: newPassword })
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        this.showToast('Password updated. Please login.');
        this.showLoginForm(role);
      } else {
        this.showToast(`❌ ${data?.message || 'Reset failed'}`);
      }
    } catch (err) {
      console.error(err);
      this.showToast('❌ Error resetting password');
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
    this.showToast('✔ Logged out successfully');
    // console.log("✅ Logout completed: terminal + state cleared");
  } catch (err) {
    console.error("Error during logout:", err);
    this.showToast('Logout encountered an issue. Please refresh.');
  }
}


inputField(label, type, id = "", value = "") {
  return `
    <div>
      <label for="${id}" class="block text-sm mb-1 text-gray-200">${label}</label>
      <input 
        type="${type}" 
        id="${id}" 
        placeholder="${label}" 
        value="${value || ""}"
        class="w-full p-3 rounded-lg bg-gray-700/60 border border-gray-600 text-white placeholder-gray-400"
      />
    </div>
  `;
}


// showQuizCreationModal() {
//   // Remove existing quiz modal if present
//   const oldModal = document.getElementById("quizCreationModal");
//   if (oldModal) oldModal.remove();

//   const modal = document.createElement("div");
//   modal.id = "quizCreationModal";
//   modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

//   modal.innerHTML = `
//     <div class="bg-[#333333] rounded-lg mt-16 w-[700px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
//       <h2 class="text-2xl font-bold text-[#61dafb] mb-4 text-center">Create Quiz</h2>

//       <div id="quizQuestionsContainer" class="space-y-6"></div>

//       <button id="addQuestionBtn"
//         class="w-full bg-blue-500 text-black font-semibold py-2 rounded hover:bg-blue-600 mt-4">
//         ➕ Add Question
//       </button>

//       <div class="flex justify-end gap-3 pt-4 border-t border-gray-700 mt-6">
//         <button id="closeQuizBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">
//           Cancel
//         </button>
//         <button id="saveQuizBtn" class="bg-green-500 px-4 py-2 rounded hover:bg-green-600">
//           Save Quiz
//         </button>
//       </div>

//       <button id="closeQuizModalX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//     </div>
//   `;

//   document.body.appendChild(modal);

//   const container = modal.querySelector("#quizQuestionsContainer");
//   const addQuestionBtn = modal.querySelector("#addQuestionBtn");
//   const closeBtn = modal.querySelector("#closeQuizBtn");
//   const closeX = modal.querySelector("#closeQuizModalX");
//   const saveBtn = modal.querySelector("#saveQuizBtn");

//   // Function to add a question block
//   const addQuestion = () => {
//     const qIndex = container.children.length + 1;
//     const qBlock = document.createElement("div");
//     qBlock.className = "quiz-question-block bg-[#2a2a2a] p-4 rounded-lg border border-gray-700 space-y-3";

//     qBlock.innerHTML = `
//       <input type="text" placeholder="Question ${qIndex}"
//         class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white" />

//       <select class="q-type w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white">
//         <option value="mcq">Multiple Choice</option>
//         <option value="short">Short Answer</option>
//       </select>

//       <div class="options space-y-2 mt-2">
//         ${[1, 2, 3, 4].map(i => `
//           <div class="flex gap-2 items-center">
//             <input type="radio" name="correct-${Date.now()}">
//             <input type="text" placeholder="Option ${i}"
//               class="flex-1 p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white">
//           </div>
//         `).join("")}
//       </div>
//     `;

//     // Handle type switch (MCQ / Short Answer)
//     const select = qBlock.querySelector(".q-type");
//     select.addEventListener("change", () => {
//       const optionsDiv = qBlock.querySelector(".options");
//       if (select.value === "short") {
//         optionsDiv.innerHTML = `
//           <input type="text" placeholder="Correct Answer"
//             class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white">
//         `;
//       } else {
//         optionsDiv.innerHTML = [1, 2, 3, 4].map(i => `
//           <div class="flex gap-2 items-center">
//             <input type="radio" name="correct-${Date.now()}">
//             <input type="text" placeholder="Option ${i}"
//               class="flex-1 p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white">
//           </div>
//         `).join("");
//       }
//     });

//     container.appendChild(qBlock);
//   };

//   // Add first question by default
//   addQuestion();

//   // Button handlers
//   addQuestionBtn.onclick = addQuestion;
//   closeBtn.onclick = () => modal.remove();
//   closeX.onclick = () => modal.remove();

//   // Save button handler
//   saveBtn.onclick = () => {
//     const quizData = [];
//     container.querySelectorAll(".quiz-question-block").forEach(block => {
//       const question = block.querySelector("input[type=text]").value.trim();
//       const qType = block.querySelector(".q-type").value;
//       const data = { question, type: qType, options: [], correct: null };

//       if (qType === "mcq") {
//         const opts = block.querySelectorAll(".options input[type=text]");
//         const radios = block.querySelectorAll(".options input[type=radio]");
//         opts.forEach((opt, i) => {
//           data.options.push(opt.value.trim());
//           if (radios[i].checked) data.correct = i;
//         });
//       } else {
//         data.correct = block.querySelector(".options input").value.trim();
//       }
//       quizData.push(data);
//     });

//     if (!quizData.length) {
//       this.showToast(" Please add at least one question.");
//       return;
//     }

//     // Show subject & quiz name modal
//     this.showQuizMetaModal(quizData, modal);
//   };
// }

// // 🔥 Updated Helper Function with Subject Autocomplete
// showQuizMetaModal(quizData, parentModal) {
//   const oldMetaModal = document.getElementById("quizMetaModal");
//   if (oldMetaModal) oldMetaModal.remove();

//   const metaModal = document.createElement("div");
//   metaModal.id = "quizMetaModal";
//   metaModal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

//   metaModal.innerHTML = `
//     <div class="bg-[#333333] rounded-lg w-[400px] p-6 text-white shadow-xl border border-gray-700 relative">
//       <h3 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Quiz Details</h3>

//       <label class="block mb-2 font-medium">Subject:</label>
//       <div class="relative w-full mb-3">
//         <input id="quizSubject" type="text" placeholder="Type to search subject"
//           class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
//       </div>

//       <label class="block mb-2 font-medium">Quiz Name:</label>
//       <div class="relative w-full mb-4">
//         <input id="quizName" type="text" placeholder="Enter Quiz Name"
//           class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
//       </div>

//       <div class="flex justify-end gap-3 pt-3 border-t border-gray-700">
//         <button id="cancelMetaBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">
//           Cancel
//         </button>
//         <button id="confirmMetaBtn" class="bg-green-500 px-4 py-2 rounded hover:bg-green-600">
//           Save
//         </button>
//       </div>

//       <button id="closeMetaX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//     </div>
//   `;

//   document.body.appendChild(metaModal);

//   // --- Get Elements ---
//   const subjectInput = metaModal.querySelector("#quizSubject");
//   const quizNameInput = metaModal.querySelector("#quizName");
//   const cancelBtn = metaModal.querySelector("#cancelMetaBtn");
//   const closeX = metaModal.querySelector("#closeMetaX");
//   const confirmBtn = metaModal.querySelector("#confirmMetaBtn");

//   // ✅ Setup Subject Autocomplete (Reusing your existing helper)
//   const institute = this.user?.institute;
//   const facultyId = this.user?.id;
//   this.setupSubjectAutocomplete(subjectInput, institute, { value: facultyId }, this.base_server);

//   // --- Modal Close Handlers ---
//   cancelBtn.onclick = () => metaModal.remove();
//   closeX.onclick = () => metaModal.remove();

//   // --- Save Quiz ---
//   confirmBtn.onclick = async () => {
//     const subject = subjectInput.value.trim();
//     const quizName = quizNameInput.value.trim();

//     if (!subject || !quizName) {
//       this.showToast("⚠️ Subject and Quiz Name are required.");
//       return;
//     }

//     const payload = {
//       institute,
//       facultyId,
//       subject,
//       quizName,
//       questions: quizData
//     };

//     try {
//       confirmBtn.disabled = true;
//       confirmBtn.textContent = "⏳ Saving...";

//       const res = await fetch(`${this.base_server}/save-quiz`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload)
//       });

//       if (res.ok) {
//         this.showToast("✔ Quiz saved successfully.");
//         metaModal.remove();
//         parentModal?.remove();
//       } else {
//         this.showToast("❌ Failed to save quiz.");
//       }
//     } catch (err) {
//       console.error("Error saving quiz:", err);
//       this.showToast("🚨 Server error while saving quiz.");
//     } finally {
//       confirmBtn.disabled = false;
//       confirmBtn.textContent = "Save";
//     }
//   };
// }



// showJoinQuizModal() {
//   const oldModal = document.getElementById("joinQuizModal");
//   if (oldModal) oldModal.remove();

//   const modal = document.createElement("div");
//   modal.id = "joinQuizModal";
//   modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

//   modal.innerHTML = `
//     <div class="bg-[#333333] rounded-lg w-[400px] p-6 text-white shadow-xl border border-gray-700 relative">
//       <h3 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Join Quiz</h3>

//       <label class="block mb-2 font-medium">Faculty:</label>
//       <div class="relative w-full mb-3">
//         <input id="facultyId" type="text" placeholder="Enter Faculty ID or Name"
//           class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
//       </div>

//       <label class="block mb-2 font-medium">Subject:</label>
//       <div class="relative w-full mb-3">
//         <input id="quizSubject" type="text" placeholder="Enter Subject"
//           class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
//       </div>

//       <label class="block mb-2 font-medium">Quiz Name:</label>
//       <div class="relative w-full mb-4">
//         <input id="quizName" type="text" placeholder="Enter Quiz Name"
//           class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
//       </div>

//       <div class="flex justify-end gap-3 pt-3 border-t border-gray-700">
//         <button id="cancelJoinBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">
//           Cancel
//         </button>
//         <button id="startQuizBtn" class="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600">
//           Start Quiz
//         </button>
//       </div>

//       <button id="closeJoinQuizX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//     </div>
//   `;

//   document.body.appendChild(modal);

//   const facultyInput = modal.querySelector("#facultyId");
//   const subjectInput = modal.querySelector("#quizSubject");
//   const quizNameInput = modal.querySelector("#quizName");
//   const cancelBtn = modal.querySelector("#cancelJoinBtn");
//   const closeX = modal.querySelector("#closeJoinQuizX");
//   const startBtn = modal.querySelector("#startQuizBtn");

//   // 🔧 Setup autocomplete
//   const college = this.user.institute;
//   this.setupFacultyAutocomplete(facultyInput, college, this.base_server);
//   this.setupSubjectAutocomplete(subjectInput, college, facultyInput, this.base_server);
//   this.setupQuizNameAutocomplete(quizNameInput, college, facultyInput, subjectInput, this.base_server);

//   cancelBtn.onclick = () => modal.remove();
//   closeX.onclick = () => modal.remove();

//   startBtn.onclick = async () => {
//     const faculty = facultyInput.value.trim();
//     const subject = subjectInput.value.trim();
//     const quizName = quizNameInput.value.trim();

//     if (!faculty || !subject || !quizName) {
//       this.showToast(" Please fill all fields.");
//       return;
//     }

//     try {
//       this.showToast("⏳ Fetching quiz...");
//       const res = await fetch(`${this.base_server}/get-quiz?college=${college}&faculty=${faculty}&subject=${subject}&quizName=${quizName}`);
//       const data = await res.json();

//       if (!data?.questions?.length) {
//         this.showToast("❌ Quiz not found or has no questions.");
//         return;
//       }

//       modal.remove();
//       this.showQuizPlayerModal(data.questions, { faculty, subject, quizName });
//     } catch (err) {
//       this.showToast("🚨 Failed to fetch quiz.");
//       console.error("Fetch quiz error:", err);
//     }
//   };
// }

// showQuizPlayerModal(questions, quizMeta) {
//   const oldModal = document.getElementById("quizPlayerModal");
//   if (oldModal) oldModal.remove();

//   const modal = document.createElement("div");
//   modal.id = "quizPlayerModal";
//   modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

//   modal.innerHTML = `
//     <div class="bg-[#333333] rounded-lg mt-16 w-[700px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
//       <h2 class="text-2xl font-bold text-[#61dafb] mb-4 text-center">${quizMeta.quizName}</h2>

//       <div id="quizQuestionContainer" class="space-y-6"></div>

//       <div class="flex justify-end gap-3 pt-4 border-t border-gray-700 mt-6">
//         <button id="submitQuizBtn" class="bg-green-500 px-4 py-2 rounded hover:bg-green-600">
//           Submit Quiz
//         </button>
//       </div>

//       <button id="closeQuizPlayerX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//     </div>
//   `;

//   document.body.appendChild(modal);

//   const container = modal.querySelector("#quizQuestionContainer");
//   const submitBtn = modal.querySelector("#submitQuizBtn");
//   const closeX = modal.querySelector("#closeQuizPlayerX");

//   closeX.onclick = () => modal.remove();

//   // Render questions dynamically
//   questions.forEach((q, idx) => {
//     const qDiv = document.createElement("div");
//     qDiv.className = "bg-[#2a2a2a] p-4 rounded-lg border border-gray-700 space-y-3";

//     if (q.type === "mcq") {
//       qDiv.innerHTML = `
//         <p class="font-semibold">${idx + 1}. ${q.question}</p>
//         ${q.options.map((opt, i) => `
//           <div class="flex gap-2 items-center">
//             <input type="radio" name="q${idx}" value="${i}">
//             <label>${opt}</label>
//           </div>
//         `).join("")}
//       `;
//     } else {
//       qDiv.innerHTML = `
//         <p class="font-semibold">${idx + 1}. ${q.question}</p>
//         <input type="text" name="q${idx}" placeholder="Your Answer"
//           class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white" />
//       `;
//     }

//     container.appendChild(qDiv);
//   });

//   submitBtn.onclick = async () => {
//     const answers = questions.map((q, idx) => {
//       if (q.type === "mcq") {
//         const selected = modal.querySelector(`input[name="q${idx}"]:checked`);
//         return selected ? parseInt(selected.value) : null;
//       } else {
//         return modal.querySelector(`input[name="q${idx}"]`).value.trim();
//       }
//     });

//     try {
//       const payload = {
//     studentId: this.user.id,
//     studentName: this.user.name,
//     institute: this.user.institute,
//     facultyId: quizMeta.faculty,
//     subject: quizMeta.subject,
//     quizId: quizMeta.quizName, // make sure quizId exists in quizMeta
//     answers
// };


//       this.showToast("⏳ Submitting...");
//       const res = await fetch(`${this.base_server}/submit-quiz`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload)
//       });

//       if (res.ok) {
//         this.showToast("Quiz submitted successfully.");
//         modal.remove();
//       } else {
//         this.showToast("❌ Failed to submit quiz.");
//       }
//     } catch (err) {
//       console.error("Quiz submit error:", err);
//       this.showToast(" Server error while submitting quiz.");
//     }
//   };
// }




showQuizCreationModal() {
  // Remove existing quiz modal if present
  const oldModal = document.getElementById("quizCreationModal");
  if (oldModal) oldModal.remove();

  const modal = document.createElement("div");
  modal.id = "quizCreationModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

  modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg mt-16 w-[760px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
      <h2 class="text-2xl font-bold text-[#61dafb] mb-4 text-center">Create Quiz</h2>

      <div id="quizQuestionsContainer" class="space-y-6"></div>

      <div class="flex gap-3 mt-4">
        <button id="addQuestionBtn" class="flex-1 bg-blue-500 text-black font-semibold py-2 rounded hover:bg-blue-600">
          ➕ Add Question
        </button>
        <button id="previewQuizBtn" class="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600">
          Preview Questions
        </button>
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t border-gray-700 mt-6">
        <button id="closeQuizBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">
          Cancel
        </button>
        <button id="saveQuizBtn" class="bg-green-500 px-4 py-2 rounded hover:bg-green-600">
          Save Quiz
        </button>
      </div>

      <button id="closeQuizModalX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;

  document.body.appendChild(modal);

  const container = modal.querySelector("#quizQuestionsContainer");
  const addQuestionBtn = modal.querySelector("#addQuestionBtn");
  const previewBtn = modal.querySelector("#previewQuizBtn");
  const closeBtn = modal.querySelector("#closeQuizBtn");
  const closeX = modal.querySelector("#closeQuizModalX");
  const saveBtn = modal.querySelector("#saveQuizBtn");

  // helper to create unique radio name per question block
  const uniqueName = () => `correct-${Date.now()}-${Math.floor(Math.random()*1000)}`;

  // Function to add a question block
  const addQuestion = (preset = {}) => {
    const qIndex = container.children.length + 1;
    const qBlock = document.createElement("div");
    qBlock.className = "quiz-question-block bg-[#2a2a2a] p-4 rounded-lg border border-gray-700 space-y-3";

    const radioName = uniqueName();

    // preset: { question, type, options, correct, timeLimit, marks }
    const questionText = preset.question || "";
    const qType = preset.type || "mcq";
    const timeLimit = preset.timeLimit != null ? preset.timeLimit : 30;
    const marks = preset.marks != null ? preset.marks : 1;
    const options = preset.options || ["", "", "", ""];
    const correctIdx = preset.correct != null ? preset.correct : null;

    qBlock.innerHTML = `
      <div class="flex justify-between items-center">
        <h4 class="font-semibold text-[#61dafb]">Question ${qIndex}</h4>
        <div>
          <button class="removeQBtn bg-red-600 px-2 py-1 rounded hover:bg-red-700 text-sm">Remove</button>
        </div>
      </div>

      <input type="text" placeholder="Enter question text"
        class="q-text w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white" value="${escapeHtml(questionText)}" />

      <div class="flex gap-3">
        <select class="q-type w-1/2 p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white">
          <option value="mcq" ${qType === 'mcq' ? 'selected' : ''}>Multiple Choice</option>
          <option value="short" ${qType === 'short' ? 'selected' : ''}>Short Answer</option>
        </select>

        <div class="flex-1 flex gap-2">
          <input type="number" min="5" step="1" placeholder="Time (seconds)" class="q-time w-1/2 p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white" value="${timeLimit}">
          <input type="number" min="1" step="1" placeholder="Max Marks" class="q-marks w-1/2 p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white" value="${marks}">
        </div>
      </div>

      <div class="options space-y-2 mt-2">
        ${options.map((opt, i) => `
          <div class="flex gap-2 items-center">
            <input type="radio" name="${radioName}" class="q-correct" ${correctIdx === i ? 'checked' : ''}>
            <input type="text" placeholder="Option ${i+1}" class="flex-1 p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white q-option" value="${escapeHtml(opt)}">
          </div>
        `).join("")}
      </div>
    `;

    // Remove button
    qBlock.querySelector(".removeQBtn").onclick = () => qBlock.remove();

    // Type switch logic
    const select = qBlock.querySelector(".q-type");
    select.addEventListener("change", () => {
      const optionsDiv = qBlock.querySelector(".options");
      if (select.value === "short") {
        optionsDiv.innerHTML = `
          <input type="text" class="q-short-answer p-2 w-full rounded bg-[#1e1e1e] border border-gray-600 text-white" placeholder="Correct answer (for auto grading)" />
        `;
      } else {
        // rebuild 4 options
        const rname = uniqueName();
        optionsDiv.innerHTML = [1,2,3,4].map(i => `
          <div class="flex gap-2 items-center">
            <input type="radio" name="${rname}" class="q-correct">
            <input type="text" placeholder="Option ${i}" class="flex-1 p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white q-option">
          </div>
        `).join("");
      }
    });

    container.appendChild(qBlock);
    qBlock.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Add first question by default
  addQuestion();

  // Button handlers
  addQuestionBtn.onclick = () => addQuestion();
  closeBtn.onclick = () => modal.remove();
  closeX.onclick = () => modal.remove();

  previewBtn.onclick = () => {
    // Simple preview overlay listing questions
    const blocks = Array.from(container.querySelectorAll(".quiz-question-block"));
    const preview = blocks.map((b, idx) => {
      const text = b.querySelector(".q-text").value.trim() || `(no text)`;
      const timeV = b.querySelector(".q-time").value || "30";
      const marksV = b.querySelector(".q-marks").value || "1";
      return `${idx+1}. ${text} (Time: ${timeV}s, Marks: ${marksV})`;
    }).join("\n\n");
    this.showToast(`Preview:\n\n${preview}`);
  };

  // Save button handler
  saveBtn.onclick = () => {
    const quizData = [];
    container.querySelectorAll(".quiz-question-block").forEach(block => {
      const questionText = block.querySelector(".q-text").value.trim();
      const qType = block.querySelector(".q-type").value;
      const timeLimit = parseInt(block.querySelector(".q-time").value) || 30;
      const marks = parseInt(block.querySelector(".q-marks").value) || 1;

      const data = { question: questionText, type: qType, timeLimit, marks, options: [], correct: null };

      if (qType === "mcq") {
        const opts = block.querySelectorAll(".q-option");
        const radios = block.querySelectorAll(".q-correct");
        opts.forEach((opt, i) => {
          data.options.push(opt.value.trim());
          if (radios[i] && radios[i].checked) data.correct = i;
        });
      } else {
        const ansEl = block.querySelector(".q-short-answer");
        data.correct = ansEl ? ansEl.value.trim() : "";
      }

      quizData.push(data);
    });

    if (!quizData.length) {
      this.showToast(" Please add at least one question.");
      return;
    }

    // Show subject & quiz name modal
    this.showQuizMetaModal(quizData, modal);
  };

  // util: escape html to avoid breaking markup when presets used
  function escapeHtml(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// ---------------------------
// QUIZ META / SAVE
// ---------------------------
showQuizMetaModal(quizData, parentModal) {
  const oldMetaModal = document.getElementById("quizMetaModal");
  if (oldMetaModal) oldMetaModal.remove();

  const metaModal = document.createElement("div");
  metaModal.id = "quizMetaModal";
  metaModal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

  metaModal.innerHTML = `
    <div class="bg-[#333333] rounded-lg w-[480px] p-6 text-white shadow-xl border border-gray-700 relative">
      <h3 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Quiz Details</h3>

      <label class="block mb-2 font-medium">Subject:</label>
      <div class="relative w-full mb-3">
        <input id="quizSubject" type="text" placeholder="Type to search subject"
          class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
      </div>

      <label class="block mb-2 font-medium">Quiz Name:</label>
      <div class="relative w-full mb-3">
        <input id="quizName" type="text" placeholder="Enter Quiz Name"
          class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
      </div>

      <label class="block mb-2 font-medium">Allow Retake (optional):</label>
      <div class="relative w-full mb-3">
        <select id="allowRetake" class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white">
          <option value="no" selected>No</option>
          <option value="yes">Yes</option>
        </select>
      </div>

      <div class="flex justify-end gap-3 pt-3 border-t border-gray-700">
        <button id="cancelMetaBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">Cancel</button>
        <button id="confirmMetaBtn" class="bg-green-500 px-4 py-2 rounded hover:bg-green-600">Save</button>
      </div>

      <button id="closeMetaX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;

  document.body.appendChild(metaModal);

  // --- Get Elements ---
  const subjectInput = metaModal.querySelector("#quizSubject");
  const quizNameInput = metaModal.querySelector("#quizName");
  const allowRetake = metaModal.querySelector("#allowRetake");
  const cancelBtn = metaModal.querySelector("#cancelMetaBtn");
  const closeX = metaModal.querySelector("#closeMetaX");
  const confirmBtn = metaModal.querySelector("#confirmMetaBtn");

  // ✅ Setup Subject Autocomplete (reuse your helper)
  const institute = this.user?.institute;
  const facultyId = this.user?.id;
  if (typeof this.setupSubjectAutocomplete === "function") {
    this.setupSubjectAutocomplete(subjectInput, institute, { value: facultyId }, this.base_server);
  }

  // --- Modal Close Handlers ---
  cancelBtn.onclick = () => metaModal.remove();
  closeX.onclick = () => metaModal.remove();

  // --- Save Quiz ---
  confirmBtn.onclick = async () => {
    const subject = subjectInput.value.trim();
    const quizName = quizNameInput.value.trim();
    const allowRetakeValue = allowRetake.value;

    if (!subject || !quizName) {
      this.showToast("Subject and Quiz Name are required.");
      return;
    }

    const payload = {
      institute,
      facultyId,
      subject,
      quizName,
      allowRetake: allowRetakeValue === "yes",
      questions: quizData
    };

    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "⏳ Saving...";

      // Suggested endpoint: POST /save-quiz
      // Body: { institute, facultyId, subject, quizName, allowRetake, questions }
      // Response: { ok: true, quizId: <id> }
      const res = await fetch(`${this.quiz_server}/save-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        this.showToast("✔ Quiz saved successfully.");
        metaModal.remove();
        parentModal?.remove();
        // optional: open quiz editor using returned quizId
        if (result?.quizId) {
          console.log("Saved quiz id:", result.quizId);
        }
      } else {
        const text = await res.text();
        console.error("Failed to save quiz:", text);
        this.showToast("❌ Failed to save quiz.");
      }
    } catch (err) {
      console.error("Error saving quiz:", err);
      this.showToast("🚨 Server error while saving quiz.");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Save";
    }
  };
}

// ---------------------------
// JOIN QUIZ MODAL (unchanged mostly, but keeps autocomplete helpers)
// ---------------------------
showJoinQuizModal() {
  const oldModal = document.getElementById("joinQuizModal");
  if (oldModal) oldModal.remove();

  const modal = document.createElement("div");
  modal.id = "joinQuizModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

  modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg w-[420px] p-6 text-white shadow-xl border border-gray-700 relative">
      <h3 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Join Quiz</h3>

      <label class="block mb-2 font-medium">Faculty:</label>
      <div class="relative w-full mb-3">
        <input id="facultyId" type="text" placeholder="Enter Faculty ID or Name"
          class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
      </div>

      <label class="block mb-2 font-medium">Subject:</label>
      <div class="relative w-full mb-3">
        <input id="quizSubject" type="text" placeholder="Enter Subject"
          class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
      </div>

      <label class="block mb-2 font-medium">Quiz Name:</label>
      <div class="relative w-full mb-4">
        <input id="quizName" type="text" placeholder="Enter Quiz Name"
          class="w-full p-2 rounded bg-[#1e1e1e] border border-gray-600 text-white focus:outline-none" />
      </div>

      <div class="flex justify-end gap-3 pt-3 border-t border-gray-700">
        <button id="cancelJoinBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">
          Cancel
        </button>
        <button id="startQuizBtn" class="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600">
          Start Quiz
        </button>
      </div>

      <button id="closeJoinQuizX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;

  document.body.appendChild(modal);

  const facultyInput = modal.querySelector("#facultyId");
  const subjectInput = modal.querySelector("#quizSubject");
  const quizNameInput = modal.querySelector("#quizName");
  const cancelBtn = modal.querySelector("#cancelJoinBtn");
  const closeX = modal.querySelector("#closeJoinQuizX");
  const startBtn = modal.querySelector("#startQuizBtn");

  // 🔧 Setup autocomplete
  const college = this.user.institute;
  if (typeof this.setupFacultyAutocomplete === "function") {
    this.setupFacultyAutocomplete(facultyInput, college, this.base_server);
  }
  if (typeof this.setupSubjectAutocomplete === "function") {
    this.setupSubjectAutocomplete(subjectInput, college, facultyInput, this.base_server);
  }
  if (typeof this.setupQuizNameAutocomplete === "function") {
    this.setupQuizNameAutocomplete(quizNameInput, college, facultyInput, subjectInput, this.base_server);
  }

  cancelBtn.onclick = () => modal.remove();
  closeX.onclick = () => modal.remove();

  startBtn.onclick = async () => {
    const faculty = facultyInput.value.trim();
    const subject = subjectInput.value.trim();
    const quizName = quizNameInput.value.trim();

    if (!faculty || !subject || !quizName) {
      this.showToast(" Please fill all fields.");
      return;
    }

    try {
      this.showToast("⏳ Fetching quiz...");
      const res = await fetch(`${this.quiz_server}/get-quiz?college=${encodeURIComponent(college)}&faculty=${encodeURIComponent(faculty)}&subject=${encodeURIComponent(subject)}&quizName=${encodeURIComponent(quizName)}`);
      const data = await res.json();

      if (!data?.questions?.length) {
        this.showToast("❌ Quiz not found or has no questions.");
        return;
      }

      modal.remove();
      this.showQuizPlayerModal(data.questions, { faculty, subject, quizName, quizId: data.quizId });
    } catch (err) {
      this.showToast("🚨 Failed to fetch quiz.");
      console.error("Fetch quiz error:", err);
    }
  };
}


showQuizPlayerModal(questions, quizMeta) {
  // Remove existing modal if any
  const existing = document.getElementById("quizPlayerModal");
  if (existing) existing.remove();

  let currentIndex = 0;
  let timerInterval = null;

  const answers = new Array(questions.length).fill(null);
  const radioNames = questions.map((_, i) => `q_${i}_group`);

  // Modal wrapper
  const modal = document.createElement("div");
  modal.id = "quizPlayerModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50";

  modal.innerHTML = `
    <div class="bg-[#0f1720] w-[760px] rounded-xl p-6 text-white border border-gray-700 shadow-lg relative">
      
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-2xl font-bold text-[#61dafb]">${escapeHtml(quizMeta.quizName)}</h2>
          <p class="text-sm text-gray-300">${escapeHtml(quizMeta.subject)} • Faculty: ${escapeHtml(quizMeta.faculty)}</p>
        </div>

        <div class="flex items-center gap-4">

          <div class="text-right">
            <div class="text-xs text-gray-400">Question</div>
            <div id="qCount" class="text-lg font-semibold">1/${questions.length}</div>
          </div>

          <div class="relative w-16 h-16">
            <svg class="absolute inset-0 w-full h-full" viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="22" stroke="#384657" stroke-width="4" fill="none"></circle>
              <circle id="timerCircle" cx="25" cy="25" r="22" stroke="#00d9ff" stroke-width="4"
                fill="none" stroke-dasharray="138" stroke-dashoffset="138"
                style="transition: stroke-dashoffset 1s linear;"></circle>
            </svg>
            <div id="timerText" class="absolute inset-0 flex items-center justify-center font-bold text-sm"></div>
          </div>

        </div>
      </div>

      <div id="playerArea" class="relative"></div>

      <div class="flex justify-end gap-3 mt-6">
        <button id="nextBtn" class="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600">Next</button>
        <button id="submitBtn" class="bg-green-500 px-4 py-2 rounded hover:bg-green-600 hidden">Submit</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const playerArea = modal.querySelector("#playerArea");
  const qCount = modal.querySelector("#qCount");
  const timerText = modal.querySelector("#timerText");
  const timerCircle = modal.querySelector("#timerCircle");
  const nextBtn = modal.querySelector("#nextBtn");
  const submitBtn = modal.querySelector("#submitBtn");

  window.onbeforeunload = () => "Quiz is running.";

  // FADE HELPERS (SAFE)
  const fadeIn = (el) => {
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    requestAnimationFrame(() => {
      el.style.transition = "opacity 300ms ease, transform 300ms ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  };

  const fadeOut = (el, callback) => {
    if (!el) {
      if (callback) callback();
      return;
    }
    el.style.transition = "opacity 300ms ease, transform 300ms ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(-8px)";
    setTimeout(() => callback && callback(), 320);
  };

  // FORMAT HELPERS
  const resolveTime = (q) => q.timeLimit ?? q.time ?? q.time_limit ?? 30;
  const resolveMarks = (q) => q.marks ?? q.max_marks ?? 1;

  const formatTime = (s) => {
    s = Math.max(0, s);
    return s < 10 ? `0:0${s}` : `0:${s}`;
  };

  // RENDER QUESTION
  const renderQuestion = (index) => {
    const qRaw = questions[index];
    const q = {
      question: qRaw.question ?? qRaw.question_text ?? "(no question)",
      type: qRaw.type ?? "mcq",
      options: qRaw.options ?? [],
      timeLimit: parseInt(resolveTime(qRaw)) || 30,
      marks: parseInt(resolveMarks(qRaw)) || 1
    };

    qCount.textContent = `${index + 1}/${questions.length}`;

    const card = document.createElement("div");
    card.className = "questionCard bg-[#071024] p-5 rounded-lg border border-gray-700 min-h-[180px] relative";

    const radioGroup = radioNames[index];

    card.innerHTML = `
      <div class="text-sm text-gray-400 mb-1">Q${index + 1}</div>
      <div class="text-lg font-semibold mb-3">${escapeHtml(q.question)}</div>
      <div id="optionsArea" class="space-y-3"></div>
      <div id="lockOverlay" class="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded text-xl hidden">
        Time's up
      </div>
    `;

    // OPTIONS
    const optArea = card.querySelector("#optionsArea");

    if (q.type === "mcq") {
      (q.options.length ? q.options : ["Option A", "Option B", "Option C", "Option D"])
        .forEach((opt, i) => {
          const row = document.createElement("label");
          row.className = "flex gap-3 items-center p-2 hover:bg-[#0d1628] rounded cursor-pointer";
          row.innerHTML = `
            <input type="radio" name="${radioGroup}" value="${i}">
            <span>${escapeHtml(opt)}</span>
          `;
          optArea.appendChild(row);
        });
    } else {
      optArea.innerHTML = `
        <input type="text" id="shortAns" class="w-full p-3 rounded bg-[#0d1628] border border-gray-700">
      `;
    }

    // RESTORE previous answer
    if (answers[index] != null) {
      if (q.type === "mcq") {
        const saved = card.querySelector(`input[value="${answers[index]}"]`);
        if (saved) saved.checked = true;
      } else {
        card.querySelector("#shortAns").value = answers[index];
      }
    }

    // ADD CARD with fade animation
    const oldCard = playerArea.firstElementChild;

    if (!oldCard) {
      playerArea.appendChild(card);
      fadeIn(card);
    } else {
      fadeOut(oldCard, () => {
        if (playerArea.firstElementChild === oldCard) {
          playerArea.removeChild(oldCard);
        }
        playerArea.appendChild(card);
        fadeIn(card);
      });
    }

    startTimer(index, q.timeLimit);

    nextBtn.style.display = index === questions.length - 1 ? "none" : "inline-block";
    submitBtn.style.display = index === questions.length - 1 ? "inline-block" : "none";
  };

  // SAVE ANSWER
  const saveAnswer = (i) => {
    const qRaw = questions[i];
    const type = qRaw.type ?? "mcq";
    const card = playerArea.querySelector(".questionCard");

    if (!card) return;

    if (type === "mcq") {
      const selected = card.querySelector("input[type=radio]:checked");
      answers[i] = selected ? parseInt(selected.value) : null;
    } else {
      answers[i] = card.querySelector("#shortAns").value.trim();
    }
  };

  // TIMER
  const startTimer = (i, sec) => {
    clearInterval(timerInterval);

    let remaining = sec;
    const total = sec;
    const circumference = 138;

    timerCircle.style.strokeDasharray = circumference;

    timerInterval = setInterval(() => {
      timerText.textContent = formatTime(remaining);
      timerCircle.style.strokeDashoffset = circumference * (remaining / total);

      if (remaining <= 0) {
        clearInterval(timerInterval);
        lockAndNext(i);
      }
      remaining--;
    }, 1000);
  };

  // LOCK + AUTO NEXT
  const lockAndNext = (i) => {
    const card = playerArea.querySelector(".questionCard");
    if (!card) return;

    card.querySelector("#lockOverlay").classList.remove("hidden");

    Array.from(card.querySelectorAll("input")).forEach(e => e.disabled = true);

    saveAnswer(i);

    if (i === questions.length - 1) {
      setTimeout(submitQuiz, 800);
    } else {
      setTimeout(() => {
        currentIndex++;
        renderQuestion(currentIndex);
      }, 800);
    }
  };

  // NEXT BUTTON
  nextBtn.onclick = () => {
    saveAnswer(currentIndex);
    currentIndex++;
    renderQuestion(currentIndex);
  };

  // FINAL SUBMIT
  submitBtn.onclick = () => {
    saveAnswer(currentIndex);
    submitQuiz();
  };

  const submitQuiz = () => {
    clearInterval(timerInterval);
    window.onbeforeunload = null;

    const payload = {
      quizId: quizMeta.quizId,
      subject: quizMeta.subject,
      facultyId: quizMeta.faculty,
      studentId: this.user.id,
      studentName: this.user.name,
      institute: this.user.institute,
      answers: answers
    };

    this.submitQuizAnswers(payload).then(ok => {
      if (ok) {
        this.showToast("✔ Quiz submitted!");
        modal.remove();
      } else {
        this.showToast("❌ Submission failed");
      }
    });
  };

  // FIRST QUESTION
  renderQuestion(0);

  function escapeHtml(str = "") {
    return String(str)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}



showEvaluateQuizModal() {
  const oldModal = document.getElementById("evaluateQuizModal");
  if (oldModal) oldModal.remove();

  const modal = document.createElement("div");
  modal.id = "evaluateQuizModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

  modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg w-[400px] p-6 text-white shadow-xl border border-gray-700 relative">
      <h3 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Evaluate Quiz</h3>

      <input id="evalSubject" type="text" placeholder="Enter Subject"
        class="w-full p-2 mb-3 rounded bg-[#1e1e1e] border border-gray-600 text-white" />

      <input id="evalQuizName" type="text" placeholder="Enter Quiz Name"
        class="w-full p-2 mb-4 rounded bg-[#1e1e1e] border border-gray-600 text-white" />

      <div class="flex justify-end gap-3 pt-3 border-t border-gray-700">
        <button id="cancelEvalBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">Cancel</button>
        <button id="confirmEvalBtn" class="bg-green-500 px-4 py-2 rounded hover:bg-green-600">Evaluate</button>
      </div>

      <button id="closeEvalX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;

  document.body.appendChild(modal);

  const subjectInput = modal.querySelector("#evalSubject");
  const quizNameInput = modal.querySelector("#evalQuizName");
  const cancelBtn = modal.querySelector("#cancelEvalBtn");
  const closeX = modal.querySelector("#closeEvalX");
  const confirmBtn = modal.querySelector("#confirmEvalBtn");

  cancelBtn.onclick = () => modal.remove();
  closeX.onclick = () => modal.remove();

  confirmBtn.onclick = async () => {
    const subject = subjectInput.value.trim();
    const quizName = quizNameInput.value.trim();

    if (!subject || !quizName) {
      this.showToast("⚠️ Subject and Quiz Name are required.");
      return;
    }

    try {
      const payload = {
        institute: this.user.institute,
        facultyId: this.user.id,
        subject,
        quizName
      };

      this.showToast("⏳ Evaluating quiz...");
      const res = await fetch(`${this.quiz_server}/evaluate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        this.showToast(`✔ Evaluation complete. ${data.evaluated} students graded.`);
        modal.remove();
      } else {
        this.showToast("❌ " + (data.error || "Failed to evaluate quiz."));
      }
    } catch (err) {
      console.error("Error evaluating quiz:", err);
      this.showToast("🚨 Server error while evaluating quiz.");
    }
  };
}





// ---------------------------
// SUBMIT QUIZ ANSWERS (helper to call API)
// ---------------------------
async submitQuizAnswers(payload) {
  
  try {
    this.showToast("⏳ Submitting...");
    const res = await fetch(`${this.quiz_server}/submit-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return true;
    } else {
      console.error("submitQuizAnswers failed:", await res.text());
      return false;
    }
  } catch (err) {
    console.error("submitQuizAnswers error:", err);
    return false;
  }
}




async showDashboard() {
  // If modal already exists, just show it
  let modal = document.getElementById("studentDashboardModal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    return;
  }

  // Otherwise, create the modal dynamically
  const modalHTML = `
  <div id="studentDashboardModal" 
       class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
    <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-[600px] relative">

      <!-- Close Button -->
      <button id="closeDashboardBtn" 
        class="absolute top-2 right-2 
               bg-gray-700 hover:bg-gray-600 text-white 
               text-sm font-medium px-3 py-2 rounded-full 
               pointer-events-auto z-50 shadow-md 
               transition-all duration-150 active:scale-90">
        ✖
      </button>

      <!-- Refresh Button -->
      <button id="refreshDashboardBtn"
        class="absolute top-2 right-12 
               bg-gray-700 hover:bg-gray-600 text-white 
               text-sm font-medium px-3 py-2 rounded-full 
               pointer-events-auto z-50 shadow-md 
               transition-all duration-150 active:scale-90">
        Refresh
      </button>

      <h2 class="text-xl font-bold text-[#61dafb] mb-6">Dashboard</h2>

      <!-- User Info -->
      <div class="mb-6">
        <p class="text-white"><strong>Name:</strong> ${this.user.name}</p>
        <p class="text-white"><strong>Role:</strong> ${this.user.role}</p>
        <p class="text-white"><strong>ID:</strong> ${this.user.id}</p>
        <p id="dashboardRank" class="text-white mt-1">Rank </p>
      </div>

      <!-- Stats Section -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-[#1e1e1e] p-4 rounded-lg text-center">
          <h3 class="text-[#61dafb] font-semibold">Points</h3>
          <p id="dashboardPoints" class="text-white text-lg">0</p>
        </div>
        <div class="bg-[#1e1e1e] p-4 rounded-lg text-center">
          <h3 class="text-[#61dafb] font-semibold">Lines of Code</h3>
          <p id="dashboardLOC" class="text-white text-lg">0</p>
        </div>
        <div class="bg-[#1e1e1e] p-4 rounded-lg text-center">
          <h3 class="text-[#61dafb] font-semibold">Unique Submissions</h3>
          <p id="dashboardUnique" class="text-white text-lg">0</p>
        </div>
      </div>

      <!-- Leaderboard Preview -->
      <div class="mb-6">
        <h3 class="text-[#61dafb] font-semibold mb-2">Leaderboard (Top 20)</h3>
        <div id="leaderboardList" 
          class="space-y-2 max-h-[280px] overflow-y-auto p-2 rounded custom-scrollbar">
        </div>
      </div>
    </div>
  </div>

  <style>
    /* Custom Dark Scrollbar for Leaderboard */
    #leaderboardList::-webkit-scrollbar {
      width: 8px;
    }
    #leaderboardList::-webkit-scrollbar-thumb {
      background-color: #4b5563; /* dark gray thumb */
      border-radius: 10px;
    }
    #leaderboardList::-webkit-scrollbar-thumb:hover {
      background-color: #6b7280; /* slightly lighter on hover */
    }
    #leaderboardList::-webkit-scrollbar-track {
      background-color: #1e1e1e; /* match container background */
      border-radius: 10px;
    }

    /* Firefox Support */
    #leaderboardList {
      scrollbar-width: thin;
      scrollbar-color: #4b5563 #1e1e1e;
    }
  </style>
`;


  document.body.insertAdjacentHTML("beforeend", modalHTML);
  modal = document.getElementById("studentDashboardModal");

  // Show modal
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  // Close handler (adds fade-out effect before removing)
  const closeBtn = document.getElementById("closeDashboardBtn");
  closeBtn.addEventListener("click", () => {
    modal.classList.add("opacity-0", "transition-opacity", "duration-200");
    setTimeout(() => modal.remove(), 200);
  });

  // Refresh handler with small button animation
  const refreshBtn = document.getElementById("refreshDashboardBtn");
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.classList.add("rotate-180");
    setTimeout(() => refreshBtn.classList.remove("rotate-180"), 300);
    await this.refreshDashboardStats();
  });

  // Initial load
  await this.refreshDashboardStats();
}


async refreshDashboardStats() {
  try {
    const response = await fetch(`${this.base_server}/get-student-stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        institute: this.user.institute,
        role: this.user.role,
        student_id: this.user.id,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Error fetching stats:", data.error);
      return;
    }

    // Update main stats
    document.getElementById("dashboardPoints").textContent = data.points || 0;
    document.getElementById("dashboardLOC").textContent = data.total_lines || 0;
    document.getElementById("dashboardUnique").textContent = data.unique_submissions || 0;
    // document.getElementById("dashboardRank").textContent = `<strong>Rank: ${data.rank}</strong>`;
    const rankEl = document.getElementById("dashboardRank");
    rankEl.innerHTML = data.rank != null
    ? `<strong class="text-lg font-bold text-[#61dafb]">Rank: ${data.rank}</strong>`
    : `<strong class="text-lg font-bold text-[#61dafb]">Rank: N/A</strong>`;

    // console.log("Student stats API response:", data);
    // console.log("Personal rank:", data.rank);
    // console.log("Total students:", data.leaderboard?.total_students);


    // Update personal rank and leaderboard if cache exists
    if (data.leaderboard) {
      const { top_students = [], total_students } = data.leaderboard;

      // Use rank from student doc if available
      const personal_rank = data.rank;

      // document.getElementById("dashboardRank").textContent =
      //   personal_rank != null
      //     ? `Rank: ${personal_rank}${total_students ? ` / ${total_students}` : ""}`
      //     : "Rank: N/A";

      rankEl.innerHTML = data.rank != null
    ? `<strong class="text-lg font-bold text-[#61dafb]">Rank: ${personal_rank}${total_students ? ` / ${total_students}` : ""}</strong>`
    : `<strong class="text-lg font-bold text-[#61dafb]">Rank: N/A</strong>`;   

      const leaderboardList = document.getElementById("leaderboardList");
      leaderboardList.innerHTML = "";

      top_students.forEach((s) => {
        const entry = document.createElement("div");
        entry.className = "flex justify-between bg-[#1e1e1e] p-2 rounded";
        entry.innerHTML = `
          <div>
            <span class="text-white font-semibold">#${s.rank} ${s.name}</span>
            <span class="text-gray-400 ml-1">(${s.student_id})</span>
          </div>
          <div class="text-[#61dafb]">
            ${s.points} pts | ${s.total_lines} LOC | ${s.unique_submissions} subs
          </div>
        `;
        leaderboardList.appendChild(entry);
      });
    }

  } catch (err) {
    console.error("Failed to refresh stats:", err);
  }
}




  async showEditor() {
    this.toggleEditorActions(true);
    this.startExamMonitoring(5000); // scan every 5 seconds

    document.getElementById('app').classList.add('hidden');
    document.getElementById('editorLayout').classList.remove('hidden');
  

    this.setupSidebar();
    this.setupTabArea();
    this.setupEditor();
    
    // this.setupOutput();
    await this.setupOutput('program');

    this.setupSplit();
    

    // const topBar = document.getElementById('topBarUserInfo');
    // if (topBar) {
    //   topBar.innerText = `👤 ${this.user.name} (${this.user.role})`;
    // }

    

    // After topbar.innerHTML is set
    const userInfo = document.getElementById("topBarUserInfo");
    if (userInfo) {
      userInfo.innerHTML = `
        <button id="dashboardBtn" class="hover:text-teal-400">
          👤 ${this.user.name } (${this.user.role})
        </button>
      `;
      document.getElementById("dashboardBtn").addEventListener("click", () => {
        this.showDashboard();
      });
    }




    // post button only for teacher
    const postQuestionBtn = document.getElementById('postQuestionBtn');
    if (this.user.role === 'teacher') {
      postQuestionBtn.classList.remove('hidden');
      postQuestionBtn.onclick = () => {
        this.showPostQuestionModal();
      };
      }; 

      const uploadNotesBtn = document.getElementById('uploadNotesBtn');

      if (this.user.role === 'teacher') {
        uploadNotesBtn.classList.remove('hidden');
        uploadNotesBtn.onclick = () => {
          this.showUploadNotesModal();
        };
      }

      const getNotesBtn = document.getElementById('getNotesBtn');

    if (this.user.role !== 'guest' ) {
      getNotesBtn.classList.remove('hidden');
      getNotesBtn.onclick = () => {
        this.viewNotes();
      };
    }

        this.initFileMenuUserActions(); 



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
  // console.log("✅ setupSidebar called");

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
      // console.log("sidebar files:",this.sidebarFiles);
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
        this.showToast('A file or folder with this name already exists.');
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



setupTabArea() {
  const tabBar = document.getElementById('tabBar');
  tabBar.innerHTML = ''; // Clear previous tabs
}


// openTab(name, content, fullPath = null, tempPath = null) {
//   const self = this; // capture 'this' for inner functions

//   // Avoid reopening same file using filePath or tempPath
//   const existingIndex = this.tabs.findIndex(tab =>
//     (fullPath && tab.filePath === fullPath) ||
//     (tempPath && tab.tempPath === tempPath) ||
//     (!fullPath && !tempPath && !tab.filePath && tab.name === name)
//   );
//   if (existingIndex !== -1) {
//     this.switchTab(existingIndex);
//     return;
//   }

//   const uri = monaco.Uri.file(fullPath || tempPath || `untitled-${Date.now()}-${name}`);
//   const model = monaco.editor.getModel(uri) || monaco.editor.createModel(content, this.detectLang(name), uri);

//   const tab = {
//     name,
//     model,
//     filePath: fullPath || null,
//     tempPath: tempPath || null
//   };
//   this.tabs.push(tab);
//   const index = this.tabs.length - 1;

//   // Create tab button
//   const tabBtn = document.createElement('div');
//   tabBtn.className = 'tab px-4 flex items-center h-full cursor-pointer bg-[#2d2d2d] hover:bg-[#373737] border-r border-[#3c3c3c] tab-item';
//   tabBtn.innerHTML = `
//     <span>${name}</span>
//     <span class="tab-close ml-2 text-sm text-gray-400 hover:text-red-400 cursor-pointer">×</span>
//   `;
//   tabBtn.dataset.index = index;

//   tabBtn.onclick = function(e) {
//     const i = parseInt(this.dataset.index);
//     if (e.target.classList.contains('tab-close')) {
//       self.closeTab(i); // use 'self' to access class method
//     } else {
//       self.switchTab(i);
//     }
//   };

//   document.getElementById('tabBar').appendChild(tabBtn);
//   this.switchTab(index);

//   // Make tab visually active
//   document.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
//   tabBtn.classList.add('active');
// }

openTab(name, content, fullPath = null, tempPath = null) {
  const self = this;

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

  // Tab UI
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
      self.closeTab(i);
    } else {
      self.switchTab(i);
    }
  };

  document.getElementById('tabBar').appendChild(tabBtn);
  this.switchTab(index);

  // Make active
  document.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
  tabBtn.classList.add('active');

  // ✅ Sync baseline to hardware count immediately after file load
  if (window.electronAPI && window.electronAPI.syncTypingBaseline) {
    const charCount = content ? content.length : 0;
    window.electronAPI.syncTypingBaseline(charCount);
  }
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
              const result = await window.electronAPI.readFile(item.path);
              const content = result.content; // always a string
              const existingTab = this.tabs.find(t => t.filePath === item.path);
              if (!existingTab) {
                this.openTab(item.name, content, item.path);
                this.setEditorLanguage(item.name);
              } else {
                const index = this.tabs.indexOf(existingTab);
                this.switchTab(index);
                this.setEditorLanguage(existingTab.name);
              }
            } catch (err) {
              console.error("Error reading file:", item.path, err);

              this.showToast(" Not a valid Kodin file (tampered or external).");
              
                  this.refreshSidebar();
                

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
          const result=await window.electronAPI.createFileInFolder({ folderPath, fileName: name });
          if (result.success) {
        // Open immediately in editor
        this.openTab(name, result.content, result.filePath);
        this.setEditorLanguage(name);
      }
          
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
        this.showToast('Error saving file.');
        return;
      }
    } else {
      const result = await window.electronAPI.saveAsFile(content);
      if (!result?.filePath) {
        this.showToast('Save canceled.');
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
            this.showToast('A file or folder with this name already exists.');
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




async setupOutput() {
  const container = document.getElementById("output");
  container.innerHTML = "";

  // create terminal once
  this.term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    rendererType: 'canvas',       // <-- prevents xterm scroll
    theme: { background: '#1e1e1e', foreground: '#d4d4d4' }
  });
  this.fitAddon = new FitAddon();
  this.term.loadAddon(this.fitAddon);
  this.term.open(container);
  this.fitAddon.fit();

  const output = document.getElementById("output");
  new ResizeObserver(() => {
    this.fitAddon?.fit();
  }).observe(output);
  // ⬆️ THIS IS THE CORRECT LOCATION


  this.term.focus();

  this._ptyOutput = '';

  // listen to backend shell/program output (make sure preload exposes onShellOutput)
  window.electronAPI.onShellOutput((text) => {
    if (!text) return;
    // normalize line endings for xterm
    const normalized = text.replace(/\r\n/g, '\r\n').replace(/\n/g, '\r\n');
    this._ptyOutput += normalized;
    this.term.write(normalized);
  });

  // mode state (closed over by onData)
  let interactiveSession = false;
  let sendInteractiveInput = null;

  // make callable by other code (runCode sets this when program starts)
  this._setInteractiveMode = (enabled, sender = null) => {
    interactiveSession = !!enabled;
    sendInteractiveInput = sender || null;
    // ensure terminal focus when switching
    try { this.term.focus(); } catch (e) {}
  };

  // unified input routing (only registered once)
  this.term.onData((data) => {
    if (interactiveSession && sendInteractiveInput) {
      // program mode: send to program PTY
      sendInteractiveInput(data);
    } else {
      // shell mode or idle: send to global shell PTY
      window.electronAPI.sendTerminalInput(data);
    }
  });

  // keyboard shortcut handler (ctrl+enter) — finish interactive program
  this.term.attachCustomKeyEventHandler((e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      if (this._interactivePid) {
        window.electronAPI.finishInteractive(this._interactivePid).then(result => {
          this.outputs = this._ptyOutput + result.output;
          // this.term.write('\r\n✔Program finished. Output captured.\r\n');
          // console.log("Captured output:", this.outputs);
        });
        this._setInteractiveMode(false);
        return false;
      }
    }
    return true;
  });

  // react to mode changes from backend (preload must provide onModeChanged)
  window.electronAPI.onModeChanged((mode) => {
    if (mode === 'shell') {
      this._setInteractiveMode(false);
      // this.term.write('\r\n🔄 Switched to Shell Mode...\r\n');
    } else if (mode === 'program') {
      // this.term.write('\r\n🔄 Switched to Program Mode...\r\n');
    } else if (mode === 'idle') {
      this._setInteractiveMode(false);
      // this.term.write('\r\n🔄 Mode: idle\r\n');
    }
  });

  // window resize -> resize backend pty
  window.addEventListener("resize", () => {
    this.fitAddon.fit();
    window.electronAPI.resizeShell(this.term.cols, this.term.rows);
  });
}

// IMPORTANT: create the terminal first (so output listener is attached), then open shell
async setupShellTerminal() {
  if (!this.term) {
    await this.setupOutput(); // ensure terminal + listeners are ready
  }

  // ask backend to spawn shell (backend will send 'mode-changed' -> renderer will setInteractiveMode)
  await window.electronAPI.openShell();

  // extra safety: ensure renderer is in shell routing mode
  this._setInteractiveMode(false);

  // let user know
  // this.term.write("\r\n🔄 Switched to Shell Mode...\r\n");
  this.term.focus();
}


cleanOutput(data) {
  let cleaned = data.toString();

  // 1. Remove ANSI escape sequences (cursor hide/show, colors, etc.)
  cleaned = cleaned.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "");

  // 2. Remove other control characters except newline (\n) and carriage return (\r)
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, "");

  // 3. Normalize spaces in each line and preserve newlines
  cleaned = cleaned
    .split(/\r?\n/)             // split by newline
    .map(line => line.replace(/\s+/g, " ").trim())  // clean each line
    .join("\n");                // join lines back with newline

  return cleaned;
}




stripBoilerplate(code, lang) {
  let stripped = code.trim();

  if (lang === "java") {
    stripped = stripped.replace(
      /(?:public\s+static\s+)?void\s+main\s*\([^)]*\)\s*\{[\s\S]*?\}/g,
      ""
    );
    stripped = stripped.replace(
      /(?:public\s+)?class\s+\w+\s*\{\s*\}/g,
      ""
    );
  }

  if (lang === "cpp" || lang === "c") {
    stripped = stripped
      .replace(/#include\s*<[^>]+>/g, "")
      .replace(/(?:int|void)\s+main\s*\([^)]*\)\s*\{/, "")
      .replace(/\}\s*$/, "");
  }

  if (lang === "js") {
    stripped = stripped.replace(/["']use strict["'];?/g, "");
  }

  return stripped.trim();
}

removeIOStatements(code) {
  return code
    .replace(/\b(System\.out\.print(?:ln)?)\s*\([^)]*\)\s*;?/g, "")
    .replace(/\bprintf\s*\([^)]*\)\s*;?/g, "")
    .replace(/\bprint\s*\([^)]*\)\s*;?/g, "")
    .replace(/\b(cout|cin)\s*(<<|>>)[^;]*;?/g, "")
    .replace(/\bscanf\s*\([^)]*\)\s*;?/g, "")
    .replace(/\bconsole\.log\s*\([^)]*\)\s*;?/g, "")
    .replace(/Scanner\s+\w+\s*=\s*new\s+Scanner\s*\([^)]*\)\s*;?/g, "")
    .replace(/\b\w+\.next\w*\s*\([^)]*\)\s*;?/g, "")
    .trim();
}

normalizeConstants(code) {
  // Replace all numeric constants with a placeholder
  return code.replace(/\b\d+(\.\d+)?\b/g, "CONST");
}
removeDeadVariables(code) {
  const usedVars = new Set();
  const identifierRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let match;

  // Collect all identifiers used in the code
  while ((match = identifierRegex.exec(code)) !== null) {
    usedVars.add(match[1]);
  }

  return code
    .split("\n")
    .filter(line => {
      const assignMatch = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);

      // If line doesn't contain assignment, keep it
      if (!assignMatch) return true;

      const varName = assignMatch[1];

      // Keep the line only if the assigned variable is used somewhere
      return usedVars.has(varName);
    })
    .join("\n");
}

renameVariables(code) {
  const keywords = new Set([
    "if","else","for","while","do","switch","case","break","continue","return",
    "class","struct","public","private","protected","static","void","int","float",
    "double","char","long","short","boolean","true","false","try","catch","finally",
    "throw","throws","import","package","def","print","and","or","not","in","is",
    "function","var","let","const"
  ]);

  const varMap = new Map();
  let counter = 1;

  return code.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
    // Keep keywords as-is
    if (keywords.has(match)) return match;

    // Map each new variable name to VAR1, VAR2, ...
    if (!varMap.has(match)) varMap.set(match, `VAR${counter++}`);

    return varMap.get(match);
  });
}


hasMeaningfulLogic(code) {
  if (!code || !code.trim()) return false;

  let normalized = this.removeIOStatements(code);
  normalized = this.normalizeConstants(normalized);
  // Control flow and logical constructs regex, now including C/C++/Java function definitions
const CONTROL_FLOW_REGEX = /\b(if|else|for|while|do|switch|case|return|try|catch|finally|throw|throws|thread|def|function|class|struct)\b|(?:\b(?:void|int|float|double|char|long|short|boolean)\b\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{?)/;


  const lines = normalized
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("//") && !l.startsWith("#"));

  // Skip pure variable declarations / simple assignments
  const meaningfulLines = lines.filter(line => {
    if (/^\s*(const\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s*(=\s*CONST)?\s*;?$/.test(line)) return false;
    return true;
  });

  // Must contain at least one control flow or function/exception/thread/logic construct
  return meaningfulLines.some(line => CONTROL_FLOW_REGEX.test(line));
}

normalizeCode(code, lang) {
  if (lang === "sql") return this.normalizeSQL(code);

  let normalized = this.stripBoilerplate(code, lang);
  normalized = this.removeIOStatements(normalized);
  normalized = this.normalizeConstants(normalized);
  normalized = normalized.replace(/\s+/g, " ").trim();
  normalized = this.removeDeadVariables(normalized);
  normalized = this.renameVariables(normalized);

  if (normalized.length < (this.MIN_LENGTH[lang] || this.MIN_LENGTH.default)) return null;

  // Must have at least one meaningful control-flow statement
  if (!this.hasMeaningfulLogic(code)) return null;

  return normalized;
}


normalizeSQL(sql) {
  let normalized = sql
    .replace(/--.*$/gm, "")               // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "")     // Remove block comments
    .replace(/\s+/g, " ")                 // Collapse spaces/newlines
    .trim();

  const hasQuery = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|JOIN|WHERE|GROUP\s+BY|ORDER\s+BY)\b/i.test(normalized);
  if (!hasQuery) return null;

  if (normalized.length < MIN_LENGTH.sql) return null;

  return normalized;
}

updateLeaderboard(lang, code, user) {
  (async () => {
    try {
      // ✅ Normalize code first
      const normalized = this.normalizeCode(code, lang);
      if (!normalized) {
        this.showToast(` Skipping submission for ${lang}: too trivial, no logic, or too short.`);
        return;
      }

      // ✅ Compute SHA-256 hash on normalized code
      const encoder = new TextEncoder();
      const data = encoder.encode(normalized);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      const kodinv=2;

      // ✅ Count lines AFTER normalization (only meaningful lines)
      const lines = normalized
        .split("\n")
        .map(l => l.trim())
        .filter(l => l !== "").length;

      // ✅ Send async update
      fetch(`${this.base_server}/update-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institute: this.user.institute,
          role: this.user.role,
          student_id: this.user.id,
          student_name: this.user.name,
          lang,
          hash,
          lines, // ✅ Now meaningful-only
          kodinv
        }),
      }).catch(err => console.error("Leaderboard update failed:", err));

    } catch (err) {
      console.error("Error in updateLeaderboard:", err);
    }
  })();
}

appendOutput(text) {
  if (!this.term) return;

  const cleanTxt = text.replace(/\n/g, '\r\n');
  this.term.write('\r\n' + cleanTxt + '\r\n');

  // Always scroll to bottom
  try {
    const scrollHeight = this.term.element.scrollHeight;
    this.term.element.scrollTop = scrollHeight;
  } catch (e) {
    // fallback if xterm element not ready
  }
}



async runCode() {
  const currentTab = this.tabs[this.activeTabIndex];
  if (!currentTab || !this.editorInstance) {
    this.appendOutput(" No active file to run.");
    return;
  }
  if (!this.term) {
    await this.setupOutput();
  }

  const fileName = currentTab.name || '';
  const extension = (fileName.split('.').pop() || '').toLowerCase();

  if (!currentTab.filePath) {
    this.showToast(" Please save the file before running.");
    return;
  }

  this.saveCurrentFile();
  if (!this.openedFilePaths.includes(currentTab.filePath)) {
    this.openedFilePaths.push(currentTab.filePath);
  }

  if (!this.submittedFiles) this.submittedFiles = new Set();

  // Clear terminal
  if (this.term) {
    const platform = await window.electronAPI.getPlatform();
    window.electronAPI.sendTerminalInput(platform === "win32" ? "cls\r\n" : "clear\n");
  }

  const appTools = await window.electronAPI.getBundledToolsPaths();
  const ext = await window.electronAPI.getExt();

  // Helper function to decide if output is valid for leaderboard
  const isValidOutput = (output) => {
    if (!output || !output.trim()) return false;
    const lower = output.toLowerCase();
    return !(
      lower.includes("error") ||
      lower.includes("exception") ||
      lower.includes("traceback") ||
      lower.includes("segmentation fault") ||
      lower.includes("failed")
    );
  };

  // Update leaderboard only once per file
  const handleLeaderboard = () => {
    if (!this.submittedFiles.has(currentTab.filePath)) {
      if (isValidOutput(this.outputs)) {
        this.updateLeaderboard(extension, this.editorInstance.getValue(), this.user);
        this.submittedFiles.add(currentTab.filePath);
      }
    }
  };

  try {
    let execName, args = [], cleanup = null;

    switch (extension) {

      // -----------------------------
      // C
      case 'c': {
        const platform = await window.electronAPI.getPlatform();

        if (platform === 'win32' && appTools.tcc) {
          execName = appTools.tcc;
          args = ['-run', currentTab.filePath];

          this.appendOutput('▶ Running C ...');
          const { pid } = await window.electronAPI.startInteractiveProcess(execName, args, currentTab.filePath);

          this._setInteractiveMode(true, (data) => window.electronAPI.sendInteractiveInput(pid, data));
          this.appendOutput(' Press Ctrl+Enter to finish program.');
          let leaderboardUpdated = false;
          this.outputs = "";

          this.term.attachCustomKeyEventHandler((e) => {
            if (e.ctrlKey && e.key === 'Enter') {
              window.electronAPI.finishInteractive(pid).then(result => {
                const cleanout = this.cleanOutput(result.output || "");
                this.outputs += cleanout || "";

                this.appendOutput('✔ Output Saved');
                this.appendOutput(result.output || "");

                if (!leaderboardUpdated) {
                  handleLeaderboard();
                  leaderboardUpdated = true;
                }
              });
              this._setInteractiveMode(false);
              return false;
            }
            return true;
          });
          break;
        }

        execName = appTools.gcc || 'gcc';
        const outExec = currentTab.filePath.replace(/\.c$/i, ext);
        args = [currentTab.filePath, '-o', outExec];
        cleanup = outExec;

        this.appendOutput('🔧 Compiling C (GCC)...');
        const compileResult = await window.electronAPI.runCommand(execName, args, currentTab.filePath);
        if (compileResult.code !== 0) {
          this.appendOutput('❌ Compilation error:');
          this.appendOutput(compileResult.stderr);
          return;
        }

        this.appendOutput('✔ Compilation successful');
        const { pid } = await window.electronAPI.startInteractiveProcess(outExec, [], currentTab.filePath);

        this._setInteractiveMode(true, (data) => window.electronAPI.sendInteractiveInput(pid, data));
        this.appendOutput(' Press Ctrl+Enter to finish program.');
        let leaderboardUpdated = false;
        this.outputs = "";

        this.term.attachCustomKeyEventHandler((e) => {
          if (e.ctrlKey && e.key === 'Enter') {
            window.electronAPI.finishInteractive(pid).then(result => {
              const cleanout = this.cleanOutput(result.output || "");
              this.outputs += cleanout || "";

              this.appendOutput('✔ Output Saved:');
              this.appendOutput(result.output || "");

              if (!leaderboardUpdated) {
                handleLeaderboard();
                leaderboardUpdated = true;
              }
            });
            this._setInteractiveMode(false);
            return false;
          }
          return true;
        });
        break;
      }

      // -----------------------------
      // C++
      case 'cpp':
      case 'cc': {
        execName = appTools.gpp || appTools.gcc || 'g++';
        const srcFile = await window.electronAPI.fixPathForCompiler(currentTab.filePath);
        const outExec = await window.electronAPI.fixPathForCompiler(
          await window.electronAPI.getTempExePath(currentTab.filePath, ext)
        );
        args = [srcFile, "-o", outExec];
        cleanup = outExec;

        this.appendOutput('🔧 Compiling C++...');
        const compileResult = await window.electronAPI.runCommand(execName, args, currentTab.filePath);
        if (compileResult.code !== 0) {
          this.appendOutput('❌ Compilation error:');
          this.appendOutput(compileResult.stderr);
          return;
        }

        this.appendOutput('✔ Compilation successful...');
        const { pid } = await window.electronAPI.startInteractiveProcess(outExec, [], currentTab.filePath);

        this._setInteractiveMode(true, (data) => window.electronAPI.sendInteractiveInput(pid, data));
        this.appendOutput(' Press Ctrl+Enter to finish program.');
        let leaderboardUpdated = false;
        this.outputs = "";

        this.term.attachCustomKeyEventHandler((e) => {
          if (e.ctrlKey && e.key === 'Enter') {
            window.electronAPI.finishInteractive(pid).then(result => {
              const cleanout = this.cleanOutput(result.output || "");
              this.outputs += cleanout || "";

              this.appendOutput('✔ Output Saved');
              this.appendOutput(result.output || "");

              if (!leaderboardUpdated) {
                handleLeaderboard();
                leaderboardUpdated = true;
              }
            });
            this._setInteractiveMode(false);
            return false;
          }
          return true;
        });
        break;
      }

      // -----------------------------
      // Python
      case 'py': {
        execName = appTools.python || 'python';
        args = [currentTab.filePath];

        this.appendOutput('▶ Running Python interactively...');
        const { pid } = await window.electronAPI.startInteractiveProcess(execName, args, currentTab.filePath);

        this._setInteractiveMode(true, (data) => window.electronAPI.sendInteractiveInput(pid, data));
        this.appendOutput(' Press Ctrl+Enter to finish program.');
        this.outputs = "";
        let leaderboardUpdated = false;

        this.term.attachCustomKeyEventHandler((e) => {
          if (e.ctrlKey && e.key === 'Enter') {
            window.electronAPI.finishInteractive(pid).then(result => {
              const cleanout = this.cleanOutput(result.output || "");
              this.outputs += cleanout || "";

              this.appendOutput('✔ Output Saved');
              this.appendOutput(result.output || "");

              if (!leaderboardUpdated) {
                handleLeaderboard();
                leaderboardUpdated = true;
              }
            });
            this._setInteractiveMode(false);
            return false;
          }
          return true;
        });
        break;
      }

      // -----------------------------
      // Java
      case 'java': {
        const compileExec = appTools.javac || 'javac';
        const javaRunner = appTools.java || 'java';
        const classname = fileName.replace(/\.java$/i, '');

        this.appendOutput('🔧 Compiling Java...');
        const compileResult = await window.electronAPI.runCommand(compileExec, [currentTab.filePath], currentTab.filePath);
        if (compileResult.code !== 0) {
          this.appendOutput('❌ javac error:');
          this.appendOutput(compileResult.stderr);
          return;
        }

        this.appendOutput('✔ javac compilation finished.');
        const filePath = currentTab.filePath;
        const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        const fileDir = lastSlashIndex >= 0 ? filePath.substring(0, lastSlashIndex) : '.';

        const { pid } = await window.electronAPI.startInteractiveProcess(
          javaRunner,
          ['-cp', fileDir, classname],
          currentTab.filePath
        );

        this._setInteractiveMode(true, (data) => window.electronAPI.sendInteractiveInput(pid, data));
        this.appendOutput(' Press Ctrl+Enter to finish program.');
        this.outputs = "";
        let leaderboardUpdated = false;

        this.term.attachCustomKeyEventHandler((e) => {
          if (e.ctrlKey && e.key === 'Enter') {
            window.electronAPI.finishInteractive(pid).then(result => {
              const cleanout = this.cleanOutput(result.output || "");
              this.outputs += cleanout || "";

              this.appendOutput('✔ Output Saved');
              this.appendOutput(result.output || "");

              if (!leaderboardUpdated) {
                handleLeaderboard();
                leaderboardUpdated = true;
              }
            });
            this._setInteractiveMode(false);
            return false;
          }
          return true;
        });
        break;
      }

      // -----------------------------
      // SQL
      case 'sql': {
        execName = appTools.sqlite3 || 'sqlite3';
        const tmpDb = currentTab.filePath.replace(/\.sql$/, '') + '.db';
        args = [tmpDb];

        this.appendOutput('▶ Running SQL script...');
        const result = await window.electronAPI.runSQLStream(execName, args, currentTab.filePath);
        this.appendOutput(result.stdout || '');
        this.appendOutput(result.stderr || '');
        this.outputs = (result.stdout || '') + (result.stderr || '');

        handleLeaderboard();
        break;
      }

      // -----------------------------
      // JavaScript
      case 'js': {
        execName = 'node';
        args = [currentTab.filePath];

        this.appendOutput('▶ Running JS program...');
        const result = await window.electronAPI.runCommand(execName, args, currentTab.filePath);
        this.appendOutput(result.stdout || '');
        this.appendOutput(result.stderr || '');
        const cleanout = this.cleanOutput(result.output || "");
        this.outputs += cleanout || "";

        if (result.code === 0) {
          handleLeaderboard();
          this.appendOutput('✔ Executed successfully.');
        } else {
          this.appendOutput('❌ Execution failed.');
        }
        break;
      }

      default:
        this.appendOutput(`❌ Unsupported file type: .${extension}`);
        return;
    }

  } catch (err) {
    this.appendOutput('❌ Runtime Error:');
    this.appendOutput(String(err));
  }
}







async setupShellTerminal() {
  // Just open backend shell
  await window.electronAPI.openShell();

  if (!this.term) {
    await this.setupOutput(); // ensure terminal exists
  }
  
}

showAutomationModal() {
  const oldModal = document.getElementById("automationModal");
  if (oldModal) oldModal.remove();

  const modal = document.createElement("div");
  modal.id = "automationModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50";

  modal.innerHTML = `
    <div class="bg-[#333333] rounded-lg w-[400px] p-6 text-white shadow-xl border border-gray-700 relative">
      <h3 class="text-xl font-bold text-[#ff5555] mb-4 text-center">An Automation Detected. Editor Locked</h3>
      <p class="text-center mb-4">An automation script or tool was detected running on your system.</p>
      <p class="text-center mb-6">Close all automation scripts to continue editing the code.</p>

      <div class="flex justify-end gap-3 pt-3 border-t border-gray-700">
        <button id="ackAutomationBtn" class="bg-gray-600 px-4 py-2 rounded hover:bg-gray-500">
          OK
        </button>
      </div>

      <button id="closeAutomationX" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  document.getElementById("ackAutomationBtn").onclick = () => modal.remove();
  document.getElementById("closeAutomationX").onclick = () => modal.remove();
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


setEditorLanguage(filename) {
    let ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    let lang = this.getLanguageByExtension(ext); // use your existing mapping
    if (this.editorInstance) {
        monaco.editor.setModelLanguage(this.editorInstance.getModel(), lang);
    }
}




  setupEditor() {
    const editorContainer = document.getElementById('editor');
    //delete previous editor instance if any
    if (this.editorInstance) {
    this.editorInstance.dispose();
    this.editorInstance = null;
  }

    
    this.editorInstance = monaco.editor.create(editorContainer, {
      value: '',
      language: 'python',
      theme: 'vs-dark',
      fontSize: 18, 
      automaticLayout: true,
       minimap: { enabled: false }
         
    });

    let hardwareCount = 0;
  let textCharCount = 0;
  let lastCheckTime = Date.now();


    if (this.user?.role === "student") {
  // 🔹 Disable keyboard shortcuts (Copy & Paste variations)
  this.editorInstance.onKeyDown((e) => {
    const key = e.code.toLowerCase();

    // Block all paste combos
    if (
      ((e.ctrlKey || e.metaKey) && key === "keyv") ||   // Ctrl+V
      (e.ctrlKey && e.shiftKey && key === "keyv") ||    // Ctrl+Shift+V
      (e.ctrlKey && e.altKey && key === "keyv") ||      // Ctrl+Alt+V
      (e.shiftKey && e.code === "Insert")               // Shift+Insert
    ) {
      e.preventDefault();
      this.showToast("Paste is disabled. Please write your code.");
    }

    // Block all copy combos
    if (
      ((e.ctrlKey || e.metaKey) && key === "keyc") ||   // Ctrl+C
      (e.ctrlKey && e.code === "Insert")                // Ctrl+Insert
    ) {
      e.preventDefault();
      this.showToast("Copy is disabled.");
    }
  });

  // 🔹 Disable paste via Monaco's API
  this.editorInstance.onDidPaste(() => {
    this.editorInstance.executeEdits(null, []); // clear pasted content
    this.showToast("Paste is disabled. Please write your code.");
  });

  // 🔹 Disable right-click context menu inside editor
  this.editorInstance.updateOptions({
    contextmenu: false
  });

  // 🔹 Disable native paste on editor DOM node
  editorContainer.addEventListener("paste", (e) => {
    e.preventDefault();
    this.showToast("Paste is disabled in the editor for students.");
  });

  // 🔹 Disable native copy on editor DOM node
  editorContainer.addEventListener("copy", (e) => {
    e.preventDefault();
    this.showToast("Copy is disabled in the editor for students.");
  });

  // 🔹 Disable drag & drop into editor
  editorContainer.addEventListener("drop", (e) => {
    e.preventDefault();
    this.showToast(" Drag & drop is disabled.");
  });

  // 🔹 Block Clipboard API access
  if (navigator.clipboard) {
    navigator.clipboard.readText = async () => "";
    navigator.clipboard.writeText = async () => {};
  }
}


// Assuming this is inside your setupEditor() function
if (window.electronAPI && window.electronAPI.onAutomationDetected) {
  window.electronAPI.onAutomationDetected((scripts) => {
    // 🔹 Lock the editor
    if (this.editorInstance) this.editorInstance.updateOptions({ readOnly: true });

    // 🔹 Show dynamic modal styled like quiz modal
    this.showAutomationModal();

    this.showToast(' Automation script detected! Editor locked.');

    console.log('Automation scripts detected:', scripts);
  });

  window.electronAPI.onAutomationCleared(() => {
    // 🔹 Unlock the editor
    if (this.editorInstance) this.editorInstance.updateOptions({ readOnly: false });

    this.showToast('Editor unlocked.');
  });
}


  }




showCopilotPane() {
  const pane = document.getElementById('copilotPane');
  if (pane) pane.classList.remove('hidden');
}

// hideCopilotPane() {
//   const pane = document.getElementById('copilotPane');
//   if (pane) pane.classList.add('hidden');
// }

hideCopilotPane() {
    const copilotPane = document.getElementById("copilotPane");
    const mainPane = document.getElementById("mainPane");

    if (!copilotPane || !mainPane) return;

    copilotPane.classList.add("hidden");

    if (this.copilotSplit) {
      this.copilotSplit.destroy();
      this.copilotSplit = null;
    }

    mainPane.style.flex = "1 1 100%";
  }


toggleCopilotPane() {
  const copilotPane = document.getElementById("copilotPane");
  const mainWithCopilot = document.getElementById("mainWithCopilot");
  const mainPane = document.getElementById("mainPane");

  if (!copilotPane || !mainPane || !mainWithCopilot) return;

  const isVisible = !copilotPane.classList.contains("hidden");

  if (isVisible) {
    // Hide Copilot
    copilotPane.classList.add("hidden");

    // Remove flex split styles if any
    if (this.copilotSplit) {
      this.copilotSplit.destroy();
      this.copilotSplit = null;
    }

    // Make editor take full width
    mainPane.style.flex = "1 1 100%";

  } else {
    // Show Copilot
    copilotPane.classList.remove("hidden");

    // Remove inline flex from editor
    mainPane.style.flex = "";

    // Create Split.js for resizing
    if (window.copilotSplit) window.copilotSplit.destroy();
    window.copilotSplit = Split(["#mainPane", "#copilotPane"], {
      sizes: [85, 15],
      minSize: [100, 100],
      gutterSize: 4,
      cursor: "col-resize",
    });
  }
}

// Attach X button



// Attach X button






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
    sizes: [10, 90],
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
  // Split(['#editor', '#output'], {
  //   direction: 'vertical',
  //   sizes: [80, 20],
  //   minSize: [100, 100],
  //   gutterSize: 4,

  //   // Called continuously while dragging
  //   onDrag: () => {
  //     if (this.fitAddon) {
  //       this.fitAddon.fit();
  //     }
  //   },

  //   // Called once drag ends
  //   onDragEnd: () => {
  //     if (this.fitAddon) {
  //       this.fitAddon.fit();
  //     }
  //   }
  // });

  Split(['#editor', '#output'], {
  direction: 'vertical',
  sizes: [80, 20],
  minSize: [100, 100],
  gutterSize: 4,
  onDrag: () => this.fitAddon?.fit(),
  onDragEnd: () => this.fitAddon?.fit()
});

// Force one time resize after layout is mounted
requestAnimationFrame(() => this.fitAddon?.fit());

  // Editor and Copilot (initially only when Copilot is visible)
  this.copilotSplit = null;
}


}


document.addEventListener('DOMContentLoaded', () => new CodeEditorApp());
// console.log('Available APIs:', window.electronAPI);

