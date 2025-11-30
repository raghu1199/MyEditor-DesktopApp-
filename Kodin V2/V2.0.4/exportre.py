# export_report.py
import sys
import json
import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

# ** Fix Windows Unicode Output Crashes **
try:
    sys.stdout.reconfigure(encoding='utf-8')
except:
    pass


def export_report(opened_files, current_user, current_folder, outputs, exam_log_json="[]"):

    # ---------------------------
    # Save location
    # ---------------------------
    if current_folder and os.path.exists(current_folder):
        save_dir = current_folder
    else:
        save_dir = os.getcwd()

    filename = os.path.join(save_dir, f"{current_user}_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf")
    pdf = canvas.Canvas(filename, pagesize=letter)
    width, height = letter

    # -----------------------------------------------------------
    # Helper: ALWAYS reset fonts after page break
    # -----------------------------------------------------------
    def reset_font_main_title():
        pdf.setFont("Helvetica-Bold", 14)

    def reset_font_header():
        pdf.setFont("Helvetica-Bold", 12)

    def reset_font_body():
        pdf.setFont("Courier", 10)

    def reset_font_text():
        pdf.setFont("Helvetica", 12)

    def ensure_space(y, needed=50):
        if y < needed:
            pdf.showPage()
            reset_font_body()
            return height - 50
        return y

    y = height - 50

    # ---------------- Title Page -----------------
    reset_font_main_title()
    pdf.drawString(50, y, f"Kodin Code Session Report - {current_user}")

    y -= 20
    reset_font_text()
    pdf.drawString(50, y, f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    y -= 40

    # -----------------------------------------------------------
    # Section drawer with page-break-safe formatting
    # -----------------------------------------------------------
    def draw_section(title, filepath):
        nonlocal y
        reset_font_header()
        pdf.drawString(50, y, title)
        y -= 20

        reset_font_body()
        max_width = width - 70

        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                wrapped = simpleSplit(line.rstrip(), "Courier", 10, max_width)
                for w in wrapped:
                    pdf.drawString(60, y, w)
                    y -= 12
                    y = ensure_space(y)
        y -= 20
        y = ensure_space(y)

    # -----------------------------------------------------------
    # Include question/algorithm/aim
    # -----------------------------------------------------------
    if current_folder:
        q_path = os.path.join(current_folder, 'question.txt')
        a_path = os.path.join(current_folder, 'algorithm.txt')
        aim_path = os.path.join(current_folder, 'aim.txt')

        if os.path.exists(q_path):
            draw_section("QUESTION", q_path)
        if os.path.exists(aim_path):
            draw_section("AIM", aim_path)
        if os.path.exists(a_path):
            draw_section("ALGORITHM", a_path)

    # -----------------------------------------------------------
    # Solution files
    # -----------------------------------------------------------
    reset_font_header()
    pdf.drawString(50, y, "SOLUTIONS")
    y -= 20
    y = ensure_space(y)

    reset_font_body()
    solution_exts = ['.py', '.c', '.cpp', '.sql', '.js', '.java']

    for file_path in opened_files:
        ext = os.path.splitext(file_path)[1].lower()
        if ext in solution_exts:
            file_name = os.path.basename(file_path)

            reset_font_header()
            pdf.drawString(50, y, f"File: {file_name}")
            y -= 15

            reset_font_body()
            max_width = width - 70

            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    wrapped = simpleSplit(line.rstrip(), "Courier", 10, max_width)
                    for w in wrapped:
                        pdf.drawString(60, y, w)
                        y -= 12
                        y = ensure_space(y)
            y -= 20
            y = ensure_space(y)

    # -----------------------------------------------------------
    # Program Output
    # -----------------------------------------------------------
    output_content = ""
    if outputs and os.path.exists(outputs):
        with open(outputs, "r", encoding="utf-8") as f:
            output_content = f.read()

    if output_content:
        reset_font_header()
        pdf.drawString(50, y, "PROGRAM OUTPUT")
        y -= 20
        y = ensure_space(y)

        reset_font_body()
        max_width = width - 70

        for line in output_content.splitlines():
            wrapped = simpleSplit(line.rstrip(), "Courier", 10, max_width)
            for w in wrapped:
                pdf.drawString(60, y, w)
                y -= 12
                y = ensure_space(y)
        y -= 20
        y = ensure_space(y)

    # -----------------------------------------------------------
    # Conclusion
    # -----------------------------------------------------------
    if current_folder:
        conclusion_path = os.path.join(current_folder, 'conclusion.txt')
        if os.path.exists(conclusion_path):
            draw_section("CONCLUSION", conclusion_path)

    # -----------------------------------------------------------
    # Exam Log Page
    # -----------------------------------------------------------
    try:
        exam_log = json.loads(exam_log_json)
    except:
        exam_log = []
    if exam_log:

        pdf.showPage()
        reset_font_header()
        pdf.setFont("Helvetica-Bold", 15)
        pdf.drawString(50, height - 40, "External Activity/Applications Found During Session")

        reset_font_text()
        left_x = 50
        right_x = width / 2 + 20
        y_left = height - 70
        y_right = height - 70

        col = 0

    for entry in exam_log:
        # Extract only time HH:MM:SS
        try:
            ts = entry.get("time", "")
            time_str = datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%H:%M:%S")
        except:
            time_str = ts

        entry_type = entry.get("type", "")
        
        if entry_type == "suspicious_processes" and "detail" in entry:
            # Split processes into two columns
            processes = entry["detail"]
            half = (len(processes) + 1) // 2
            left_proc = processes[:half]
            right_proc = processes[half:]

            for l, r in zip(left_proc, right_proc + [""] * (len(left_proc) - len(right_proc))):
                left_line = f"{time_str}   {l}"
                right_line = f"{time_str}   {r}" if r else ""

                pdf.drawString(left_x, y_left, left_line)
                y_left -= 14
                if y_left < 60:
                    pdf.showPage()
                    reset_font_text()
                    y_left = height - 70
                    y_right = height - 70

                if right_line:
                    pdf.drawString(right_x, y_right, right_line)
                    y_right -= 14
                    if y_right < 60:
                        pdf.showPage()
                        reset_font_text()
                        y_left = height - 70
                        y_right = height - 70

        else:
            # Normal entries like exam_started / exam_ended
            line = f"{time_str}   {entry_type}"
            if col == 0:
                pdf.drawString(left_x, y_left, line)
                y_left -= 14
                if y_left < 60:
                    pdf.showPage()
                    reset_font_text()
                    y_left = height - 70
                    y_right = height - 70
                col = 1
            else:
                pdf.drawString(right_x, y_right, line)
                y_right -= 14
                if y_right < 60:
                    pdf.showPage()
                    reset_font_text()
                    y_left = height - 70
                    y_right = height - 70
                col = 0

    pdf.save()
    sys.stdout.write(f"Report exported to: {filename}\n")
    sys.stdout.flush()


# ---------------- MAIN EXECUTION ----------------

if __name__ == "__main__":
    try:
        opened_files_json = sys.argv[1]
        current_user = sys.argv[2]
        current_folder = sys.argv[3] if len(sys.argv) > 3 else ""
        outputs = sys.argv[4] if len(sys.argv) > 4 else ""
        exam_log_json = sys.argv[5] if len(sys.argv) > 5 else "[]"

        opened_files = json.loads(opened_files_json)

        export_report(opened_files, current_user, current_folder, outputs, exam_log_json)

    except Exception as e:
        # NO EMOJIS — safe for EXE
        print("Error:", str(e))
        sys.exit(1)
