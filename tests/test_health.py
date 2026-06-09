import requests

BASE_URL_BN = "http://localhost:8000"
BASE_URL_ROBO = "http://localhost:8001"

r = requests.get(f"{BASE_URL_BN}/health")
print(f"building-nav health: {r.status_code} {r.json()}")
assert r.status_code == 200, f"Expected 200, got {r.status_code}"
print("PASS")

r = requests.get(f"{BASE_URL_ROBO}/api/health")
print(f"Robo-BN health: {r.status_code} {r.json()}")
assert r.status_code == 200, f"Expected 200, got {r.status_code}"
print("PASS")