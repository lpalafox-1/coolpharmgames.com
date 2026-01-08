import csv
import json
import os

def parse_csv(filepath, default_metadata, has_category=True, has_week=False):
    entries = []
    if not os.path.exists(filepath):
        print(f"Warning: File not found: {filepath}")
        return []

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = None
        for row in reader:
            if not row: continue
            # Handle headers repeating in the file
            if "Generic Name" in row[0]:
                header = [h.strip().lower() for h in row]
                continue

            if not header: continue

            # Map columns
            generic = row[0].strip()
            brand = row[1].strip()
            drug_class = row[2].strip()

            category = None
            moa = None
            week = None

            if has_category:
                category = row[3].strip()
                moa = row[4].strip() if len(row) > 4 else None
                if has_week and len(row) > 5:
                    try:
                        week = int(row[5].strip())
                    except ValueError:
                        pass
            else:
                moa = row[3].strip() if len(row) > 3 else None

            meta = default_metadata.copy()
            if week is not None:
                meta["week"] = week

            entry = {
                "generic": generic,
                "brand": brand,
                "class": drug_class,
                "category": category,
                "moa": moa,
                "metadata": meta
            }
            entries.append(entry)
    return entries

def main():
    all_drugs = []

    # Configuration for data sources
    # Format: { "path": str, "meta": dict, "has_category": bool, "has_week": bool }
    data_sources = [
        {
            "path": "v2-generator/data/lab1.csv",
            "meta": {"lab": 1, "quiz": 1, "is_new": False},
            "has_category": True,
            "has_week": True
        },
        {
            "path": "v2-generator/data/lab2_quiz1.csv",
            "meta": {"lab": 2, "quiz": 1, "is_new": True},
            "has_category": True,
            "has_week": False
        },
        {
            "path": "v2-generator/data/lab2_quiz2.csv",
            "meta": {"lab": 2, "quiz": 2, "is_new": True},
            "has_category": False,
            "has_week": False
        },
        # Add new blocks here as they come in:
        # { "path": "v2-generator/data/lab1_part2.csv", ... }
    ]

    for source in data_sources:
        drugs = parse_csv(
            source["path"],
            source["meta"],
            has_category=source["has_category"],
            has_week=source.get("has_week", False)
        )
        all_drugs.extend(drugs)
        print(f"Loaded {len(drugs)} items from {source['path']}")

    # Write to master_pool.json in v2-generator root
    with open("v2-generator/master_pool.json", "w", encoding='utf-8') as f:
        json.dump(all_drugs, f, indent=2)

    print(f"Generated master_pool.json with {len(all_drugs)} drugs.")

if __name__ == "__main__":
    main()
