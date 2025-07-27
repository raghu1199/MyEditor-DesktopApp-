import * as monaco from 'monaco-editor';
import Split from 'split.js';

class CodeEditorApp {
  constructor() {
    this.initTopbar();
    this.tabs = [];  // For multi-tab
    this.activeTabIndex = -1;
    this.untitledCounter = 1;
    this.sidebarFiles = [];

    this.loadFolderToSidebar = this.loadFolderToSidebar.bind(this);

    this.showWelcomePage();
    
  }

initTopbar() {
  const topbar = document.getElementById('topbar');
  topbar.innerHTML = `
    <div class="flex items-center justify-between bg-[#1e1e1e] text-gray-200 px-4 h-10 w-full border-b border-[#3c3c3c]">
      <div id="editorActions" class="relative flex space-x-4 hidden">
        <div class="relative">
          <button id="fileBtn" class="hover:text-teal-400">File</button>
          <div id="fileMenu" class="hidden absolute left-0 mt-1 w-40 bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-lg z-50">
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="newFile">New File</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="openFile">Open File</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="openFolder">Open Folder</div>
            <div class="px-4 py-2 hover:bg-[#3c3c3c] cursor-pointer" data-action="saveFile">Save</div>
          </div>
        </div>
        <button id="runBtn" class="hover:text-teal-400">Run</button>
        <button id="exportBtn" class="hover:text-teal-400">Export</button>
        <button id="uploadBtn" class="hover:text-teal-400">Upload</button>
        <button id="logoutBtn" class="hover:text-red-400">Logout</button>
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

  // Toggle File Menu
  const fileBtn = document.getElementById('fileBtn');
  const fileMenu = document.getElementById('fileMenu');

  fileBtn.onclick = (e) => {
    fileMenu.classList.toggle('hidden');
    e.stopPropagation(); // prevent immediate close
  };

  document.body.addEventListener('click', () => {
    if (!fileMenu.classList.contains('hidden')) {
      fileMenu.classList.add('hidden');
    }
  });

  fileMenu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === 'newFile') {

        const untitledCount = this.tabs.filter(t => t.name.startsWith('untitled')).length;
        const newName = `untitled-${untitledCount + 1}.js`;

        this.openTab(newName, '// New File');
        this.refreshSidebar();


    } else if (action === 'openFile') {
      
      const file = await window.electronAPI.openFile();
        if (!file.canceled) {
          const fileName = file.filePath.split(/[/\\]/).pop();
          this.openTab(fileName, file.content, file.filePath);

          // ✅ Add to sidebar if not already listed
          if (!this.sidebarFiles.find(f => f.path === file.filePath)) {
            this.sidebarFiles.push({
              name: fileName,
              path: file.filePath,
              type: 'file'
            });
            this.refreshSidebar();
          }

      }

    } else if (action === 'openFolder') {
      const folder = await window.electronAPI.openFolder();

      if (!folder.canceled) {
        if (!this.editorInstance) {
          this.showEditor(); // ✅ Lazy load editor if it's not ready
        }
        this.loadFolderToSidebar(folder.tree);  // expects a folder structure like { name, path, children: [...] }
      }
    } else if (action === 'saveFile') {
       
        this.saveCurrentFile();

    }

    fileMenu.classList.add('hidden');

    // ctr+s binding
    window.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
     this.saveCurrentFile();  // ✅ use `this.`
  }
});

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

    fileListContainer.appendChild(item);
  });
}




  setupTabArea() {
  const tabBar = document.getElementById('tabBar');
  tabBar.innerHTML = ''; // Clear previous tabs, if needed
}



  openTab(name, content, fullPath = null) {
  // Avoid reopening same file
  const existingIndex = this.tabs.findIndex(tab =>
    (fullPath && tab.filePath === fullPath) ||
    (!fullPath && !tab.filePath && tab.name === name)
  );
  if (existingIndex !== -1) {
    this.switchTab(existingIndex);
    return;
  }

  const uri = monaco.Uri.file(fullPath || `untitled-${Date.now()}-${name}`);
  const model = monaco.editor.getModel(uri) || monaco.editor.createModel(content, this.detectLang(name), uri);

  const tab = { name, model, filePath: fullPath };
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

closeTab(index) {
  if (index < 0 || index >= this.tabs.length) return;

  const tab = this.tabs[index];
  tab.model.dispose();
  this.tabs.splice(index, 1);

  // Remove tab button
  const tabBar = document.getElementById('tabBar');
  tabBar.removeChild(tabBar.children[index]);

  // Rebind tab indexes after removal
  [...tabBar.children].forEach((btn, i) => {
    btn.onclick = (e) => {
      if (e.target.classList.contains('tab-close')) {
        this.closeTab(i);
      } else {
        this.switchTab(i);
      }
    };
  });

  // Switch to previous tab or clear
  if (this.tabs.length > 0) {
    this.switchTab(index > 0 ? index - 1 : 0);
  } else {
    monaco.editor.setModel(null);
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

  const buildTree = (items, parent) => {
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
        buildTree(item.children, childrenContainer);

      } else {
        const fileItem = document.createElement('div');
        fileItem.className = 'cursor-pointer hover:text-teal-400';
        fileItem.innerText = item.name;

        fileItem.onclick = async () => {
          if (!this.editorInstance) this.showEditor();

          try {
            const content = await window.electronAPI.readFile(item.path);
            this.openTab(item.name, content, item.path);

            // ✅ Add to tracked sidebar list if not already there
            const alreadyListed = this.sidebarFiles.some(f => f.path === item.path);
            if (!alreadyListed) {
              this.sidebarFiles.push({
                name: item.name,
                path: item.path,
                type: 'file'
              });
               // To reflect it in "Open Files" sidebar (if you use both)
            }

          } catch (err) {
            console.error("Error reading file:", item.path, err);
          }
        };

        el.appendChild(fileItem);
      }

      parent.appendChild(el);
    });
  };

  buildTree(tree, container);
  sidebar.appendChild(container);
}


async saveCurrentFile() {
  const activeTab = this.tabs[this.activeTabIndex];

  if (!activeTab) {
    alert('No file is open.');
    return;
  }

  const content = this.editorInstance.getValue();

  // CASE 1: New file (no path)
  if (!activeTab.filePath) {
    const result = await window.electronAPI.saveAsFile(content);
    if (result?.filePath) {
      const newName = result.filePath.split(/[/\\]/).pop();

      // Update tab object
      activeTab.filePath = result.filePath;
      activeTab.name = newName;

      // Update tab UI name
      const tabBtn = document.querySelectorAll('.tab-item')[this.activeTabIndex];
      if (tabBtn) tabBtn.innerText = newName;

      // Add to sidebar if not already listed
      const alreadyExists = this.sidebarFiles.some(file => file.path === activeTab.filePath);
      if (!alreadyExists) {
        this.sidebarFiles.push({
          name: newName,
          path: result.filePath,
          type: 'file'
        });
      }

      this.refreshSidebar();
    } else {
      alert('Save canceled.');
    }

  } else {
    // CASE 2: Existing file — Save directly
    const success = await window.electronAPI.saveFile(activeTab.filePath, content);
    if (!success) alert('Failed to save file.');
  }
}




refreshSidebar() {
  const fileListContainer = document.getElementById('fileList');
  if (!fileListContainer) return;

  fileListContainer.innerHTML = '';

  this.sidebarFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.textContent = file.name;
    item.classList.add('sidebar-file');
    item.dataset.index = index;

    item.addEventListener('click', () => {
      // Find and switch to tab if already open
      const tabIndex = this.tabs.findIndex(t => t.filePath === file.path);
      if (tabIndex !== -1) {
        this.switchTab(tabIndex);
      } else {
        // Open from disk if not opened yet
        window.electronAPI.readFile(file.path).then(content => {
          this.openTab(file.name, content, file.path);
        });
      }
    });

    fileListContainer.appendChild(item);
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


