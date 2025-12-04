

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

