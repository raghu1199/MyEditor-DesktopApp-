from flask import Flask, request, jsonify,send_file
from flask_cors import CORS
from google.cloud import storage, firestore
from datetime import timedelta
import os
from PyPDF2 import PdfMerger  # pip install PyPDF2
import tempfile
from io import BytesIO
import pandas as pd
import hashlib
from urllib.parse import unquote
from werkzeug.utils import secure_filename
import bcrypt
import smtplib
from email.message import EmailMessage
import random
import string
import time
from datetime import datetime, timedelta






# os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "C:/Users/Raghvendra/Desktop/MyEditorServer/editor.json"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/var/www/myflaskapp/editor.json"


app = Flask(__name__)
CORS(app)
firestore_client = firestore.Client()
storage_client = storage.Client()
bucket = storage_client.bucket("editor-6e2cd.firebasestorage.app")




OTP_EXPIRY_SECONDS = int(os.environ.get('OTP_EXPIRY_SECONDS', 10 * 60))

os.environ["SMTP_HOST"]= "smtp.gmail.com"      # e.g. smtp.gmail.com
os.environ["SMTP_PORT"]= "587"    # e.g. 587
os.environ["SMTP_USER"]="mraghvendra10@gmail.com"
os.environ["SMTP_PASSWORD"]="mygm ypvj swzt whnc"
os.environ["ADMIN_PASSWORD"]="kodin@#!"


@app.route("/home")
def home():
    return jsonify({"status": "success", "message": "Flask + Gunicorn + Nginx working!"})





# ---------- Utility helpers ----------
def send_email(to_email, subject, body):
    smtp_host = os.environ.get('SMTP_HOST')
    smtp_port = int(os.environ.get('SMTP_PORT', 587))
    smtp_user = os.environ.get('SMTP_USER')
    smtp_password = os.environ.get('SMTP_PASSWORD')
    from_email = smtp_user #os.environ.get('mraghvendra10@gmail.com', smtp_user)

    if not (smtp_host and smtp_user and smtp_password):
        raise RuntimeError("SMTP not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASSWORD env variables.")

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = from_email
    msg['To'] = to_email
    msg.set_content(body)

    with smtplib.SMTP(smtp_host, smtp_port) as s:
        s.starttls()
        s.login(smtp_user, smtp_password)
        s.send_message(msg)

def generate_otp():
    return ''.join(random.choices(string.digits, k=6))


def check_user_exists(user_ref):
    # If it's a query (teacher case)
    if hasattr(user_ref, "stream"):  
        docs = list(user_ref.stream())
        if docs:
            return True, docs[0].to_dict()
        return False, None

    # If it's a direct document reference (student case)
    doc = user_ref.get()
    return doc.exists, (doc.to_dict() if doc.exists else None)



def get_user_doc_ref(institute, role, email_or_roll):
    if role == "student":
        # roll number is document ID
        path = f"institutes/{institute}/students/{email_or_roll}"
        return firestore_client.document(path)

    elif role == "teacher":
        # normalize email before querying
        email_or_roll = email_or_roll.lower()
        return firestore_client.collection(f"institutes/{institute}/teachers") \
                               .where("email", "==", email_or_roll)

    else:
        raise ValueError("Invalid role")


def otp_doc_ref(institute, role, email):
    # keep OTPs in a central collection for resets
    return firestore_client.document(f"password_resets/{institute}_{role}_{email}")

# ---------- Endpoints ----------




# @app.route("/send-reset-otp", methods=['POST'])
# def send_reset_otp():
#     body = request.get_json() or {}
#     institute = body.get('institute', '').strip()
#     role = body.get('role', '').strip()
#     email = body.get('email', '').strip().lower()
#     print("inside send otp:",institute,role,email)
#     if not (institute and role and email):
#         return jsonify({'success': False, 'message': 'Missing institute/role/email'}), 400

#     # find user doc
#     user_ref = get_user_doc_ref(institute, role, email)
#     exists, user_data = check_user_exists(user_ref)

#     if not exists:
#         return jsonify({'success': False, 'message': 'Email not found'}), 404

#     # generate OTP and store hashed plus expiry
#     otp = generate_otp()
#     expires_at = datetime.utcnow() + timedelta(seconds=OTP_EXPIRY_SECONDS)
#     otp_hashed = bcrypt.hashpw(otp.encode('utf8'), bcrypt.gensalt()).decode('utf8')

#     # store
#     data = {
#         'otp_hashed': otp_hashed,
#         'expires_at': expires_at.timestamp(),
#         'created_at': datetime.utcnow().timestamp(),
#         'institute': institute,
#         'role': role,
#         'email': email
#     }
#     otp_ref = otp_doc_ref(institute, role, email)
#     otp_ref.set(data)

