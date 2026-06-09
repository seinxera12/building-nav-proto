import requests
import json

r = requests.post("http://localhost:8000/chat", json={
    "session_id": "test-001",
    "text": "where is the cafeteria",
    "language": "en"
})
print(f"Status: {r.status_code}")
print(json.dumps(r.json(), indent=2))

assert r.status_code == 200, f"Expected 200, got {r.status_code}"
data = r.json()
assert "response_text" in data, "Missing response_text"
assert "candidates" in data, "Missing candidates"
assert data.get("chatbot_available") is True, "Expected chatbot_available=true"
print("PASS")