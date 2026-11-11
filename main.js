const CONFIG = {
  QUESTION: "What is the empty number?",
  VISIBLE_COUNT: 8,
  MIN_VALUE: -999,
  MAX_VALUE: 999,
  MAX_ATTEMPTS: 1000,
  COLORS: {
    CORRECT: "lightgreen",
    INCORRECT: "red",
  },
};

const state = {
  seriesTemplates: [],
  currentSeries: [],
  currentAnswer: null,
  currentLogic: "",
  pageStartTime: Date.now(),
  lastSubmitTime: null,
  correctCount: 0,
  totalAttempts: 0,
  currentQuestionSubmitted: false,
};

const rand = {
  int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  nonZero(min, max) {
    let v;
    do {
      v = rand.int(min, max);
    } while (v === 0);
    return v;
  },
  pick(array) {
    return array[Math.floor(Math.random() * array.length)];
  },
};

const SYMBOLS = {
  addition: "+",
  subtraction: "-",
  multiplication: "×",
  division: "÷",
};

function applyOperation(type, value, x) {
  switch (type) {
    case "addition":
      return x + value;
    case "subtraction":
      return x - value;
    case "multiplication":
      return x * value;
    case "division":
      return x / value;
    default:
      return NaN;
  }
}

function signed(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

class SeriesGenerator {
  buildArithmetic(t, count) {
    const value = rand.int(t.value.min, t.value.max);
    let start;

    if (t.type === "division") {
      start =
        rand.nonZero(t.start.min, t.start.max) * Math.pow(value, count - 1);
    } else if (t.type === "multiplication") {
      start = rand.nonZero(t.start.min, t.start.max);
    } else {
      start = rand.int(t.start.min, t.start.max);
    }

    const terms = [start];
    for (let i = 1; i < count; i++) {
      terms.push(applyOperation(t.type, value, terms[i - 1]));
    }
    return { terms, logic: `Always ${SYMBOLS[t.type]}${value}` };
  }

  buildAlternating(t, count) {
    const [typeA, typeB] = rand.pick(t.pairs);
    const valueA = rand.int(t.values[typeA].min, t.values[typeA].max);
    let valueB = rand.int(t.values[typeB].min, t.values[typeB].max);
    if (valueA === valueB)
      valueB = rand.int(t.values[typeB].min, t.values[typeB].max);

    const ops = [
      { type: typeA, value: valueA },
      { type: typeB, value: valueB },
    ];
    const start = rand.nonZero(t.start.min, t.start.max);
    const terms = [start];
    for (let i = 1; i < count; i++) {
      const op = ops[(i - 1) % 2];
      terms.push(applyOperation(op.type, op.value, terms[i - 1]));
    }
    return {
      terms,
      logic: `Alternating ${SYMBOLS[typeA]}${valueA} and ${SYMBOLS[typeB]}${valueB}`,
    };
  }

  buildSquares(t, count) {
    const maxBase = Math.floor(Math.sqrt(CONFIG.MAX_VALUE));
    if (maxBase < count) return null;

    const ascending = Math.random() < 0.5;
    const terms = [];

    if (ascending) {
      const first = rand.int(1, maxBase - (count - 1));
      for (let i = 0; i < count; i++) terms.push((first + i) ** 2);
      return {
        terms,
        logic: `Ascending squares (${first}², ${first + 1}², ${first + 2}², ...)`,
      };
    }

    const first = rand.int(count, maxBase);
    for (let i = 0; i < count; i++) terms.push((first - i) ** 2);
    return {
      terms,
      logic: `Descending squares (${first}², ${first - 1}², ${first - 2}², ...)`,
    };
  }

  buildMeta(t, count) {
    const sign = rand.pick([1, -1]);
    const firstDiff = rand.int(t.firstDiff.min, t.firstDiff.max) * sign;
    const change = rand.int(t.diffChange.min, t.diffChange.max) * sign;

    const terms = [rand.int(t.start.min, t.start.max)];
    const diffs = [];
    for (let i = 0; i < count - 1; i++) {
      const diff = firstDiff + i * change;
      diffs.push(diff);
      terms.push(terms[i] + diff);
    }
    return {
      terms,
      logic: `Meta series: the step changes by ${signed(change)} each time (${diffs
        .slice(0, 4)
        .map(signed)
        .join(", ")}, ...)`,
    };
  }

  buildMetaAlternating(t, count) {
    const sign = rand.pick([1, -1]);
    const firstDiff = rand.int(t.firstDiff.min, t.firstDiff.max);
    const change = rand.int(t.diffChange.min, t.diffChange.max);

    const terms = [rand.int(t.start.min, t.start.max)];
    const diffs = [];
    for (let i = 0; i < count - 1; i++) {
      const magnitude = firstDiff + i * change;
      const diff = (i % 2 === 0 ? 1 : -1) * sign * magnitude;
      diffs.push(diff);
      terms.push(terms[i] + diff);
    }
    return {
      terms,
      logic: `Meta alternating series: steps alternate in sign and grow by ${change} (${diffs
        .slice(0, 4)
        .map(signed)
        .join(", ")}, ...)`,
    };
  }

  build(template, count) {
    switch (template.type) {
      case "addition":
      case "subtraction":
      case "multiplication":
      case "division":
        return this.buildArithmetic(template, count);
      case "alternating":
        return this.buildAlternating(template, count);
      case "squares":
        return this.buildSquares(template, count);
      case "meta":
        return this.buildMeta(template, count);
      case "metaAlternating":
        return this.buildMetaAlternating(template, count);
      default:
        console.warn(`Unknown series type: ${template.type}`);
        return null;
    }
  }

  isValid(terms) {
    if (!terms || !terms.length) return false;
    const inRange = terms.every(
      (n) =>
        Number.isInteger(n) && n >= CONFIG.MIN_VALUE && n <= CONFIG.MAX_VALUE,
    );
    const notAllSame = new Set(terms).size > 1;
    return inRange && notAllSame;
  }

  generate() {
    if (!state.seriesTemplates.length) {
      console.warn("Cannot generate series: no templates loaded");
      return null;
    }

    const candidates = [...state.seriesTemplates];
    while (candidates.length) {
      const template = candidates.splice(
        Math.floor(Math.random() * candidates.length),
        1,
      )[0];
      const count = (template.visible ?? CONFIG.VISIBLE_COUNT) + 1;

      for (let attempt = 0; attempt < CONFIG.MAX_ATTEMPTS; attempt++) {
        const result = this.build(template, count);
        if (result && this.isValid(result.terms)) {
          const visible = result.terms.slice(0, -1);
          const answer = result.terms[result.terms.length - 1];
          state.currentSeries = visible;
          state.currentAnswer = answer;
          state.currentLogic = result.logic;
          return { series: visible, answer, logic: result.logic };
        }
      }
      console.warn(
        `Template "${template.type}" could not produce a valid series.`,
      );
    }
    return null;
  }
}

class SeriesRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  render(series) {
    const cells = series.map((n) => `<td>[${n}]</td>`).join("");
    this.container.innerHTML = `
      <table>
        <tbody>
          <tr>${cells}<td>[ ? ]</td></tr>
        </tbody>
      </table>
    `;
  }
}

