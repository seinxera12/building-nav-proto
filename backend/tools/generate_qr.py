import json
import os
from pathlib import Path

import qrcode


ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "seed"
OUTPUT_DIR = SEED_DIR / "qr_printouts"


def main():
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
        img.add_data(checkpoint["qr_code"])
        img.make(fit=True)

        qr_img = img.make_image(fill_color="black", back_color="white")
        filename = OUTPUT_DIR / f"{checkpoint['qr_code']}.png"
        qr_img.save(filename)
        print(f"Generated: {filename} ({checkpoint['label']})")

    print(f"\nGenerated {len(data)} QR codes in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
