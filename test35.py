# 

    
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
import requests  # Make sure you have: pip install requests
import tkinter.messagebox as messagebox  
import webbrowser
from functools import partial

print("This Python:", sys.executable)


class CodeEditorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("CodeX")
        self.bg_main = "#f5f5f5"
        self.bg_output = "#ffffff"
        self.fg_text = "#000000"
        self.font_code = ("Consolas", 12)

        self.open_tabs = {}
        self.current_folder = None
        self.welcome_frame=None
        self.current_user = "Anonymous"
        self.current_user_role = "Anonymous"
        self.current_user_institute=None
        self.user_actions = []

        self.welcome_frame = None
        self.editor_frame = None

        self.show_welcome_page()

    def show_welcome_page(self):
        if self.welcome_frame:
            self.welcome_frame.destroy()

        self.welcome_frame = tk.Frame(self.root, bg="#282c34")
        self.welcome_frame.pack(fill='both', expand=True)

        title = tk.Label(
            self.welcome_frame,
            text="Welcome to CodeX",
            font=("Helvetica", 28, "bold"),
            fg="#61dafb",
            bg="#282c34"
        )
        title.pack(pady=50)

        btn_font = ("Helvetica", 16, "bold")

        # ✅ Add message label for feedback
        self.message_label = tk.Label(
            self.welcome_frame,
            text="",  # empty initially
            fg="#4caf50",
            bg="#282c34",
            font=("Helvetica", 12, "bold")
        )
        self.message_label.pack(pady=10)

        ctk.CTkButton(
            self.welcome_frame,
            text="Student",
            corner_radius=20,
            width=220,
            height=50,
            fg_color="#61dafb",
            text_color="#282c34",
            hover_color="#21a1f1",
            font=btn_font,
            command=lambda: self.show_login_form("Student")
        ).pack(pady=15)

        ctk.CTkButton(
            self.welcome_frame,
            text="Teacher",
            corner_radius=20,
            width=220,
            height=50,
            fg_color="#61dafb",
            text_color="#282c34",
            hover_color="#21a1f1",
            font=btn_font,
            command=lambda: self.show_login_form("Teacher")
        ).pack(pady=15)

        ctk.CTkButton(
            self.welcome_frame,
            text="Proceed as Guest",
            corner_radius=20,
            width=220,
            height=50,
            fg_color="#61dafb",
            text_color="#282c34",
            hover_color="#21a1f1",
            font=btn_font,
            command=self.proceed_as_guest
        ).pack(pady=15)

        # ✅ NEW: Sign Up button
        ctk.CTkButton(
            self.welcome_frame,
            text="Sign Up",
            corner_radius=20,
            width=220,
            height=50,
            fg_color="#21a1f1",
            text_color="#ffffff",
            hover_color="#1a8cd8",
            font=btn_font,
            command=self.show_signup_form
        ).pack(pady=15)
        


    def show_login_form(self, role):
        for widget in self.welcome_frame.winfo_children():
            widget.destroy()

        self.current_user_role = role    

        form_frame = tk.Frame(self.welcome_frame, bg="#282c34")
        form_frame.place(relx=0.5, rely=0.5, anchor='center')

        tk.Label(form_frame, text=f"{role} Login",
                font=("Helvetica", 20, "bold"),
                fg="#61dafb", bg="#282c34").pack(pady=10)

        tk.Label(form_frame, text="Institute:", fg="#ffffff",
                bg="#282c34", font=("Helvetica", 12)).pack(anchor="w")
        inst_entry = ctk.CTkEntry(form_frame, width=300, height=40, corner_radius=10)
        inst_entry.pack(pady=5)

        tk.Label(form_frame, text="Name:", fg="#ffffff",
                bg="#282c34", font=("Helvetica", 12)).pack(anchor="w")
        name_entry = ctk.CTkEntry(form_frame, width=300, height=40, corner_radius=10)
        name_entry.pack(pady=5)

        tk.Label(form_frame, text="Password:", fg="#ffffff",
                bg="#282c34", font=("Helvetica", 12)).pack(anchor="w")
        pwd_entry = ctk.CTkEntry(form_frame, width=300, height=40, corner_radius=10, show="*")
        pwd_entry.pack(pady=5)

        # Label to show error messages
        error_label = tk.Label(form_frame, text="", fg="#ff4c4c", bg="#282c34", font=("Helvetica", 11))
        error_label.pack(pady=5)

        def submit():
            institute = inst_entry.get().strip()
            name = name_entry.get().strip()
            password = pwd_entry.get().strip()

            if not all([institute, name, password]):
                error_label.config(text="Please fill in all fields.")
                return

            payload = {
                "name": name,
                "password": password,
                "role": role,
                "institute": institute
            }

            try:
                res = requests.post("http://localhost:5000/login", json=payload)
                if res.ok:
                    self.current_user = name
                    self.current_user_institute=institute
                    self.start_editor()
                else:
                    error = res.json().get("error", "Login failed")
                    error_label.config(text=error)
                    inst_entry.delete(0, 'end')
                    name_entry.delete(0, 'end')
                    pwd_entry.delete(0, 'end')
            except Exception as e:
                error_label.config(text=str(e))

        ctk.CTkButton(form_frame, text="Login",
                    corner_radius=20,
                    width=200,
                    height=40,
                    fg_color="#61dafb",
                    text_color="#282c34",
                    hover_color="#21a1f1",
                    font=("Helvetica", 14, "bold"),
                    command=submit).pack(pady=15)

    def show_signup_form(self):

        for widget in self.welcome_frame.winfo_children():
            widget.destroy()

        form_frame = tk.Frame(self.welcome_frame, bg="#282c34")
        form_frame.place(relx=0.5, rely=0.5, anchor='center')

        tk.Label(form_frame, text="Sign Up",
                font=("Helvetica", 20, "bold"),
                fg="#61dafb", bg="#282c34").pack(pady=10)

        tk.Label(form_frame, text="Institute:", fg="#ffffff",
                bg="#282c34", font=("Helvetica", 12)).pack(anchor="w")
        inst_entry = ctk.CTkEntry(form_frame, width=300, height=40, corner_radius=10)
        inst_entry.pack(pady=5)

        tk.Label(form_frame, text="Name:", fg="#ffffff",
                bg="#282c34", font=("Helvetica", 12)).pack(anchor="w")
        name_entry = ctk.CTkEntry(form_frame, width=300, height=40, corner_radius=10)
        name_entry.pack(pady=5)

        tk.Label(form_frame, text="Password:", fg="#ffffff",
                bg="#282c34", font=("Helvetica", 12)).pack(anchor="w")
        pwd_entry = ctk.CTkEntry(form_frame, width=300, height=40, corner_radius=10, show="*")
        pwd_entry.pack(pady=5)

        tk.Label(form_frame, text="Role (Teacher/Student):", fg="#ffffff",
                bg="#282c34", font=("Helvetica", 12)).pack(anchor="w")
        role_entry = ctk.CTkEntry(form_frame, width=300, height=40, corner_radius=10)
        role_entry.pack(pady=5)

        error_label = tk.Label(form_frame, text="", fg="#ff4c4c", bg="#282c34", font=("Helvetica", 11))
        error_label.pack(pady=5)

        def submit_signup():
            institute = inst_entry.get().strip()
            name = name_entry.get().strip()
            password = pwd_entry.get().strip()
            role = role_entry.get().strip().lower()

            if not all([institute, name, password, role]):
                error_label.config(text="Please fill in all fields.")
                return

            payload = {
                "name": name,
                "password": password,
                "role": role,
                "institute": institute
            }

            try:
                res = requests.post("http://localhost:5000/signup", json=payload)
                if res.ok:
                    

                    for widget in self.welcome_frame.winfo_children():
                        widget.destroy()
                    self.show_welcome_page()
                    
                    self.message_label.config(text="Signup successful! Please login.")

                    
                else:
                    error = res.json().get("error", "Signup failed")
                    error_label.config(text=error)
                    inst_entry.delete(0, 'end')
                    name_entry.delete(0, 'end')
                    pwd_entry.delete(0, 'end')
                    role_entry.delete(0, 'end')
            except Exception as e:
                error_label.config(text=str(e))

        ctk.CTkButton(form_frame, text="Create Account",
                    corner_radius=20,
                    width=200,
                    height=40,
                    fg_color="#61dafb",
                    text_color="#282c34",
                    hover_color="#21a1f1",
                    font=("Helvetica", 14, "bold"),
                    command=submit_signup).pack(pady=15)


    
    def proceed_as_guest(self):
        self.current_user = "Guest"
        self.start_editor()

    def create_top_button(self, parent, text, command):
        btn = tk.Label(parent,
                    text=text,
                    font=("Segoe UI", 11, "bold"),
                    bg="#333333",
                    fg="#ffffff",
                    padx=10, pady=5,
                    cursor="hand2")

        btn.bind("<Button-1>", lambda e: command())
        btn.bind("<Enter>", lambda e: btn.config(bg="#444444"))
        btn.bind("<Leave>", lambda e: btn.config(bg="#333333"))

        btn.pack(side='left', padx=5)
        return btn
    
    def create_file_menu_button(self, text, command):
        btn = tk.Label(self.file_menu,
                    text=text,
                    font=("Segoe UI", 11),
                    bg="#444444",
                    fg="#ffffff",
                    padx=10, pady=5,
                    cursor="hand2")
        btn.bind("<Button-1>", lambda e: command())
        btn.bind("<Enter>", lambda e: btn.config(bg="#555555"))
        btn.bind("<Leave>", lambda e: btn.config(bg="#444444"))
        btn.pack(fill='x', padx=5, pady=2)
        return btn

        

    def start_editor(self):
        self.welcome_frame.destroy()

        self.root.configure(bg=self.bg_main)

        #
        top_bar = tk.Frame(self.root, bg="#333333")
        top_bar.pack(fill='x')

        self.file_button = self.create_top_button(top_bar, "☰ File", self.toggle_file_menu)
        self.create_top_button(top_bar, "Run ▶", self.run_code)
        self.create_top_button(top_bar, "Export Report", self.export_report)
        self.create_top_button(top_bar, "Logout", self.logout)
        self.create_top_button(top_bar, "Upload Session", self.upload_session)

        if hasattr(self, 'current_user_role') and self.current_user_role.lower() == "teacher":
            self.create_top_button(top_bar, "View Submissions", self.view_submissions)

        elif hasattr(self, 'current_user_role') and self.current_user_role.lower() == "student":
            self.create_top_button(top_bar, "My Submissions", self.view_my_submissions)

        if hasattr(self, 'current_user_role') and self.current_user_role.lower() == "student":
            self.create_top_button(top_bar, "Get Question", self.get_question)
        elif hasattr(self, 'current_user_role') and self.current_user_role.lower() == "teacher":
            self.create_top_button(top_bar, "Post Question", self.post_question)
    
    

        # Welcome label at right
        self.user_label = tk.Label(top_bar,
                                text=f"Welcome, {self.current_user}",
                                font=("Segoe UI", 11, "bold"),
                                bg="#333333",
                                fg="#ffffff")
        self.user_label.pack(side='right', padx=10)

        # Create the File menu frame
        self.file_menu = tk.Frame(self.root, bg="#444444", bd=0)
        self.file_menu.place_forget()

        # Add items
        self.create_file_menu_button("New", self.new_file)
        self.create_file_menu_button("Open", self.open_file)
        self.create_file_menu_button("Save", self.save_file)
        self.create_file_menu_button("Open Folder", self.open_folder)


        main = ctk.CTkFrame(self.root)
        main.pack(fill='both', expand=True)

        self.h_paned = tk.PanedWindow(main, orient=tk.HORIZONTAL, sashrelief='raised', sashwidth=5)
        self.h_paned.pack(fill='both', expand=True)

        explorer_frame = ctk.CTkFrame(self.h_paned, fg_color="#333333")
        self.tree = ttk.Treeview(explorer_frame, show='tree')
        self.tree.pack(fill='both', expand=True)
        self.tree.bind("<Double-1>", self.open_selected_file)
        self.folder_icon = ImageTk.PhotoImage(Image.open("folder.png").resize((16, 16)))
        self.file_icon = ImageTk.PhotoImage(Image.open("file.png").resize((16, 16)))
        self.icon_refs = [self.folder_icon, self.file_icon]
        self.h_paned.add(explorer_frame, minsize=150)
        self.v_paned = tk.PanedWindow(self.h_paned, orient=tk.VERTICAL, sashrelief='raised', sashwidth=5)

        notebook_frame = ctk.CTkFrame(self.v_paned)
        self.notebook = ttk.Notebook(notebook_frame)
        self.notebook.pack(fill='both', expand=True)
        self.v_paned.add(notebook_frame, minsize=300)

        output_frame = ctk.CTkFrame(self.v_paned)
        self.output = tk.Text(output_frame, height=6, bg="#ffffff", fg="#000000", font=self.font_code)
        self.output.pack(fill='both', expand=True)
        self.v_paned.add(output_frame, minsize=100)

        self.h_paned.add(self.v_paned)

        def set_default_sashes():
            h = self.v_paned.winfo_height()
            self.h_paned.sash_place(0, 200, 0)
            self.v_paned.sash_place(0, 0, int(h * 0.85))

        self.root.after(400, set_default_sashes)
        self.root.bind('<Control-s>', lambda event: self.save_file())
        self.root.bind('<Command-s>', lambda event: self.save_file())
        self.root.bind("<Button-1>", self.global_click_handler)

    def toggle_file_menu(self):
        if self.file_menu.winfo_ismapped():
            self.file_menu.place_forget()
        else:
            x = self.file_button.winfo_rootx() - self.root.winfo_rootx()
            y = self.file_button.winfo_rooty() - self.root.winfo_rooty() + self.file_button.winfo_height()
            self.file_menu.place(x=x, y=y)
            self.file_menu.lift()

    def logout(self):
        # Destroy only the editor UI
        self.open_tabs = {}
        self.current_folder = None
        self.welcome_frame=None
        self.current_user = "Anonymous"
        self.current_user_role = "Anonymous"
        self.user_actions = []
        self.current_user_institute=None
        
        if self.editor_frame:
            self.editor_frame.destroy()
        elif self.h_paned:
            self.h_paned.destroy()
        
        # Clean ALL widgets
        for widget in self.root.winfo_children():
            widget.destroy()


        # Re-create the welcome frame
        self.show_welcome_page()


    # Add your unchanged code: new_file, open_file, save_file, open_folder,
    # populate_tree, open_selected_file, create_tab, get_current_tab,
    # highlight_syntax, insert_tab, handle_return, handle_pairs,
    # update_line_numbers, run_code, export_report.

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
            self.add_file_to_treeview(file_path)  # ✅ Add this line!to add new file to explorer
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
            self.add_file_to_treeview(path)

    def add_file_to_treeview(self, path):
        for child in self.tree.get_children():
            for sub in self.tree.get_children(child):
                if self.tree.item(sub, 'values') == [path]:
                    return

        if not hasattr(self, 'opened_files_node'):
            self.opened_files_node = self.tree.insert('', 'end', text="Opened Files",
                                                    image=self.folder_icon, open=True)

        file_name = os.path.basename(path)
        self.tree.insert(self.opened_files_node, 'end',
                        text=file_name,
                        image=self.file_icon,
                        values=[path])


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

        text.focus_set()  # One-time only.
        text.bind("<Button-1>", lambda e: text.focus_set()) 
        
        if hasattr(self, 'current_user_role') and self.current_user_role.lower() == "student":
            def block_paste(e):
                messagebox.showwarning(
                    "Paste Blocked",
                    "Pasting is disabled for students. Please type your code manually."
                )
                return "break"

            text.bind("<<Paste>>", block_paste)

        self.notebook.add(frame, text=name)
        self.open_tabs[frame] = {'text': text, 'lines': line_numbers, 'path': path}
        self.notebook.select(frame)

        self.update_line_numbers(text, line_numbers)
        self.highlight_syntax(text)

    def save_file(self):
        tab = self.get_current_tab()
        if not tab:
            self.output.insert(tk.END, "[INFO] No file is open to save.\n")
            return

        content = tab['text'].get('1.0', tk.END).rstrip()

        if not tab['path']:
            path = filedialog.asksaveasfilename(defaultextension=".py")
            if not path:
                self.output.insert(tk.END, "[INFO] Save cancelled (no filename chosen).\n")
                return
            tab['path'] = path
            self.notebook.tab(self.notebook.select(), text=os.path.basename(path))

        with open(tab['path'], 'w', encoding='utf-8') as f:
            f.write(content)

        # Optional: record the save as a user action only if not already logged
        self.user_actions.append({
            'action': 'save_file',
            'file': os.path.basename(tab['path']),
            'content': content
        })

        self.output.insert(tk.END, f"[DEBUG] Saved file: {tab['path']}\n")


    def export_report(self):
        # ✅ Always auto-save the current tab if any
        tab = self.get_current_tab()
        if tab:
            current_content = tab['text'].get('1.0', tk.END).rstrip()

            if not tab['path']:
                path = filedialog.asksaveasfilename(defaultextension=".py")
                if not path:
                    self.output.insert(tk.END, "[INFO] Export cancelled (no filename chosen).\n")
                    return
                tab['path'] = path
                self.notebook.tab(self.notebook.select(), text=os.path.basename(path))

            with open(tab['path'], 'w', encoding='utf-8') as f:
                f.write(current_content)

            self.user_actions.append({
                'action': 'save_file',
                'file': os.path.basename(tab['path']),
                'content': current_content
            })

            self.output.insert(tk.END, f"[DEBUG] Auto-saved current file: {tab['path']}\n")
        else:
            self.output.insert(tk.END, "[INFO] No active file to auto-save.\n")

        # ✅ PDF file name
        filename = f"{self.current_user}_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        pdf = canvas.Canvas(filename, pagesize=letter)
        width, height = letter

        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawString(50, height - 50, f"Code Session Report - {self.current_user}")
        pdf.setFont("Helvetica", 12)
        pdf.drawString(50, height - 70, f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        y = height - 100

        folder = self.current_folder or os.getcwd()

        # ✅ 1️⃣ Add Question section
        question_path = os.path.join(folder, "question.txt")
        if os.path.exists(question_path):
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(50, y, "QUESTION")
            y -= 20

            pdf.setFont("Courier", 10)
            with open(question_path, 'r',encoding="utf-8") as f:
                for line in f:
                    pdf.drawString(60, y, line.rstrip())
                    y -= 12
                    if y < 50:
                        pdf.showPage()
                        y = height - 50

            y -= 20

        # ✅ 2️⃣ Add Algorithm section
        algo_path = os.path.join(folder, "algorithm.txt")
        if os.path.exists(algo_path):
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(50, y, "ALGORITHM")
            y -= 20

            pdf.setFont("Courier", 10)
            with open(algo_path, 'r',encoding="utf-8") as f:
                for line in f:
                    pdf.drawString(60, y, line.rstrip())
                    y -= 12
                    if y < 50:
                        pdf.showPage()
                        y = height - 50

            y -= 20

        # ✅ 3️⃣ Add Solutions section
        # ✅ 3️⃣ Add Solutions section (ONLY opened files from tree)
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y, "SOLUTIONS")
        y -= 20

        solution_exts = ['.py', '.c', '.cpp', '.sql']

        # Loop through files visible in the tree
        opened_files = []
        # If you have an 'opened_files_node' parent node:
        if hasattr(self, 'opened_files_node'):
            for child in self.tree.get_children(self.opened_files_node):
                path = self.tree.item(child, 'values')[0]
                if path and os.path.isfile(path):
                    ext = os.path.splitext(path)[1].lower()
                    if ext in solution_exts:
                        opened_files.append(path)

        # ✅ For each opened file, write content
        for file_path in opened_files:
            file_name = os.path.basename(file_path)
            pdf.setFont("Helvetica-Bold", 11)
            pdf.drawString(50, y, f"File: {file_name}")
            y -= 15

            pdf.setFont("Courier", 10)
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    pdf.drawString(60, y, line.rstrip())
                    y -= 12
                    if y < 50:
                        pdf.showPage()
                        y = height - 50

            y -= 20


        # ✅ 4️⃣ Add Program Output section
        output_content = self.output.get('1.0', tk.END).strip()
        if output_content:
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(50, y, "PROGRAM OUTPUT")
            y -= 20

            pdf.setFont("Courier", 10)
            for line in output_content.splitlines():
                pdf.drawString(60, y, line.rstrip())
                y -= 12
                if y < 50:
                    pdf.showPage()
                    y = height - 50

        pdf.save()
        self.output.insert(tk.END, f"[DEBUG] Report saved as {filename}\n")




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
        text.insert(tk.INSERT, "")
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

    

    def global_click_handler(self, event):
        widget = event.widget
        if isinstance(event.widget, tk.Text):
            return  # don’t do anything


        def is_descendant(widget, parent):
            while widget:
                if widget == parent:
                    return True
                try:
                    widget = widget.master
                except:
                    break
            return False

        # ✅ Safe: only run this part if file_menu exists
        if hasattr(self, 'file_menu') and self.file_menu.winfo_exists():
            if self.file_menu.winfo_ismapped():
                if not (is_descendant(widget, self.file_menu) or is_descendant(widget, self.file_button)):
                    self.file_menu.place_forget()


    
    def upload_session(self):
        self.user_actions.append({
            'action': 'upload_session',
            'file': 'Session PDF'
        })

        self.export_report()
        pdf_filename = f"{self.current_user}_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"

        if not os.path.exists(pdf_filename):
            self.output.insert(tk.END, "[ERROR] PDF not generated.\n")
            return

        popup = ctk.CTkToplevel(self.root)
        popup.title("Upload Session")
        popup.geometry("400x500")
        popup.configure(fg_color="#333333")

        ctk.CTkLabel(popup, text="Upload Session",
                    font=("Helvetica", 20, "bold"),
                    text_color="#61dafb").pack(pady=20)

        font_label = ("Helvetica", 12)

        # Add College field ✅
        ctk.CTkLabel(popup, text="College:", font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
        college_entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
        college_entry.pack(pady=5)

        ctk.CTkLabel(popup, text="Faculty:", font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
        faculty_entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
        faculty_entry.pack(pady=5)

        ctk.CTkLabel(popup, text="Subject:", font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
        subject_entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
        subject_entry.pack(pady=5)

        ctk.CTkLabel(popup, text="Class:", font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
        class_entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
        class_entry.pack(pady=5)

        def send_request():
            college = college_entry.get().strip()
            faculty = faculty_entry.get().strip()
            subject = subject_entry.get().strip()
            class_name = class_entry.get().strip()

            if not all([college, faculty, subject, class_name]):
                self.output.insert(tk.END, "[ERROR] Please fill all fields.\n")
                return

           
            with open(pdf_filename, 'rb') as f:
                files = {'file': f}
                data = {
                    'college': college,
                    'faculty': faculty,
                    'subject': subject,
                    'class': class_name,
                    'pdf_name': self.current_user,  # or pdf_name logic you want
                    'student_name':self.current_user
                }
                print("upload data:",data)
                try:
                    res = requests.post("http://localhost:5000/upload-report",
                                        files=files, data=data)
                    if res.ok:
                        self.output.insert(tk.END, f"[DEBUG] Uploaded: {res.json()}\n")
                    else:
                        self.output.insert(tk.END, f"[ERROR] Upload failed: {res.text}\n")
                except Exception as e:
                    self.output.insert(tk.END, f"[ERROR] {str(e)}\n")

            popup.destroy()

        ctk.CTkButton(popup, text="Upload",
                    corner_radius=20,
                    width=200,
                    height=40,
                    fg_color="#61dafb",
                    text_color="#282c34",
                    hover_color="#21a1f1",
                    font=("Helvetica", 14, "bold"),
                    command=send_request).pack(pady=20)

        popup.transient(self.root)
        popup.grab_set()
        self.root.wait_window(popup)


        

    def view_submissions(self):
        popup = ctk.CTkToplevel(self.root)
        popup.title("View Submissions")
        popup.geometry("600x600")
        popup.configure(fg_color="#333333")

        ctk.CTkLabel(
            popup, text="View Submissions",
            font=("Helvetica", 20, "bold"),
            text_color="#61dafb"
        ).pack(pady=20)

        font_label = ("Helvetica", 12)

        labels = ["College:", "Faculty:", "Subject:", "Class:"]
        entries = []
        for label in labels:
            ctk.CTkLabel(popup, text=label, font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
            entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
            entry.pack(pady=5)
            entries.append(entry)

        def load_submissions():
            college, faculty, subject, class_name = [e.get().strip() for e in entries]
            if not all([college, faculty, subject, class_name]):
                self.output.insert(tk.END, "[ERROR] Please fill all fields.\n")
                return

            try:
                url = f"http://localhost:5000/get-reports"
                params = {
                    'college': college,
                    'faculty': faculty,
                    'subject': subject,
                    'class': class_name
                }
                res = requests.get(url, params=params)
                if res.ok:
                    reports = res.json().get('reports', [])

                    popup.destroy()

                    title = f"{subject}_{class_name}_Reports"
                    sub_popup = ctk.CTkToplevel(self.root)
                    sub_popup.title(title)
                    sub_popup.geometry("600x600")
                    sub_popup.configure(fg_color="#333333")

                    ctk.CTkLabel(
                        sub_popup, text=f"Reports for {subject} - {class_name}",
                        font=("Helvetica", 18, "bold"),
                        text_color="#61dafb"
                    ).pack(pady=20)

                    result_frame = ctk.CTkScrollableFrame(sub_popup, fg_color="#222222", width=550, height=450)
                    result_frame.pack(padx=20, pady=10, fill='both', expand=True)

                    if not reports:
                        ctk.CTkLabel(result_frame, text="No reports found.",
                                    font=font_label, text_color="#ffffff").pack()
                    else:
                        for report in reports:
                            pdf_name = report.get('pdf_name', 'Unknown')
                            storage_path = report.get('storage_path')

                            card = ctk.CTkFrame(result_frame, fg_color="#2a2a2a", corner_radius=10)
                            card.pack(fill="x", padx=10, pady=8)

                            row_frame = ctk.CTkFrame(card, fg_color="transparent")
                            row_frame.pack(fill="x", padx=10, pady=10)

                            name_label = ctk.CTkLabel(
                                row_frame,
                                text=pdf_name,
                                font=("Helvetica", 13, "bold"),
                                text_color="#61dafb"
                            )
                            name_label.pack(side="left")

                            if storage_path:
                                def make_open(path):
                                    def open_signed_url():
                                        try:
                                            url = "http://localhost:5000/get-signed-url"
                                            payload = {'storage_path': path}
                                            res = requests.post(url, json=payload)
                                            if res.ok:
                                                signed_url = res.json().get('signed_url')
                                                if signed_url:
                                                    webbrowser.open_new(signed_url)
                                                else:
                                                    self.output.insert(tk.END, "[ERROR] No signed URL returned.\n")
                                            else:
                                                self.output.insert(tk.END, f"[ERROR] {res.text}\n")
                                        except Exception as e:
                                            self.output.insert(tk.END, f"[ERROR] {str(e)}\n")
                                    return open_signed_url

                                download_button = ctk.CTkButton(
                                    row_frame,
                                    text="Download",
                                    corner_radius=15,
                                    fg_color="#61dafb",
                                    text_color="#000000",
                                    hover_color="#21a1f1",
                                    font=("Helvetica", 11, "bold"),
                                    width=100,
                                    command=make_open(storage_path)
                                )
                                download_button.pack(side="right")

                    sub_popup.transient(self.root)
                    sub_popup.grab_set()
                    self.root.wait_window(sub_popup)

                else:
                    self.output.insert(tk.END, f"[ERROR] {res.text}\n")
            except Exception as e:
                self.output.insert(tk.END, f"[ERROR] {str(e)}\n")

        ctk.CTkButton(
            popup, text="Load Reports",
            corner_radius=20,
            width=200,
            height=40,
            fg_color="#61dafb",
            text_color="#282c34",
            hover_color="#21a1f1",
            font=("Helvetica", 14, "bold"),
            command=load_submissions
        ).pack(pady=20)

        popup.transient(self.root)
        popup.grab_set()
        self.root.wait_window(popup)

    
    


    def view_my_submissions(self):
        popup = ctk.CTkToplevel(self.root)
        popup.title("View My Submissions")
        popup.geometry("600x400")
        popup.configure(fg_color="#333333")

        ctk.CTkLabel(
            popup, text="View My Submissions",
            font=("Helvetica", 20, "bold"),
            text_color="#61dafb"
        ).pack(pady=20)

        font_label = ("Helvetica", 12)

        labels = ["College:", "Faculty:", "Subject:"]
        entries = []
        for label in labels:
            ctk.CTkLabel(popup, text=label, font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
            entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
            entry.pack(pady=5)
            entries.append(entry)

        def load_my_submissions():
            college, faculty, subject = [e.get().strip() for e in entries]
            student_name = self.current_user

            if not all([college, faculty, subject, student_name]):
                self.output.insert(tk.END, "[ERROR] Please fill all fields.\n")
                return

            try:
                url = f"http://localhost:5000/get-my-reports"
                params = {
                    'college': college,
                    'faculty': faculty,
                    'subject': subject,
                    'student_name': student_name
                }
                res = requests.get(url, params=params)
                if res.ok:
                    reports = res.json().get('reports', [])

                    popup.destroy()

                    title = f"{subject}_Reports"
                    sub_popup = ctk.CTkToplevel(self.root)
                    sub_popup.title(title)
                    sub_popup.geometry("600x600")
                    sub_popup.configure(fg_color="#333333")

                    ctk.CTkLabel(
                        sub_popup, text=f"My Reports for {subject}",
                        font=("Helvetica", 18, "bold"),
                        text_color="#61dafb"
                    ).pack(pady=20)

                    result_frame = ctk.CTkScrollableFrame(sub_popup, fg_color="#222222", width=550, height=400)
                    result_frame.pack(padx=20, pady=10, fill='both', expand=True)

                    if not reports:
                        ctk.CTkLabel(result_frame, text="No reports found.",
                                    font=font_label, text_color="#ffffff").pack()
                    else:
                        # ✅ define once OUTSIDE loop
                        def generate_signed_url_and_open(path):
                            payload = {"storage_path": path}
                            url = "http://localhost:5000/get-signed-url"
                            res = requests.post(url, json=payload)
                            if res.ok:
                                download_url = res.json().get("signed_url")
                                if download_url:
                                    webbrowser.open_new(download_url)
                            else:
                                self.output.insert(tk.END, f"[ERROR] {res.text}\n")

                        for report in reports:
                            pdf_name = report.get('pdf_name', 'Unknown')
                            storage_path = report.get('storage_path')

                            card = ctk.CTkFrame(result_frame, fg_color="#2a2a2a", corner_radius=10)
                            card.pack(fill="x", padx=10, pady=8)

                            row_frame = ctk.CTkFrame(card, fg_color="transparent")
                            row_frame.pack(fill="x", padx=10, pady=10)

                            name_label = ctk.CTkLabel(
                                row_frame,
                                text=pdf_name,
                                font=("Helvetica", 13, "bold"),
                                text_color="#61dafb"
                            )
                            name_label.pack(side="left")

                            download_button = ctk.CTkButton(
                                row_frame,
                                text="Download",
                                corner_radius=15,
                                fg_color="#61dafb",
                                text_color="#000000",
                                hover_color="#21a1f1",
                                font=("Helvetica", 11, "bold"),
                                width=100,
                                command=partial(generate_signed_url_and_open, storage_path)
                            )
                            download_button.pack(side="right")

                        def merge_final_report():
                            storage_paths = [r['storage_path'] for r in reports]
                            payload = {
                                "storage_paths": storage_paths,
                                "output_name": "final_report",
                                "college": college,
                                "faculty": faculty,
                                "subject": subject,
                                "student_name": student_name
                            }
                            res = requests.post("http://localhost:5000/merge-reports", json=payload)
                            if res.ok:
                                final_url = res.json().get("signed_url")
                                if final_url:
                                    webbrowser.open_new(final_url)
                            else:
                                self.output.insert(tk.END, f"[ERROR] {res.text}\n")

                        ctk.CTkButton(
                            sub_popup,
                            text="Generate Final Report",
                            corner_radius=20,
                            width=200,
                            height=40,
                            fg_color="#61dafb",
                            text_color="#282c34",
                            hover_color="#21a1f1",
                            font=("Helvetica", 14, "bold"),
                            command=merge_final_report
                        ).pack(pady=20)

                    sub_popup.transient(self.root)
                    sub_popup.grab_set()
                    self.root.wait_window(sub_popup)

                else:
                    self.output.insert(tk.END, f"[ERROR] {res.text}\n")
            except Exception as e:
                self.output.insert(tk.END, f"[ERROR] {str(e)}\n")

        ctk.CTkButton(
            popup, text="Load My Reports",
            corner_radius=20,
            width=200,
            height=40,
            fg_color="#61dafb",
            text_color="#282c34",
            hover_color="#21a1f1",
            font=("Helvetica", 14, "bold"),
            command=load_my_submissions
        ).pack(pady=20)

        popup.transient(self.root)
        popup.grab_set()
        self.root.wait_window(popup)


    def post_question(self):
        popup = ctk.CTkToplevel(self.root)
        popup.title("Post Question")
        popup.geometry("500x400")
        popup.configure(fg_color="#333333")

        ctk.CTkLabel(
            popup, text="Post Question",
            font=("Helvetica", 20, "bold"),
            text_color="#61dafb"
        ).pack(pady=20)

        font_label = ("Helvetica", 12)

        labels = ["Faculty:", "Subject:"]
        entries = []
        for label in labels:
            ctk.CTkLabel(popup, text=label, font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
            entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
            entry.pack(pady=5)
            entries.append(entry)

        ctk.CTkLabel(popup, text="Question:", font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
        question_text = ctk.CTkTextbox(popup, width=400, height=100, corner_radius=10)
        question_text.pack(pady=10)

        def submit():
            faculty, subject = [e.get().strip() for e in entries]
            question = question_text.get("1.0", "end").strip()
            institute = getattr(self, 'current_user_institute', '').strip()

            if not all([faculty, subject, question, institute]):
                self.output.insert(tk.END, "[ERROR] Please fill all fields.\n")
                return

            payload = {
                "institute": institute,
                "faculty": faculty,
                "subject": subject,
                "question": question
            }

            response = requests.post("http://localhost:5000/post_question", json=payload)
            if response.status_code == 200:
                messagebox.showinfo("Success", "Question posted successfully.")
                popup.destroy()
            else:
                self.output.insert(tk.END, f"[ERROR] {response.text}\n")

        ctk.CTkButton(
            popup, text="Post Question",
            corner_radius=20,
            width=200,
            height=40,
            fg_color="#61dafb",
            text_color="#282c34",
            hover_color="#21a1f1",
            font=("Helvetica", 14, "bold"),
            command=submit
        ).pack(pady=20)

        popup.transient(self.root)
        popup.grab_set()
        self.root.wait_window(popup)

    
    def get_question(self):
        popup = ctk.CTkToplevel(self.root)
        popup.title("Get Question")
        popup.geometry("400x300")
        popup.configure(fg_color="#333333")

        ctk.CTkLabel(
            popup, text="Get Question",
            font=("Helvetica", 20, "bold"),
            text_color="#61dafb"
        ).pack(pady=20)

        font_label = ("Helvetica", 12)

        labels = ["Faculty:", "Subject:"]
        entries = []
        for label in labels:
            ctk.CTkLabel(popup, text=label, font=font_label, text_color="#ffffff").pack(anchor="w", padx=40)
            entry = ctk.CTkEntry(popup, width=300, height=40, corner_radius=10)
            entry.pack(pady=5)
            entries.append(entry)

        def fetch():
            faculty, subject = [e.get().strip() for e in entries]
            institute = getattr(self, 'current_user_institute', '').strip()

            if not all([faculty, subject, institute]):
                self.output.insert(tk.END, "[ERROR] Please fill all fields.\n")
                return

            params = {
                "institute": institute,
                "faculty": faculty,
                "subject": subject
            }

            response = requests.get("http://localhost:5000/get_question", params=params)
            if response.status_code == 200:
                question = response.json().get("question", "")
                folder = self.current_folder or os.getcwd()

                # ✅ Save question.txt
                question_path = os.path.join(folder, "question.txt")
                with open(question_path, "w") as f:
                    f.write(question)

                self.add_file_to_treeview(question_path)
                self.load_file(question_path)

                # ✅ Also create empty algorithm.txt
                algo_path = os.path.join(folder, "algorithm.txt")
                with open(algo_path, "w") as f:
                    f.write("")  # empty for now

                self.add_file_to_treeview(algo_path)
                self.load_file(algo_path)

                messagebox.showinfo("Success", "Question saved to question.txt and empty algorithm.txt created.")
                popup.destroy()
            else:
                self.output.insert(tk.END, f"[ERROR] {response.text}\n")

        ctk.CTkButton(
            popup, text="Fetch Question",
            corner_radius=20,
            width=200,
            height=40,
            fg_color="#61dafb",
            text_color="#282c34",
            hover_color="#21a1f1",
            font=("Helvetica", 14, "bold"),
            command=fetch
        ).pack(pady=20)

        popup.transient(self.root)
        popup.grab_set()
        self.root.wait_window(popup)



if __name__ == "__main__":
    root = ctk.CTk()
    app = CodeEditorApp(root)
    root.mainloop()