class UIController {
  constructor() {
    this.elements = {
      questionDisplay: document.querySelector(".questions"),
      answerInput: document.getElementById("answerInput"),
      feedback: document.getElementById("feedback"),
      answerDiv: null,
      score: document.getElementById("score"),
      lastTime: document.getElementById("last-time"),
      totalTime: document.getElementById("total-time"),
    };
  }

  displayQuestion(answer, logic) {
    this.elements.questionDisplay.innerHTML = `
      <strong>${CONFIG.QUESTION}</strong><br>
      <div id="answer" style="display:none;">Answer: ${answer}<br>Logic: ${logic}</div>
    `;
    this.clearInput();
    this.clearFeedback();
    this.elements.answerDiv = document.getElementById("answer");
  }

  clearInput() {
    this.elements.answerInput.value = "";
  }

  clearFeedback() {
    this.elements.feedback.textContent = "";
    this.elements.feedback.style.color = "";
  }

  showAnswer() {
    if (this.elements.answerDiv) {
      this.elements.answerDiv.style.display = "block";
    }
  }

  showFeedback(isCorrect) {
    this.elements.feedback.textContent = isCorrect ? "Correct." : "Wrong";
    this.elements.feedback.style.color = isCorrect
      ? CONFIG.COLORS.CORRECT
      : CONFIG.COLORS.INCORRECT;
  }

