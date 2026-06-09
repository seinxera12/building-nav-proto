import requests

BASE_URL = "http://localhost:8000"

# English TTS
r = requests.post(f"{BASE_URL}/tts/instruction", json={
    "text": "Turn left at the elevator bank",
    "language": "en"
})
print(f"TTS English — Status: {r.status_code}, Bytes: {len(r.content)}")
assert r.status_code == 200, f"Expected 200, got {r.status_code}"
assert r.content[:4] == b"RIFF", f"Expected RIFF/WAV, got {r.content[:16]}"
with open("test.wav", "wb") as f:
    f.write(r.content)
print("PASS: valid WAV saved to test.wav")

# Korean TTS — expect 406
r = requests.post(f"{BASE_URL}/tts/instruction", json={
    "text": "좌회전",
    "language": "ko"
})
print(f"TTS Korean — Status: {r.status_code}")
assert r.status_code == 406, f"Expected 406, got {r.status_code}"
print("PASS: 406 for unsupported language")