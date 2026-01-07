import csv
import json
import os

def parse_csv(filepath, default_metadata, has_category=True):
    entries = []
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

            if has_category:
                category = row[3].strip()
                moa = row[4].strip() if len(row) > 4 else None
            else:
                moa = row[3].strip() if len(row) > 3 else None

            # Clean up semicolons in Brand (e.g. "Lopressor; Toprol XL")
            # We will just keep the string as is for display, or split?
            # The prompt examples showed simple strings. Let's keep as string.

            entry = {
                "generic": generic,
                "brand": brand,
                "class": drug_class,
                "category": category,
                "moa": moa,
                "metadata": default_metadata
            }
            entries.append(entry)
    return entries

def main():
    all_drugs = []

    # Process Lab 1
    # Assumption: Lab 1 items are available for all quizzes, or specifically Quiz 1+?
    # Prompt: "4 items from lab: 1 (where quiz number is <= X)"
    # If we tag them as quiz: 1, they are available for Quiz 1, 2, 3...
    lab1_meta = {"lab": 1, "quiz": 1, "is_new": False}
    lab1_drugs = parse_csv("data/lab1.csv", lab1_meta, has_category=True)
    all_drugs.extend(lab1_drugs)

    # Process Lab 2 Quiz 1
    lab2_meta = {"lab": 2, "quiz": 1, "is_new": True}
    lab2_drugs = parse_csv("data/lab2_quiz1.csv", lab2_meta, has_category=False)
    all_drugs.extend(lab2_drugs)

    # Write to master_pool.json
    with open("master_pool.json", "w", encoding='utf-8') as f:
        json.dump(all_drugs, f, indent=2)

    print(f"Generated master_pool.json with {len(all_drugs)} drugs.")

if __name__ == "__main__":
    main()
