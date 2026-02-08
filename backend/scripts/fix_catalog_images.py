#!/usr/bin/env python3
"""
Fix Pull & Bear catalog image-product pairings using GPT-4o vision.

For each product image, asks GPT-4o to describe what it sees,
then updates the catalog with image-accurate product names and descriptions.

Usage:
    cd backend
    uv run python scripts/fix_catalog_images.py
"""

import json
import sys
import time
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

CATALOG_PATH = Path(__file__).parent.parent / "data" / "pullbear_catalog.json"
CATALOG_COPY = Path(__file__).parent.parent.parent / "demos" / "pullbear" / "catalog" / "data" / "pullbear_catalog.json"

client = OpenAI()


def analyze_image(image_url: str, current_name: str, category: str) -> dict:
    """Use GPT-4o vision to describe the product in the image."""
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a fashion product cataloger for Pull & Bear. "
                    "Analyze the product image and return a JSON object with:\n"
                    '- "name": concise product name (e.g., "Black oversized hoodie with graphic print")\n'
                    '- "description": 1-2 sentence product description mentioning key visual details '
                    "(color, pattern, fit, material, graphics)\n"
                    '- "category": one of "Hoodies", "T Shirts", "Jackets", "Trousers", "Shoes"\n'
                    '- "tags": comma-separated tags (e.g., "casual,graphic,oversized")\n'
                    "Return ONLY valid JSON, no markdown."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Describe this Pull & Bear product. Current name: '{current_name}', category: '{category}'. Fix if the image doesn't match.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url, "detail": "low"},
                    },
                ],
            },
        ],
        max_tokens=200,
        temperature=0.3,
    )

    text = response.choices[0].message.content.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    return json.loads(text)


def main():
    with open(CATALOG_PATH) as f:
        products = json.load(f)

    print(f"Analyzing {len(products)} product images with GPT-4o vision...\n")

    fixed = 0
    errors = 0

    for i, product in enumerate(products):
        pid = product["id"]
        name = product["name"]
        image_url = product["image_url"]
        category = product["category"]

        try:
            result = analyze_image(image_url, name, category)

            old_name = product["name"]
            product["name"] = result["name"]
            product["description"] = result["description"]
            product["category"] = result.get("category", category)
            product["tags"] = result.get("tags", product.get("tags", ""))

            # Update permalink with new name
            from urllib.parse import quote
            product["permalink"] = f"https://www.pullandbear.com/search?query={quote(result['name'])}"

            changed = old_name != result["name"]
            status = "FIXED" if changed else "OK"
            if changed:
                fixed += 1

            print(f"  [{i+1:2d}/89] {status:5s} {pid}: {old_name}")
            if changed:
                print(f"          -> {result['name']}")

        except Exception as e:
            errors += 1
            print(f"  [{i+1:2d}/89] ERROR {pid}: {e}")

        # Rate limit: ~1 req/sec to be safe
        if i < len(products) - 1:
            time.sleep(0.5)

    # Save fixed catalog
    with open(CATALOG_PATH, "w") as f:
        json.dump(products, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to {CATALOG_PATH}")

    # Copy to demo catalog
    if CATALOG_COPY.parent.exists():
        with open(CATALOG_COPY, "w") as f:
            json.dump(products, f, indent=2, ensure_ascii=False)
        print(f"Copied to {CATALOG_COPY}")

    print(f"\nDone: {fixed} products fixed, {errors} errors, {len(products) - fixed - errors} unchanged")


if __name__ == "__main__":
    main()