#     # send email
#     try:
#         subject = "Kodin / Password Reset OTP"
#         body_text = f"Your password reset OTP is: {otp}\n\nThis OTP is valid for {OTP_EXPIRY_SECONDS//60} minutes."
#         send_email(email, subject, body_text)
#     except Exception as e:
#         # If sending fails, remove OTP doc
#         otp_ref.delete()
#         return jsonify({'success': False, 'message': f'Failed to send email: {str(e)}'}), 500

#     return jsonify({'success': True, 'message': 'OTP sent'}), 200

@app.route("/send-reset-otp", methods=['POST'])
def send_reset_otp():
    body = request.get_json() or {}
    institute = body.get('institute', '').strip()
    role = body.get('role', '').strip()
    email = body.get('email', '').strip().lower()
    admin_password = body.get('admin_password', '').strip()

    if not (institute and role and email):
        return jsonify({'success': False, 'message': 'Missing institute/role/email'}), 400

    # 🔹 Special case for teacher → check admin password
    if role == "teacher":
        expected_admin_pw = os.environ.get("ADMIN_PASSWORD", "").strip()
        if not expected_admin_pw:
            return jsonify({'success': False, 'message': 'Server not configured with ADMIN_PASSWORD'}), 500
        if admin_password != expected_admin_pw:
            return jsonify({'success': False, 'message': 'Invalid Admin Password'}), 403

    # find user doc
    user_ref = get_user_doc_ref(institute, role, email)
    exists, user_data = check_user_exists(user_ref)

    if not exists:
        return jsonify({'success': False, 'message': 'Email not found'}), 404

    # generate OTP and store
    otp = generate_otp()
    expires_at = datetime.utcnow() + timedelta(seconds=OTP_EXPIRY_SECONDS)
    otp_hashed = bcrypt.hashpw(otp.encode('utf8'), bcrypt.gensalt()).decode('utf8')

    data = {
        'otp_hashed': otp_hashed,
        'expires_at': expires_at.timestamp(),
        'created_at': datetime.utcnow().timestamp(),
        'institute': institute,
        'role': role,
        'email': email
    }
    otp_ref = otp_doc_ref(institute, role, email)
    otp_ref.set(data)

    # send email
    try:
        subject = "Kodin / Password Reset OTP"
        body_text = f"Your password reset OTP is: {otp}\n\nThis OTP is valid for {OTP_EXPIRY_SECONDS//60} minutes."
        send_email(email, subject, body_text)
    except Exception as e:
        otp_ref.delete()
        return jsonify({'success': False, 'message': f'Failed to send email: {str(e)}'}), 500

    return jsonify({'success': True, 'message': 'OTP sent'}), 200



@app.route('/verify_reset_otp', methods=['POST'])
def verify_reset_otp():
    body = request.get_json() or {}
    institute = body.get('institute', '').strip()
    role = body.get('role', '').strip()
    email_or_roll = body.get('email', '').strip().lower()
    otp = body.get('otp', '').strip()
    new_password = body.get('new_password', '').strip()

    if not (institute and role and email_or_roll and otp and new_password):
        return jsonify({'success': False, 'message': 'Missing parameters'}), 400

    otp_ref = otp_doc_ref(institute, role, email_or_roll)
    otp_doc = otp_ref.get()
    if not otp_doc.exists:
        return jsonify({'success': False, 'message': 'No OTP requested or expired'}), 400

    otp_data = otp_doc.to_dict()
    expires_ts = otp_data.get('expires_at', 0)
    if datetime.utcnow().timestamp() > expires_ts:
        otp_ref.delete()
        return jsonify({'success': False, 'message': 'OTP expired'}), 400

    otp_hashed = otp_data.get('otp_hashed')
    if not otp_hashed or not bcrypt.checkpw(otp.encode('utf8'), otp_hashed.encode('utf8')):
        return jsonify({'success': False, 'message': 'Invalid OTP'}), 400

    # ✅ Get actual Firestore doc reference
    if role == "student":
        doc_ref = firestore_client.document(f"institutes/{institute}/students/{email_or_roll}")
    elif role == "teacher":
        query = firestore_client.collection(f"institutes/{institute}/teachers").where("email", "==", email_or_roll).get()
        if not query:
            otp_ref.delete()
            return jsonify({'success': False, 'message': 'User not found'}), 404
        doc_ref = query[0].reference
    else:
        return jsonify({'success': False, 'message': 'Invalid role'}), 400

    # ✅ Use your SHA-256 helper
    hashed_pw = hash_password(new_password)

    try:
        doc_ref.update({'password': hashed_pw})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error updating password: {str(e)}'}), 500

    otp_ref.delete()
    return jsonify({'success': True, 'message': 'Password updated'}), 200


# @app.route('/verify_reset_otp', methods=['POST'])
# def verify_reset_otp():
#     body = request.get_json() or {}
#     institute = body.get('institute', '').strip()
#     role = body.get('role', '').strip()
#     email = body.get('email', '').strip().lower()
#     otp = body.get('otp', '').strip()
#     new_password = body.get('new_password', '').strip()

