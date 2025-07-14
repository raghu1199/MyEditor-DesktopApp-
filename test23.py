import customtkinter as ctk
import tkinter as tk
from tkinter import ttk, filedialog
from PIL import Image, ImageTk
import os
import keyword
import re
import sys
import tempfile
import subprocess
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from datetime import datetime

print("This Python:", sys.executable)


class CodeEditorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Python Code Editor")
        self.bg_main = "#f5f5f5"
        self.bg_sidebar = "#e0e0e0"
        self.bg_output = "#ffffff"
        self.fg_text = "#000000"
        self.font_code = ("Consolas", 12)

        root.configure(bg=self.bg_main)
        root.bind('<Control-s>', lambda event: self.save_file())
        root.bind('<Command-s>', lambda event: self.save_file())

        # Top bar
        top = ctk.CTkFrame(root)
        top.pack(fill='x')

        ctk.CTkButton(top, text="Login", command=self.login).pack(side='left', padx=5, pady=5)
        ctk.CTkButton(top, text="Logout", command=self.logout).pack(side='left', padx=5, pady=5)
        ctk.CTkButton(top, text="New", command=self.new_file).pack(side='left', padx=5)
        ctk.CTkButton(top, text="Open", command=self.open_file).pack(side='left', padx=5)
        ctk.CTkButton(top, text="Save", command=self.save_file).pack(side='left', padx=5)
        ctk.CTkButton(top, text="Open Folder", command=self.open_folder).pack(side='left', padx=5)
        ctk.CTkButton(top, text="Run ▶", command=self.run_code).pack(side='left', padx=5)
        ctk.CTkButton(top, text="Export Report", command=self.export_report).pack(side='left', padx=5)

        # Main area
        main = ctk.CTkFrame(root)
        main.pack(fill='both', expand=True)

        # Folder tree
        self.tree = ttk.Treeview(main, show='tree')
        self.tree.pack(side='left', fill='y')
        self.tree.bind("<Double-1>", self.open_selected_file)

        self.folder_icon = ImageTk.PhotoImage(Image.open("folder.png").resize((16, 16)))
        self.file_icon = ImageTk.PhotoImage(Image.open("file.png").resize((16, 16)))
        self.icon_refs = [self.folder_icon, self.file_icon]

        # Notebook
        self.notebook = ttk.Notebook(main)
        self.notebook.pack(side='left', fill='both', expand=True)

        # Output area
        self.output = tk.Text(root, height=6, bg=self.bg_output, fg=self.fg_text, font=self.font_code)
        self.output.pack(fill='x')

        self.open_tabs = {}
        self.current_folder = None

        # Initialize user as guest
        self.current_user = "Anonymous"
        self.user_actions = []

    def login(self):
        popup = tk.Toplevel(self.root)
        popup.title("Login")
        popup.geometry("+%d+%d" % (self.root.winfo_rootx() + 150, self.root.winfo_rooty() + 50))
        popup.configure(bg="#f5f5f5")

        tk.Label(popup, text="Enter your username:", bg="#f5f5f5").pack(padx=10, pady=5)
        entry = tk.Entry(popup, width=30)
        entry.pack(padx=10, pady=5)
        entry.focus_set()

        def submit():
            self.current_user = entry.get().strip() or "Anonymous"
            self.output.insert(tk.END, f"[INFO] Logged in as: {self.current_user}\n")
            self.user_actions = []
            popup.destroy()

        tk.Button(popup, text="Login", command=submit).pack(pady=5)
        popup.transient(self.root)
        popup.grab_set()
        self.root.wait_window(popup)

    def logout(self):
        self.current_user = "Anonymous"
        self.user_actions = []
        self.output.insert(tk.END, "[INFO] Logged out. Back to anonymous mode.\n")

    def new_file(self):
        popup = tk.Toplevel(self.root)
        popup.title("New File Name")
        popup.configure(bg="#f5f5f5")
        popup.geometry("+%d+%d" % (self.root.winfo_rootx() + 100, self.root.winfo_rooty() + 50))

        tk.Label(popup, text="Enter file name:", bg="#f5f5f5").pack(padx=10, pady=5)
        entry = tk.Entry(popup, width=30)
        entry.insert(0, "Untitled.py")
        entry.pack(padx=10, pady=5)
        entry.focus_set()

        def create():
            name = entry.get().strip() or "Untitled.py"
            if not name.endswith(".py"):
                name += ".py"

            folder = self.current_folder or os.getcwd()
            file_path = os.path.join(folder, name)

            if os.path.exists(file_path):
                self.output.insert(tk.END, f"[DEBUG] File {file_path} already exists!\n")
            else:
                with open(file_path, 'w') as f:
                    f.write("")

            self.create_tab(name, "", file_path)

            self.user_actions.append({
                'action': 'create',
                'file': file_path,
                'content': ""
            })

            popup.destroy()

        tk.Button(popup, text="Create", command=create).pack(pady=5)
        popup.transient(self.root)
        popup.grab_set()
        self.root.wait_window(popup)

    def open_folder(self):
        folder = filedialog.askdirectory()
        if folder:
            self.current_folder = folder
            self.tree.delete(*self.tree.get_children())
            node = self.tree.insert('', 'end', text=os.path.basename(folder), image=self.folder_icon, open=True)
            self.populate_tree(node, folder)

    def populate_tree(self, parent, path):
        for f in os.listdir(path):
            full = os.path.join(path, f)
            if os.path.isfile(full) and f.endswith('.py'):
                self.tree.insert(parent, 'end', text=f, image=self.file_icon, values=[full])

    def open_selected_file(self, event):
        selected = self.tree.focus()
        path = self.tree.item(selected, 'values')
        if path:
            self.load_file(path[0])

    def open_file(self):
        path = filedialog.askopenfilename(filetypes=[("Python Files", "*.py")])
        if path:
            self.load_file(path)

    def load_file(self, path):
        with open(path) as f:
            content = f.read()
        self.create_tab(os.path.basename(path), content, path)

    def create_tab(self, name, content, path=None):
        frame = ctk.CTkFrame(self.notebook)
        line_numbers = tk.Text(
            frame,
            width=4,
            wrap="none",
            bg="#e0e0e0",
            fg="#555555",
            font=self.font_code,
            state='disabled'
        )
        line_numbers.pack(side='left', fill='y')

        text = tk.Text(
            frame,
            wrap="none",
            bg=self.bg_output,
            fg=self.fg_text,
            insertbackground=self.fg_text,
            font=self.font_code,
            undo=True
        )
        text.insert('1.0', content)
        text.pack(side='left', fill='both', expand=True)

        text.bind('<KeyRelease>', lambda e: self.update_line_numbers(text, line_numbers))
        text.bind('<KeyRelease>', lambda e: self.highlight_syntax(text))
        text.bind('<Tab>', lambda e: self.insert_tab(text))
        text.bind('<Return>', lambda e: self.handle_return(text))
        text.bind('<Key>', lambda e: self.handle_pairs(text, e))

        self.notebook.add(frame, text=name)
        self.open_tabs[frame] = {'text': text, 'lines': line_numbers, 'path': path}
        self.notebook.select(frame)

        self.update_line_numbers(text, line_numbers)
        self.highlight_syntax(text)

    def save_file(self):
        tab = self.get_current_tab()
        if not tab:
            return

        if not tab['path']:
            path = filedialog.asksaveasfilename(defaultextension=".py")
            if not path:
                return
            tab['path'] = path
            self.notebook.tab(self.notebook.select(), text=os.path.basename(path))

        content = tab['text'].get('1.0', tk.END)

        with open(tab['path'], 'w') as f:
            f.write(content)

        self.user_actions.append({
            'action': 'save',
            'file': tab['path'],
            'content': content
        })

    def get_current_tab(self):
        selected_tab_id = self.notebook.select()
        for frame, tab in self.open_tabs.items():
            if str(frame) == selected_tab_id:
                return tab
        return None

    def highlight_syntax(self, text):
        for tag in text.tag_names():
            text.tag_remove(tag, "1.0", tk.END)
        code = text.get("1.0", tk.END)
        for kw in keyword.kwlist:
            for m in re.finditer(r'\b' + kw + r'\b', code):
                text.tag_add("kw", f"1.0+{m.start()}c", f"1.0+{m.end()}c")
        text.tag_config("kw", foreground="#0000ff")
        for m in re.finditer(r'(\".*?\"|\'.*?\')', code, re.DOTALL):
            text.tag_add("str", f"1.0+{m.start()}c", f"1.0+{m.end()}c")
        text.tag_config("str", foreground="#a31515")
        for m in re.finditer(r'#.*', code):
            text.tag_add("com", f"1.0+{m.start()}c", f"1.0+{m.end()}c")
        text.tag_config("com", foreground="#008000")

    def insert_tab(self, text):
        text.insert(tk.INSERT, "    ")
        return "break"

    def handle_return(self, text):
        pos = text.index(tk.INSERT)
        line = text.get(f"{pos} linestart", pos)
        indent = re.match(r'\s*', line).group(0)
        if line.strip().endswith(':'):
            indent += "    "
        text.insert(pos, '\n' + indent)
        return "break"

    def handle_pairs(self, text, event):
        pairs = {'(': ')', '[': ']', '{': '}', '"': '"', "'": "'"}
        if event.char in pairs:
            text.insert(tk.INSERT, pairs[event.char])
            text.mark_set(tk.INSERT, f"{text.index(tk.INSERT)} -1c")

    def update_line_numbers(self, text, line_numbers):
        lines = int(text.index('end-1c').split('.')[0])
        content = "\n".join(f"{i}" for i in range(1, lines + 1))
        line_numbers.config(state='normal')
        line_numbers.delete("1.0", tk.END)
        line_numbers.insert("1.0", content)
        line_numbers.config(state='disabled')

    def run_code(self):
        outputs = ""
        self.output.delete("1.0", tk.END)

        tab = self.get_current_tab()
        if not tab:
            self.output.insert(tk.END, "[DEBUG] No tab is active!\n")
            return

        code = tab['text'].get('1.0', tk.END)
        if tab['path']:
            with open(tab['path'], 'w', encoding='utf-8') as f:
                f.write(code)
            file_to_run = tab['path']
        else:
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w", encoding="utf-8")
            tmp.write(code)
            tmp.close()
            file_to_run = tmp.name

        try:
            result = subprocess.run(
                [sys.executable, file_to_run],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            outputs += result.stdout + result.stderr
            if not result.stdout and not result.stderr:
                outputs += "\n[DEBUG] No output"
            self.output.insert(tk.END, outputs)
        except Exception as e:
            outputs += f"[DEBUG] Exception occurred:\n{str(e)}\n"
            self.output.insert(tk.END, outputs)

    def export_report(self):
        if not self.user_actions:
            self.output.insert(tk.END, "[INFO] No session actions to export.\n")
            return

        filename = f"{self.current_user}_session_report.pdf"
        c = canvas.Canvas(filename, pagesize=letter)
        width, height = letter
        c.setFont("Helvetica", 12)
        c.drawString(50, height - 50, f"User: {self.current_user}")
        c.drawString(50, height - 70, f"Session Report - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        y = height - 100
        for i, action in enumerate(self.user_actions, 1):
            c.drawString(50, y, f"{i}. {action['action'].capitalize()} - {action['file']}")
            y -= 20

            lines = action['content'].splitlines()
            for line in lines:
                if y < 50:
                    c.showPage()
                    c.setFont("Helvetica", 12)
                    y = height - 50
                c.drawString(70, y, line)
                y -= 15

            y -= 10

        c.save()
        self.output.insert(tk.END, f"[INFO] PDF saved: {filename}\n")


if __name__ == "__main__":
    root = ctk.CTk()
    CodeEditorApp(root)
    root.mainloop()
