import argparse
import json
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import qrcode


ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "seed"
OUTPUT_DIR = SEED_DIR / "qr_printouts"


def build_payload(qr_code: str, base_url: str | None) -> str:
    if not base_url:
        return qr_code

    normalized = base_url.rstrip("/")
    parts = urlsplit(normalized)
    if not parts.scheme or not parts.netloc:
        raise ValueError("--base-url must be an absolute URL, for example https://app.example.com")

    base_without_query = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    return f"{base_without_query}/?loc={quote(qr_code, safe='')}"


def main():
    parser = argparse.ArgumentParser(description="Generate QR checkpoint printout PNGs.")
    parser.add_argument(
        "--base-url",
        help="Optional app URL. When provided, QR images encode {base_url}/?loc={qr_code}.",
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with (SEED_DIR / "qr_codes.json").open("r", encoding="utf-8") as f:
        data = json.load(f)

    for checkpoint in data:
        img = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        payload = build_payload(checkpoint["qr_code"], args.base_url)
        img.add_data(payload)
        img.make(fit=True)

        qr_img = img.make_image(fill_color="black", back_color="white")
        filename = OUTPUT_DIR / f"{checkpoint['qr_code']}.png"
        qr_img.save(filename)
        print(f"Generated: {filename} ({checkpoint['label']}) -> {payload}")

    print(f"\nGenerated {len(data)} QR codes in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