  updateScore() {
    this.elements.score.textContent = `Score: ${state.correctCount}/${state.totalAttempts}`;
  }

  updateLastTime(seconds) {
    this.elements.lastTime.textContent = `Last time spent: ${this.formatTime(seconds)}`;
  }

  updateTotalTime() {
    const totalSeconds = (Date.now() - state.pageStartTime) / 1000;
    this.elements.totalTime.textContent = `Total time spent: ${this.formatTime(totalSeconds)}`;
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  getUserAnswer() {
    return this.elements.answerInput.value;
  }
}

class AnswerValidator {
  static parse(answer) {
    if (answer == null) return NaN;
    const cleaned = String(answer).trim().replace(/,/g, "");
    if (cleaned === "") return NaN;
    return Number(cleaned);
  }

  static isCorrect(userAnswer, correctAnswer) {
    const user = this.parse(userAnswer);
    return !Number.isNaN(user) && user === Number(correctAnswer);
  }
}

class QuizApp {
  constructor() {
    this.renderer = new SeriesRenderer("table");
    this.generator = new SeriesGenerator();
    this.uiController = new UIController();
    this.initialize();
  }

  async initialize() {
    await this.loadSeriesTemplates();
    this.setupEventListeners();
    this.startTimers();
    this.generateNewQuestion();
  }

  async loadSeriesTemplates() {
    try {
      const response = await fetch("q.json");
      state.seriesTemplates = await response.json();
    } catch (error) {
      console.error("Error loading q.json:", error);
      alert("Could not load q.json.");
    }
  }

  setupEventListeners() {
    document
      .getElementById("questionButton")
      .addEventListener("click", () => this.generateNewQuestion());

    document
      .getElementById("answerButton")
      .addEventListener("click", () => this.uiController.showAnswer());

    document
      .getElementById("randomizeButton")
      .addEventListener("click", () => this.generateNewQuestion());

    document
      .getElementById("submitAnswerButton")
      .addEventListener("click", () => this.handleSubmit());

    this.uiController.elements.answerInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.handleSubmit();
    });
  }

  startTimers() {
    setInterval(() => this.uiController.updateTotalTime(), 1000);
  }

  generateNewQuestion() {
    const result = this.generator.generate();
    if (!result) return;

    this.renderer.render(result.series);
    this.uiController.displayQuestion(result.answer, result.logic);
    state.currentQuestionSubmitted = false;
  }

  handleSubmit() {
    if (state.currentQuestionSubmitted) return;

    const isCorrect = AnswerValidator.isCorrect(
      this.uiController.getUserAnswer(),
      state.currentAnswer,
    );

    state.totalAttempts++;
    if (isCorrect) state.correctCount++;

    this.uiController.updateScore();
    this.uiController.showFeedback(isCorrect);

    const now = Date.now();
    if (state.lastSubmitTime) {
      this.uiController.updateLastTime((now - state.lastSubmitTime) / 1000);
    }
    state.lastSubmitTime = now;

    state.currentQuestionSubmitted = true;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new QuizApp());
} else {
  new QuizApp();
}
