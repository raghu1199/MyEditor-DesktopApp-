import * as monaco from 'monaco-editor';
import Split from 'split.js';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css'; // Choose your preferred theme



import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
// ✅ Firebase config (public keys only, safe in client apps)


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
    
    this.tabs = [];  // For multi-tab
    this.activeTabIndex = -1;
    this.untitledCounter = 1;
    this.sidebarFiles = [];
    this.currentFolderPath=null;
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
    
  }

  async loadapi() {
    // ✅ Public Firebase config (safe to expose)
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

    try {
      const ref = doc(db, "config", "config");
      const snapshot = await getDoc(ref);

      if (!snapshot.exists()) {
        throw new Error("Config document not found");
      }

      const config = snapshot.data();
      console.log("✅ Loaded remote config:", config);

      // Store in class variables
      this.base_server = config.server_api;
      this.base_llm = config.llm_api;

      // Update UI if elements exist
      const serverApiEl = document.getElementById("serverApi");
      const llmApiEl = document.getElementById("llmApi");
      if (serverApiEl) serverApiEl.textContent = config.server_api;
      if (llmApiEl) llmApiEl.textContent = config.llm_api;

    } catch (err) {
      console.error("❌ Failed to load config:", err);
    }
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
          </div>
        </div>
        <button id="runBtn" class="hover:text-teal-400">Run</button>
        <button id="exportBtn" class="hover:text-teal-400">📤Export</button>
        <button id="getQuestionBtn" class="hover:text-teal-400 hidden">📥 Get Question</button>
        <button id="postQuestionBtn" class="hover:text-teal-400 hidden">📝 Post Question</button>
        <button id="viewMySubmissionsBtn" class="hover:text-teal-400 hidden">📥 My Submissions</button>
        <button id="viewClassSubmissionsBtn" class="hover:text-teal-400 hidden">📚 View Class Submissions</button>
        <button id="copilotToggleFromMenu" class="text-sm hover:text-teal-400">Ask Kodin</button>


        <button id="uploadBtn" class="hover:text-teal-400">📤Upload Session</button>
        <button id="logoutBtn" class="hover:text-red-400">Logout</button>
      </div>
      <!-- USER INFO + WINDOW BUTTONS -->
       <div class="flex items-center space-x-4">
          <div id="topBarUserInfo" class="text-sm text-gray-300">
          </div>
      <div class="flex space-x-2">
        <button id="min-btn" class="hover:text-gray-400">—</button>
        <button id="max-btn" class="hover:text-gray-400">▢</button>
        <button id="close-btn" class="hover:text-red-400">✕</button>
      </div>
    </div>
  `;

  // Window Controls
  document.getElementById('min-btn').onclick = () => window.electronAPI.windowControl('minimize');
  document.getElementById('max-btn').onclick = () => window.electronAPI.windowControl('maximize');
  document.getElementById('close-btn').onclick = () => window.electronAPI.windowControl('close');
  document.getElementById('logoutBtn').onclick = () => location.reload();
  document.getElementById('runBtn').onclick = () => this.runCode();

  const fileBtn = document.getElementById('fileBtn');
  const fileMenu = document.getElementById('fileMenu');
  const newFileTypeMenu = document.getElementById('newFileTypeMenu');



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

  document.body.addEventListener('click', () => {
    fileMenu.classList.add('hidden');
    newFileTypeMenu.classList.add('hidden');
  });


  // new file logic
      fileMenu.addEventListener('click', async (e) => {
  e.stopPropagation();
  const action = e.target.dataset.action;

  if (action === 'newFile') {
    newFileTypeMenu.classList.toggle('hidden');
  } else if (action === 'openFile') {
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
  } else if (action === 'openFolder') {
    const folder = await window.electronAPI.openFolder();
    this.currentFolderPath = folder.folderPath;
    if (!folder.canceled) {
      if (!this.editorInstance) this.showEditor();
      this.loadFolderToSidebar(folder.tree);
    }
  } else if (action === 'saveFile') {
    this.saveCurrentFile();
  }
});

newFileTypeMenu.addEventListener('click', async (e) => {
  e.stopPropagation(); // ✅ prevents submenu click from closing itself

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

  if (!this.editorInstance) {
    this.showEditor();
  }

  this.openTab(newName, '', filePath);

  if (!this.openedFilePaths.includes(filePath)) {
    this.openedFilePaths.push(filePath);
  }

  

  // ✅ Do NOT hide newFileTypeMenu here unless you want to close submenu after one click
  this.refreshSidebar();
  newFileTypeMenu.classList.add('hidden');
    
  fileMenu.classList.add('hidden');
});



    // export pdf

  document.getElementById('exportBtn').onclick = async () => {
  const openedFiles = this.openedFilePaths || [];
  const currentUser = this.user?.name || "unknown_user";
  const currentFolder = this.currentFolderPath || "";

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

      const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
      if (refreshed) {
        requestIdleCallback(() => {
          this.loadFolderToSidebar(refreshed);
        });
    }
};

  // upload session
  document.getElementById('uploadBtn').onclick = () => {
  this.showUploadSessionModal();
};


  window.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      this.saveCurrentFile();
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

      document.getElementById("copilotToggleBtn")?.addEventListener("click", () => {
        this.toggleCopilotPane();
      });
}


showQuestionModal() {
  let modal = document.getElementById("getQuestionModal");

  // Create modal if it doesn't exist
  if (!modal) {
    const modalHTML = `
      <div id="getQuestionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96">
          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Get Question</h2>
          <label class="block text-sm text-white mb-1">Faculty:</label>
          <input id="facultyInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">
          <label class="block text-sm text-white mb-1">Subject:</label>
          <input id="subjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">
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
  const cancelBtn = document.getElementById("cancelQuestionBtn");
  const fetchBtn = document.getElementById("fetchQuestionBtn");

  // Reset input fields and show modal
  facultyInput.value = "";
  subjectInput.value = "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  fetchBtn.onclick = () => {
    const faculty = facultyInput.value.trim();
    const subject = subjectInput.value.trim();
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    this.fetchQuestion(faculty, subject);
  };
}

