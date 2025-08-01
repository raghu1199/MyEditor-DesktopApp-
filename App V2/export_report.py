# export_report.py
import sys
import json
import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

def export_report(opened_files, current_user, current_folder,outputs):
    filename = f"{current_user}_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    pdf = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    y = height - 50

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(50, y, f"Code Session Report - {current_user}")
    y -= 20
    pdf.setFont("Helvetica", 12)
    pdf.drawString(50, y, f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    y -= 40

    def draw_section(title, filepath):
        nonlocal y
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y, title)
        y -= 20
        pdf.setFont("Courier", 10)
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                pdf.drawString(60, y, line.rstrip())
                y -= 12
                if y < 50:
                    pdf.showPage()
                    y = height - 50
        y -= 20

    # Include question.txt and algorithm.txt if they exist
    if current_folder:
        q_path = os.path.join(current_folder, 'question.txt')
        a_path = os.path.join(current_folder, 'algorithm.txt')
        if os.path.exists(q_path):
            draw_section("QUESTION", q_path)
        if os.path.exists(a_path):
            draw_section("ALGORITHM", a_path)

    # Solutions
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "SOLUTIONS")
    y -= 20

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "SOLUTIONS")
    y -= 20

    solution_exts = ['.py', '.c', '.cpp', '.sql','.js','.java'] 

    # Loop through files visible in the tree
    
    

    # ✅ For each opened file, write content
    for file_path in opened_files:

        ext = os.path.splitext(file_path)[1].lower()
        if ext in solution_exts:
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
    output_content = ""
    if outputs and os.path.exists(outputs):
        with open(outputs, 'r', encoding='utf-8') as f:
            output_content = f.read()
            
    print(output_content)
    if output_content:
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y, "PROGRAM OUTPUT")
        y -= 20

        pdf.setFont("Courier", 10)

        
        max_width = width - 70  # adjust as per your margin

        for line in output_content.splitlines():
            wrapped_lines = simpleSplit(line, "Courier", 10, max_width)
            for wrapped_line in wrapped_lines:
                pdf.drawString(60, y, wrapped_line.rstrip())
                y -= 12
                if y < 50:
                    pdf.showPage()
                    y = height - 50
        

    pdf.save()
    print(f"Report exported to {filename}")

if __name__ == "__main__":

    try:
        # Correctly read individual arguments
        opened_files_json = sys.argv[1]  # This should be a JSON string: '["file1.py", "file2.py"]'
        current_user = sys.argv[2]
        current_folder = sys.argv[3] if len(sys.argv) > 3 else ""
        outputs=sys.argv[4]

        # Parse JSON safely
        print("Received JSON string:", opened_files_json)

        opened_files = json.loads(opened_files_json)

        # Now call your export function
        export_report(opened_files, current_user, current_folder,outputs)

    except IndexError:
        print("❌ Not enough arguments provided.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ JSON parsing error: {e}")
        sys.exit(1)


# python export_report.py '[\"untitled-1.py\", \"question.txt\"]' "raghvendra" "C:/Users/Raghvendra/Desktop/TestFolder" "C:/Users/Raghvendra/Desktop/TestFolder/output1.txt"