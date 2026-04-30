// scripts/validate-quizzes.mjs
// GitHub Actions calls `node scripts/validate-quizzes.mjs`.
// Delegate to the canonical validator in `tools/validate-quizzes.mjs` so local `npm run validate`
// and CI stay in sync.
import "../tools/validate-quizzes.mjs";