async fetchQuestion(faculty, subject) {
  const institute = this.user.institute || '';
  if (!faculty || !subject || !institute) {
    alert("Faculty, subject, or institute is missing.");
    return;
  }

  try {
    const response = await fetch(`${this.base_server}/get_question?faculty=${faculty}&subject=${subject}&institute=${institute}`);
    if (!response.ok) throw new Error(await response.text());

    const data = await response.json();
    const questionText = data.question || "No question returned.";

    const folderPath = await window.electronAPI.saveQuestionFiles({ questionText });
    if (!folderPath) throw new Error("Failed to save question files.");

    const refreshed = await window.electronAPI.getFolderTree(folderPath);
    if (!refreshed) {
      console.error("getFolderTree returned null. Path:", folderPath);
      alert("Failed to load folder structure.");
      return;
    }

    this.currentFolderPath = folderPath;

    setTimeout(() => {

    requestIdleCallback(() => {
      console.log("before sidebar load");
      this.loadFolderToSidebar(refreshed);
      console.log("before sidebar load");

      // Show alert only after DOM paints
      requestAnimationFrame(() => {
        setTimeout(() => {
          // alert(".");
          this.showToast("✅ Question folder created and loaded!");

        }, 50);
      });
    });
  }, 100); 

  } catch (error) {
    console.error("Fetch error:", error);
    alert("Failed to fetch question: " + error.message);
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



async viewMySubmissions() {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
    modal.innerHTML = `
        <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
            <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">View My Submissions</h2>

            
            <label class="block mb-2 font-medium">Faculty:</label>
            <input type="text" id="faculty" class="w-full mb-4 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />

            <label class="block mb-2 font-medium">Subject:</label>
            <input type="text" id="subject" class="w-full mb-6 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />

            <button id="loadReportsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">Load My Reports</button>

            <button id="closeModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("closeModalBtn").onclick = () => modal.remove();

    document.getElementById("loadReportsBtn").onclick = async () => {
        const college = this.user.institute;//document.getElementById("college").value.trim();
        const faculty = document.getElementById("faculty").value.trim();
        const subject = document.getElementById("subject").value.trim();
        const student_name = this.user.name || "Unknown";  // make sure current user is set

        if (!college || !faculty || !subject || !student_name) {
            this.showToast("Please fill all fields.");
            return;
        }

        try {
            const res = await fetch(`${this.base_server}/get-my-reports?college=${college}&faculty=${faculty}&subject=${subject}&student_name=${student_name}`);
            const data = await res.json();
            const reports = data.reports || [];

            modal.remove(); // remove the input modal
            this.showReportViewerModal(subject, reports, college, faculty, student_name); // show next one
        } catch (err) {
            this.showToast("Failed to load reports.");
            console.error(err);
        }
    };
}

showReportViewerModal(subject, reports, college, faculty, student_name) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

    const reportCards = reports.map((r, i) => `
        <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700 flex justify-between items-center">
            <span class="text-[#61dafb] font-semibold">${r.pdf_name || 'Unnamed PDF'}</span>
            <button 
              class="download-btn bg-[#61dafb] text-black px-4 py-1 rounded hover:bg-[#21a1f1] font-semibold" 
              data-path="${r.storage_path}"
            >
              Download
            </button>
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

    // Close button
    modal.querySelector("#closeModalBtn2").onclick = () => modal.remove();

    // Bind download buttons to class method
    const downloadButtons = modal.querySelectorAll(".download-btn");
    downloadButtons.forEach(btn => {
        const path = btn.dataset.path;
        btn.onclick = () => this.downloadReport(path); // ✅ class method used here
    });

    // Merge reports
    if (reports.length > 0) {
        modal.querySelector("#mergeReportsBtn").onclick = async () => {
            const payload = {
                storage_paths: reports.map(r => r.storage_path),
                output_name: "final_report",
                college,
                faculty,
                subject,
                student_name
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
                    
                    this.showToast("✅Final Report generated and Uploaded to respective subject.");
                } else {
                    this.showToast("Failed to generate final report.");
                }
            } catch (err) {
                this.showToast("Error merging reports.");
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
        this.showToast("Download failed.");
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
            <input type="text" id="subject" class="w-full mb-4 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />

            <label class="block mb-2 font-medium">Class:</label>
            <input type="text" id="classId" class="w-full mb-6 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />

            <button id="loadClassReportsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">Load Class Reports</button>

            <button id="closeModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#closeModalBtn").onclick = () => modal.remove();

    modal.querySelector("#loadClassReportsBtn").onclick = async () => {
        const college = this.user.institute;
        const faculty = this.user.id; // teacher's ID
        const subject = document.getElementById("subject").value.trim();
        const classId = document.getElementById("classId").value.trim();

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
            this.showToast("Failed to load class reports.");
            console.error(err);
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
        const pdfList = studentReports.map(r => `
            <div class="flex justify-between items-center mt-2">
                <span class="text-sm text-gray-300">${r.pdf_name || 'session.pdf'}</span>
                <button 
                    class="download-btn bg-[#61dafb] text-black px-2 py-1 rounded hover:bg-[#21a1f1]" 
                    data-path="${r.storage_path}">
                    Download
                </button>
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

    // Update marks
    const updateBtn = modal.querySelector("#updateMarksBtn");
    if (updateBtn) {
        updateBtn.onclick = async () => {
            const marksData = [];
            modal.querySelectorAll(".marks-input").forEach(input => {
                marksData.push({
                    student_id: input.dataset.studentId,
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
                this.showToast("Failed to update marks.");
            }
        };
    }
}



// async viewClassSubmissions() {
//     const modal = document.createElement("div");
//     modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";
//     modal.innerHTML = `
//         <div class="bg-[#333333] rounded-lg mt-20 w-[600px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
//             <h2 class="text-2xl font-bold text-[#61dafb] mb-6 text-center">View Class Submissions</h2>

            

//             <label class="block mb-2 font-medium">Subject:</label>
//             <input type="text" id="subject" class="w-full mb-4 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />

//             <label class="block mb-2 font-medium">Class:</label>
//             <input type="text" id="classId" class="w-full mb-6 p-2 rounded bg-[#444] border border-gray-600 focus:outline-none" />

//             <button id="loadClassReportsBtn" class="w-full bg-[#61dafb] text-[#000] font-semibold py-2 rounded hover:bg-[#21a1f1]">Load Class Reports</button>

//             <button id="closeModalBtn" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//         </div>
//     `;
//     document.body.appendChild(modal);

//     modal.querySelector("#closeModalBtn").onclick = () => modal.remove();

//     modal.querySelector("#loadClassReportsBtn").onclick = async () => {
//         const college = this.user.institute;
//         const faculty = this.user.id;//document.getElementById("faculty").value.trim();
//         const subject = document.getElementById("subject").value.trim();
//         const classId = document.getElementById("classId").value.trim();

//         if (!college || !faculty || !subject || !classId) {
//             this.showToast("Please fill all fields.");
//             return;
//         }

//         try {
//             const res = await fetch(`${this.base_server}/get-reports?college=${college}&faculty=${faculty}&subject=${subject}&class=${classId}`);

//             const data = await res.json();
//             const reports = data.reports || [];

//             modal.remove(); // Close input modal
//             this.showClassReportViewerModal(subject, reports, college, faculty, classId); // Open viewer
//         } catch (err) {
//             this.showToast("Failed to load class reports.");
//             console.error(err);
//         }
//     };
// }
// showClassReportViewerModal(subject, reports, college, faculty, classId) {
//     const modal = document.createElement("div");
//     modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

//     const reportCards = reports.map((r) => `
//         <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700 flex justify-between items-center">
//             <div>
//                 <p class="text-[#61dafb] font-semibold">${r.pdf_name || 'Unnamed PDF'}</p>
//                 <p class="text-gray-400 text-sm">
//                     Student: ${r.student_name || 'Unknown'} 
//                     <span class="text-gray-500 text-xs">(ID: ${r.student_id || 'N/A'})</span>
//                 </p>
//             </div>
//             <div class="flex items-center gap-2">
//                 <button 
//                     class="download-btn bg-[#61dafb] text-black px-3 py-1 rounded hover:bg-[#21a1f1] font-semibold" 
//                     data-path="${r.storage_path}">
//                     Download
//                 </button>
//                 <input 
//                     type="number" 
//                     min="0" max="100" 
//                     class="marks-input w-16 p-1 rounded bg-[#444] border border-gray-600 text-white text-center" 
//                     data-student-id="${r.student_id}" 
//                     placeholder="Marks" 
//                     value="${r.marks || ''}"
//                 />
//             </div>
//         </div>
//     `).join("");

//     modal.innerHTML = `
//         <div class="bg-[#333333] rounded-lg mt-16 w-[650px] max-h-[90vh] overflow-y-auto p-6 text-white shadow-xl border border-gray-700 relative">
//             <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Class Submissions for ${subject}-${classId}</h2>

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

//     // Update marks handler
//     const updateBtn = modal.querySelector("#updateMarksBtn");
//     if (updateBtn) {
//         updateBtn.onclick = async () => {
//             const marksData = [];
//             modal.querySelectorAll(".marks-input").forEach(input => {
//                 marksData.push({
//                     student_id: input.dataset.studentId, // ✅ use ID now
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
//                 this.showToast("Failed to update marks.");
//             }
//         };
//     }
// }



// showClassReportViewerModal(subject, reports, college, faculty, classId) {
//     const modal = document.createElement("div");
//     modal.className = "fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50";

//     const reportCards = reports.map((r, i) => `
//         <div class="bg-[#2a2a2a] rounded p-4 mb-4 border border-gray-700">
//             <div class="flex justify-between items-center">
//                 <div>
//                     <p class="text-[#61dafb] font-semibold">${r.pdf_name || 'Unnamed PDF'}</p>
//                     <p class="text-gray-400 text-sm">Student: ${r.student_name || 'Unknown'}</p>
//                 </div>
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
//             <h2 class="text-xl font-bold text-[#61dafb] mb-4 text-center">Class Submissions for ${subject}-${classId}</h2>

//             ${reports.length === 0 ? `<p>No reports found.</p>` : reportCards}

            
//             <button id="closeModalBtn2" class="absolute top-2 right-3 text-gray-400 hover:text-white text-xl">&times;</button>
//         </div>
//     `;
//     document.body.appendChild(modal);

//     modal.querySelector("#closeModalBtn2").onclick = () => modal.remove();

//     // Bind all download buttons
//     const downloadButtons = modal.querySelectorAll(".download-btn");
//     downloadButtons.forEach(btn => {
//         const path = btn.dataset.path;
//         btn.onclick = () => this.downloadReport(path);
//     });

//     // Optional merge for all class submissions
    
// }








async showPostQuestionModal() {
  let modal = document.getElementById("postQuestionModal");

  if (!modal) {
    const modalHTML = `
      <div id="postQuestionModal" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-50">
        <div class="bg-[#2d2d2d] p-6 rounded-lg shadow-lg w-96">
          <h2 class="text-lg font-bold text-[#61dafb] mb-4">Post a Question</h2>
          <label class="block text-sm text-white mb-1">Subject:</label>
          <input id="postSubjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">
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

  const cancelBtn = document.getElementById("cancelPostBtn");
  const submitBtn = document.getElementById("submitPostBtn");

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  submitBtn.onclick = async () => {
    const subject = document.getElementById("postSubjectInput").value.trim();
    const questionText = document.getElementById("postQuestionInput").value.trim();

    const faculty = this.user.name;
    const institute = this.user.institute;

    if (!subject || !questionText || !faculty || !institute) {
      this.showToast("❌Please fill all fields before submitting.");
      return;
    }

    try {
      const response = await fetch(`${this.base_server}/post_question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, faculty, question: questionText, institute })
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
          <input id="uploadFacultyInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">

          <label class="block text-sm text-white mb-1">Subject:</label>
          <input id="uploadSubjectInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">

          <label class="block text-sm text-white mb-1">Class:</label>
          <input id="uploadClassInput" type="text" class="w-full p-2 rounded bg-[#1e1e1e] text-white mb-4">

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

  document.getElementById("cancelUploadBtn").onclick = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  document.getElementById("submitUploadBtn").onclick = async () => {
    const faculty = document.getElementById("uploadFacultyInput").value.trim();
    const subject = document.getElementById("uploadSubjectInput").value.trim();
    const classId = document.getElementById("uploadClassInput").value.trim();

    const studentId = this.user.id; // ✅ New: use stored student ID
    const studentName = this.user.name ||'default';
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
      formData.append("student_id", studentId); // ✅ Pass student ID to backend

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
    const app = document.getElementById('app');
    app.classList.remove('hidden');
    document.getElementById('editorLayout').classList.add('hidden');

    app.innerHTML = `
      <div class="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950 px-4">
        <h1 class="text-6xl font-extrabold mb-14 text-white">Welcome to <span class="text-teal-400">Kodin</span></h1>
        <div class="flex flex-col space-y-6 w-full max-w-xs">
          ${this.button('Student', 'student')}
          ${this.button('Teacher', 'teacher')}
          ${this.button('Proceed as Guest', 'guest')}
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


  showLoginForm(role) {
    this.toggleEditorActions(false);
    const app = document.getElementById('app');
    this.user.role=role;

    const isStudent = this.user.role.toLowerCase() === "student";
    const title = `${this.user.role} Login`;

    app.innerHTML = `
      <div class="h-full w-full flex items-center justify-center px-4 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950">
        <div class="bg-gray-800/80 p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-700">
          <h2 class="text-4xl font-extrabold mb-8 text-white text-center">${title}</h2>
          <form id="loginForm" class="space-y-6">
            ${this.inputField('Institute', 'text')}
            ${isStudent 
              ? this.inputField('Roll Number', 'text') 
              : this.inputField('Name', 'text')}
            ${this.inputField('Password', 'password')}
            <button type="submit"
              class="w-full py-4 px-6 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-lg font-bold text-white">
              Login
            </button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('loginForm').onsubmit = e => {
      e.preventDefault();

      const institute = document.querySelector('#loginForm input[placeholder="Institute"]').value.trim();
      const password = document.querySelector('#loginForm input[placeholder="Password"]').value.trim();
      let id;

      if (isStudent) {
        id = document.querySelector('#loginForm input[placeholder="Roll Number"]').value.trim();
      } else {
        id = document.querySelector('#loginForm input[placeholder="Name"]').value.trim();
      }

      // Save user info
      this.user.id = id;
      this.user.institute = institute;

      // Validation or authentication logic can go here

      this.showEditor();
    };
}


  // showLoginForm(role) {
  //   this.toggleEditorActions(false);
  //   const app = document.getElementById('app');
  //   app.innerHTML = `
  //     <div class="h-full w-full flex items-center justify-center px-4 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950">
  //       <div class="bg-gray-800/80 p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-700">
  //         <h2 class="text-4xl font-extrabold mb-8 text-white text-center">${role} Login</h2>
  //         <form id="loginForm" class="space-y-6">
  //           ${this.inputField('Institute', 'text')}
  //           ${this.inputField('Roll Number', 'text')}
  //           ${this.inputField('Password', 'password')}
  //           <button type="submit"
  //             class="w-full py-4 px-6 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-teal-500 hover:to-teal-600 text-lg font-bold text-white">
  //             Login
  //           </button>
  //         </form>
  //       </div>
  //     </div>
  //   `;
  //   document.getElementById('loginForm').onsubmit = e => {
  //     e.preventDefault();
  //     const roll_number = document.querySelector('#loginForm input[placeholder="Roll Number"]').value.trim();
  //     const institute = document.querySelector('#loginForm input[placeholder="Institute"]').value.trim();
  //     const password = document.querySelector('#loginForm input[placeholder="Password"]').value.trim();

  //     // Optional: Add authentication logic here if needed.

  //     // Save user info
  //     this.user.id = roll_number;
  //     this.user.role = role;  // already passed as parameter
  //     this.user.institute = institute;

      

  //     // validation
  //     this.showEditor();
  //   };
  // }

  inputField(label, type) {
    return `
      <div>
        <label class="block text-sm mb-1 text-gray-200">${label}</label>
        <input type="${type}" placeholder="${label}" class="w-full p-3 rounded-lg bg-gray-700/60 border border-gray-600 text-white placeholder-gray-400">
      </div>
    `;
  }

  showEditor() {
    this.toggleEditorActions(true);
    document.getElementById('app').classList.add('hidden');
    document.getElementById('editorLayout').classList.remove('hidden');

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
      // view my submissiion button only for student guest
    const vmBtn = document.getElementById('viewMySubmissionsBtn');
    if (this.user.role != 'teacher') {
      vmBtn.classList.remove('hidden');
      vmBtn.onclick = () => {
        this.viewMySubmissions();
      };
    };
    
    const vcBtn = document.getElementById('viewClassSubmissionsBtn');
    if (this.user.role === 'teacher') {
      vcBtn.classList.remove('hidden');
      vcBtn.onclick = () => {
        this.viewClassSubmissions();
      };
    };

    this.toggleCopilotPane();

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
  const fileListContainer = document.createElement('ul');
  fileListContainer.id = 'fileList';
  fileListContainer.className = 'space-y-2';

  sidebar.innerHTML = `<h3 class="text-lg font-bold mb-4">Files</h3>`;
  sidebar.appendChild(fileListContainer);

  this.sidebarFiles.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded';
    item.innerText = file.name;
    item.dataset.path = file.path;

    item.onclick = async () => {
      if (!this.editorInstance) this.showEditor();

      sidebar.querySelectorAll('li').forEach(li => li.classList.remove('bg-gray-700'));
      item.classList.add('bg-gray-700');

      let content = `// Opened ${file.name}`;
      try {
        content = await window.electronAPI.readFile(file.path);
      } catch (err) {
        console.error('File read error:', err);
      }

      this.openTab(file.name, content, file.path);
    };
    this.enableInlineRename(item, file);

    fileListContainer.appendChild(item);
  });
}




  setupTabArea() {
  const tabBar = document.getElementById('tabBar');
  tabBar.innerHTML = ''; // Clear previous tabs, if needed
}

openTab(name, content, fullPath = null, tempPath = null) {
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

  tabBtn.onclick = (e) => {
    const i = parseInt(tabBtn.dataset.index);
    if (e.target.classList.contains('tab-close')) {
      this.closeTab(i);
    } else {
      this.switchTab(i);
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

  // Highlight the active tab and add .active class
  const tabBar = document.getElementById('tabBar');
  const activeBtn = tabBar.children[index];
  if (activeBtn) {
    activeBtn.classList.add('bg-[#373737]', 'text-teal-400', 'active');
  }
}


loadFolderToSidebar(tree) {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `<h3 class="text-lg font-bold mb-4">Explorer</h3>`;

  const iconBase = 'text-xs font-mono px-1 border border-gray-500 rounded hover:border-teal-400 cursor-pointer';
  this.sidebarFiles = [];

  const renderTree = (items, parent, folderPath) => {
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

          labelSpan.onclick = () => {
            childrenContainer.classList.toggle('hidden');
          };

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

          requestIdleCallback(() => {
            renderTree(item.children, childrenContainer, item.path);
          });
        } else if (item.type === 'file') {
          const fileItem = document.createElement('div');
          fileItem.className = 'cursor-pointer hover:text-teal-400 ml-1 font-normal text-sm';
          fileItem.innerText = `📄 ${item.name}`;

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
              if (!this.sidebarFiles.some(f => f.path === item.path)) {
                this.sidebarFiles.push({ name: item.name, path: item.path, type: 'file' });
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

  rootLabel.onclick = () => {
    rootChildren.classList.toggle('hidden');
  };

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

  if (tree.children) {
    renderTree(tree.children, rootChildren, this.currentFolderPath);
  } else {
    renderTree(tree, rootChildren, this.currentFolderPath);
  }
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
    alert('No file is open.');
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
    if (!success) alert('Failed to save file.');
  }
}



// enableInlineRename(fileItem, file) {
//   fileItem.ondblclick = () => {
//     const input = document.createElement('input');
//     input.type = 'text';
//     input.value = file.name;
//     input.className = 'bg-gray-800 text-white p-1 rounded w-full';

//     input.onblur = () => {
//       const newName = input.value.trim();
//       if (newName && newName !== file.name) {
//         file.name = newName;
//         fileItem.textContent = newName;

//         // Update tab name if it’s unsaved
//         const tabIndex = this.tabs.findIndex(tab => tab.filePath === file.path || (!file.path && tab.name === file.name));
//         if (tabIndex !== -1) {
//           const tabBtn = document.querySelectorAll('.tab-item')[tabIndex];
//           if (tabBtn) tabBtn.innerText = newName;
//           this.tabs[tabIndex].name = newName;
//         }
//       } else {
//         fileItem.textContent = file.name;
//       }
//     };

//     fileItem.innerHTML = '';
//     fileItem.appendChild(input);
//     input.focus();
//   };
// }

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

refreshSidebar() {
  const fileListContainer = document.getElementById('fileList');
  if (!fileListContainer) return;

  requestIdleCallback(() => {
    fileListContainer.innerHTML = '';

    this.sidebarFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.textContent = file.name;
      item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded';
      item.dataset.index = index;
      item.dataset.path = file.path || file.tempPath || '';

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

        document.querySelectorAll('#fileList div').forEach(el => el.classList.remove('bg-gray-700'));
        item.classList.add('bg-gray-700');
      };

      this.enableInlineRename(item, file);
      fileListContainer.appendChild(item);
    });
  });
}




async runCode() {
  // const outputArea = document.getElementById('output');
  // if (!outputArea) return;

  // const currentTab = window.editorState?.tabs?.[window.editorState.activeTabIndex];
  // if (!currentTab || !window.editorInstance) {
  //   outputArea.innerText = "⚠️ No active file to run.";
  //   return;
  // }

    const outputArea = document.getElementById('output');
    if (!outputArea) return;

    const currentTab = this.tabs[this.activeTabIndex];
    if (!currentTab || !this.editorInstance) 
    {
      outputArea.innerText = "⚠️ No active file to run.";
      return;
    }

  const fileName = currentTab.name || '';
  const extension = (fileName.split('.').pop() || '').toLowerCase();

  if (!currentTab.filePath) {
    alert("⚠️ Please save the file before running.");
    return;
  }

  // Save before run (assume your app exposes this)
  // if (typeof window.saveCurrentFile === 'function') await window.saveCurrentFile();
  this.saveCurrentFile();
  if (!this.openedFilePaths.includes(currentTab.filePath)) {
    this.openedFilePaths.push(currentTab.filePath);

    console.log("openedFilePaths wihile running:",this.openedFilePaths);
  }

  // Clear previous output
  outputArea.innerText = '';

  // Decide runner type and arguments (we prefer passing executable + args)
  let execName = null;
  let args = [];
  let cleanup = null; // optional: path to delete after run

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

    case 'c':
      // compile then run: produce temp exe next to file
      execName = appTools.gcc || 'gcc';
      {

        const out = currentTab.filePath.replace(/\.c$/i, ext);
        args = [currentTab.filePath, '-o', out];
        cleanup = out; // we'll run it after compile
      }
      break;

    case 'cpp':
    case 'cc':
      execName = appTools.gpp || appTools.gcc || 'g++';
      {
        const out = currentTab.filePath.replace(/\.(cpp|cc|cxx|c\+\+)$/i, ext);
        args = [currentTab.filePath, '-o', out];
        cleanup = out;
      }
      break;

    case 'java':
      // For Java we compile .java and then run `java` with classname
      execName = appTools.javac || 'javac';
      args = [currentTab.filePath];
      break;

    case 'sql':
      // Run .sql using bundled sqlite3 and a temporary DB file
      execName = appTools.sqlite3 || 'sqlite3';
      {
        const tmpDb = currentTab.filePath + '.db';
        args = [tmpDb, '.read', currentTab.filePath];
        cleanup = tmpDb;
      }
      break;

    default:
      outputArea.innerText = `❌ Unsupported file type: .${extension}`;
      return;
  }

  // Utility to append to output UI
  const append = (txt) => { outputArea.innerText += txt; outputArea.scrollTop = outputArea.scrollHeight; };

  try {
    // If we compiled (C/C++/Java) we need a 2-step flow
    if (['c', 'cpp', 'cc'].includes(extension)) {
      append('🔧 Compiling...\n');
      const compileResult = await window.electronAPI.runCommandStream(execName, args);
      if (compileResult.code !== 0) {
        append('\n❌ Compile error:\n' + compileResult.stderr);
        return;
      }
      append('\n✅ Compile finished. Running...\n');

      // run produced binary
      const outExec = cleanup; // path to compiled exe
      const runResult = await window.electronAPI.runCommandStream(outExec, []);
      append('\n' + (runResult.stdout || '') + (runResult.stderr || ''));
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

      // find classname (simple heuristic: file name without extension)
      const classname = fileName.replace(/\.java$/i, '');
      const javaRunner = appTools.java || 'java';
      const runResult = await window.electronAPI.runCommandStream(javaRunner, ['-cp', require('path').dirname(currentTab.filePath), classname]);
      append('\n' + (runResult.stdout || '') + (runResult.stderr || ''));
      return;
    }

    // default single-step execution (py, js, sql)
    append('▶ Running...\n');
    const result = await window.electronAPI.runCommandStream(execName, args);
    append((result.stdout || '') + (result.stderr || ''));

    // optional cleanup
    if (cleanup && process.platform !== 'win32') {
      try { /* delete file if you want - left to implement */ } catch(e){}
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

  setupOutput() {
    document.getElementById('output').innerText = '// Output...';
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

  if (!copilotGutter) {
    copilotGutter = document.createElement("div");
    copilotGutter.id = "copilotGutter";
    copilotGutter.className = "gutter gutter-horizontal";
    mainPane.parentElement.insertBefore(copilotGutter, copilotPane);
  }

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
    copilotGutter.classList.remove("hidden");
    mainPane.style.width = "";

    this.copilotSplit = Split(["#mainPane", "#copilotPane"], {
      sizes: [75, 25],
      minSize: [300, 200],
      gutterSize: 4,
      gutter: () => copilotGutter,
    });
  }
}


clearCopilotContent() {
  const content = document.getElementById('copilotContent');
  if (content) content.innerHTML = '';
}

// appendCopilotMessage(text, sender) {
//   const content = document.getElementById('copilotContent');
//   const msg = document.createElement('div');
//   msg.textContent = text;
//   msg.className = sender === 'user'
//     ? 'bg-gray-800 p-2 rounded text-blue-300'
//     : 'bg-gray-700 p-2 rounded text-green-300';
//   content.appendChild(msg);
//   content.scrollTop = content.scrollHeight;
// }

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
  // Sidebar and Main
  Split(['#sidebar', '#mainWithCopilot'], {
    sizes: [20, 80],
    minSize: 150,
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
    minSize: 100,
    gutterSize: 4,
  });

  // Editor and Copilot (initially only when Copilot is visible)
  this.copilotSplit = null;
}

}


document.addEventListener('DOMContentLoaded', () => new CodeEditorApp());
console.log('Available APIs:', window.electronAPI);


