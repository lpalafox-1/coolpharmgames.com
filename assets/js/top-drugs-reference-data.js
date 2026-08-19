const TOP_DRUGS_REFERENCE_P1_PATH = "assets/data/master_pool.json";
const TOP_DRUGS_REFERENCE_P2_FALL_PATH = "assets/data/fall-2026-p2-top-drugs.json";

window.TopDrugsReferenceData = (() => {
  const P1_CONTEXT_BY_LAB = {
    1: { academicYear: "2025-26", semester: "Fall 2025", lab: "Lab I" },
    2: { academicYear: "2025-26", semester: "Spring 2026", lab: "Lab II" }
  };

  const SEARCH_FIELDS = new Set([
    "all",
    "generic",
    "brand",
    "class",
    "indication",
    "moa",
    "adr",
    "bbw",
    "category"
  ]);

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function compactStrings(values) {
    return Array.isArray(values)
      ? values.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
  }

  function deriveSemesterLabel(source) {
    const academicYear = String(source?.academicYear || "");
    const semester = normalizeText(source?.semester);
    const match = academicYear.match(/^(\d{4})-(\d{2,4})$/);
    if (!match) return String(source?.semester || "").trim();

    const fallYear = match[1];
    const springYear = match[2].length === 2 ? `${fallYear.slice(0, 2)}${match[2]}` : match[2];
    if (semester.includes("fall")) return `Fall ${fallYear}`;
    if (semester.includes("spring")) return `Spring ${springYear}`;
    return String(source?.semester || "").trim();
  }

  function normalizeP1Record(record, index) {
    const labNumber = Number(record?.metadata?.lab || 0);
    const context = P1_CONTEXT_BY_LAB[labNumber] || {
      academicYear: "",
      semester: "Legacy P1",
      lab: labNumber ? `Lab ${labNumber}` : "Legacy P1"
    };
    const generic = String(record?.generic || "").trim();
    const brand = String(record?.brand || "").trim();
    const drugClass = String(record?.class || "").trim();
    const legacyCategory = String(record?.category || "").trim();
    const moa = String(record?.moa || "").trim();

    return {
      id: `legacy-p1-${String(index + 1).padStart(3, "0")}`,
      drugIdentity: generic,
      academicYear: context.academicYear,
      professionalYear: "P1",
      semester: context.semester,
      curriculumSemester: "P1 legacy",
      lab: context.lab,
      labNumber,
      week: Number(record?.metadata?.week || 0),
      generic,
      brands: brand ? [brand] : [],
      drugClass,
      indications: [],
      moa,
      adverseReactions: [],
      boxWarning: "",
      legacyCategory,
      sourceType: "legacy-p1",
      sourceRecordId: `master_pool:${index + 1}`,
      sourcePath: TOP_DRUGS_REFERENCE_P1_PATH,
      sourcePage: null,
      sourceReviewFlags: [],
      curriculumContext: "Legacy P1 source fields",
      fieldsAvailable: [
        generic && "generic",
        brand && "brand",
        drugClass && "class",
        legacyCategory && "category",
        moa && "moa"
      ].filter(Boolean)
    };
  }

  function flagsForRecord(source, recordId) {
    return (Array.isArray(source?.sourceReviewFlags) ? source.sourceReviewFlags : [])
      .filter((flag) => flag?.recordId === recordId || flag?.recordIds?.includes(recordId))
      .map((flag) => ({ ...flag, recordIds: flag?.recordIds ? [...flag.recordIds] : undefined }));
  }

  function normalizeP2Record(record, index, source) {
    const generic = String(record?.genericName || "").trim();
    const brands = compactStrings(record?.brandNames);
    const indications = compactStrings(record?.fdaIndications);
    const adverseReactions = compactStrings(record?.adverseReactions);
    const drugClass = String(record?.drugClass || "").trim();
    const moa = String(record?.mechanismOfAction || "").trim();
    const boxWarning = String(record?.boxWarning || "").trim();
    const sourceRecordId = String(record?.id || `p2-fall-record-${index + 1}`);

    return {
      id: `official-p2-fall-${sourceRecordId}`,
      drugIdentity: generic,
      academicYear: String(source?.academicYear || "").trim(),
      professionalYear: "P2",
      semester: deriveSemesterLabel(source),
      curriculumSemester: String(record?.semester || source?.semester || "P2 Fall").trim(),
      lab: "Lab III",
      labNumber: 3,
      week: Number(record?.quizWeek || 0),
      generic,
      brands,
      drugClass,
      indications,
      moa,
      adverseReactions,
      boxWarning,
      legacyCategory: "",
      sourceType: "official-p2-fall",
      sourceRecordId,
      sourcePath: TOP_DRUGS_REFERENCE_P2_FALL_PATH,
      sourcePage: Number(record?.sourcePage || 0) || null,
      sourceReviewFlags: flagsForRecord(source, sourceRecordId),
      curriculumContext: "Official P2 Fall source fields",
      fieldsAvailable: [
        generic && "generic",
        brands.length && "brand",
        drugClass && "class",
        indications.length && "indication",
        moa && "moa",
        adverseReactions.length && "adr",
        boxWarning && "bbw"
      ].filter(Boolean)
    };
  }

  function normalizeP1Records(pool) {
    if (!Array.isArray(pool)) throw new Error("Legacy Top Drugs source is not an array.");
    return pool.map(normalizeP1Record);
  }

  function normalizeP2FallRecords(source) {
    if (!source || !Array.isArray(source.drugs)) throw new Error("P2 Fall Top Drugs source has no drugs array.");
    return source.drugs.map((record, index) => normalizeP2Record(record, index, source));
  }

  function buildReferenceLibrary(p1Pool, p2FallSource) {
    const p1Records = normalizeP1Records(p1Pool);
    const p2Records = normalizeP2FallRecords(p2FallSource);
    const records = [...p1Records, ...p2Records];

    return {
      records,
      sources: {
        p1: {
          path: TOP_DRUGS_REFERENCE_P1_PATH,
          type: "legacy-p1",
          count: p1Records.length
        },
        p2Fall: {
          path: TOP_DRUGS_REFERENCE_P2_FALL_PATH,
          type: "official-p2-fall",
          id: String(p2FallSource?.id || ""),
          academicYear: String(p2FallSource?.academicYear || ""),
          semester: deriveSemesterLabel(p2FallSource),
          count: p2Records.length,
          source: p2FallSource?.source ? { ...p2FallSource.source } : null,
          excludedFromTestableData: Array.isArray(p2FallSource?.excludedFromTestableData)
            ? p2FallSource.excludedFromTestableData.map((entry) => ({ ...entry }))
            : [],
          sourceReviewFlags: Array.isArray(p2FallSource?.sourceReviewFlags)
            ? p2FallSource.sourceReviewFlags.map((entry) => ({
              ...entry,
              recordIds: entry?.recordIds ? [...entry.recordIds] : undefined
            }))
            : []
        }
      },
      summary: {
        total: records.length,
        p1: p1Records.length,
        p2: p2Records.length,
        semesters: sortSemesters(new Set(records.map((record) => record.semester).filter(Boolean)))
      }
    };
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${path}`);
    return response.json();
  }

  async function loadReferenceLibrary() {
    const [p1Pool, p2FallSource] = await Promise.all([
      fetchJson(TOP_DRUGS_REFERENCE_P1_PATH),
      fetchJson(TOP_DRUGS_REFERENCE_P2_FALL_PATH)
    ]);
    return buildReferenceLibrary(p1Pool, p2FallSource);
  }

  function getSearchValues(record, field = "all") {
    const fieldMap = {
      generic: [record?.generic],
      brand: record?.brands,
      class: [record?.drugClass],
      indication: record?.indications,
      moa: [record?.moa],
      adr: record?.adverseReactions,
      bbw: [record?.boxWarning],
      category: [record?.legacyCategory]
    };

    if (field !== "all") return compactStrings(fieldMap[field]);

    return compactStrings([
      ...Object.values(fieldMap).flat(),
      record?.professionalYear,
      record?.academicYear,
      record?.semester,
      record?.curriculumSemester,
      record?.lab,
      record?.labNumber ? `Lab ${record.labNumber}` : "",
      record?.week ? `Week ${record.week}` : "",
      record?.week ? `Quiz ${record.week}` : "",
      record?.curriculumContext
    ]);
  }

  function normalizeSearchField(field) {
    const normalized = normalizeText(field) || "all";
    return SEARCH_FIELDS.has(normalized) ? normalized : "all";
  }

  function normalizeLabFilter(value) {
    const normalized = normalizeText(value).replace(/^lab\s+/, "");
    const aliases = { i: "1", ii: "2", iii: "3", iv: "4" };
    return aliases[normalized] || normalized || "all";
  }

  function filterRecords(records, filters = {}) {
    const query = normalizeText(filters.query);
    const field = normalizeSearchField(filters.field);
    const professionalYear = normalizeText(filters.professionalYear || "all");
    const semester = normalizeText(filters.semester || "all");
    const lab = normalizeLabFilter(filters.lab || "all");
    const week = normalizeText(filters.week || "all");

    return (Array.isArray(records) ? records : []).filter((record) => {
      const matchesQuery = !query || getSearchValues(record, field)
        .some((value) => normalizeText(value).includes(query));
      const matchesYear = professionalYear === "all" || normalizeText(record?.professionalYear) === professionalYear;
      const matchesSemester = semester === "all" || normalizeText(record?.semester) === semester;
      const matchesLab = lab === "all" || String(record?.labNumber || "") === lab;
      const matchesWeek = week === "all" || String(record?.week || "") === week;
      return matchesQuery && matchesYear && matchesSemester && matchesLab && matchesWeek;
    });
  }

  function sortSemesters(values) {
    const seasonRank = { spring: 1, summer: 2, fall: 3 };
    return [...values].sort((a, b) => {
      const [, seasonA = "", yearA = "0"] = String(a).match(/^(\S+)\s+(\d{4})$/) || [];
      const [, seasonB = "", yearB = "0"] = String(b).match(/^(\S+)\s+(\d{4})$/) || [];
      return Number(yearA) - Number(yearB)
        || (seasonRank[normalizeText(seasonA)] || 9) - (seasonRank[normalizeText(seasonB)] || 9)
        || String(a).localeCompare(String(b));
    });
  }

  function getFilterOptions(records) {
    const source = Array.isArray(records) ? records : [];
    const professionalYears = [...new Set(source.map((record) => record.professionalYear).filter(Boolean))].sort();
    const semesters = sortSemesters(new Set(source.map((record) => record.semester).filter(Boolean)));
    const labs = [...new Map(source
      .filter((record) => record.labNumber && record.lab)
      .map((record) => [record.labNumber, { value: String(record.labNumber), label: record.lab }])).values()]
      .sort((a, b) => Number(a.value) - Number(b.value));
    const weeks = [...new Set(source.map((record) => Number(record.week || 0)).filter(Boolean))].sort((a, b) => a - b);
    return { professionalYears, semesters, labs, weeks };
  }

  return {
    TOP_DRUGS_REFERENCE_P1_PATH,
    TOP_DRUGS_REFERENCE_P2_FALL_PATH,
    buildReferenceLibrary,
    filterRecords,
    getFilterOptions,
    getSearchValues,
    loadReferenceLibrary,
    normalizeLabFilter,
    normalizeP1Records,
    normalizeP2FallRecords,
    normalizeSearchField,
    normalizeText
  };
})();
