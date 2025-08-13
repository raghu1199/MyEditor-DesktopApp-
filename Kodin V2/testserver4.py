from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import storage, firestore
from datetime import timedelta
import os
from PyPDF2 import PdfMerger  # pip install PyPDF2
import tempfile
from io import BytesIO



# from transformers import AutoTokenizer, AutoModelForCausalLM
# import torch


# # ✅ 1️⃣ Paths
# BASE_MODEL = "bigcode/starcoderbase-3b"   # Only needed for tokenizer
# CHECKPOINT = "./output/checkpoint-6375"   # Your fine-tuned checkpoint path
# os.environ["HF_TOKEN"] = "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"  # replace with your token

# offload_dir="./offload"
# os.makedirs(offload_dir, exist_ok=True)

# # ✅ 2️⃣ Load tokenizer
# print("Loading tokenizer...")
# tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

# # ✅ 3️⃣ Load fine-tuned model
# print("Loading fine-tuned model...")
# model = AutoModelForCausalLM.from_pretrained(
#     CHECKPOINT,
#     device_map={"": "cpu"},
#     torch_dtype=torch.float16,
#     offload_folder=offload_dir,
#     token=os.environ["HF_TOKEN"] 
# )

# model.eval()



os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "C:/Users/Raghvendra/Desktop/MyEditorServer/editor.json"

app = Flask(__name__)
CORS(app)
firestore_client = firestore.Client()
storage_client = storage.Client()
bucket = storage_client.bucket("editor-6e2cd.firebasestorage.app")

@app.route("/upload-report", methods=["POST"])
def upload_report():
    file = request.files.get("file")
    college = request.form.get("college")
    faculty = request.form.get("faculty")
    subject = request.form.get("subject")
    class_id = request.form.get("class")
    pdf_name = request.form.get("pdf_name")
    student_name = request.form.get("student_name")
    student_id = request.form.get("student_id")

    if not all([file, college, faculty, subject, class_id, pdf_name, student_name, student_id]):
        return jsonify({"error": "Missing data"}), 400

    # ✅ Always create or update the class doc
    class_doc_ref = (
        firestore_client
        .collection(college)
        .document(faculty)
        .collection(subject)
        .document(class_id)
    )
    class_doc_ref.set({"_created": True}, merge=True)

    # ✅ Create student subcollection
    student_doc_ref = class_doc_ref.collection(student_id).document(pdf_name)

    storage_path = f"{college}/{faculty}/{subject}/{class_id}/{student_id}/{pdf_name}.pdf"
    blob = bucket.blob(storage_path)
    blob.upload_from_file(file)

    student_doc_ref.set({
        "college": college,
        "faculty": faculty,
        "subject": subject,
        "class": class_id,
        "pdf_name": pdf_name,
        "storage_path": storage_path,
        "student_name": student_name,
        "student_id": student_id
    })

    return jsonify({
        "message": "Upload successful",
        "storage_path": storage_path
    })


@app.route("/get-reports", methods=["GET"])
def get_reports():
    college = request.args.get("college")
    faculty = request.args.get("faculty")
    subject = request.args.get("subject")
    class_id = request.args.get("class")

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


# @app.route("/get-reports", methods=["GET"])
# def get_reports():
#     college = request.args.get("college")
#     faculty = request.args.get("faculty")
#     subject = request.args.get("subject")
#     class_id = request.args.get("class")

#     if not all([college, faculty, subject, class_id]):
#         return jsonify({"error": "Missing params"}), 400

#     class_ref = (
#         firestore_client
#         .collection(college)
#         .document(faculty)
#         .collection(subject)
#         .document(class_id)
#     )

#     reports = []

#     # Loop through student_id collections
#     for student_collection in class_ref.collections():
#         for report_doc in student_collection.stream():
#             data = report_doc.to_dict()
#             reports.append({
#                 "pdf_name": data.get("pdf_name"),
#                 "storage_path": data.get("storage_path"),
#                 "college": data.get("college"),
#                 "faculty": data.get("faculty"),
#                 "subject": data.get("subject"),
#                 "class": data.get("class"),
#                 "student_name": data.get("student_name"),
#                 "student_id": data.get("student_id")
#             })

#     return jsonify({"reports": reports})




# @app.route("/get-reports", methods=["GET"])
# def get_reports():
#     college = request.args.get("college")
#     faculty = request.args.get("faculty")
#     subject = request.args.get("subject")
#     class_id = request.args.get("class")

#     if not all([college, faculty, subject, class_id]):
#         return jsonify({"error": "Missing params"}), 400

