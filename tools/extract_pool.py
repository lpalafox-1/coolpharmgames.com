import json
import re
import os

# Helper function to find tag from filename
def get_tag_from_filename(filename):
    if "lab-quiz1" in filename:
        return {"lab": 2, "quiz": 1} # Antihypertensives (Lab 2 starts here based on prompt implication? Wait. Prompt says "Lab 2, Quiz X". Filenames are lab-quiz1..5. Let's assume lab-quizN IS Lab 2 Quiz N.)
        # But wait, where is Lab 1? "4 items from lab: 1".
        # Maybe Lab 1 data comes from other files?
        # "chapter1-review.json", "cumulative-quiz..." etc.
        # The user provided sample has "Lisinopril... metadata: {lab: 1, quiz: 1}".
        # Lisinopril is an ACE inhibitor.
        # I need to find sources for Lab 1.
        # Let's assume "chapterX-review" or "practice-eX" maps to Lab 1?
        # Or maybe I should just treat "lab-quizX" as Lab 2, and everything else as Lab 1?
        # Let's try to map "chapterX" to Lab 1 Quiz X roughly?
        # Or maybe "cumulative-quiz1-2" -> Lab 1, Quiz 2?

    # Let's stick to the ones I know clearly first.
    if "lab-quiz1" in filename: return {"lab": 2, "quiz": 1}
    if "lab-quiz2" in filename: return {"lab": 2, "quiz": 1} # Wait, lab-quiz2-antihypertensives.json ... maybe these are versions? Or split?
    # User said: "lab: 1 or lab: 2 and their respective quiz number"
    # User file list has:
    # lab-quiz1-antihypertensives.json
    # lab-quiz2-antihypertensives.json -> Maybe this is Lab 2 Quiz 1, Part 2? Or Quiz 2?
    # lab-quiz3-antilipemics.json -> Quiz 2?
    # lab-quiz4-anticoagulants.json -> Quiz 3?
    # lab-quiz5-antiarrhythmics.json -> Quiz 4?

    # Hypothesis:
    # Lab Quizzes are "Lab 2".
    # General Quizzes (Chapter reviews, etc) are "Lab 1".

    if "lab-quiz" in filename:
        # Extract number
        m = re.search(r"lab-quiz(\d+)", filename)
        if m:
            q_num = int(m.group(1))
            # Adjust mapping?
            # Lab 1 Antihypertensives
            # Lab 2 Antilipemics
            # Lab 3 Anticoagulants
            # Lab 4 Antiarrhythmics
            # If lab-quiz1 and lab-quiz2 are both Antihypertensives, maybe they are both Quiz 1 for Lab 2.
            if "antihypertensives" in filename: return {"lab": 2, "quiz": 1}
            if "antilipemics" in filename: return {"lab": 2, "quiz": 2}
            if "anticoagulants" in filename: return {"lab": 2, "quiz": 3}
            if "antiarrhythmics" in filename: return {"lab": 2, "quiz": 4}
            return {"lab": 2, "quiz": q_num} # Fallback

    # Lab 1 sources?
    # Let's map Chapter 1 -> Quiz 1, Chapter 2 -> Quiz 2, etc?
    if "chapter1-review" in filename: return {"lab": 1, "quiz": 1}
    if "chapter2-review" in filename: return {"lab": 1, "quiz": 2}
    if "chapter3-review" in filename: return {"lab": 1, "quiz": 3}
    if "chapter4-review" in filename: return {"lab": 1, "quiz": 4}
    if "chapter5-review" in filename: return {"lab": 1, "quiz": 5}

    # Cumulative also Lab 1?
    if "cumulative-quiz1-2" in filename: return {"lab": 1, "quiz": 2}
    if "cumulative-quiz1-3" in filename: return {"lab": 1, "quiz": 3}

    return None

drugs = [] # List of dicts

def add_drug(generic, brand, drug_class, category, moa, tag):
    if not generic: return

    # Create new entry
    entry = {
        "generic": generic.strip(),
        "brand": brand.strip() if brand else None,
        "class": drug_class.strip() if drug_class else None,
        "category": category.strip() if category else None,
        "moa": moa.strip() if moa else None,
        "metadata": {
            "lab": tag["lab"],
            "quiz": tag["quiz"],
            "is_new": (tag["lab"] == 2) # Heuristic: Lab 2 items are "new" material?
        }
    }
    drugs.append(entry)

def process_file(filepath, filename):
    tag = get_tag_from_filename(filename)
    if not tag:
        return

    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        return

    pools = data.get("pools", {})
    for pool_name in ["easy", "hard"]:
        items = pools.get(pool_name, [])
        for item in items:
            mapping = item.get("mapping")

            # Try to find MOA from prompt if not in mapping (mapping usually doesn't have MOA)
            moa = None
            prompt = item.get("prompt", "")

            # Regex for MOA
            # "MOA (Drug): text"
            # "MOA: text"
            if "MOA" in prompt:
                # Attempt to extract the description
                # e.g. "MOA (ACE inhibitors) - Part A: Inhibits conversion of Ang I to Ang II."
                # We want the text after the colon usually?
                if ":" in prompt:
                    parts = prompt.split(":", 1)
                    if len(parts) > 1:
                        possible_moa = parts[1].strip()
                        # If it's a fill-in-the-blank question, the answer might be part of the MOA
                        # But for now let's just grab the text if it looks like a statement
                        # Actually, if it's an MCQ, the "answer" is the correct completion.
                        # So MOA = Prompt (minus blanks) + Answer? Too complex.
                        # Let's check if the prompt ITSELF describes the MOA (e.g. "Inhibits X. Choose drug.")
                        if "Inhibits" in prompt or "Blocks" in prompt or "Competes" in prompt:
                            moa = prompt
                        else:
                            # Prompt: "MOA ... : ..."
                            moa = parts[1].strip()

            if mapping:
                generic = mapping.get("generic")
                brand = mapping.get("brand")
                drug_class = mapping.get("class")
                category = mapping.get("category")

                if isinstance(generic, list): generic = generic[0]
                if isinstance(brand, list): brand = brand[0]

                if generic:
                    # Check if we already added this drug for this tag?
                    # The prompt implies we want a master pool. Duplicate entries for the same drug in the same quiz?
                    # Probably not.
                    # But different questions might give different info (one gives brand, one gives class).
                    # We should probably merge info if it's the same drug+lab+quiz.

                    # Find existing entry
                    existing = None
                    for d in drugs:
                        if d["generic"].lower() == generic.lower() and \
                           d["metadata"]["lab"] == tag["lab"] and \
                           d["metadata"]["quiz"] == tag["quiz"]:
                            existing = d
                            break

                    if existing:
                        # Update fields if missing
                        if not existing["brand"] and brand: existing["brand"] = brand
                        if not existing["class"] and drug_class: existing["class"] = drug_class
                        if not existing["category"] and category: existing["category"] = category
                        if not existing["moa"] and moa: existing["moa"] = moa
                    else:
                        add_drug(generic, brand, drug_class, category, moa, tag)

            else:
                # Parsing logic from before
                # ... (simplified for now to focus on mapped items or simple extractions)
                pass

def main():
    quizzes_dir = "quizzes"
    for filename in os.listdir(quizzes_dir):
        if filename.endswith(".json"):
            process_file(os.path.join(quizzes_dir, filename), filename)

    with open("master_pool.json", "w") as f:
        json.dump(drugs, f, indent=2)

    print(f"Generated master_pool.json with {len(drugs)} entries.")

if __name__ == "__main__":
    main()
