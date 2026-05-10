const STORAGE_KEY = "extraQuestionBank";
const TOPIC_TITLES_KEY = "topicTitleOverrides";
const BANK_DISABLED_KEY = "questionBankDisabled";
const RECENT_QUESTIONS_KEY = "recentQuestionIds";
const DELETE_PASSWORD = "valencia";
const RECENT_TEST_WINDOW = 8;

const state = {
  bank: null,
  activeQuestions: [],
  currentIndex: 0,
  answers: [],
  topicSelections: {},
  missedIds: new Set(JSON.parse(localStorage.getItem("missedQuestionIds") || "[]")),
};

const els = {
  setup: document.querySelector("#setupView"),
  quiz: document.querySelector("#quizView"),
  result: document.querySelector("#resultView"),
  subject: document.querySelector("#subjectSelect"),
  topicCheckboxes: document.querySelector("#topicCheckboxes"),
  topicSearch: document.querySelector("#topicSearch"),
  topicSummary: document.querySelector("#topicSelectionSummary"),
  selectAllTopics: document.querySelector("#selectAllTopicsButton"),
  clearTopics: document.querySelector("#clearTopicsButton"),
  length: document.querySelector("#lengthSelect"),
  customLengthLabel: document.querySelector("#customLengthLabel"),
  customLength: document.querySelector("#customLengthInput"),
  difficulty: document.querySelector("#difficultySelect"),
  stats: document.querySelector("#stats"),
  start: document.querySelector("#startButton"),
  review: document.querySelector("#reviewButton"),
  clearMissed: document.querySelector("#clearMissedButton"),
  back: document.querySelector("#backButton"),
  counter: document.querySelector("#questionCounter"),
  meta: document.querySelector("#quizMeta"),
  score: document.querySelector("#scorePill"),
  question: document.querySelector("#questionText"),
  answers: document.querySelector("#answers"),
  feedback: document.querySelector("#feedback"),
  next: document.querySelector("#nextButton"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSummary: document.querySelector("#resultSummary"),
  missedList: document.querySelector("#missedList"),
  retryMissed: document.querySelector("#retryMissedButton"),
  newTest: document.querySelector("#newTestButton"),
  loadFile: document.querySelector("#loadFileButton"),
  fileInput: document.querySelector("#fileInput"),
};

async function boot() {
  if (localStorage.getItem(BANK_DISABLED_KEY) === "true") {
    state.bank = emptyBank();
  } else {
    const response = await fetch("data/question-bank.json");
    state.bank = await response.json();
  }
  state.defaultQuestionIds = new Set(
    state.bank.subjects.flatMap((subject) => subject.questions.map((question) => question.id)),
  );
  mergeBank(loadStoredBank(), { persist: false });
  applyTopicTitleOverrides();
  hydrateSelectors();
  renderStats();
}

function hydrateSelectors() {
  els.subject.innerHTML = state.bank.subjects
    .map((subject) => `<option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)} (${subject.questions.length})</option>`)
    .join("");
  renderTopics();
}

function renderTopics() {
  const subject = getSubject();
  if (!subject) {
    els.topicCheckboxes.innerHTML = "";
    els.topicSummary.textContent = "0/0";
    renderStats();
    return;
  }
  ensureTopicSelection(subject);
  const query = normalizeSearch(els.topicSearch.value);
  const counts = questionCountsByTopic(subject);
  const visibleTopics = subject.topics.filter((topic) => normalizeSearch(topic.name).includes(query));
  const selected = state.topicSelections[subject.id];

  els.topicCheckboxes.innerHTML = visibleTopics
    .map((topic) => {
      const inputId = `topic-${slug(subject.id)}-${slug(topic.id)}`;
      return `
        <div class="topic-check" title="${escapeHtml(topic.name)}">
          <input id="${escapeHtml(inputId)}" type="checkbox" value="${escapeHtml(topic.id)}" ${selected.has(topic.id) ? "checked" : ""} />
          <label class="topic-name" for="${escapeHtml(inputId)}">${escapeHtml(topic.name)}</label>
          <span class="topic-count">${counts.get(topic.id) || 0}</span>
          <button class="topic-edit" type="button" data-topic-id="${escapeHtml(topic.id)}" title="Editar título">✎</button>
        </div>
      `;
    })
    .join("");
  renderStats();
}

function getSubject() {
  return state.bank.subjects.find((subject) => subject.id === els.subject.value) || state.bank.subjects[0];
}

function filteredQuestions({ missedOnly = false } = {}) {
  let questions = getSubject()?.questions || [];
  const topicIds = selectedTopicIds();
  questions = questions.filter((question) => topicIds.has(question.topicId));
  if (missedOnly) {
    questions = questions.filter((question) => state.missedIds.has(question.id));
  }
  return questions;
}

function selectedTopicIds() {
  const subject = getSubject();
  if (!subject) return new Set();
  ensureTopicSelection(subject);
  return new Set(state.topicSelections[subject.id]);
}

function ensureTopicSelection(subject) {
  if (!subject) return;
  const validIds = new Set(subject.topics.map((topic) => topic.id));
  const current = state.topicSelections[subject.id];
  if (!current) {
    state.topicSelections[subject.id] = new Set(validIds);
    return;
  }
  for (const id of current) {
    if (!validIds.has(id)) current.delete(id);
  }
}

function renderStats() {
  if (!state.bank) return;
  const questions = filteredQuestions();
  const selectedCount = selectedTopicIds().size;
  const topics = new Set(questions.map((question) => question.topicId)).size;
  const missed = filteredQuestions({ missedOnly: true }).length;
  const difficultyCounts = countBy(questions, (question) => normalizeDifficulty(question.difficulty));
  els.topicSummary.textContent = `${selectedCount}/${getSubject()?.topics.length || 0}`;
  els.stats.innerHTML = [
    stat("Preguntas", questions.length),
    stat("Temas", topics),
    stat("Fáciles", difficultyCounts.easy || 0),
    stat("Medias", difficultyCounts.medium || 0),
    stat("Difíciles", difficultyCounts.hard || 0),
    stat("Falladas guardadas", missed),
  ].join("");
  els.start.disabled = questions.length === 0;
  els.review.disabled = missed === 0;
  els.clearMissed.disabled = state.missedIds.size === 0;
}

function stat(label, value) {
  return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
}

function startQuiz(questions) {
  const desired = getDesiredQuestionCount(questions.length);
  state.activeQuestions = pickWeightedQuestions(questions, desired, els.difficulty.value, recentQuestionIds());
  state.currentIndex = 0;
  state.answers = [];
  rememberRecentQuestions(state.activeQuestions.map((question) => question.id), questions.length);
  show("quiz");
  renderQuestion();
}

function getDesiredQuestionCount(available) {
  const customValue = els.customLength.value.trim();
  const raw = els.length.value === "custom" ? Number(customValue || 10) : Number(els.length.value);
  const desired = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 10;
  return Math.min(desired, available);
}

function pickWeightedQuestions(questions, desired, difficultyMode, recentIds = new Set()) {
  const normalized = shuffle(questions.map((question) => ({ ...question, difficulty: normalizeDifficulty(question.difficulty) })));
  const avoidRecent = normalized.length >= desired * 3;
  const candidates = avoidRecent ? normalized.filter((question) => !recentIds.has(question.id)) : normalized;
  const usable = candidates.length >= desired ? candidates : normalized;
  const buckets = {
    easy: shuffle(usable.filter((question) => question.difficulty === "easy")),
    medium: shuffle(usable.filter((question) => question.difficulty === "medium")),
    hard: shuffle(usable.filter((question) => question.difficulty === "hard")),
  };
  const plan = difficultyPlans[difficultyMode] || difficultyPlans.mixed;
  const picked = [];
  const used = new Set();

  for (const level of ["easy", "medium", "hard"]) {
    const target = Math.floor(desired * plan[level]);
    for (const question of buckets[level].slice(0, target)) {
      picked.push(question);
      used.add(question.id);
    }
  }

  let index = 0;
  const levelsByWeight = weightedLevelOrder(plan);
  while (picked.length < desired) {
    const level = levelsByWeight[index % levelsByWeight.length];
    const next = buckets[level].find((question) => !used.has(question.id));
    if (next) {
      picked.push(next);
      used.add(next.id);
    } else {
      const fallback = usable.find((question) => !used.has(question.id)) || normalized.find((question) => !used.has(question.id));
      if (!fallback) break;
      picked.push(fallback);
      used.add(fallback.id);
    }
    index += 1;
  }

  return shuffle(picked).slice(0, desired);
}

const difficultyPlans = {
  easy: { easy: 0.6, medium: 0.3, hard: 0.1 },
  mixed: { easy: 0.34, medium: 0.33, hard: 0.33 },
  medium: { easy: 0.2, medium: 0.55, hard: 0.25 },
  hard: { easy: 0.1, medium: 0.3, hard: 0.6 },
};

function weightedLevelOrder(plan) {
  return Object.entries(plan)
    .sort((a, b) => b[1] - a[1])
    .map(([level]) => level);
}

function renderQuestion() {
  const question = state.activeQuestions[state.currentIndex];
  const correct = state.answers.filter((answer) => answer.correct).length;
  els.counter.textContent = `Pregunta ${state.currentIndex + 1} de ${state.activeQuestions.length}`;
  els.meta.textContent = `${topicName(question.topicId)} · ${difficultyLabel(normalizeDifficulty(question.difficulty))}`;
  els.score.textContent = `${correct}/${state.answers.length || 0}`;
  els.question.textContent = question.prompt;
  els.feedback.classList.add("hidden");
  els.feedback.innerHTML = "";
  els.next.disabled = true;
  els.next.textContent = state.currentIndex === state.activeQuestions.length - 1 ? "Ver resultado" : "Siguiente";
  els.answers.innerHTML = question.options
    .map(
      (option, index) => `
        <button class="answer" data-index="${index}">
          <span class="letter">${String.fromCharCode(65 + index)}</span>
          <span>${escapeHtml(option)}</span>
        </button>
      `,
    )
    .join("");
}

function chooseAnswer(index) {
  const question = state.activeQuestions[state.currentIndex];
  const correct = index === question.correctIndex;
  state.answers[state.currentIndex] = { questionId: question.id, selectedIndex: index, correct };
  if (correct) state.missedIds.delete(question.id);
  else state.missedIds.add(question.id);
  localStorage.setItem("missedQuestionIds", JSON.stringify([...state.missedIds]));
  els.score.textContent = `${state.answers.filter((answer) => answer.correct).length}/${state.answers.length}`;

  [...els.answers.querySelectorAll(".answer")].forEach((button) => {
    const answerIndex = Number(button.dataset.index);
    button.disabled = true;
    if (answerIndex === question.correctIndex) button.classList.add("correct");
    if (answerIndex === index && !correct) button.classList.add("wrong");
  });

  els.feedback.classList.remove("hidden");
  els.feedback.innerHTML = `
    <strong>${correct ? "Correcta" : "La correcta era " + String.fromCharCode(65 + question.correctIndex)}</strong>
    <p>${escapeHtml(question.explanation || `Respuesta correcta: ${question.options[question.correctIndex]}`)}</p>
  `;
  els.next.disabled = false;
}

function finishQuiz() {
  const correct = state.answers.filter((answer) => answer.correct).length;
  const total = state.activeQuestions.length;
  const missed = state.activeQuestions.filter((question) => state.missedIds.has(question.id));
  const difficultyCounts = countBy(state.activeQuestions, (question) => normalizeDifficulty(question.difficulty));
  els.resultTitle.textContent = `${correct}/${total} correctas`;
  els.resultSummary.innerHTML = [
    stat("Acierto", `${Math.round((correct / total) * 100)}%`),
    stat("Falladas", missed.length),
    stat("Fáciles", difficultyCounts.easy || 0),
    stat("Medias", difficultyCounts.medium || 0),
    stat("Difíciles", difficultyCounts.hard || 0),
  ].join("");
  els.missedList.innerHTML = missed.length
    ? missed
        .map(
          (question) => `
            <div class="missed-item">
              <p><strong>${escapeHtml(question.prompt)}</strong></p>
              <p>${escapeHtml(question.explanation || `Respuesta correcta: ${question.options[question.correctIndex]}`)}</p>
            </div>
          `,
        )
        .join("")
    : `<div class="missed-item"><p><strong>Sin fallos guardados en este test.</strong></p></div>`;
  els.retryMissed.disabled = missed.length === 0;
  show("result");
  renderStats();
}

function topicName(topicId) {
  return getSubject()?.topics.find((topic) => topic.id === topicId)?.name || topicId;
}

function questionCountsByTopic(subject) {
  const counts = new Map();
  for (const question of subject?.questions || []) {
    counts.set(question.topicId, (counts.get(question.topicId) || 0) + 1);
  }
  return counts;
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function normalizeDifficulty(value) {
  const normalized = slug(value || "medium");
  if (["facil", "easy"].includes(normalized)) return "easy";
  if (["dificil", "hard"].includes(normalized)) return "hard";
  return "medium";
}

function difficultyLabel(value) {
  return { easy: "Fácil", medium: "Media", hard: "Difícil" }[value] || "Media";
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function randomInt(maxExclusive) {
  if (maxExclusive <= 1) return 0;
  if (window.crypto?.getRandomValues) {
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const value = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(value);
    } while (value[0] >= limit);
    return value[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function show(view) {
  els.setup.classList.toggle("hidden", view !== "setup");
  els.quiz.classList.toggle("hidden", view !== "quiz");
  els.result.classList.toggle("hidden", view !== "result");
}

function loadStoredBank() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"version":"local","subjects":[]}');
  } catch {
    return { version: "local", subjects: [] };
  }
}

function emptyBank() {
  return { version: "empty", subjects: [] };
}

function wipeQuestionBank() {
  const password = window.prompt("Contraseña");
  if (password !== DELETE_PASSWORD) return;
  localStorage.setItem(BANK_DISABLED_KEY, "true");
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(TOPIC_TITLES_KEY);
  localStorage.removeItem(RECENT_QUESTIONS_KEY);
  localStorage.removeItem("missedQuestionIds");
  state.bank = emptyBank();
  state.defaultQuestionIds = new Set();
  state.topicSelections = {};
  state.missedIds = new Set();
  hydrateSelectors();
  show("setup");
}

function clearMissedQuestions() {
  if (state.missedIds.size === 0) return;
  if (!window.confirm("¿Limpiar todas las falladas guardadas?")) return;
  state.missedIds = new Set();
  localStorage.removeItem("missedQuestionIds");
  renderStats();
}

function recentQuestionIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(RECENT_QUESTIONS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function rememberRecentQuestions(questionIds, poolSize) {
  const maxRecent = Math.min(Math.max(0, poolSize - questionIds.length), questionIds.length * RECENT_TEST_WINDOW);
  if (maxRecent === 0) {
    localStorage.removeItem(RECENT_QUESTIONS_KEY);
    return;
  }
  const recent = [...questionIds, ...recentQuestionIds()].filter(Boolean);
  const deduped = [];
  const seen = new Set();
  for (const id of recent) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
    if (deduped.length >= maxRecent) break;
  }
  localStorage.setItem(RECENT_QUESTIONS_KEY, JSON.stringify(deduped));
}

function saveExtraBank() {
  const baseIds = new Set(defaultQuestionIds());
  const extra = {
    version: "local",
    subjects: state.bank.subjects
      .map((subject) => ({
        ...subject,
        questions: subject.questions.filter((question) => !baseIds.has(question.id)),
      }))
      .filter((subject) => subject.questions.length > 0),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
}

function defaultQuestionIds() {
  return (state.defaultQuestionIds ||= new Set(
    state.bank.subjects.flatMap((subject) => subject.questions.map((question) => question.id)),
  ));
}

function mergeBank(incoming, { persist = true } = {}) {
  if (!incoming?.subjects?.length) return 0;
  let added = 0;
  for (const incomingSubject of incoming.subjects) {
    let subject = state.bank.subjects.find((item) => item.id === incomingSubject.id);
    if (!subject) {
      subject = { id: incomingSubject.id, name: incomingSubject.name, topics: [], questions: [] };
      state.bank.subjects.push(subject);
    }
    for (const topic of incomingSubject.topics || []) {
      if (!subject.topics.some((item) => item.id === topic.id)) {
        subject.topics.push(topic);
        if (state.topicSelections[subject.id]) state.topicSelections[subject.id].add(topic.id);
      }
    }
    const existingIds = new Set(subject.questions.map((question) => question.id));
    for (const question of incomingSubject.questions || []) {
      if (existingIds.has(question.id)) continue;
      subject.questions.push({ ...question, difficulty: normalizeDifficulty(question.difficulty) });
      existingIds.add(question.id);
      added += 1;
    }
  }
  applyTopicTitleOverrides();
  if (persist) saveExtraBank(state.bank);
  return added;
}

function topicOverrideKey(subjectId, topicId) {
  return `${subjectId}::${topicId}`;
}

function loadTopicTitleOverrides() {
  try {
    return JSON.parse(localStorage.getItem(TOPIC_TITLES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveTopicTitleOverrides(overrides) {
  localStorage.setItem(TOPIC_TITLES_KEY, JSON.stringify(overrides));
}

function applyTopicTitleOverrides() {
  const overrides = loadTopicTitleOverrides();
  for (const subject of state.bank?.subjects || []) {
    for (const topic of subject.topics || []) {
      const override = overrides[topicOverrideKey(subject.id, topic.id)];
      if (override) topic.name = override;
    }
  }
}

function renameTopic(topicId) {
  const subject = getSubject();
  const topic = subject?.topics.find((item) => item.id === topicId);
  if (!topic) return;
  const nextName = window.prompt("Nuevo título del tema", topic.name)?.trim();
  if (!nextName || nextName === topic.name) return;
  topic.name = nextName;
  const overrides = loadTopicTitleOverrides();
  overrides[topicOverrideKey(subject.id, topic.id)] = nextName;
  saveTopicTitleOverrides(overrides);
  saveExtraBank();
  renderTopics();
}

function setVisibleTopicsChecked(checked) {
  const subject = getSubject();
  ensureTopicSelection(subject);
  const selected = state.topicSelections[subject.id];
  for (const input of els.topicCheckboxes.querySelectorAll("input[type='checkbox']")) {
    input.checked = checked;
    if (checked) selected.add(input.value);
    else selected.delete(input.value);
  }
  renderStats();
}

function normalizeSearch(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function bankFromFile(file) {
  if (file.name.toLowerCase().endsWith(".json")) {
    return JSON.parse(await file.text());
  }
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    return bankFromWorkbook(file.name, await file.arrayBuffer());
  }
  throw new Error(`Formato no soportado: ${file.name}`);
}

function bankFromWorkbook(fileName, arrayBuffer) {
  if (!window.XLSX) throw new Error("No se ha podido cargar el lector de Excel.");
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames.includes("Preguntas_detalle")
    ? "Preguntas_detalle"
    : workbook.SheetNames.includes("preguntas")
      ? "preguntas"
      : workbook.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  const rows = rawRows.map(normalizeRow);
  const fallbackTopic = inferTopic(fileName);
  const subjects = new Map();
  const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };

  rows.forEach((row, rowIndex) => {
    const subjectName = String(row.asignatura || "General").trim() || "General";
    const topicName = String(row.tema || fallbackTopic.name).trim() || fallbackTopic.name;
    const topic = { id: slug(topicName), name: topicName };
    const prompt = String(row.pregunta || "").trim();
    const options = ["respuesta_a", "respuesta_b", "respuesta_c", "respuesta_d"].map((key) => String(row[key] || "").trim());
    const correctLetter = String(row.respuesta_correcta || "").trim().toUpperCase();
    if (!prompt || options.some((option) => !option) || !(correctLetter in letterToIndex)) return;

    const subjectId = slug(subjectName);
    if (!subjects.has(subjectId)) {
      subjects.set(subjectId, { id: subjectId, name: subjectName, topics: [], questions: [] });
    }
    const subject = subjects.get(subjectId);
    if (!subject.topics.some((item) => item.id === topic.id)) subject.topics.push(topic);
    const correctIndex = letterToIndex[correctLetter];
    const explanation = String(row.explicacion_respuesta_correcta || row.texto_respuesta_correcta || "").trim();
    subject.questions.push({
      id: `${subjectId}-${topic.id}-${slug(prompt).slice(0, 32)}-${rowIndex + 2}`,
      topicId: topic.id,
      prompt,
      options,
      correctIndex,
      difficulty: normalizeDifficulty(row.dificultad),
      explanation: explanation || `Respuesta correcta: ${options[correctIndex]}`,
      source: `${fileName}, fila ${rowIndex + 2}`,
    });
  });

  return { version: "uploaded", subjects: [...subjects.values()] };
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [slug(key).replaceAll("-", "_"), value]));
}

function inferTopic(fileName) {
  const match = fileName.match(/tema[_ -]*(\d+)/i);
  if (match) return { id: `tema-${match[1]}`, name: `Tema ${match[1]}` };
  return { id: slug(fileName.replace(/\.[^.]+$/, "")), name: fileName.replace(/\.[^.]+$/, "") };
}

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "general";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.subject.addEventListener("change", () => {
  els.topicSearch.value = "";
  renderTopics();
});
els.topicCheckboxes.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  const subject = getSubject();
  ensureTopicSelection(subject);
  if (input.checked) state.topicSelections[subject.id].add(input.value);
  else state.topicSelections[subject.id].delete(input.value);
  renderStats();
});
els.topicCheckboxes.addEventListener("click", (event) => {
  const button = event.target.closest(".topic-edit");
  if (!button) return;
  event.preventDefault();
  renameTopic(button.dataset.topicId);
});
els.topicSearch.addEventListener("input", renderTopics);
els.selectAllTopics.addEventListener("click", () => setVisibleTopicsChecked(true));
els.clearTopics.addEventListener("click", () => setVisibleTopicsChecked(false));
els.length.addEventListener("change", () => {
  els.customLengthLabel.classList.toggle("hidden", els.length.value !== "custom");
  if (els.length.value !== "custom") els.customLength.value = "";
});
els.start.addEventListener("click", () => startQuiz(filteredQuestions()));
els.review.addEventListener("click", () => startQuiz(filteredQuestions({ missedOnly: true })));
els.clearMissed.addEventListener("click", clearMissedQuestions);
els.back.addEventListener("click", () => show("setup"));
els.newTest.addEventListener("click", () => show("setup"));
els.retryMissed.addEventListener("click", () => startQuiz(filteredQuestions({ missedOnly: true })));
els.next.addEventListener("click", () => {
  if (state.currentIndex === state.activeQuestions.length - 1) finishQuiz();
  else {
    state.currentIndex += 1;
    renderQuestion();
  }
});
els.answers.addEventListener("click", (event) => {
  const button = event.target.closest(".answer");
  if (!button) return;
  chooseAnswer(Number(button.dataset.index));
});
els.loadFile.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", async () => {
  const files = [...els.fileInput.files];
  let added = 0;
  for (const file of files) {
    added += mergeBank(await bankFromFile(file));
  }
  hydrateSelectors();
  renderStats();
  show("setup");
  els.fileInput.value = "";
  if (added > 0) {
    els.loadFile.title = `Añadidas ${added} preguntas`;
  }
});

let titleClicks = 0;
let titleClickTimer = 0;
document.querySelector("h1").addEventListener("click", () => {
  window.clearTimeout(titleClickTimer);
  titleClicks += 1;
  if (titleClicks >= 7) {
    titleClicks = 0;
    wipeQuestionBank();
    return;
  }
  titleClickTimer = window.setTimeout(() => {
    titleClicks = 0;
  }, 1500);
});

boot();
