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
import time,re
from datetime import datetime, timedelta
from collections import defaultdict
import redis
import json

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "C:/Users/Raghvendra/Desktop/MyEditorServer/quizeditor1.json"
# os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/var/www/myflaskapp/editor.json"


app = Flask(__name__)
CORS(app)
firestore_client = firestore.Client(
    project="editor2-acad2",
    database="db77"
)
storage_client = storage.Client()
bucket = storage_client.bucket("editor2-acad2.firebasestorage.app")



@app.route("/home")
def home():
    return jsonify({"status": "success", "message": "quiz server Flask + Gunicorn + Nginx working!"})





@app.route("/save-quiz", methods=["POST"])
def save_quiz():
    try:
        data = request.json
        institute = data.get("institute")
        faculty_id = data.get("facultyId")
        subject = data.get("subject")
        quiz_name = data.get("quizName")
        questions = data.get("questions", [])

        if not all([institute, faculty_id, subject, quiz_name, questions]):
            return jsonify({"error": "Missing required fields"}), 400

        # ✅ Generate quiz_id using quiz name + timestamp
        # timestamp = int(time.time() * 1000)
        quiz_id = quiz_name

        # ✅ Build Firestore path: quizzes/{institute}/{faculty}/{subject}/{quiz_id}
        
        quiz_ref = (
            firestore_client.collection("quizzes")
            .document(institute)
            .collection(faculty_id)
            .document(subject)
            .collection("quizList")
            .document(quiz_id)
        )

        # ✅ Save quiz data with merge=True (safe upsert)
        quiz_ref.set({
            "quizId": quiz_id,
            "quizName": quiz_name,
            "facultyId": faculty_id,
            "subject": subject,
            "questions": questions,
            "createdAt": firestore.SERVER_TIMESTAMP
        }, merge=True)

        return jsonify({"message": "Quiz saved successfully", "quizId": quiz_id}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get-quizzes", methods=["GET"])
def get_quizzes():
    institute = request.args.get("college")
    faculty_id = request.args.get("faculty")
    subject = request.args.get("subject")

    if not all([institute, faculty_id, subject]):
        return jsonify({"error": "Missing required parameters"}), 400

    try:
        # Reference to the quizzes under this faculty/subject/institute
        quizzes_ref = (
            firestore_client.collection("quizzes")
            .document(institute)
            .collection(faculty_id)
            .document(subject)
            .collection("quizList")
        )

        quizzes_docs = quizzes_ref.stream()

        quizzes = []
        for doc in quizzes_docs:
            data = doc.to_dict()
            quizzes.append({
                "quizId": doc.id,
                "quizName": data.get("quizName"),
                "createdAt": data.get("createdAt")
            })

        return jsonify({"quizzes": quizzes}), 200

    except Exception as e:
        print("Error fetching quizzes:", e)
        return jsonify({"error": "Server error fetching quizzes"}), 500    


@app.route("/get-quiz", methods=["GET"])
def get_quiz():
    """
    Fetch a quiz for a student based on institute, faculty, subject, and quizName.
    """
    institute = request.args.get("college")
    faculty_id = request.args.get("faculty")
    subject = request.args.get("subject")
    quiz_name = request.args.get("quizName")

    if not (institute and faculty_id and subject and quiz_name):
        return jsonify({"error": "Missing required parameters"}), 400

    quiz_collection = (
        firestore_client.collection("quizzes")
          .document(institute)
          .collection(faculty_id)
          .document(subject)
          .collection("quizList")
    )

    # Query for quiz with matching quizName
    query = quiz_collection.where("quizName", "==", quiz_name).limit(1).stream()
    quiz_doc = next(query, None)

    if not quiz_doc:
        return jsonify({"error": "Quiz not found"}), 404

    quiz_data = quiz_doc.to_dict()
    return jsonify({
        "quizId": quiz_doc.id,
        "quizName": quiz_data.get("quizName"),
        "questions": quiz_data.get("questions", [])
    }), 200


@app.route("/submit-quiz", methods=["POST"])
def submit_quiz():
    data = request.json
    required_fields = ["studentId", "studentName", "institute", "facultyId", "subject", "quizId", "answers"]

    # Check all required fields
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400

    student_id = data["studentId"]
    student_name = data["studentName"]
    institute = data["institute"]
    faculty_id = data["facultyId"]
    subject = data["subject"]
    quiz_id = data["quizId"]
    answers = data["answers"]

    # Firestore path: /submissions/{institute}/{facultyId}/{subject}/{quizId}/{studentId}
    quiz_doc_ref = (
    firestore_client.collection("submissions")
    .document(institute)
    .collection(faculty_id)
    .document(subject)
    .collection("quizList")
    .document(quiz_id)
    )
    quiz_doc_ref.set({
        "quizId": quiz_id,
        "quizName": data.get("quizName", quiz_id)
    }, merge=True)

    submission_ref = quiz_doc_ref.collection("studentSubmissions").document(student_id)
    submission_ref.set({
        "studentId": student_id,
        "studentName": student_name,
        "quizId": quiz_id,
        "quizName": data.get("quizName", quiz_id),
        "answers": answers,
        "submittedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)

    return jsonify({"message": "Quiz submitted successfully"}), 200


 

@app.route("/evaluate-quiz", methods=["POST"])
def evaluate_quiz():
    try:
        data = request.json or {}
        institute = data.get("institute")
        faculty_id = data.get("facultyId")
        subject = data.get("subject")
        quiz_name = data.get("quizName")

        if not all([institute, faculty_id, subject, quiz_name]):
            return jsonify({"error": "Missing required fields"}), 400

        # 🔹 Find quiz by name
        quiz_collection = (
            firestore_client.collection("quizzes")
            .document(institute)
            .collection(faculty_id)
            .document(subject)
            .collection("quizList")
        )
        query = quiz_collection.where("quizName", "==", quiz_name).limit(1).stream()
        quiz_doc = next(query, None)
        if not quiz_doc:
            return jsonify({"error": "Quiz not found"}), 404

        quiz_data = quiz_doc.to_dict()
        quiz_id = quiz_doc.id
        questions = quiz_data.get("questions", [])

        # 🔹 Student submissions reference
        submissions_ref = (
            firestore_client.collection("submissions")
            .document(institute)
            .collection(faculty_id)
            .document(subject)
            .collection("quizList")
            .document(quiz_id)
            .collection("studentSubmissions")
        )

        submissions = submissions_ref.stream()
        evaluated_count = 0

        for sub in submissions:
            sub_data = sub.to_dict()
            student_answers = sub_data.get("answers", [])
            
            # ✅ Simple evaluation: +1 for each correct
            score = 0
            total=0
            for idx, q in enumerate(questions):
                correct = q.get("correct")  # Make sure quizzes store correctAnswer!
                total+=1
                if idx < len(student_answers) and student_answers[idx] == correct:
                    score += 1

            # ✅ Update submission with marks
            sub.reference.set({
                "quizId": quiz_id,
                "quizName": quiz_name,
                "marks": score,
                "total":total,
                "evaluatedAt": firestore.SERVER_TIMESTAMP
            }, merge=True)

            evaluated_count += 1

        return jsonify({"message": "Evaluation complete", "evaluated": evaluated_count}), 200

    except Exception as e:
        print("Evaluation error:", e)
        return jsonify({"error": str(e)}), 500



@app.route("/get-my-quiz-results", methods=["GET"])
def get_my_quiz_results():
    try:
        college = request.args.get("college")
        faculty = request.args.get("faculty")
        subject = request.args.get("subject")
        student_id = request.args.get("student_id")
        print([college,faculty,subject,student_id])

        if not all([college, faculty, subject, student_id]):
            return jsonify({"error": "Missing required fields"}), 400

        # 🔹 Point to quizzes submissions
        quiz_collection = (
            firestore_client.collection("submissions")
            .document(college)
            .collection(faculty)
            .document(subject)
            .collection("quizList")
        )

        quiz_results = []

        # Iterate through all quizzes
        quiz_list = quiz_collection.stream()
        print("quiz list:",quiz_list)
        for quiz in quiz_list:
            print("🔎 Found quiz:", quiz.id)  # debug
            submissions_ref = quiz.reference.collection("studentSubmissions").document(student_id).get()
            print("   -> Checking student submission:", submissions_ref)  # debug
            if submissions_ref.exists:
                data = submissions_ref.to_dict()
                print("data fro submions:",data)
                quiz_results.append({
                    "quizId": quiz.id,
                    "quizName": data.get("quizName", quiz.id),
                    "marks": data.get("marks", 0),
                    "total": data.get("total", 0),
                    "evaluatedAt": data.get("evaluatedAt"),
                })
        print("quiz results:",quiz_results)        

        return jsonify({"results": quiz_results}), 200

    except Exception as e:
        print("Quiz results error:", e)
        return jsonify({"error": str(e)}), 500
    

# Teacher posts an assignment
@app.route("/post_assignment", methods=["POST"])
def post_assignment():
    try:
        data = request.json or {}

        assignment = data.get("assignment")   # assignment text / details
        institute = data.get("institute")
        faculty = data.get("faculty")
        subject = data.get("subject")
        class_id = data.get("classId")

        if not all([assignment, institute, faculty, subject, class_id]):
            return jsonify({"error": "Missing fields"}), 400

        # Firestore Path:
        # Assignments/{institute}/{faculty}/{subject}/{classId}/current_assignment
        doc_ref = (
            firestore_client.collection("Assignments")
            .document(institute)
            .collection(faculty)
            .document(subject)
            .collection(class_id)
            .document("current_assignment")
        )

        # Ensure root docs exist
        firestore_client.collection("Assignments").document(institute).set({}, merge=True)
        firestore_client.collection("Assignments").document(institute).collection(faculty).document(subject).set({}, merge=True)

        # Save assignment data
        doc_ref.set({
            "assignment": assignment,
            "timestamp": firestore.SERVER_TIMESTAMP
        }, merge=True)

        return jsonify({"message": "Assignment posted successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# @app.route("/upload-report", methods=["POST"])
# def upload_assignment():
#     try:
#         file = request.files.get("file")
#         college = request.form.get("college")
#         faculty = request.form.get("faculty")
#         subject = request.form.get("subject")
#         pdf_name = request.form.get("pdf_name")
#         student_id = request.form.get("student_id")
#         student_name = request.form.get("student_name", "")
#         class_id = request.form.get("class")  # <-- used as assignmentId

#         # Validate fields (same as upload-report)
#         if not all([file, college, faculty, subject, pdf_name, student_id, class_id]):
#             return jsonify({"error": "Missing data"}), 400

#         assignment_id = class_id  # rename for clarity

#         # ----------------------------
#         # 1. Upload PDF to Cloud Storage
#         # ----------------------------
#         storage_path = (
#             f"submissions/{college}/{faculty}/{subject}/"
#             f"assignmentList/{assignment_id}/studentSubmissions/{student_id}/{pdf_name}.pdf"
#         )

#         blob = bucket.blob(storage_path)
#         blob.upload_from_file(file)

#         # ----------------------------
#         # 2. Firestore Path (Quiz Style)
#         # ----------------------------

#         assignment_doc_ref = (
#             firestore_client.collection("submissions")
#             .document(college)
#             .collection(faculty)
#             .document(subject)
#             .collection("assignmentList")
#             .document(assignment_id)
#         )

#         # Save assignment metadata (created only once)
#         assignment_doc_ref.set({
#             "assignmentId": assignment_id,
#             "assignmentName": pdf_name  # or you can pass separate field later
#         }, merge=True)

#         # Student submission document
#         submission_ref = assignment_doc_ref.collection("studentSubmissions").document(student_id)

#         submission_ref.set({
#             "studentId": student_id,
#             "studentName": student_name,
#             "assignmentId": assignment_id,
#             "assignmentName": pdf_name,
#             "pdfName": pdf_name,
#             "storagePath": storage_path,
#             "submittedAt": firestore.SERVER_TIMESTAMP
#         }, merge=True)

#         return jsonify({
#             "message": "Assignment uploaded successfully",
#             "storagePath": storage_path
#         }), 200

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500
    
@app.route("/upload-report", methods=["POST"])
def upload_assignment():
    try:
        # File coming from frontend (generated or uploaded)
        file = request.files.get("pdf_file")

        # Common fields
        college = request.form.get("college")
        faculty = request.form.get("faculty")
        subject = request.form.get("subject")
        pdf_name = request.form.get("pdf_name")
        student_id = request.form.get("student_id")
        student_name = request.form.get("student_name", "")
        class_id = request.form.get("class")  # assignmentId
        exam_log = request.form.get("exam_log")
        print("exam log:",exam_log)

        # New fields from frontend
        upload_type = request.form.get("upload_type")          
        session_generated = request.form.get("session_generated")  # "true" | "false"

        # Validate fields (pdf must exist always)
        if not all([file, college, faculty, subject, pdf_name, student_id, class_id]):
            return jsonify({"error": "Missing required fields"}), 400

        assignment_id = class_id

        # --------------------------------------------------------------------------------
        # 🔥 Upload PDF to Cloud Storage
        # --------------------------------------------------------------------------------
        storage_path = (
            f"submissions/{college}/{faculty}/{subject}/"
            f"assignmentList/{assignment_id}/studentSubmissions/{student_id}/{pdf_name}.pdf"
        )

        blob = bucket.blob(storage_path)
        blob.upload_from_file(file)

        # --------------------------------------------------------------------------------
        # 🔥 Firestore Root Path (quiz-style)
        # --------------------------------------------------------------------------------
        assignment_doc_ref = (
            firestore_client.collection("submissions")
            .document(college)
            .collection(faculty)
            .document(subject)
            .collection("assignmentList")
            .document(assignment_id)
        )

        # Create assignment metadata
        assignment_doc_ref.set({
            "assignmentId": assignment_id,
            "assignmentName": pdf_name,
        }, merge=True)

        # Student submission document
        submission_ref = assignment_doc_ref.collection("studentSubmissions").document(student_id)

        # Store student submission metadata
        submission_ref.set({
            "studentId": student_id,
            "studentName": student_name,
            "assignmentId": assignment_id,
            "assignmentName": pdf_name,
            "pdfName": pdf_name,
            "storagePath": storage_path,
            "submittedAt": firestore.SERVER_TIMESTAMP,

            # 🔥 New metadata added (same as upload-report)
            "upload_type": upload_type,                # generated/external
            "session_generated": session_generated,    # true/false

        }, merge=True)

        return jsonify({
            "message": "Assignment uploaded successfully",
            "storagePath": storage_path
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Student fetches ASSIGNMENT question
@app.route("/get_question", methods=["GET"])
def get_assignment_question():
    institute = request.args.get("institute")
    faculty = request.args.get("faculty")        # faculty email
    subject = request.args.get("subject")
    class_id = request.args.get("class_id")

    if not all([institute, faculty, subject, class_id]):
        return jsonify({"error": "Missing fields"}), 400

    # Path:
    # Assignments/{institute}/{faculty}/{subject}/{class_id}/current_assignment
    doc_ref = (
        firestore_client.collection("Assignments")
        .document(institute)
        .collection(faculty)
        .document(subject)
        .collection(class_id)
        .document("current_assignment")
    )

    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({"error": "No assignment found"}), 404

    assignment_question = doc.to_dict().get("assignment", "")
    return jsonify({"question": assignment_question}), 200



if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5006, debug=True)
    
