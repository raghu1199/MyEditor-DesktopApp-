 Current Features — CustomTkinter Python Code Editor
🟢 1️⃣ User Account Management
Login:

Simple login prompt to enter a username.

Session actions are recorded per user.

Logout:

Switches back to anonymous mode.

Clears current session actions (new files, saves).

🟢 2️⃣ File Operations
New File:

Prompts for filename → creates a new .py file in the selected folder or current working directory.

Opens the file in a new tab.

Open File:

Opens an existing .py file.

Displays its content in a new tab.

Save File:

Saves the current tab’s code.

If new (untitled) → Save As dialog.

Tracks save actions for session PDF.

Open Folder:

Opens a folder → shows .py files in a folder tree on the left sidebar.

Double-click to open any file.

🟢 3️⃣ Code Editor
Tabbed Interface:

Each file opens in its own tab.

Line Numbers:

Shows line numbers that stay synced.

Syntax Highlighting:

Highlights Python keywords, strings, and comments.

Indentation Helper:

Auto-indent after :

Bracket/Quote Pairing:

Automatically inserts closing ), ], }, ', ".

Tab Key:

Inserts 4 spaces instead of tab character.

🟢 4️⃣ Run Python Code
Run ▶ Button:

Executes the active Python script.

Shows stdout and stderr in the output box.

Uses current Python interpreter.

🟢 5️⃣ Session Report
Export Report:

Generates a PDF report for the current user session.

Report includes:

Username & timestamp

A list of files created/saved during the session

Filename and the entire code content for each.

Saved as: username_session_report.pdf

🟢 6️⃣ UI/UX
Modern Look:

Uses customtkinter for modern themed buttons & frames.

Icons:

Folder and file icons in the tree view.

Keyboard Shortcut:

Ctrl+S or Cmd+S → saves the active file.

✅ Technical Highlights
Uses:

customtkinter for modern widgets.

tkinter for Text widgets and Treeview.

reportlab for PDF export.

PIL for icon images.

Cross-platform:

Runs on Windows, macOS, Linux.

Uses the same Python that runs the editor to execute scripts.

⚡ How it works
Everything happens locally — no cloud backend.

Session report helps students track what they did in a login.

Perfect for educational use where students log in, practice coding, run files, and submit the PDF as proof of work.

✅ What’s Next (Optional Improvements)
Here are some popular next steps if you want to evolve it:
1️⃣ Add a proper username/password system → e.g., SQLite or JSON file.
2️⃣ Add auto-save on code changes or at intervals.
3️⃣ Add theme switching: dark/light mode toggle.
4️⃣ Add advanced code linting (e.g., pylint integration).
5️⃣ Add integrated terminal to run scripts interactively.
6️⃣ Deploy as a .exe or .app for students to download.


test33
upload file by student on firebase
view submission by teacher

test 34
login/signup works perfect
view submission only visible to teachers 
paste is disabled in code area for student login

