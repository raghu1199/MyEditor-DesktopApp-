import * as monaco from 'monaco-editor';
import Split from 'split.js';

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

    this.user = {
    name: '',
    role: '',
    institute: ''
  };

    this.loadFolderToSidebar = this.loadFolderToSidebar.bind(this);

    this.showWelcomePage();
    
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
        <button id="uploadBtn" class="hover:text-teal-400">Upload</button>
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

  fileBtn.onclick = (e) => {
    e.stopPropagation();
    fileMenu.classList.toggle('hidden');
    newFileTypeMenu.classList.add('hidden');
  };

  document.body.addEventListener('click', () => {
    fileMenu.classList.add('hidden');
    newFileTypeMenu.classList.add('hidden');
  });

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

        //track files
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
      this.currentFolderPath=folder.folderPath
      console.log(this.currentFolderPath)
      if (!folder.canceled) {
        if (!this.editorInstance) this.showEditor();
        this.loadFolderToSidebar(folder.tree);
      }
    } else if (action === 'saveFile') {
      this.saveCurrentFile();
    }
  }); 

  newFileTypeMenu.addEventListener('click', async (e) => {
    const ext = e.target.dataset.type;
    if (!ext) return;
    const untitledCount = this.tabs.filter(t => t.name.startsWith('untitled')).length;
    const newName = `untitled-${untitledCount + 1}.${ext}`;

    let filePath;
    if (this.currentFolderPath) {
    // Create the new file inside opened folder
    filePath = await window.electronAPI.joinPath(this.currentFolderPath, newName);
    await window.electronAPI.saveFile(filePath, '');  // ✅ actually save it on disk

    // Reload sidebar with refreshed folder tree
    const refreshed = await window.electronAPI.getFolderTree(this.currentFolderPath);
    this.loadFolderToSidebar(refreshed);
  } else {
    const result = await window.electronAPI.saveTempFile(newName);
    if (result.canceled) return;
    filePath = result.filePath;
  }

    this.openTab(newName, '', filePath);
    this.sidebarFiles.push({ name: newName, path: filePath, type: 'file', isUnsaved: true });

    // ✅ Track the new file
      if (!this.openedFilePaths.includes(filePath)) {
        this.openedFilePaths.push(filePath);
      }


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
};



  window.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      this.saveCurrentFile();
    }
  });
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
        <h1 class="text-6xl font-extrabold mb-14 text-white">Welcome to <span class="text-teal-400">CodeX</span></h1>
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
    app.innerHTML = `
      <div class="h-full w-full flex items-center justify-center px-4 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-950">
        <div class="bg-gray-800/80 p-10 rounded-3xl shadow-2xl w-full max-w-md border border-gray-700">
          <h2 class="text-4xl font-extrabold mb-8 text-white text-center">${role} Login</h2>
          <form id="loginForm" class="space-y-6">
            ${this.inputField('Institute', 'text')}
            ${this.inputField('Name', 'text')}
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
      const name = document.querySelector('#loginForm input[placeholder="Name"]').value.trim();
      const institute = document.querySelector('#loginForm input[placeholder="Institute"]').value.trim();
      const password = document.querySelector('#loginForm input[placeholder="Password"]').value.trim();

      // Optional: Add authentication logic here if needed.

      // Save user info
      this.user.name = name;
      this.user.role = role;  // already passed as parameter
      this.user.institute = institute;

      this.showEditor();
    };
  }

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


    

  }

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

  const container = document.createElement('ul');
  container.className = 'space-y-1 text-sm';
  this.sidebarFiles = []; // Reset tracked sidebar files

  const renderTree = (items, parent) => {
    items.forEach(item => {
      const el = document.createElement('li');
      el.className = 'ml-2';

      if (item.type === 'folder') {
        const folderHeader = document.createElement('div');
        folderHeader.className = 'cursor-pointer font-bold hover:text-teal-400';
        folderHeader.innerText = item.name;

        const childrenContainer = document.createElement('ul');
        childrenContainer.className = 'ml-4 space-y-1 hidden';

        folderHeader.onclick = () => {
          childrenContainer.classList.toggle('hidden');
        };

        el.appendChild(folderHeader);
        el.appendChild(childrenContainer);
        renderTree(item.children, childrenContainer);

      } else if (item.type === 'file') {
        const fileItem = document.createElement('div');
        fileItem.className = 'cursor-pointer hover:text-teal-400';
        fileItem.innerText = item.name;

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
              this.sidebarFiles.push({
                name: item.name,
                path: item.path,
                type: 'file'
              });
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
  };

  renderTree(tree, container);  // ⬅️ Use the new rendering helper
  sidebar.appendChild(container);
}




async saveCurrentFile() {
  const activeTab = this.tabs[this.activeTabIndex];
  if (!activeTab) {
    alert('No file is open.');
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
    const input = document.createElement('input');
    input.type = 'text';
    input.value = file.name;
    input.className = 'bg-gray-800 text-white p-1 rounded w-full';

    input.onblur = async () => {
      const newName = input.value.trim();
      if (newName && newName !== file.name) {
       const oldPath = file.path;

          // ✅ Derive dirPath safely using string split
          const dirParts = oldPath.split(/[/\\]/); // cross-platform
          dirParts.pop(); // remove filename
          const dirPath = dirParts.join('/'); // normalize

          const newPath = await window.electronAPI.joinPath(dirPath, newName);

          const exists = await window.electronAPI.fileExists(newPath);
        if (exists) {
          alert('A file or folder with this name already exists.');
          fileItem.textContent = file.name;
          return;
        }

        // Try renaming on disk
        const success = await window.electronAPI.renameFileOrFolder(file.path, newPath);
        if (!success) {
          alert('Failed to rename file.');
          fileItem.textContent = file.name;
          return;
        }

        // Update in-memory state
        file.name = newName;
        file.path = newPath;
        fileItem.textContent = newName;

        // Update tab name and filePath
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
  };
}


refreshSidebar() {
  const fileListContainer = document.getElementById('fileList');
  if (!fileListContainer) return;

  fileListContainer.innerHTML = '';

  this.sidebarFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.textContent = file.name;
    item.className = 'cursor-pointer hover:bg-gray-700 px-2 py-1 rounded';
    item.dataset.index = index;
    item.dataset.path = file.path || file.tempPath || '';

    // Click to open or switch tab
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

      // Highlight selected file
      document.querySelectorAll('#fileList div').forEach(el => el.classList.remove('bg-gray-700'));
      item.classList.add('bg-gray-700');
    };

    // Double-click to rename
    this.enableInlineRename(item, file);

    fileListContainer.appendChild(item);
  });
}

async runCode() {
  
  const outputArea = document.getElementById('output');
  if (!outputArea) return;

  const currentTab = this.tabs[this.activeTabIndex];
  if (!currentTab || !this.editorInstance) 
  {
    outputArea.innerText = "⚠️ No active file to run.";
    return;
  }
      

  //  const currentTab = this.tabs?.[this.activeTab];
  // if (!currentTab || !currentTab.name) {
  //   outputArea.innerText = "⚠️ No active file to run.";
  //   return;
  // }
  

  const fileName = currentTab.name || '';
  const extension = fileName.split('.').pop();

  // Ensure file is saved before running
  if (!currentTab.filePath) {
    alert("⚠️ Please save the file before running.");
    return;
  }

  this.saveCurrentFile();
  if (!this.openedFilePaths.includes(currentTab.filePath)) {
  this.openedFilePaths.push(currentTab.filePath);
  console.log("openedFilePaths:",this.openedFilePaths);
}

  let command;
  outputArea.innerText="";

  if (extension === 'js') {
    command = `node "${currentTab.filePath}"`;
  } else if (extension === 'py') {
    command = `python "${currentTab.filePath}"`; // or use python3 depending on system
  } else {
    // this.showOutput(`❌ Unsupported file type: .${extension}`);
    outputArea.innerText = `❌ Unsupported file type: .${extension}`;
    return;
  }

  // Run the command via Electron main process
  window.electronAPI.runCommand(command)
    .then(output => {
      // this.showOutput(output || "✅ Finished with no output.");
      this.outputs=output || "✅ Finished ";
      
      outputArea.innerText=output || "✅ Finished "
      
    })
    .catch(error => {
      // this.showOutput(`❌ Runtime Error:\n${error}`);
      outputArea.innerText=`❌ Runtime Error:\n${error}`;
    });
}






  // Your other methods (openTab, switchTab...) go here








  detectLang(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.html')) return 'html';
    return 'plaintext';
  }

  setupEditor() {
    const editorContainer = document.getElementById('editor');
    this.editorInstance = monaco.editor.create(editorContainer, {
      value: '',
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true
    });
  }

  setupOutput() {
    document.getElementById('output').innerText = '// Output...';
  }

  setupSplit() {
    Split(['#sidebar', '#mainPane'], {
      sizes: [20, 80],
      minSize: 150,
      gutterSize: 4,
    });

    Split(['#editor', '#output'], {
      direction: 'vertical',
      sizes: [80, 20],
      minSize: 100,
      gutterSize: 4,
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new CodeEditorApp());
console.log('Available APIs:', window.electronAPI);


