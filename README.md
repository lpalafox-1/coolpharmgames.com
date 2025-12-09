# coolpharmgames.com
The UAMS College of Pharmacy Class of 2029 Personalized Hub is designed to assist students in preparing for quizzes and exams.


# Pharm-let Quizzes

• Chapter Reviews: Chapter-by-chapter practice in exam style (Easy/Hard).
• Exam Practice: Mixed sets aligned to in-class exams.
	- Practice E1 — Exam 1 Prep (Chapters 1–4)
	- Practice E2A — Exam 2 Prep (Chapters 1–5)
• Supplemental: Official-style mock material (kept verbatim naming).
• Fun Modes: Light, quick SIG/Latin practice. Great for warmups.

All questions include hint + solution for Show/Hide (MTC) support.
Answer types: numeric, multi-numeric, short-answer (with acceptable variants).

## New Features

### 📊 Performance Dashboard (`stats.html`)
Track your quiz performance over time with:
- Total questions answered
- Average score percentage
- Best streak records
- Study days tracking
- Performance breakdown by quiz and category
- Recent activity history

### ♿ Accessibility Improvements
- Skip-to-content links for keyboard navigation
- Screen reader-friendly labels and ARIA attributes
- High contrast mode toggle (yellow/black theme for better visibility)
- Font size controls (A-/A+ buttons, 12-24px range)

### ⭐ Quality of Life Features
- **Bookmark favorites**: Star icon next to quizzes for quick access
- **Font size controls**: Adjust text size for better readability (persists across sessions)
- **High contrast mode**: Enhanced visibility with bold colors and underlined links
- **Confetti celebration**: Animated confetti for perfect quiz scores (100%)
- All preferences saved to localStorage for seamless experience

Repository layout:
- `quizzes/` - JSON quiz files organized in folders (Chapter Reviews, Exam Practice, Supplemental, Fun Modes)
- `assets/` - front-end JS/CSS and icons
- `tools/` - local test harness and validation scripts

Run local validator:

```bash
node tools/validate-quizzes.mjs
```

Quick local test (simple server):

```bash
python3 -m http.server 8000
# open http://localhost:8000/tools/test-quiz.html
```

## Deployment

- **Live site:** https://lpalafox-1.github.io/coolpharmgames.com/

- GitHub Pages is used to publish the site from the repository. To add a custom domain, create a file named `CNAME` at the repository root containing your domain (for example `quiz.example.com`) and then add a DNS `CNAME` record pointing that domain to `lpalafox-1.github.io`.

After updating `CNAME`, push to `main` and the Pages workflow will deploy the site. If you prefer to manage DNS yourself, add the `CNAME` and configure records with your DNS provider.