#     if not (institute and role and email and otp and new_password):
#         return jsonify({'success': False, 'message': 'Missing parameters'}), 400

#     otp_ref = otp_doc_ref(institute, role, email)
#     otp_doc = otp_ref.get()
#     if not otp_doc.exists:
#         return jsonify({'success': False, 'message': 'No OTP requested or expired'}), 400

#     otp_data = otp_doc.to_dict()
#     expires_ts = otp_data.get('expires_at', 0)
#     if datetime.utcnow().timestamp() > expires_ts:
#         otp_ref.delete()
#         return jsonify({'success': False, 'message': 'OTP expired'}), 400

#     otp_hashed = otp_data.get('otp_hashed')
#     if not otp_hashed or not bcrypt.checkpw(otp.encode('utf8'), otp_hashed.encode('utf8')):
#         return jsonify({'success': False, 'message': 'Invalid OTP'}), 400

#     # update user password in Firestore
#     user_ref = get_user_doc_ref(institute, role, email)
#     exists, actual_user_ref = check_user_exists(user_ref)
#     if not exists:
#         otp_ref.delete()
#         return jsonify({'success': False, 'message': 'User does not exist'}), 404

#     # Hash the new password before saving
#     hashed_pw = hash_password(new_password)
   


#     # Determine what field you used for password in signup. Common options:
#     # - 'password' (string)
#     # - 'password_hash' or 'pw_hash'
#     # Update below accordingly.
#     try:
#         actual_user_ref.update({'password': hashed_pw})
#     except Exception as e:
#         return jsonify({'success': False, 'message': f'Error updating password: {str(e)}'}), 500

#     # clean up otp doc
#     otp_ref.delete()

#     return jsonify({'success': True, 'message': 'Password updated'}), 200


@app.route("/get-requests", methods=["POST"])
def get_requests():
    try:
        data = request.json or {}
        college = data.get("college")
        faculty = data.get("faculty")
        subject = data.get("subject")

        if not all([college, faculty, subject]):
            return jsonify({"error": "Missing data"}), 400

        # Firestore collection: /college/{faculty}/{subject}/requests/students/{student_id}
        students_ref = (
            firestore_client
            .collection(college)
            .document(faculty)
            .collection(subject)
            .document("requests")
            .collection("students")
        )

        students = students_ref.stream()

        requests = []
        for doc in students:
            student_data = doc.to_dict()
            requests.append({
                "student_id": doc.id,
                "student_name": student_data.get("student_name", ""),
                "approved": student_data.get("approved", False),
                "institute": student_data.get("institute", "")
            })

        return jsonify({"requests": requests})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/join-class", methods=["POST"])
