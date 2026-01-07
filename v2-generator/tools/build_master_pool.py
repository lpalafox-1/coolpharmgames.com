import csv
import json
import os

def parse_csv(filepath, default_metadata, has_category=True, has_week=False):
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

    # Process Lab 1
    lab1_meta = {"lab": 1, "quiz": 1, "is_new": False}
    # lab1.csv has category and week
    lab1_drugs = parse_csv("v2-generator/data/lab1.csv", lab1_meta, has_category=True, has_week=True)
    all_drugs.extend(lab1_drugs)

    # Process Lab 2 Quiz 1
    lab2_meta = {"lab": 2, "quiz": 1, "is_new": True}
    lab2_drugs = parse_csv("v2-generator/data/lab2_quiz1.csv", lab2_meta, has_category=True) # Lab2 Quiz 1 now has category/MOA structure similar to Lab 1? No, prompt said "Cetirizine..." list.
    # Let's check the CSV content again. I wrote it as: "Generic Name,Brand Name,Medication Class,Category,Full MOA"
    # So has_category=True.
    all_drugs.extend(lab2_drugs)

    # Process Lab 2 Quiz 2
    lab2_q2_meta = {"lab": 2, "quiz": 2, "is_new": True}
    lab2_q2_drugs = parse_csv("v2-generator/data/lab2_quiz2.csv", lab2_q2_meta, has_category=False) # "Prasugrel..." list.
    # I wrote it as: "Generic Name,Brand Name,Medication Class,Full Mechanism of Action (MOA)"
    # So has_category=False.
    all_drugs.extend(lab2_q2_drugs)

    # Write to master_pool.json in v2-generator root
    with open("v2-generator/master_pool.json", "w", encoding='utf-8') as f:
        json.dump(all_drugs, f, indent=2)

    print(f"Generated master_pool.json with {len(all_drugs)} drugs.")

if __name__ == "__main__":
    main()
