
const expression = document.getElementById("expression");
const result = document.getElementById("result");
const status = document.getElementById("status");
const keypad = document.getElementById("keypad");
const memoryIndicator = document.getElementById("memoryIndicator");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");

let angleMode = "DEG";
let memory = 0;
let lastAnswer = 0;
let history = [];
let justCalculated = false;

const numberFormat = n => {
  if (!Number.isFinite(n)) throw Error("Result is not finite");
  if (Object.is(n, -0)) n = 0;
  return Number(n.toPrecision(12)).toString();
};

function tokenize(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }

    const rest = source.slice(i);
    const number = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);

    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      i += number[0].length;
      continue;
    }

    const word = rest.match(/^[a-z]+/i);
    if (word) {
      const name = word[0].toLowerCase();
      if (!["sin", "cos", "tan", "asin", "acos", "atan",
            "sqrt", "cbrt", "log", "ln", "abs", "pi", "e"].includes(name)) {
        throw Error("Unknown function: " + name);
      }
      tokens.push({ type: "word", value: name });
      i += word[0].length;
      continue;
    }

    if ("+-*/^()%".includes(source[i])) {
      tokens.push({ type: "symbol", value: source[i] });
      i++;
      continue;
    }

    throw Error("Invalid character: " + source[i]);
  }

  // Support implicit multiplication: 2pi, 2(3+4), (2)(3).
  const output = [];
  const endsValue = t =>
    t.type === "number" ||
    (t.type === "word" && ["pi", "e"].includes(t.value)) ||
    (t.type === "symbol" && [")", "%"].includes(t.value));

  const startsValue = t =>
    t.type === "number" ||
    t.type === "word" ||
    (t.type === "symbol" && t.value === "(");

  for (const token of tokens) {
    const prev = output[output.length - 1];

    if (prev && endsValue(prev) && startsValue(token)) {
      output.push({ type: "symbol", value: "*" });
    }

    output.push(token);
  }

  return output;
}

function evaluate(source) {
  const tokens = tokenize(source);
  let pos = 0;

  function peek(value) {
    return tokens[pos]?.value === value;
  }

  function take(value) {
    if (!peek(value)) throw Error("Expected " + value);
    pos++;
  }

  function parseExpression() {
    let value = parseProduct();

    while (peek("+") || peek("-")) {
      const op = tokens[pos++].value;
      const right = parseProduct();
      value = op === "+" ? value + right : value - right;
    }

    return value;
  }

  function parseProduct() {
    let value = parsePostfix();

    while (peek("*") || peek("/")) {
      const op = tokens[pos++].value;
      const right = parsePostfix();

      if (op === "/" && right === 0) {
        throw Error("Cannot divide by zero");
      }

      value = op === "*" ? value * right : value / right;
    }

    return value;
  }

  function parsePostfix() {
    let value = parseUnary();

    while (peek("%")) {
      pos++;
      value /= 100;
    }

    return value;
  }

  function parseUnary() {
    if (peek("+")) {
      pos++;
      return parseUnary();
    }

    if (peek("-")) {
      pos++;
      return -parseUnary();
    }

    return parsePower();
  }

  function parsePower() {
    let value = parsePrimary();

    if (peek("^")) {
      pos++;
      value = Math.pow(value, parseUnary());
    }

    return value;
  }

  function parsePrimary() {
    const token = tokens[pos++];

    if (!token) throw Error("Incomplete expression");

    if (token.type === "number") return token.value;

    if (token.type === "symbol" && token.value === "(") {
      const value = parseExpression();
      take(")");
      return value;
    }

    if (token.type === "word") {
      const name = token.value;

      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;

      take("(");
      const x = parseExpression();
      take(")");

      const toRadians = a =>
        angleMode === "DEG" ? a * Math.PI / 180 :
        angleMode === "GRAD" ? a * Math.PI / 200 : a;

      const fromRadians = a =>
        angleMode === "DEG" ? a * 180 / Math.PI :
        angleMode === "GRAD" ? a * 200 / Math.PI : a;

      switch (name) {
        case "sin": return Math.sin(toRadians(x));
        case "cos": return Math.cos(toRadians(x));
        case "tan":
          if (Math.abs(Math.cos(toRadians(x))) < 1e-14) {
            throw Error("Tangent is undefined here");
          }
          return Math.tan(toRadians(x));
        case "asin": return fromRadians(Math.asin(x));
        case "acos": return fromRadians(Math.acos(x));
        case "atan": return fromRadians(Math.atan(x));
        case "sqrt":
          if (x < 0) throw Error("Square root requires x ≥ 0");
          return Math.sqrt(x);
        case "cbrt": return Math.cbrt(x);
        case "log":
          if (x <= 0) throw Error("log requires x > 0");
          return Math.log10(x);
        case "ln":
          if (x <= 0) throw Error("ln requires x > 0");
          return Math.log(x);
        case "abs": return Math.abs(x);
      }
    }

    throw Error("Invalid expression");
  }

  if (!tokens.length) throw Error("Enter an expression");

  const value = parseExpression();

  if (pos !== tokens.length) throw Error("Check your expression");
  if (!Number.isFinite(value)) throw Error("Result is not finite");

  return value;
}

