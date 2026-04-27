(function (global) {
  const STORAGE_VERSION = 2;
  const MAX_QUEUE_ITEMS = 500;
  const MASTERED_STREAK_TARGET = 3;
  const MASTERED_REFRESH_DAYS = 21;
  const MASTERED_REFRESH_MS = MASTERED_REFRESH_DAYS * 24 * 60 * 60 * 1000;

  function toPlainText(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value ?? "");
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }

  function normalizeText(value) {
    return toPlainText(value).toLowerCase();
  }

  function serializeAnswerValue(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => toPlainText(item))
        .filter(Boolean)
        .join(", ");
    }

    return toPlainText(value);
  }

  function getAnswerSignature(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => normalizeText(item))
        .filter(Boolean)
        .sort()
        .join("||");
    }

    return normalizeText(value);
  }

  function normalizeIso(value, fallbackIso) {
    const timestamp = new Date(value || fallbackIso || Date.now()).getTime();
    if (Number.isNaN(timestamp)) {
      return new Date(fallbackIso || Date.now()).toISOString();
    }
    return new Date(timestamp).toISOString();
  }

  function getTimestamp(value) {
    const timestamp = new Date(value || 0).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function getMasteredTimestamp(entry) {
    return Math.max(
      getTimestamp(entry?.masteredAt),
      getTimestamp(entry?.lastReviewedAt),
      getTimestamp(entry?.lastMissedAt),
      getTimestamp(entry?.createdAt),
      0
    );
  }

  function getMasteryAgeMs(entry, now = Date.now()) {
    const masteredTimestamp = getMasteredTimestamp(entry);
    if (!masteredTimestamp) return 0;
    return Math.max(0, now - masteredTimestamp);
  }

  function isMasteryRefreshDue(entry, now = Date.now()) {
    const clearStreak = Math.max(0, Number(entry?.clearStreak) || 0);
    const mastered = Boolean(entry?.archived) || clearStreak >= MASTERED_STREAK_TARGET;
    if (!mastered) return false;
    return getMasteryAgeMs(entry, now) >= MASTERED_REFRESH_MS;
  }

  function getLaterIso(a, b) {
    return getTimestamp(a) >= getTimestamp(b) ? normalizeIso(a, b) : normalizeIso(b, a);
  }

  function getEarlierIso(a, b) {
    if (!a) return normalizeIso(b);
    if (!b) return normalizeIso(a);
    return getTimestamp(a) <= getTimestamp(b) ? normalizeIso(a, b) : normalizeIso(b, a);
  }

  function mergeWrongCounts(a, b) {
    const merged = {};

    [a, b].forEach((source) => {
      if (!source || typeof source !== "object") return;
      Object.entries(source).forEach(([answer, count]) => {
        const key = serializeAnswerValue(answer);
        if (!key) return;
        merged[key] = (merged[key] || 0) + Math.max(0, Number(count) || 0);
      });
    });

    return merged;
  }

  function createEntryKey(record) {
    const quizKey = normalizeText(record?.quizId || record?.sourceQuizId || "");
    const promptKey = normalizeText(record?.prompt || record?.promptText || "");
    const answerValue = record?.answer !== undefined ? record.answer : record?.answerText;
    const answerKey = getAnswerSignature(answerValue);
    return [quizKey, promptKey, answerKey].join("::");
  }

  function normalizeEntry(rawEntry) {
    if (!rawEntry || typeof rawEntry !== "object") return null;

    const prompt = String(rawEntry.prompt || "").trim();
    const answerValue = rawEntry.answer !== undefined ? rawEntry.answer : rawEntry.answerText;
    if (!prompt || (!Array.isArray(answerValue) && serializeAnswerValue(answerValue) === "")) {
      return null;
    }

    const fallbackIso = normalizeIso(rawEntry.lastMissedAt || rawEntry.timestamp || rawEntry.createdAt || Date.now());
    const legacyUserAnswer = serializeAnswerValue(
      rawEntry.lastUserAnswer ?? rawEntry.userAnswer ?? rawEntry.user ?? rawEntry.selected ?? ""
    );
    const wrongCounts = mergeWrongCounts(rawEntry.wrongCounts, legacyUserAnswer ? { [legacyUserAnswer]: 1 } : null);
    const hasAggregateCounts = "missCount" in rawEntry || "reviewMissCount" in rawEntry || "reviewCorrectCount" in rawEntry;

    const normalized = {
      version: STORAGE_VERSION,
      key: rawEntry.key || createEntryKey(rawEntry),
      quizId: String(rawEntry.quizId || rawEntry.sourceQuizId || "").trim(),
      title: String(rawEntry.title || rawEntry.sourceTitle || "").trim(),
      type: String(rawEntry.type || "mcq").trim() || "mcq",
      prompt,
      promptText: rawEntry.promptText || toPlainText(prompt),
      choices: Array.isArray(rawEntry.choices) ? rawEntry.choices : undefined,
      answer: answerValue,
      answerText: rawEntry.answerText,
      missCount: Math.max(0, Number(rawEntry.missCount) || (hasAggregateCounts ? 0 : 1)),
      reviewMissCount: Math.max(0, Number(rawEntry.reviewMissCount) || 0),
      reviewCorrectCount: Math.max(0, Number(rawEntry.reviewCorrectCount) || 0),
      reviewAttemptCount: Math.max(
        0,
        Number(rawEntry.reviewAttemptCount) || ((Number(rawEntry.reviewMissCount) || 0) + (Number(rawEntry.reviewCorrectCount) || 0))
      ),
      clearStreak: Math.max(0, Number(rawEntry.clearStreak) || 0),
      wrongCounts,
      lastUserAnswer: legacyUserAnswer,
      createdAt: normalizeIso(rawEntry.createdAt || rawEntry.timestamp || fallbackIso, fallbackIso),
      lastMissedAt: normalizeIso(rawEntry.lastMissedAt || rawEntry.timestamp || fallbackIso, fallbackIso),
      lastReviewedAt: rawEntry.lastReviewedAt ? normalizeIso(rawEntry.lastReviewedAt, fallbackIso) : null,
      masteredAt: rawEntry.masteredAt ? normalizeIso(rawEntry.masteredAt, fallbackIso) : null,
      archived: Boolean(rawEntry.archived)
    };

    if (normalized.clearStreak >= MASTERED_STREAK_TARGET) {
      normalized.archived = true;
      normalized.masteredAt = normalized.masteredAt || normalized.lastReviewedAt || normalized.lastMissedAt;
    }

    return normalized;
  }

  function combineEntries(existing, incoming) {
    const newerEntry = getLatestActivityTimestamp(incoming) >= getLatestActivityTimestamp(existing) ? incoming : existing;
    const newerReviewState = getTimestamp(incoming.lastReviewedAt) >= getTimestamp(existing.lastReviewedAt) ? incoming : existing;

    const combined = {
      version: STORAGE_VERSION,
      key: existing.key || incoming.key,
      quizId: newerEntry.quizId || existing.quizId || incoming.quizId || "",
      title: newerEntry.title || existing.title || incoming.title || "",
      type: newerEntry.type || existing.type || incoming.type || "mcq",
      prompt: newerEntry.prompt || existing.prompt || incoming.prompt || "",
      promptText: newerEntry.promptText || existing.promptText || incoming.promptText || "",
      choices: Array.isArray(newerEntry.choices)
        ? newerEntry.choices
        : Array.isArray(existing.choices)
        ? existing.choices
        : incoming.choices,
      answer: newerEntry.answer !== undefined ? newerEntry.answer : (existing.answer !== undefined ? existing.answer : incoming.answer),
      answerText: newerEntry.answerText ?? existing.answerText ?? incoming.answerText,
      missCount: Math.max(0, Number(existing.missCount) || 0) + Math.max(0, Number(incoming.missCount) || 0),
      reviewMissCount: Math.max(0, Number(existing.reviewMissCount) || 0) + Math.max(0, Number(incoming.reviewMissCount) || 0),
      reviewCorrectCount: Math.max(0, Number(existing.reviewCorrectCount) || 0) + Math.max(0, Number(incoming.reviewCorrectCount) || 0),
      reviewAttemptCount: Math.max(0, Number(existing.reviewAttemptCount) || 0) + Math.max(0, Number(incoming.reviewAttemptCount) || 0),
      clearStreak: Math.max(0, Number(newerReviewState.clearStreak) || 0),
      wrongCounts: mergeWrongCounts(existing.wrongCounts, incoming.wrongCounts),
      lastUserAnswer: newerEntry.lastUserAnswer || existing.lastUserAnswer || incoming.lastUserAnswer || "",
      createdAt: getEarlierIso(existing.createdAt, incoming.createdAt),
      lastMissedAt: getLaterIso(existing.lastMissedAt, incoming.lastMissedAt),
      lastReviewedAt: existing.lastReviewedAt || incoming.lastReviewedAt
        ? getLaterIso(existing.lastReviewedAt, incoming.lastReviewedAt)
        : null,
      masteredAt: existing.masteredAt || incoming.masteredAt
        ? getLaterIso(existing.masteredAt, incoming.masteredAt)
        : null,
      archived: Boolean(newerReviewState.archived || newerEntry.archived)
    };

    if (combined.clearStreak >= MASTERED_STREAK_TARGET) {
      combined.archived = true;
      combined.masteredAt = combined.masteredAt || combined.lastReviewedAt || combined.lastMissedAt;
    }

    if (combined.archived && combined.clearStreak < MASTERED_STREAK_TARGET) {
      combined.archived = false;
      combined.masteredAt = null;
    }

    return combined;
  }

  function sortQueue(entries) {
    const now = Date.now();

    return [...entries].sort((a, b) => {
      const aRefreshDue = isMasteryRefreshDue(a, now);
      const bRefreshDue = isMasteryRefreshDue(b, now);
      const aActive = (!a.archived || aRefreshDue) ? 0 : 1;
      const bActive = (!b.archived || bRefreshDue) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      if (aRefreshDue !== bRefreshDue) return Number(bRefreshDue) - Number(aRefreshDue);

      if (aRefreshDue && bRefreshDue) {
        const ageDiff = getMasteryAgeMs(b, now) - getMasteryAgeMs(a, now);
        if (ageDiff !== 0) return ageDiff;
      }

      if (a.clearStreak !== b.clearStreak) return a.clearStreak - b.clearStreak;

      const missDiff = getEntryMissCount(b) - getEntryMissCount(a);
      if (missDiff !== 0) return missDiff;

      const touchDiff = getLatestActivityTimestamp(b) - getLatestActivityTimestamp(a);
      if (touchDiff !== 0) return touchDiff;

      return a.promptText.localeCompare(b.promptText);
    });
  }

  function pruneQueue(entries) {
    return sortQueue(entries).slice(0, MAX_QUEUE_ITEMS);
  }

  function normalizeQueue(rawQueue) {
    const entries = Array.isArray(rawQueue) ? rawQueue : [];
    const byKey = new Map();

    entries.forEach((rawEntry) => {
      const entry = normalizeEntry(rawEntry);
      if (!entry) return;

      const existing = byKey.get(entry.key);
      if (!existing) {
        byKey.set(entry.key, entry);
        return;
      }

      byKey.set(entry.key, combineEntries(existing, entry));
    });

    return sortQueue(Array.from(byKey.values()));
  }

  function updateEntryBaseFields(entry, record) {
    if (record.quizId) entry.quizId = String(record.quizId).trim();
    if (record.title) entry.title = String(record.title).trim();
    if (record.type) entry.type = String(record.type).trim();
    if (record.prompt) {
      entry.prompt = String(record.prompt);
      entry.promptText = toPlainText(record.prompt);
    }
    if (Array.isArray(record.choices)) entry.choices = record.choices;
    if (record.answer !== undefined) entry.answer = record.answer;
    if (record.answerText !== undefined) entry.answerText = record.answerText;
  }

  function buildEmptyEntry(record, timestampIso) {
    const entry = normalizeEntry({
      ...record,
      missCount: 0,
      reviewMissCount: 0,
      reviewCorrectCount: 0,
      reviewAttemptCount: 0,
      clearStreak: 0,
      timestamp: timestampIso
    });
    return entry || null;
  }

  function mergeMissedEntries(rawQueue, missedEntries) {
    const byKey = new Map(normalizeQueue(rawQueue).map((entry) => [entry.key, entry]));

    (Array.isArray(missedEntries) ? missedEntries : []).forEach((record) => {
      const key = createEntryKey(record);
      if (!key) return;

      const timestampIso = normalizeIso(record.timestamp || Date.now());
      const userAnswer = serializeAnswerValue(record.userAnswer || "");
      const existing = byKey.get(key) || buildEmptyEntry(record, timestampIso);
      if (!existing) return;

      updateEntryBaseFields(existing, record);
      existing.key = key;
      existing.missCount += 1;
      existing.clearStreak = 0;
      existing.archived = false;
      existing.masteredAt = null;
      existing.lastMissedAt = timestampIso;
      existing.lastUserAnswer = userAnswer || existing.lastUserAnswer || "";
      if (userAnswer) {
        existing.wrongCounts[userAnswer] = (existing.wrongCounts[userAnswer] || 0) + 1;
      }

      byKey.set(key, existing);
    });

    return pruneQueue(Array.from(byKey.values()));
  }

  function applyReviewResults(rawQueue, reviewResults) {
    const byKey = new Map(normalizeQueue(rawQueue).map((entry) => [entry.key, entry]));

    (Array.isArray(reviewResults) ? reviewResults : []).forEach((record) => {
      const key = createEntryKey(record);
      if (!key) return;

      const timestampIso = normalizeIso(record.timestamp || Date.now());
      const userAnswer = serializeAnswerValue(record.userAnswer || "");
      const existing = byKey.get(key) || buildEmptyEntry(record, timestampIso);
      if (!existing) return;

      updateEntryBaseFields(existing, record);
      existing.key = key;
      existing.reviewAttemptCount += 1;
      existing.lastReviewedAt = timestampIso;
      existing.lastUserAnswer = userAnswer || existing.lastUserAnswer || "";

      if (record.correct) {
        existing.reviewCorrectCount += 1;
        existing.clearStreak = Math.min(MASTERED_STREAK_TARGET, existing.clearStreak + 1);
        if (existing.clearStreak >= MASTERED_STREAK_TARGET) {
          existing.archived = true;
          existing.masteredAt = timestampIso;
        } else {
          existing.archived = false;
          existing.masteredAt = null;
        }
      } else {
        existing.reviewMissCount += 1;
        existing.clearStreak = 0;
        existing.archived = false;
        existing.masteredAt = null;
        existing.lastMissedAt = timestampIso;
        if (userAnswer) {
          existing.wrongCounts[userAnswer] = (existing.wrongCounts[userAnswer] || 0) + 1;
        }
      }

      byKey.set(key, existing);
    });

    return pruneQueue(Array.from(byKey.values()));
  }

  function getEntryMissCount(entry) {
    return Math.max(0, Number(entry?.missCount) || 0) + Math.max(0, Number(entry?.reviewMissCount) || 0);
  }

  function getLatestActivityTimestamp(entry) {
    return Math.max(
      getTimestamp(entry?.lastMissedAt),
      getTimestamp(entry?.lastReviewedAt),
      getTimestamp(entry?.createdAt),
      0
    );
  }

  function getCommonWrongAnswer(entry) {
    const wrongCounts = entry?.wrongCounts && typeof entry.wrongCounts === "object" ? entry.wrongCounts : {};
    return Object.entries(wrongCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
  }

  function getCommonWrongAnswerCount(entry) {
    const commonWrong = getCommonWrongAnswer(entry);
    if (!commonWrong) return 0;
    return Math.max(0, Number(entry?.wrongCounts?.[commonWrong]) || 0);
  }

  function getMasterySummary(entry) {
    const clearStreak = Math.max(0, Number(entry?.clearStreak) || 0);
    const mastered = Boolean(entry?.archived) || clearStreak >= MASTERED_STREAK_TARGET;
    const refreshDue = isMasteryRefreshDue(entry);
    const masteryAgeDays = Math.max(0, Math.floor(getMasteryAgeMs(entry) / (24 * 60 * 60 * 1000)));

    if (mastered && refreshDue) {
      return {
        clearStreak,
        target: MASTERED_STREAK_TARGET,
        mastered: false,
        refreshDue: true,
        masteryAgeDays,
        label: `Refresh due (${Math.max(1, masteryAgeDays)}d)`
      };
    }

    if (mastered) {
      return {
        clearStreak,
        target: MASTERED_STREAK_TARGET,
        mastered: true,
        refreshDue: false,
        masteryAgeDays,
        label: masteryAgeDays > 0 ? `Mastered (${masteryAgeDays}d)` : "Mastered"
      };
    }

    if (clearStreak <= 0) {
      return {
        clearStreak,
        target: MASTERED_STREAK_TARGET,
        mastered: false,
        refreshDue: false,
        label: "Fresh miss"
      };
    }

    return {
      clearStreak,
      target: MASTERED_STREAK_TARGET,
      mastered: false,
      refreshDue: false,
      label: `${clearStreak}/${MASTERED_STREAK_TARGET} clean reviews`
    };
  }

  function getActiveEntries(rawQueue) {
    const now = Date.now();
    return normalizeQueue(rawQueue).filter((entry) => !entry.archived || isMasteryRefreshDue(entry, now));
  }

  function getDisplayTitle(entry, titleMap) {
    const titles = titleMap && typeof titleMap === "object" ? titleMap : {};
    const quizId = String(entry?.quizId || "").trim();
    const quizCatalog = global.PharmletQuizCatalog;
    const catalogTitle = quizCatalog?.getEntry?.(quizId)?.title || quizCatalog?.buildDynamicQuizLabel?.(quizId) || "";
    return entry?.title || titles[quizId] || catalogTitle || quizId || "Review Queue";
  }

  function getMostMissedQuestions(rawQueue) {
    const groups = new Map();

    normalizeQueue(rawQueue).forEach((entry) => {
      const prompt = entry.promptText || toPlainText(entry.prompt || "");
      const answer = serializeAnswerValue(entry.answerText !== undefined ? entry.answerText : entry.answer);
      if (!prompt || !answer) return;

      const key = `${normalizeText(prompt)}||${getAnswerSignature(entry.answerText !== undefined ? entry.answerText : entry.answer)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          prompt,
          answer,
          misses: 0,
          wrongCounts: {},
          latest: 0,
          quizIds: new Set()
        });
      }

      const group = groups.get(key);
      group.misses += getEntryMissCount(entry);
      group.wrongCounts = mergeWrongCounts(group.wrongCounts, entry.wrongCounts);
      group.latest = Math.max(group.latest, getLatestActivityTimestamp(entry));
      if (entry.quizId) group.quizIds.add(entry.quizId);
    });

    return Array.from(groups.values())
      .map((group) => {
        const commonWrong = Object.entries(group.wrongCounts)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || ["", 0];

        return {
          prompt: group.prompt,
          answer: group.answer,
          misses: group.misses,
          commonWrong: commonWrong[0],
          commonWrongCount: commonWrong[1],
          quizCount: group.quizIds.size,
          latest: group.latest
        };
      })
      .sort((a, b) => b.misses - a.misses || b.latest - a.latest);
  }

  global.PharmletReviewQueueStore = {
    STORAGE_VERSION,
    MASTERED_STREAK_TARGET,
    MASTERED_REFRESH_DAYS,
    MAX_QUEUE_ITEMS,
    toPlainText,
    serializeAnswerValue,
    normalizeQueue,
    mergeMissedEntries,
    applyReviewResults,
    getActiveEntries,
    isMasteryRefreshDue,
    getMasteryAgeMs,
    getEntryMissCount,
    getLatestActivityTimestamp,
    getCommonWrongAnswer,
    getCommonWrongAnswerCount,
    getMasterySummary,
    getDisplayTitle,
    getMostMissedQuestions
  };
})(window);
