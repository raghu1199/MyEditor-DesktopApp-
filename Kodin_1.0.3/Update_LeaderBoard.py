import requests

# ✅ Configuration
API_URL = "http://127.0.0.1:5005/update-leaderboard"  # Replace with your API endpoint
INSTITUTE = "dgu"  # Replace with your institute name
ROLE = "student"   # Replace with role (student/teacher if needed)

def update_leaderboard(api_url=API_URL, institute=INSTITUTE, role=ROLE):
    payload = {
        "institute": institute,
        "role": role
    }
    
    try:
        response = requests.post(api_url, json=payload)
        response.raise_for_status()  # Raise exception for HTTP errors
        data = response.json()
        
        if "error" in data:
            print("API returned error:", data["error"])
        else:
            print(f"Leaderboard updated successfully! Total students: {data.get('total_students')}")
            print("Top 20 students:")
            for s in data.get("top_students", []):
                print(f"#{s['rank']} {s['name']} - Points: {s['points']}, LOC: {s['total_lines']}, Unique: {s['unique_submissions']}")
                
    except requests.exceptions.RequestException as e:
        print("Error calling API:", e)

if __name__ == "__main__":
    update_leaderboard()