function insertText(text) {
  const start = expression.selectionStart ?? expression.value.length;
  const end = expression.selectionEnd ?? start;
  let current = expression.value;

  if (justCalculated && /^[0-9.]$/.test(text)) {
    current = "";
    expression.value = "";
  }

  justCalculated = false;
  expression.value =
    current.slice(0, start) + text + current.slice(end);

  const cursor = start + text.length;
  expression.focus();
  expression.setSelectionRange(cursor, cursor);
  status.textContent = "Editing";
}

function getValue() {
  return evaluate(expression.value);
}

function showError(message) {
  result.textContent = "Error";
  status.textContent = message;
}

function calculate() {
  try {
    const source = expression.value.trim();
    const value = evaluate(source);

    result.textContent = numberFormat(value);
    status.textContent = "Calculated";
    lastAnswer = value;
    justCalculated = true;

    history.unshift({
      expression: source,
      result: numberFormat(value)
    });

    history = history.slice(0, 30);
    renderHistory();
  } catch (error) {
    showError(error.message);
    justCalculated = false;
  }
}

function renderHistory() {
  historyList.replaceChildren();

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No calculations yet.";
    historyList.appendChild(empty);
    return;
  }

  history.forEach(item => {
    const button = document.createElement("button");
    button.className = "history-item";

    const left = document.createElement("span");
    const small = document.createElement("small");
    small.textContent = item.expression;
    left.appendChild(small);

    const right = document.createElement("strong");
    right.textContent = item.result;

    button.append(left, right);
    button.addEventListener("click", () => {
      expression.value = item.expression;
      result.textContent = item.result;
      status.textContent = "History selected";
      historyPanel.hidden = true;
      justCalculated = false;
    });

    historyList.appendChild(button);
  });
}

function setExpression(value) {
  expression.value = value;
  expression.focus();
  justCalculated = false;
}

function performAction(action) {
  try {
    switch (action) {
      case "clear":
        setExpression("");
        result.textContent = "0";
        status.textContent = "Ready";
        break;

      case "clear-entry":
        setExpression("");
        status.textContent = "Entry cleared";
        break;

      case "backspace": {
        const start = expression.selectionStart;
        const end = expression.selectionEnd;
        const value = expression.value;

        if (start !== end) {
          setExpression(value.slice(0, start) + value.slice(end));
          expression.setSelectionRange(start, start);
        } else if (start > 0) {
          setExpression(value.slice(0, start - 1) + value.slice(start));
          expression.setSelectionRange(start - 1, start - 1);
        }
        break;
      }

      case "equals":
        calculate();
        break;

      case "sign":
        if (expression.value) {
          setExpression("-(" + expression.value + ")");
        } else {
          insertText("-");
        }
        break;

      case "reciprocal": {
        const value = getValue();
        if (value === 0) throw Error("Cannot divide by zero");
        setExpression(`1/(${expression.value})`);
        calculate();
        break;
      }

      case "absolute":
        if (expression.value) {
          setExpression(`abs(${expression.value})`);
          calculate();
        }
        break;

      case "ans":
        insertText(numberFormat(lastAnswer));
        break;

      case "memory-clear":
        memory = 0;
        memoryIndicator.textContent = "M: 0";
        break;

      case "memory-recall":
        insertText(numberFormat(memory));
        break;

      case "memory-save":
        memory = resultValue();
        memoryIndicator.textContent = "M: " + numberFormat(memory);
        status.textContent = "Saved to memory";
        break;

      case "memory-add":
        memory += resultValue();
        memoryIndicator.textContent = "M: " + numberFormat(memory);
        status.textContent = "Added to memory";
        break;

      case "memory-subtract":
        memory -= resultValue();
        memoryIndicator.textContent = "M: " + numberFormat(memory);
        status.textContent = "Subtracted from memory";
        break;
    }
  } catch (error) {
    showError(error.message);
  }
}

function resultValue() {
  // Prefer the expression when it is valid; otherwise use displayed result.
  if (expression.value.trim()) return getValue();

  const value = Number(result.textContent);
  if (!Number.isFinite(value)) throw Error("No valid result");
  return value;
}

keypad.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.insert !== undefined) {
    insertText(button.dataset.insert);
  } else if (button.dataset.action) {
    performAction(button.dataset.action);
  }
});

document.querySelectorAll(".mode").forEach(button => {
  button.addEventListener("click", () => {
    angleMode = button.dataset.mode;

    document.querySelectorAll(".mode").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    status.textContent = "Angle mode: " + angleMode;
  });
});

document.getElementById("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
});

document.getElementById("historyBtn").addEventListener("click", () => {
  historyPanel.hidden = !historyPanel.hidden;
  renderHistory();
});

document.getElementById("clearHistory").addEventListener("click", () => {
  history = [];
  renderHistory();
});

document.getElementById("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(result.textContent);
    status.textContent = "Result copied";
  } catch {
    status.textContent = "Copy unavailable in this browser";
  }
});

expression.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    calculate();
  }

  if (event.key === "Escape") {
    performAction("clear");
  }
});

renderHistory();