#     class_ref = (
#         firestore_client
#         .collection(college)
#         .document(faculty)
#         .collection(subject)
#         .document(class_id)
#     )

#     pdf_collections = class_ref.collections()
#     reports = []

#     for pdf_collection in pdf_collections:
#         doc = pdf_collection.document("file").get()
#         if doc.exists:
#             data = doc.to_dict()
#             report_info = {
#                 "pdf_name": data.get("pdf_name"),
#                 "storage_path": data.get("storage_path"),
#                 "college": data.get("college"),
#                 "faculty": data.get("faculty"),
#                 "subject": data.get("subject"),
#                 "class": data.get("class"),
#                 "student_name": data.get("student_name"),  # ✅ Added
#                 "student_id": data.get("student_id")       # ✅ Added
#             }
#             reports.append(report_info)

#     return jsonify({"reports": reports})


# ✅ Get reports: only metadata, NO signed URLs
# @app.route("/get-reports", methods=["GET"])
# def get_reports():
#     college = request.args.get("college")
#     faculty = request.args.get("faculty")
#     subject = request.args.get("subject")
#     class_id = request.args.get("class")

#     if not all([college, faculty, subject, class_id]):
#         return jsonify({"error": "Missing params"}), 400

#     class_ref = (
#         firestore_client
#         .collection(college)
#         .document(faculty)
#         .collection(subject)
#         .document(class_id)
#     )

#     pdf_collections = class_ref.collections()
#     reports = []

#     for pdf_collection in pdf_collections:
#         pdf_name = pdf_collection.id
#         doc = pdf_collection.document("file").get()
#         if doc.exists:
#             data = doc.to_dict()
#             print("doc:",doc)
#             report_info = {
#                 "pdf_name": data["pdf_name"],
#                 "storage_path": data["storage_path"],
#                 "college": data["college"],
#                 "faculty": data["faculty"],
#                 "subject": data["subject"],
#                 "class": data["class"]
#             }
#             reports.append(report_info)

#     return jsonify({"reports": reports})


@app.route("/get-my-reports", methods=["GET"])
def get_my_reports():
    college = request.args.get("college")
    faculty = request.args.get("faculty")
    subject = request.args.get("subject")
    student_name = request.args.get("student_name")

    if not all([college, faculty, subject, student_name]):
        return jsonify({"error": "Missing params"}), 400

    subject_ref = (
        firestore_client
        .collection(college)
        .document(faculty)
        .collection(subject)
    )

    reports = []

    # ✅ Loop all class docs
    class_docs = subject_ref.stream()

    for class_doc in class_docs:
        class_id = class_doc.id

        # ✅ For each class doc, loop all pdf_name collections
        class_doc_ref = subject_ref.document(class_id)
        pdf_collections = class_doc_ref.collections()

        for pdf_collection in pdf_collections:
            pdf_name = pdf_collection.id
            file_doc = pdf_collection.document("file").get()
            if file_doc.exists:
                data = file_doc.to_dict()
                if data.get("student_name") == student_name:
                    reports.append({
                        "pdf_name": data.get("pdf_name"),
                        "storage_path": data.get("storage_path"),
                        "college": college,
                        "faculty": faculty,
                        "subject": subject,
                        "class": class_id
                    })

    return jsonify({"reports": reports})


@app.route("/debug-classes", methods=["GET"])
def debug_classes():
    college = request.args.get("college")
    faculty = request.args.get("faculty")
    subject = request.args.get("subject")

    subject_ref = firestore_client.collection(college).document(faculty).collection(subject)
    class_docs = subject_ref.stream()

    out = []
    for doc in class_docs:
        out.append(doc.id)

    return jsonify({"classes": out})





@app.route("/merge-reports", methods=["POST"])
def merge_reports():
    data = request.json
    storage_paths = data.get("storage_paths")
    output_name = data.get("output_name")
    college = data.get("college")
    faculty = data.get("faculty")
    subject = data.get("subject")
    student_name = data.get("student_name")

    if not all([storage_paths, output_name, college, faculty, subject, student_name]):
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
    output_path = f"{college}/{faculty}/{subject}/{student_name}/{output_name}.pdf"
    out_blob = bucket.blob(output_path)
    out_blob.upload_from_filename(tmp_file_path)

    signed_url = out_blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        method="GET"
    )

    # ✅ Cleanup local temp file
    os.remove(tmp_file_path)

    return jsonify({
        "message": "Merged successfully",
        "signed_url": signed_url
    })




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

