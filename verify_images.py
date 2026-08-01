import json
import os
import sys

from quiz_files import ALL_QUIZ_FILES

PUBLIC_DIR = "public"
FILES_TO_CHECK = ALL_QUIZ_FILES

missing = []

for filepath in FILES_TO_CHECK:
    if not os.path.exists(filepath):
        continue
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    for idx, q in enumerate(data):
        img = q.get("imageUrl")
        if img:
            real_path = os.path.join(PUBLIC_DIR, img.lstrip("/"))
            if not os.path.exists(real_path):
                missing.append((filepath, q.get("id", idx), img, real_path))

if missing:
    print("❌ ERROR: Missing quiz images found!")
    for file, qid, img_url, path in missing:
        print(f"  - [{file}] Question {qid}: '{img_url}' -> file not found at '{path}'")
    sys.exit(1)
else:
    print("✅ OK: All referenced quiz images exist in public/quiz_images/.")
