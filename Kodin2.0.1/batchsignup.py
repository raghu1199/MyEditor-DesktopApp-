import os
import requests

# ✅ Replace with your actual API URL
# API_URL = "http://127.0.0.1:5000/batch_signup"
API_URL = "http://157.20.190.59/batch_signup"

# ✅ Path to the Excel file you want to upload
FILE_PATH = "./format.xlsx"
print("inside batch signup")

try:
    if not os.path.exists(FILE_PATH):
        raise FileNotFoundError(f"Excel file not found: {FILE_PATH}")

    with open(FILE_PATH, "rb") as f:
        files = {"file": (os.path.basename(FILE_PATH), f, 
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        response = requests.post(API_URL, files=files)

    # ✅ Check if request was successful
    if response.status_code == 200:
        # Ensure response looks like Excel file before saving
        content_type = response.headers.get("Content-Type", "")
        if "spreadsheetml" in content_type:
            with open("batch_signup_results.xlsx", "wb") as out:
                out.write(response.content)
            print("✅ Batch signup completed. Result saved to batch_signup_results.xlsx")
        else:
            print("⚠️ Server returned a non-Excel response:")
            print(response.text)

        # Print error logs from API (if any)
        errors = response.headers.get("X-Errors", "None")
        if errors and errors != "None":
            print("\n⚠️ Some rows failed during signup:")
            print(errors)

    else:
        print(f"❌ Request failed with status {response.status_code}")
        try:
            print(response.json())
        except:
            print(response.text)

except Exception as e:
    print(f"❌ Error: {e}")