# ✅ User signup (same)
@app.route("/signup", methods=["POST"])
def signup():
    data = request.json
    name = data.get("name")
    password = data.get("password")
    role = data.get("role")
    institute = data.get("institute")

    if not all([name, password, role, institute]):
        return jsonify({"error": "Missing fields"}), 400

    role = role.lower()
    if role not in ["teacher", "student"]:
        return jsonify({"error": "Invalid role"}), 400

    collection_path = f"institutes/{institute}/{role}s"
    user_ref = firestore_client.collection(collection_path).document(name)

    if user_ref.get().exists:
        return jsonify({"error": "User already exists"}), 400

    user_ref.set({
        "name": name,
        "password": password,
        "role": role,
        "institute": institute
    })

    return jsonify({"message": "Signup successful"}), 200

# ✅ User login (same)
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    name = data.get("name")
    password = data.get("password")
    role = data.get("role")
    institute = data.get("institute")

    if not all([name, password, role, institute]):
        return jsonify({"error": "Missing fields"}), 400

    role = role.lower()
    if role not in ["teacher", "student"]:
        return jsonify({"error": "Invalid role"}), 400

    collection_path = f"institutes/{institute}/{role}s"
    user_ref = firestore_client.collection(collection_path).document(name)
    doc = user_ref.get()

    if not doc.exists:
        return jsonify({"error": "User not found"}), 404

    user_data = doc.to_dict()
    if user_data["password"] != password:
        return jsonify({"error": "Incorrect password"}), 401

    return jsonify({"message": "Login successful"}), 200


# Teacher posts a question
@app.route("/post_question", methods=["POST"])
def post_question():
    data = request.json
    question = data.get("question")
    institute = data.get("institute")
    faculty = data.get("faculty")
    subject = data.get("subject")

    if not all([question, institute, faculty, subject]):
        return jsonify({"error": "Missing fields"}), 400

    # New path: Questions/institutes/{institute}/faculties/{faculty}/subjects/{subject}
    doc_ref = (
        firestore_client.collection("Questions")
        .document("institutes")
        .collection(institute)
        .document("faculties")
        .collection(faculty)
        .document("subjects")
        .collection(subject)
        .document("current_question")
    )

    doc_ref.set({"question": question}, merge=True)

    return jsonify({"message": "Question posted"}), 200


# Student fetches the question
@app.route("/get_question", methods=["GET"])
def get_question():
    institute = request.args.get("institute")
    faculty = request.args.get("faculty")
    subject = request.args.get("subject")

    if not all([institute, faculty, subject]):
        return jsonify({"error": "Missing fields"}), 400

    doc_ref = (
        firestore_client.collection("Questions")
        .document("institutes")
        .collection(institute)
        .document("faculties")
        .collection(faculty)
        .document("subjects")
        .collection(subject)
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
        data = request.get_json()
        college = data.get("college")
        faculty = data.get("faculty")
        subject = data.get("subject")
        class_id = data.get("classId")
        marks_data = data.get("marksData", [])

        if not all([college, faculty, subject, class_id]) or not marks_data:
            return jsonify({"error": "Missing required fields"}), 400

        # ✅ Create the bottom-most doc to ensure hierarchy exists
        class_doc_ref = (
            firestore_client
            .collection("marks")
            .document(college)
            .collection(faculty)
            .document(subject)
            .collection(class_id)
            .document("_meta")
        )
        class_doc_ref.set({"_created": True}, merge=True)

        # ✅ Now target the actual marks document
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
            marks = entry.get("marks")
            if student_id is not None:
                updates[student_id] = {"marks": marks}

        if updates:
            marks_doc_ref.set(updates, merge=True)

        return jsonify({"message": "Marks updated successfully"}), 200

    except Exception as e:
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


# # ✅ 4️⃣ Flask route
# @app.route('/copilot', methods=['POST'])
# def copilot():
#     data = request.get_json()
#     instruction = data.get("prompt", "").strip()
    
#     if not instruction:
#         return jsonify({"error": "Missing prompt"}), 400

#     # Build prompt in tested format
#     prompt = (
#         "### System:\n"
#         "You are a tutor. Give responses as a tutor. "
#         "Do not give full code solutions — only partial solutions, hints, or small examples.\n\n"
#         f"### Instruction: {instruction}"
#     )

#     try:
#         # Tokenize
#         inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

#         # Generate
#         with torch.no_grad():
#             outputs = model.generate(
#                 **inputs,
#                 max_new_tokens=100,
#                 do_sample=True,
#                 top_p=0.9,
#                 temperature=0.7
#             )

#         # Decode
#         response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
#         trimmed_response = response_text[len(prompt):].strip()

#         return jsonify({"response": trimmed_response})

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# ✅ 5️⃣ Run server
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5005)


