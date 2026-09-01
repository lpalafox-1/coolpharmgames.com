(function (root, factory) {
  root.PharmletQuestionReports = factory(root);
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const STORAGE_KEY = "pharmlet.question-reports";
  const SCHEMA_VERSION = 2;
  const MAX_REPORTS = 200;
  const REASON_OPTIONS = Object.freeze([
    { value: "incorrectAnswer", label: "Incorrect answer" },
    { value: "sourceMismatch", label: "Source mismatch" },
    { value: "ambiguousAnswers", label: "Ambiguous / multiple answers" },
    { value: "distractorQuality", label: "Distractor quality" },
    { value: "wordingClarity", label: "Wording / clarity" },
    { value: "typoFormatting", label: "Typo / formatting" },
    { value: "professorStyleMismatch", label: "Professor-style mismatch" },
    { value: "other", label: "Other" }
  ]);

  let pendingCapture = null;
  let captureDialogBound = false;

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function toPlainText(value) {
    const source = String(value ?? "");
    if (root.document?.createElement) {
      const div = root.document.createElement("div");
      div.innerHTML = source;
      return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
    }
    return source.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  function serializeValue(value) {
    if (Array.isArray(value)) return value.map(toPlainText).filter(Boolean).join(", ");
    return toPlainText(value);
  }

  function optionalText(target, key, value) {
    const normalized = toPlainText(value);
    if (normalized) target[key] = normalized;
  }

  function optionalStringArray(target, key, value) {
    if (!Array.isArray(value)) return;
    const normalized = [...new Set(value.map(toPlainText).filter(Boolean))];
    if (normalized.length) target[key] = normalized;
  }

  function optionalPositiveInteger(target, key, value) {
    const normalized = Number(value);
    if (Number.isInteger(normalized) && normalized > 0) target[key] = normalized;
  }

  function cloneAnswerMatching(value) {
    if (!isRecord(value)) return null;
    const result = {};
    if (typeof value.spellingSensitive === "boolean") {
      result.spellingSensitive = value.spellingSensitive;
    }
    if (typeof value.capitalizationSensitive === "boolean") {
      result.capitalizationSensitive = value.capitalizationSensitive;
    }
    return Object.keys(result).length ? result : null;
  }

  function buildReport(input = {}) {
    const questionMetadata = isRecord(input.questionMetadata) ? input.questionMetadata : {};
    const quizMetadata = isRecord(input.quizMetadata) ? input.quizMetadata : {};
    const curriculumMetadata = root.PharmletCurriculumMetadata?.normalizeCurriculumMetadata?.({
      quizId: input.quizId,
      sourceQuizId: input.sourceQuizId,
      questionId: input.questionId,
      quizMetadata,
      questionMetadata,
      catalogEntry: root.PharmletQuizCatalog?.getEntry?.(input.quizId)
    });
    const quizCurriculum = isRecord(curriculumMetadata?.quiz) ? curriculumMetadata.quiz : {};
    const questionCurriculum = isRecord(curriculumMetadata?.question) ? curriculumMetadata.question : {};
    const timestamp = String(input.timestamp || new Date().toISOString());
    const report = {
      schemaVersion: SCHEMA_VERSION,
      quizId: String(input.quizId || "unknown"),
      title: String(input.title || input.quizId || "Quiz"),
      mode: String(input.mode || ""),
      questionNumber: Number(input.questionNumber) || 0,
      totalQuestions: Number(input.totalQuestions) || 0,
      prompt: String(input.prompt || ""),
      promptText: toPlainText(input.promptText || input.prompt || ""),
      correctAnswer: serializeValue(input.correctAnswer),
      userAnswer: serializeValue(input.userAnswer),
      questionType: String(input.questionType || ""),
      questionFamily: String(input.questionFamily || ""),
      drugGeneric: String(input.drugGeneric || ""),
      note: String(input.note || "").trim(),
      timestamp
    };

    optionalText(report, "questionId", questionCurriculum.questionId || input.questionId);
    optionalStringArray(report, "choices", input.choices);
    optionalStringArray(report, "acceptedAnswers", input.acceptedAnswers);
    optionalText(
      report,
      "sourceQuizId",
      input.sourceQuizId || quizMetadata.generatedFrom || quizCurriculum.sourceQuizId
    );
    optionalText(report, "professionalYear", quizCurriculum.professionalYear);
    optionalText(report, "academicYear", quizCurriculum.academicYear);
    optionalText(report, "semester", quizCurriculum.semester);
    optionalText(report, "course", quizCurriculum.course);
    optionalText(report, "lab", quizCurriculum.lab);
    optionalText(report, "curriculumId", quizCurriculum.curriculumId);
    optionalText(report, "curriculumSource", quizCurriculum.curriculumSource);
    optionalText(report, "origin", quizCurriculum.origin);
    optionalText(report, "generatorId", quizCurriculum.generatorId || questionMetadata.generatorId || quizMetadata.generator);
    optionalText(report, "seed", quizCurriculum.seed || quizMetadata.seed);
    optionalPositiveInteger(
      report,
      "requestedQuizWeek",
      questionMetadata.requestedQuizWeek || quizCurriculum.quizWeek || quizMetadata.quizWeek
    );
    optionalText(report, "sourceMaterial", questionCurriculum.sourceMaterial || questionMetadata.sourceMaterial);
    optionalText(report, "knowledgeDomain", questionCurriculum.knowledgeDomain || questionMetadata.knowledgeDomain);
    optionalText(report, "sourceDrugId", questionCurriculum.sourceDrugId || questionMetadata.sourceDrugId);
    optionalStringArray(report, "sourceDrugIds", questionCurriculum.sourceDrugIds || questionMetadata.sourceDrugIds);
    optionalPositiveInteger(
      report,
      "sourceDrugQuizWeek",
      questionCurriculum.sourceDrugQuizWeek || questionMetadata.sourceDrugQuizWeek
    );
    optionalText(report, "questionVariant", questionCurriculum.questionVariant || questionMetadata.questionVariant);
    optionalText(
      report,
      "brandGenericDirection",
      questionCurriculum.brandGenericDirection || questionMetadata.brandGenericDirection
    );

    const answerMatching = cloneAnswerMatching(questionMetadata.answerMatching);
    if (answerMatching) report.answerMatching = answerMatching;

    return report;
  }

  function getStorage(storage) {
    return storage || root.localStorage;
  }

  function loadReports(storage) {
    try {
      const raw = getStorage(storage)?.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    } catch {
      return [];
    }
  }

  function saveReports(reports, storage) {
    const next = Array.isArray(reports) ? reports.filter(isRecord).slice(0, MAX_REPORTS) : [];
    getStorage(storage)?.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function createReportId(report, existingCount) {
    const stamp = new Date(report.timestamp || Date.now()).getTime();
    const safeStamp = Number.isFinite(stamp) ? stamp.toString(36) : Date.now().toString(36);
    const questionPart = toPlainText(report.questionId || report.quizId || "report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "report";
    return `qr-${safeStamp}-${Number(existingCount || 0).toString(36)}-${questionPart}`;
  }

  function addReport(report, storage) {
    const reports = loadReports(storage);
    const timestamp = String(report?.timestamp || new Date().toISOString());
    const nextReport = {
      ...report,
      schemaVersion: SCHEMA_VERSION,
      reportId: String(report?.reportId || createReportId({ ...report, timestamp }, reports.length)),
      timestamp
    };
    saveReports([nextReport, ...reports], storage);
    return nextReport;
  }

  function legacyReportSignature(report) {
    return JSON.stringify([
      report?.timestamp || "",
      report?.quizId || "",
      report?.questionNumber || "",
      report?.promptText || report?.prompt || "",
      report?.correctAnswer || "",
      report?.userAnswer || "",
      report?.note || ""
    ]);
  }

  function deleteReport(report, storage) {
    const reports = loadReports(storage);
    const reportId = toPlainText(report?.reportId);
    const signature = legacyReportSignature(report);
    const index = reports.findIndex((candidate) => (
      reportId
        ? toPlainText(candidate.reportId) === reportId
        : legacyReportSignature(candidate) === signature
    ));
    if (index < 0) return reports;
    reports.splice(index, 1);
    return saveReports(reports, storage);
  }

  function clearReports(storage) {
    getStorage(storage)?.removeItem(STORAGE_KEY);
  }

  function getReasonLabel(reason) {
    const match = REASON_OPTIONS.find((option) => option.value === reason);
    return match?.label || toPlainText(reason);
  }

  function titleCase(value) {
    const text = toPlainText(value);
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }

  function formatAnswerMatching(answerMatching) {
    if (!isRecord(answerMatching)) return "";
    const labels = [];
    if (answerMatching.spellingSensitive === true) labels.push("spelling-sensitive");
    if (answerMatching.spellingSensitive === false) labels.push("spelling-tolerant");
    if (answerMatching.capitalizationSensitive === true) labels.push("capitalization-sensitive");
    if (answerMatching.capitalizationSensitive === false) labels.push("capitalization-insensitive");
    return labels.join(", ");
  }

  function formatReport(report = {}) {
    const lines = ["Pharm-let Question Report", ""];
    const add = (label, value) => {
      const text = toPlainText(value);
      if (text) lines.push(`${label}: ${text}`);
    };

    add("Reason", getReasonLabel(report.reportReason));
    add("Quiz", report.title || report.quizId);
    if (report.quizId && report.title && report.quizId !== report.title) add("Quiz ID", report.quizId);
    add("Source quiz", report.sourceQuizId);
    add("Generator", report.generatorId);
    add("Seed", report.seed);
    add("Question ID", report.questionId);
    add("Week", report.requestedQuizWeek);
    add("Domain", report.knowledgeDomain);
    add("Material", titleCase(report.sourceMaterial));
    add("Source drug", report.sourceDrugId);
    if (Array.isArray(report.sourceDrugIds) && report.sourceDrugIds.length > 1) {
      add("Source drug records", report.sourceDrugIds.join(", "));
    }
    add("Variant", report.questionVariant);
    add("Brand/Generic direction", report.brandGenericDirection);
    add("Answer matching", formatAnswerMatching(report.answerMatching));

    const prompt = toPlainText(report.promptText || report.prompt);
    if (prompt) lines.push("", "Prompt:", prompt);

    if (Array.isArray(report.choices) && report.choices.length) {
      lines.push("", "Choices:", ...report.choices.map((choice) => `- ${toPlainText(choice)}`));
    }

    const expectedAnswer = serializeValue(report.correctAnswer);
    if (expectedAnswer) lines.push("", "Expected answer:", expectedAnswer);

    if (Array.isArray(report.acceptedAnswers) && report.acceptedAnswers.length) {
      lines.push("", "Also accepted:", report.acceptedAnswers.map(toPlainText).join(", "));
    }

    const submittedAnswer = serializeValue(report.userAnswer);
    if (submittedAnswer) lines.push("", "Submitted answer:", submittedAnswer);

    const note = toPlainText(report.note);
    if (note) lines.push("", "Student note:", note);

    return lines.join("\n").trim();
  }

  async function copyReport(report, clipboard) {
    const text = formatReport(report);
    const target = clipboard || root.navigator?.clipboard;
    if (target?.writeText) {
      await target.writeText(text);
      return text;
    }

    const doc = root.document;
    if (!doc?.createElement || !doc.body?.appendChild || !doc.execCommand) {
      throw new Error("Clipboard access is unavailable in this browser.");
    }

    const textarea = doc.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    doc.body.appendChild(textarea);
    textarea.select();
    const copied = doc.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy was not accepted by this browser.");
    return text;
  }

  function closeCaptureDialog() {
    const dialog = root.document?.getElementById?.("question-report-dialog");
    pendingCapture = null;
    if (dialog?.open) dialog.close();
  }

  function bindCaptureDialog() {
    if (captureDialogBound) return true;
    const dialog = root.document?.getElementById?.("question-report-dialog");
    const form = root.document?.getElementById?.("question-report-form");
    const reason = root.document?.getElementById?.("question-report-reason");
    const note = root.document?.getElementById?.("question-report-note");
    const status = root.document?.getElementById?.("question-report-form-status");
    const cancelButton = root.document?.getElementById?.("cancel-question-report");
    if (!dialog || !form || !reason || !note || !cancelButton || typeof dialog.showModal !== "function") {
      return false;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!pendingCapture) return;
      if (!reason.value) {
        if (status) status.textContent = "Choose a reason before saving.";
        reason.focus();
        return;
      }

      try {
        const saved = addReport({
          ...pendingCapture.payload,
          reportReason: reason.value,
          note: String(note.value || "").trim()
        });
        const onSaved = pendingCapture.onSaved;
        pendingCapture = null;
        dialog.close();
        onSaved?.(saved);
      } catch (error) {
        if (status) status.textContent = error?.message || "Unable to save this report locally.";
      }
    });

    cancelButton.addEventListener("click", closeCaptureDialog);
    dialog.addEventListener("cancel", () => {
      pendingCapture = null;
    });
    captureDialogBound = true;
    return true;
  }

  function openCaptureDialog(payload, onSaved) {
    if (!bindCaptureDialog()) return false;
    const dialog = root.document.getElementById("question-report-dialog");
    const reason = root.document.getElementById("question-report-reason");
    const note = root.document.getElementById("question-report-note");
    const status = root.document.getElementById("question-report-form-status");
    pendingCapture = { payload, onSaved };
    reason.value = "";
    note.value = "";
    if (status) status.textContent = "Reports stay on this browser unless you copy, delete, or clear them.";
    if (dialog.open) dialog.close();
    dialog.showModal();
    reason.focus();
    return true;
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    MAX_REPORTS,
    REASON_OPTIONS,
    toPlainText,
    buildReport,
    loadReports,
    saveReports,
    addReport,
    deleteReport,
    clearReports,
    getReasonLabel,
    formatReport,
    copyReport,
    openCaptureDialog,
    closeCaptureDialog
  });
});