def join_class():
    try:
        data = request.json or {}
        college = data.get("college")
        faculty = data.get("faculty")
        subject = data.get("subject")
        student_id = data.get("student_id")
        student_name = data.get("student_name", "")
        print("in  join-class recieved:",data)

        if not all([college, faculty, subject, student_id]):
            return jsonify({"error": "Missing required data"}), 400

        faculty_ref = firestore_client.collection(college).document(faculty)
        faculty_ref.set({"exists": True}, merge=True)

        # ✅ Ensure subject root exists (just a dummy marker)
        subject_root_ref = faculty_ref.collection(subject).document("_meta")
        subject_root_ref.set({"exists": True}, merge=True)    
        # Request path → institute/faculty/subject/requests/student_id
        req_ref = (
            firestore_client
            .collection(college)
            .document(faculty)
            .collection(subject)
            .document("requests")
            .collection("students")
            .document(student_id)
        )

        req_ref.set({
            "student_id": student_id,
            "student_name": student_name,
            "approved": False
        }, merge=True)

        return jsonify({"message": "Request submitted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/approve-requests", methods=["POST"])
def approve_requests():
    try:
        data = request.json or {}
        college = data.get("college")
        faculty = data.get("faculty")
        subject = data.get("subject")
        approved_ids = data.get("approved_ids", [])
        print("reciveed in aprove request:",data)

        if not all([college, faculty, subject]) or not approved_ids:
            return jsonify({"error": "Missing data"}), 400

        batch = firestore_client.batch()

        for sid in approved_ids:
            req_ref = (
                firestore_client
                .collection(college)
                .document(faculty)
                .collection(subject)
                .document("requests")
                .collection("students")
                .document(sid)
            )
            batch.update(req_ref, {"approved": True})

        batch.commit()
        return jsonify({"message": "Requests approved"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route("/upload-report", methods=["POST"])
def upload_report():
    try:
        file = request.files.get("file")
        college = request.form.get("college")
        faculty = request.form.get("faculty")
        subject = request.form.get("subject")
        pdf_name = request.form.get("pdf_name")
        student_id = request.form.get("student_id")
        student_name = request.form.get("student_name", "")
        class_id = request.form.get("class")  # <-- extract classId from frontend

        if not all([file, college, faculty, subject, pdf_name, student_id, class_id]):
            return jsonify({"error": "Missing data"}), 400


        # ✅ Check if student is approved
        req_ref = (
            firestore_client
            .collection(college)
            .document(faculty)
            .collection(subject)
            .document("requests")
            .collection("students")
            .document(student_id)
        )

        req_doc = req_ref.get()
        if not req_doc.exists or not req_doc.to_dict().get("approved", False):
            return jsonify({"error": "Not approved to submit"}), 403

        # ✅ Upload report
        storage_path = f"{college}/{faculty}/{subject}/{student_id}/{class_id}/{pdf_name}.pdf"
        blob = bucket.blob(storage_path)
        blob.upload_from_file(file)

        # ✅ Ensure root docs exist (create placeholder docs if needed)
        firestore_client.collection(college).document(faculty).set({}, merge=True)
        firestore_client.collection(college).document(faculty).collection(subject).document(class_id).set({}, merge=True)

        # ✅ Now safe to write report
        # 1) Ensure root docs exist (before saving report)

        # 2) Now safe to save the actual report
        report_ref = (
            firestore_client
            .collection(college)
            .document(faculty)
            .collection(subject)
            .document(class_id)
            .collection(student_id)
            .document(pdf_name)
        )

        report_ref.set({
            "student_id": student_id,
            "student_name": student_name,
            "pdf_name": pdf_name,
            "storage_path": storage_path,
            "college": college,
            "faculty": faculty,
            "subject": subject,
            "class": class_id,
        })

        return jsonify({"message": "Upload successful", "storage_path": storage_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route("/get-reports", methods=["GET"])
def get_reports():
    college = request.args.get("college")
    faculty = request.args.get("faculty")
    subject = request.args.get("subject")
    class_id = request.args.get("class")
    faculty = unquote(faculty)
    college = unquote(college)

    if not all([college, faculty, subject, class_id]):
        return jsonify({"error": "Missing params"}), 400

    # ---- 1) Gather all report docs: class_id/<student_id>/<pdf_name>
    class_ref = (
        firestore_client
        .collection(college)
        .document(faculty)
        .collection(subject)
        .document(class_id)
    )

    reports = []
    # Each subcollection here should be a student_id
    for student_coll in class_ref.collections():
        student_id = student_coll.id
        # Each document inside is a report (e.g., pdf_name)
        for report_doc in student_coll.stream():
            data = report_doc.to_dict() or {}
            # Be defensive: ensure student_id present even if missing in doc
            data.setdefault("student_id", student_id)
            reports.append({
                "pdf_name": data.get("pdf_name"),
                "storage_path": data.get("storage_path"),
                "college": data.get("college"),
                "faculty": data.get("faculty"),
                "subject": data.get("subject"),
                "class": data.get("class"),
                "student_name": data.get("student_name"),
                "student_id": data.get("student_id"),
            })

    # ---- 2) Fetch marks and merge by student_id
    # Primary path (with subject)
    marks_doc_ref = (
        firestore_client
        .collection("marks")
        .document(college)
        .collection(faculty)
        .document(subject)
        .collection(class_id)
        .document("marks")
    )
    marks_snap = marks_doc_ref.get()
    marks_data = marks_snap.to_dict() if marks_snap.exists else {}

    # Fallback path (without subject) if you stored it that way:
    if not marks_data:
        fallback_marks_ref = (
            firestore_client
            .collection("marks")
            .document(college)
            .collection(faculty)
            .document(class_id)
            .collection("_")
            .document("marks")
        )
        fb = fallback_marks_ref.get()
        if fb.exists:
            marks_data = fb.to_dict()

    if marks_data:
        # marks_data is expected like: { "<student_id>": {"marks": <value>}, ... }
        for r in reports:
            sid = r.get("student_id")
            if sid and sid in marks_data:
                r["marks"] = marks_data[sid].get("marks", "")

    return jsonify({"reports": reports})




@app.route("/generate_marks_excel", methods=["POST"])
def generate_marks_excel():
    try:
        data = request.json or {}
        college = data.get("college")
        faculty = data.get("faculty")
        subject = data.get("subject")

        if not all([college, faculty, subject]):
            return jsonify({"error": "Missing parameters"}), 400

        # Step 1: Get all class IDs under the subject
        subject_ref = (
            firestore_client
            .collection("marks")
            .document(college)
            .collection(faculty)
            .document(subject)
        )

        class_ids = sorted([cls.id for cls in subject_ref.collections()])
        
        print("Class IDs found:", class_ids)

        # Step 2: Prepare student data
        student_data = {}
        for class_id in class_ids:
            marks_doc_ref = (
                firestore_client
                .collection("marks")
                .document(college)
                .collection(faculty)
                .document(subject)
                .collection(class_id)
                .document("marks")
            )
            marks_doc = marks_doc_ref.get()
            if marks_doc.exists:
                marks_dict = marks_doc.to_dict()
                for student_id, info in marks_dict.items():
                    student_name = info.get("name", "")
                    marks = info.get("marks", "")

                    if student_id not in student_data:
                        student_data[student_id] = {"name": student_name}

                    # Store marks under the specific class ID column
                    student_data[student_id][class_id] = marks

        # Step 3: Build DataFrame
        sorted_student_ids = sorted(student_data.keys())
        columns = ["StudentID", "StudentName"] + class_ids
        rows = []

        for sid in sorted_student_ids:
            row = [sid, student_data[sid].get("name", "")]
            for cid in class_ids:
                row.append(student_data[sid].get(cid, ""))
            rows.append(row)

        df = pd.DataFrame(rows, columns=columns)
        print("Final DataFrame rows:", rows)

        # Step 4: Save to in-memory buffer
        output = BytesIO()
        df.to_excel(output, index=False)
        output.seek(0)

        return send_file(
            output,
            as_attachment=True,
            download_name=f"{subject}_marks.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    except Exception as e:
        print("Error generating Excel:", e)
        return jsonify({"error": str(e)}), 500




@app.route("/get-my-reports", methods=["GET"])
def get_my_reports():
    college = request.args.get("college")
    faculty = request.args.get("faculty")
    subject = request.args.get("subject")
    student_id = request.args.get("student_id")  # primary key now

    if not all([college, faculty, subject, student_id]):
        return jsonify({"error": "Missing params"}), 400

    subject_ref = (
        firestore_client
        .collection(college)
        .document(faculty)
        .collection(subject)
    )

    reports = []

    # ✅ Loop all classes for this subject
    class_docs = subject_ref.stream()
    for class_doc in class_docs:
        class_id = class_doc.id
        class_doc_ref = subject_ref.document(class_id)

        # ✅ Fetch all reports from the student's subcollection
        student_coll_ref = class_doc_ref.collection(student_id)
        for report_doc in student_coll_ref.stream():
            data = report_doc.to_dict() or {}
            reports.append({
                "pdf_name": data.get("pdf_name"),
                "storage_path": data.get("storage_path"),
                "college": data.get("college"),
                "faculty": data.get("faculty"),
                "subject": data.get("subject"),
                "class": data.get("class"),
                "marks": 0  # default marks, will be updated if found
            })

        # ✅ Fetch marks for this class
        marks_doc_ref = (
            firestore_client
            .collection("marks")
            .document(college)
            .collection(faculty)
            .document(subject)
            .collection(class_id)
            .document("marks")
        )
        marks_snap = marks_doc_ref.get()
        marks_data = marks_snap.to_dict() if marks_snap.exists else {}

        # Fallback path without subject
        if not marks_data:
            fallback_marks_ref = (
                firestore_client
                .collection("marks")
                .document(college)
                .collection(faculty)
                .document(class_id)
                .collection("_")
                .document("marks")
            )
            fb = fallback_marks_ref.get()
            if fb.exists:
                marks_data = fb.to_dict()

        # ✅ Update marks if found
        if marks_data and student_id in marks_data:
            for r in reports:
                if r["class"] == class_id:
                    r["marks"] = marks_data[student_id].get("marks", 0)

    return jsonify({"reports": reports})





@app.route("/merge-reports", methods=["POST"])
def merge_reports():
    try:
        data = request.json
        storage_paths = data.get("storage_paths")
        output_name = data.get("output_name")
        college = data.get("college")
        faculty = data.get("faculty")
        subject = data.get("subject")
        student_id = data.get("student_id")   # ✅ fixed
        student_name = data.get("student_name", "")  # optional, if frontend sends it

        if not all([storage_paths, output_name, college, faculty, subject, student_id]):
            return jsonify({"error": "Missing data"}), 400

        merger = PdfMerger()

        for path in storage_paths:
            blob = bucket.blob(path)
            pdf_data = blob.download_as_bytes()
            merger.append(BytesIO(pdf_data))

        # ✅ Use NamedTemporaryFile safely
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            merger.write(tmp_file)
            tmp_file_path = tmp_file.name

        # ✅ Upload merged PDF back to Storage
        output_path = f"{college}/{faculty}/{subject}/{student_id}/{output_name}.pdf"
        out_blob = bucket.blob(output_path)
        out_blob.upload_from_filename(tmp_file_path)

        signed_url = out_blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=15),
            method="GET"
        )

        # ✅ Cleanup local temp file
        os.remove(tmp_file_path)

        # ✅ Save a record in Firestore (optional but useful for tracking)
        report_ref = (
            firestore_client
            .collection(college)
            .document(faculty)
            .collection(subject)
            .document("merged_reports")
            .collection(student_id)
            .document(output_name)
        )

        report_ref.set({
            "student_id": student_id,
            "student_name": student_name,
            "pdf_name": output_name,
            "storage_path": output_path,
            "merged": True,
            "college": college,
            "faculty": faculty,
            "subject": subject
        }, merge=True)

        return jsonify({
            "message": "Merged successfully",
            "storage_path": output_path,
            "signed_url": signed_url
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500



# ✅ Get fresh signed URL when user clicks download
@app.route("/get-signed-url", methods=["POST"])
def get_signed_url():
    data = request.json
    storage_path = data.get("storage_path")

    if not storage_path:
        return jsonify({"error": "Missing storage_path"}), 400

    blob = bucket.blob(storage_path)
    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        method="GET"
    )

    return jsonify({"signed_url": signed_url})


@app.route("/get-view-url", methods=["POST"])
def get_view_url():
    data = request.json
    storage_path = data.get("storage_path")

    if not storage_path:
        return jsonify({"error": "Missing storage_path"}), 400

    blob = bucket.blob(storage_path)
    signed_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        method="GET",
        response_disposition="inline",          # 👈 key for viewing
        response_type="application/pdf"         # 👈 force PDF type
    )

    return jsonify({"signed_url": signed_url})

# Initialize Firestore (do this once at app startup)
# cred = credentials.Certificate("serviceAccountKey.json")
# firebase_admin.initialize_app(cred)
# db = firestore.client()

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

@app.route("/signup", methods=["POST"])
def signup():
    try:
        data = request.get_json()
        institute = data.get("institute")
        role = data.get("role")
        print("recived data in signup:",data)

        if not institute or not role:
            return jsonify({"success": False, "message": "Institute and role are required"}), 400

        collection_path = f"institutes/{institute}/{role}s"

        if role == "student":
            roll_number = data.get("roll_number")
            name = data.get("name")
            email = data.get("email")
            password = data.get("password")

            if not all([roll_number, name, email, password]):
                return jsonify({"success": False, "message": "Missing student details"}), 400

            doc_ref = firestore_client.collection(collection_path).document(roll_number)
            if doc_ref.get().exists:
                return jsonify({"success": False, "message": "Student already exists"}), 400

            doc_ref.set({
                "student_id": roll_number,
                "name": name,
                "email": email,
                "password": hash_password(password)
            })

        elif role == "teacher":
            email = data.get("email")
            password = data.get("password")

            if not all([email, password]):
                return jsonify({"success": False, "message": "Missing teacher details"}), 400

            query = firestore_client.collection(collection_path).where("email", "==", email).get()
            if query:
                return jsonify({"success": False, "message": "Teacher already exists"}), 400

            firestore_client.collection(collection_path).add({
                "email": email,
                "password": hash_password(password)
            })

        else:
            return jsonify({"success": False, "message": "Invalid role"}), 400

        return jsonify({"success": True, "message": f"{role.capitalize()} signup successful"})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    



# ✅ Firestore client assumed to be initialized
# from google.cloud import firestore
# firestore_client = firestore.Client()

# def hash_password(password):
#     import hashlib
#     return hashlib.sha256(password.encode()).hexdigest()


@app.route("/batch_signup", methods=["POST"])
def batch_signup():
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "message": "No file uploaded"}), 400
        
        file = request.files["file"]
        filename = secure_filename(file.filename)
        
        if not filename.endswith((".xlsx", ".xls")):
            return jsonify({"success": False, "message": "Only Excel files are supported"}), 400
        
        df = pd.read_excel(file)

        # ✅ Required columns
        required_columns = {"institute", "role", "email"}
        if not required_columns.issubset(df.columns):
            return jsonify({
                "success": False,
                "message": f"Missing required columns. Required: {required_columns} (+ name & roll_number for students)"
            }), 400

        result_data = []
        errors = []

        for _, row in df.iterrows():
            try:
                institute = str(row["institute"]).strip()
                role = str(row["role"]).strip().lower()
                email = str(row["email"]).strip().lower() if pd.notna(row["email"]) else ""
                name = str(row["name"]).strip() if "name" in df.columns and pd.notna(row["name"]) else ""

                # ✅ Only convert roll_number safely for students
                roll_number = ""
                if role == "student" and "roll_number" in df.columns and pd.notna(row["roll_number"]):
                    roll_number = str(row["roll_number"]).strip()
                    # Remove trailing .0 if Excel stored as float
                    if roll_number.endswith(".0"):
                        roll_number = roll_number[:-2]

                if not institute or not role:
                    errors.append(f"Missing institute/role for row: {row.to_dict()}")
                    continue

                collection_path = f"institutes/{institute}/{role}s"

                # === STUDENT SIGNUP ===
                if role == "student":
                    if not all([roll_number, name, email]):
                        errors.append(f"Missing student details: {row.to_dict()}")
                        continue

                    password = f"{roll_number}@123"
                    doc_ref = firestore_client.collection(collection_path).document(roll_number)
                    if doc_ref.get().exists:
                        errors.append(f"Student already exists: {roll_number}")
                        continue
                    
                    doc_ref.set({
                        "student_id": roll_number,
                        "name": name,
                        "email": email,
                        "password": hash_password(password)
                    })
                    result_data.append({"email": email, "username": roll_number, "password": password})

                # === TEACHER SIGNUP ===
                elif role == "teacher":
                    if not email:
                        errors.append(f"Missing teacher email: {row.to_dict()}")
                        continue
                    
                    password = f"{email[:5]}@123"
                    query = firestore_client.collection(collection_path).where("email", "==", email).get()
                    if query:
                        errors.append(f"Teacher already exists: {email}")
                        continue

                    firestore_client.collection(collection_path).add({
                        "email": email,
                        "password": hash_password(password)
                    })
                    result_data.append({"email": email, "username": email, "password": password})

                else:
                    errors.append(f"Invalid role '{role}' for row: {row.to_dict()}")

            except Exception as inner_e:
                errors.append(f"Error processing row {row.to_dict()}: {str(inner_e)}")

        # ✅ Generate result Excel file
        output = BytesIO()
        result_df = pd.DataFrame(result_data)
        result_df.to_excel(output, index=False)
        output.seek(0)

        response = send_file(
            output,
            download_name="batch_signup_results.xlsx",
            as_attachment=True,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        response.headers["X-Errors"] = str(errors) if errors else "None"
        return response

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500




@app.route("/login", methods=["POST"])
def login():
    data = request.json
    institute = data.get("institute")
    role = data.get("role")
    email_or_roll = data.get("email_or_roll")
    password = data.get("password")

    collection_path = f"institutes/{institute}/{role}s"
    password_hash = hash_password(password)

    if role == "student":
        doc = firestore_client.collection(collection_path).document(email_or_roll).get()
        if not doc.exists:
            return jsonify({"success": False, "message": "Student not found"})
        student_data = doc.to_dict()
        if student_data["password"] == password_hash:
            # ✅ include student_name
            return jsonify({"success": True, "data": {"student_id": email_or_roll, "name": student_data["name"], "institute": institute}})
        else:
            return jsonify({"success": False, "message": "Incorrect password"})

    elif role == "teacher":
        query = firestore_client.collection(collection_path).where("email", "==", email_or_roll).get()
        if not query:
            return jsonify({"success": False, "message": "Teacher not found"})
        teacher_data = query[0].to_dict()
        if teacher_data["password"] == password_hash:
            return jsonify({"success": True, "data": {"email": email_or_roll, "institute": institute}})
        else:
            return jsonify({"success": False, "message": "Incorrect password"})


# Example usage:
# signup_user("NIT_Hamirpur", "student", roll_number="CS101", name="Raghvendra", email="raghu@example.com", password="12345")
# signup_user("NIT_Hamirpur", "teacher", email="teacher@example.com", password="abcd")

# login_user("NIT_Hamirpur", "student", "CS101", "12345")
# login_user("NIT_Hamirpur", "teacher", "teacher@example.com", "abcd")



# Teacher posts a question
@app.route("/post_question", methods=["POST"])
def post_question():
    try:
        data = request.json or {}
        question = data.get("question")
        institute = data.get("institute")
        faculty = data.get("faculty")
        subject = data.get("subject")
        class_id = data.get("classId")   # new level

        if not all([question, institute, faculty, subject, class_id]):
            return jsonify({"error": "Missing fields"}), 400

        # Path: Questions/{institute}/{faculty}/{subject}/{class_id}/current_question
        doc_ref = (
            firestore_client.collection("Questions")
            .document(institute)
            .collection(faculty)
            .document(subject)
            .collection(class_id)
            .document("current_question")
        )

        # Ensure root docs exist (create placeholder docs if needed)
        firestore_client.collection("Questions").document(institute).set({}, merge=True)
        firestore_client.collection("Questions").document(institute).collection(faculty).document(subject).set({}, merge=True)

        # Save the actual question
        doc_ref.set({
            "question": question,
            "timestamp": firestore.SERVER_TIMESTAMP
        }, merge=True)

        return jsonify({"message": "Question posted successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Student fetches the question
@app.route("/get_question", methods=["GET"])
def get_question():
    institute = request.args.get("institute")
    faculty = request.args.get("faculty")   # faculty email
    subject = request.args.get("subject")
    class_id = request.args.get("class_id")

    if not all([institute, faculty, subject, class_id]):
        return jsonify({"error": "Missing fields"}), 400

    # Path: Questions/{institute}/{faculty}/{subject}/{class_id}/question
    doc_ref = (
        firestore_client.collection("Questions")
        .document(institute)
        .collection(faculty)
        .document(subject)
        .collection(class_id)
        .document("current_question")
    )

    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({"error": "No question found"}), 404

    question = doc.to_dict().get("question", "")
    return jsonify({"question": question}), 200



@app.route("/update-marks", methods=["POST"])
def update_marks():
    try:
        data = request.get_json() or {}
        college = data.get("college")
        faculty = data.get("faculty")
        subject = data.get("subject")
        class_id = data.get("classId")
        marks_data = data.get("marksData", [])

        if not all([college, faculty, subject, class_id]) or not marks_data:
            return jsonify({"error": "Missing required fields"}), 400

        # Firestore document for storing marks
        marks_doc_ref = (
            firestore_client
            .collection("marks")
            .document(college)
            .collection(faculty)
            .document(subject)
            .collection(class_id)
            .document("marks")
        )

        updates = {}
        for entry in marks_data:
            student_id = entry.get("student_id")
            student_name = entry.get("student_name")  # <-- include name
            marks = entry.get("marks")
            if student_id:
                updates[student_id] = {
                    "name": student_name or "",  # store name
                    "marks": marks
                }

        if updates:
            marks_doc_ref.set(updates, merge=True)

        return jsonify({"message": "Marks updated successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500




@app.route("/institutes", methods=["GET"])
def get_institutes():
    try:
        # Get all documents in 'institutes' collection
        docs = firestore_client.collection("institutes").get()
        # Each document ID is the institute name (assuming you store institutes as doc IDs)
        institutes = [doc.id for doc in docs]
        return jsonify({"institutes": institutes})
    except Exception as e:
        print("Error fetching institutes:", e)
        return jsonify({"institutes": [], "error": str(e)}), 500

# -------------------------------
# 1. Get all faculties for an institute
# -------------------------------
@app.route("/get-faculties/<institute_name>", methods=["GET"])
def get_faculties(institute_name):
    try:
        # Faculties are stored as subcollections under:
        # Questions/{institute_name}
        faculties_ref = (
            firestore_client
            .collection("Questions")
            .document(institute_name)
            .collections()
        )

        faculties = []
        for col in faculties_ref:
            faculties.append(col.id)
            print("Found faculty:", col.id)

        return jsonify({"faculties": faculties})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -------------------------------
# 2. Get all subjects for a faculty
# -------------------------------



@app.route("/get-subjects/<institute_name>/<faculty_email>", methods=["GET"])
def get_subjects(institute_name, faculty_email):
    faculty_email = unquote(faculty_email)
    institute_name = unquote(institute_name)
    try:
        subjects = []

        # Path: Questions/{institute}/{faculty_email}/{subject}
        faculty_ref = (
            firestore_client
            .collection("Questions")
            .document(institute_name)
            .collection(faculty_email)
        )

        # Each subject is a subcollection name
        for subj in faculty_ref.list_documents():
            subjects.append(subj.id)
            print("Found subject:", subj.id)

        return jsonify({"subjects": subjects}), 200

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": str(e)}), 500





@app.route("/get-classes/<institute_name>/<faculty_email>/<subject>", methods=["GET"])
def get_classes(institute_name, faculty_email, subject):
    faculty_email = unquote(faculty_email)
    subject = unquote(subject)
    try:
        classes = []

        # Path: Questions/{institute}/{faculty_email}/{subject}
        subject_ref = (
            firestore_client
            .collection("Questions")
            .document(institute_name)
            .collection(faculty_email)
            .document(subject)
        )

        # Each class is a subcollection name
        for class_doc in subject_ref.collections():
            classes.append(class_doc.id)
            print("Found class:", class_doc.id)

        return jsonify({"classes": classes}), 200

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": str(e)}), 500


@app.route("/get-class-marks", methods=["GET"])
def get_class_marks():
    try:
        college = request.args.get("college")
        faculty = request.args.get("faculty")
        subject = request.args.get("subject")
        class_id = request.args.get("classId")

        ref_path = f"marks/{college}/{faculty}/{subject}/{class_id}"
        marks_data = firestore_client(ref_path).get() or {}
        return jsonify({"marks": marks_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500




# @app.route("/copilot", methods=["POST"])
# def copilot():
#     data = request.get_json()
#     prompt = data.get("prompt", "")

#     if not prompt:
#         return jsonify({"error": "Prompt is required"}), 400

#     inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
#     with torch.no_grad():
#         outputs = model.generate(
#             **inputs,
#             max_new_tokens=256,
#             do_sample=False,
#             eos_token_id=tokenizer.eos_token_id,
#             early_stopping=True,
#             pad_token_id=tokenizer.eos_token_id
#         )
#     response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
#     return jsonify({"response": response_text})

# # Start the server and expose via ngrok
# public_url = ngrok.connect(5000)
# print(" * ngrok tunnel available at:", public_url)

# app.run(port=5000)

# print(app.url_map)

# ✅ 5️⃣ Run server
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5005, debug=True)
    

    


