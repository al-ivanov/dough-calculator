import { calculate } from "./formula.js";
import {
  PROOF_HOURS,
  fermentElapsed,
  formatClock,
  pauseFerment,
  proofRemaining,
  resetFerment,
  sanitizeTimers,
  splitElapsed,
  startFerment,
} from "./timers.js";

const STORAGE_KEY = "testo-settings-v1";
const DIAMETER_MIN = 25;
const DIAMETER_MAX = 51;
const COUNT_MIN = 1;
const COUNT_MAX = 12;

const THICKNESS_LABEL = {
  thin: "тонкое",
  regular: "обычное",
  thick: "толстое",
};

const STEPS = {
  regular: [
    "Охладите воду ниже 16 °C.",
    "Разведите в ней сухие дрожжи.",
    "Всыпьте муку, влейте оливковое масло и месите 2 минуты.",
    "Добавьте сахар и соль на низкой скорости.",
    "Месите ещё 10 минут.",
    "Накройте миску и оставьте тесто на 1–3 часа.",
    "Разделите на шарики и защипните шов снизу.",
    "Уберите в холодильник на 2–4 дня. Лучший срок — 3 дня.",
    "Перед раскаткой достаньте тесто и дайте ему согреться до комнатной температуры.",
  ],
  glutenFree: [
    "Смешайте холодную воду и сухие дрожжи.",
    "Добавьте безглютеновую муку и оливковое масло, месите 2 минуты.",
    "Всыпьте сахар и соль и месите ещё 3–4 минуты.",
    "Поставьте миску в холодильник на 15 минут, чтобы тесто окрепло.",
    "Смажьте руки маслом и сформуйте шарики.",
    "Храните в холодильнике не дольше 48 часов.",
    "Перед раскаткой дайте тесту согреться до комнатной температуры.",
  ],
};

const integerFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const diameterInput = document.getElementById("diameter");
const countInput = document.getElementById("count");
const glutenInput = document.getElementById("gluten");
const chips = [...document.querySelectorAll(".chips button")];
const thicknessInputs = [...document.querySelectorAll('input[name="thickness"]')];
const stepsToggle = document.getElementById("steps-toggle");
const stepsWrap = document.getElementById("steps-wrap");
const copyButton = document.getElementById("copy");
const installButton = document.getElementById("install");
const installDialog = document.getElementById("install-dialog");

let copyResetTimer = 0;

function plural(value, one, few, many) {
  const abs = Math.abs(Math.trunc(value)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last > 1 && last < 5) return few;
  return many;
}

function formatNumber(value, digits) {
  return (digits === 1 ? decimalFormat : integerFormat).format(value);
}

function formatPercent(value) {
  const digits = Number.isInteger(value) ? 0 : 1;
  return `${formatNumber(value, digits)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function inchesPhrase(inches) {
  const rounded = Number(inches.toFixed(1));
  const digits = Number.isInteger(rounded) ? 0 : 1;
  const word = Number.isInteger(rounded) ? plural(rounded, "дюйм", "дюйма", "дюймов") : "дюйма";
  return `${formatNumber(rounded, digits)} ${word}`;
}

function sanitize(raw) {
  const diameter = Math.round(Number(raw?.diameterCm));
  const count = Math.round(Number(raw?.count));
  const thickness = raw?.thickness === "thin" || raw?.thickness === "thick" ? raw.thickness : "regular";
  return {
    diameterCm: clamp(Number.isFinite(diameter) ? diameter : 30, DIAMETER_MIN, DIAMETER_MAX),
    count: clamp(Number.isFinite(count) ? count : 4, COUNT_MIN, COUNT_MAX),
    thickness,
    glutenFree: raw?.glutenFree === true,
  };
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return raw ? sanitize(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode can reject storage. The current calculation still shows.
  }
}

function readForm() {
  const selected = thicknessInputs.find((input) => input.checked);
  return sanitize({
    diameterCm: diameterInput.value,
    count: countInput.value,
    thickness: selected ? selected.value : "regular",
    glutenFree: glutenInput.checked,
  });
}

function applySettings(state) {
  diameterInput.value = String(state.diameterCm);
  countInput.value = String(state.count);
  glutenInput.checked = state.glutenFree;
  for (const input of thicknessInputs) {
    input.checked = input.value === state.thickness;
  }
}

function fillRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const ratio = (Number(input.value) - min) / (max - min);
  input.style.setProperty("--fill", `${Math.round(ratio * 1000) / 10}%`);
}

function ingredientsFor(result) {
  return [
    {
      name: result.glutenFree ? "Безглютеновая мука" : "Пшеничная мука",
      note: result.glutenFree ? "Смесь для пиццы" : "Белок 12–14%",
      amount: result.flour,
      digits: 0,
      percent: 100,
    },
    {
      name: "Вода",
      note: "Холодная, ниже 16 °C",
      amount: result.water,
      digits: 0,
      percent: result.hydrationPercent,
    },
    {
      name: "Дрожжи",
      note: "Сухие",
      amount: result.yeast,
      digits: 1,
      percent: 0.4,
    },
    { name: "Соль", note: "", amount: result.salt, digits: 0, percent: 2.5 },
    { name: "Сахар", note: "", amount: result.sugar, digits: 0, percent: 2 },
    { name: "Оливковое масло", note: "", amount: result.oil, digits: 0, percent: 3.3 },
  ];
}

function summaryLine(state) {
  const balls = plural(state.count, "шарик", "шарика", "шариков");
  return `${state.count} ${balls} · ${formatNumber(state.diameterCm, 0)} см · ${THICKNESS_LABEL[state.thickness]}`;
}

function tipFor(state, result) {
  if (state.glutenFree) {
    return {
      title: "Без глютена",
      text: "Безглютеновое тесто липкое. Смажьте руки маслом, прежде чем формовать шарики.",
    };
  }
  if (result.diameterIn >= 18) {
    return {
      title: "Большая пицца",
      text: `Пицца ${formatNumber(state.diameterCm, 0)} см — большая. Прогрейте камень или сталь 45 минут на максимальной температуре.`,
    };
  }
  if (state.count >= 8) {
    const balls = plural(state.count, "шарик", "шарика", "шариков");
    return {
      title: "Большая партия",
      text: `Сразу разделите тесто на все ${state.count} ${balls}. В холодильнике они лежат до 4 дней.`,
    };
  }
  if (state.thickness === "thick") {
    return {
      title: "Толстая корка",
      text: "Толстую корку пеките при 230 °C примерно 10–12 минут, а не 6–8.",
    };
  }
  if (state.thickness === "thin") {
    return {
      title: "Тонкая корка",
      text: "Тонкая корка готова за 4–5 минут. Не отходите от духовки.",
    };
  }
  return {
    title: "Выпечка",
    text: "Разогрейте печь на максимум. На камне или стали обычная пицца печётся 6–8 минут.",
  };
}

function recipeText(state, result, items, steps) {
  return [
    "Тесто для пиццы",
    summaryLine(state),
    state.glutenFree ? "Без глютена" : "Обычное тесто",
    state.glutenFree ? "В холодильнике до 48 часов" : "Холодная ферментация 2–4 дня",
    "",
    `Шарик: ${formatNumber(result.ball, 0)} г`,
    "",
    ...items.map((item) => `${item.name}: ${formatNumber(item.amount, item.digits)} г`),
    "",
    `Гидратация: ${result.hydrationPercent}%`,
    "",
    "Как замесить",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function renderTable(items) {
  const body = document.getElementById("ingredients");
  body.replaceChildren(
    ...items.map((item) => {
      const row = document.createElement("tr");
      const heading = document.createElement("th");
      heading.scope = "row";
      const name = document.createElement("span");
      name.className = "ing-name";
      name.textContent = item.name;
      heading.append(name);
      if (item.note) {
        const note = document.createElement("span");
        note.className = "ing-note";
        note.textContent = item.note;
        heading.append(note);
      }
      const amount = document.createElement("td");
      amount.textContent = `${formatNumber(item.amount, item.digits)} г`;
      const percent = document.createElement("td");
      percent.textContent = formatPercent(item.percent);
      row.append(heading, amount, percent);
      return row;
    }),
  );
}

function renderSteps(steps) {
  const list = document.getElementById("steps");
  list.replaceChildren(
    ...steps.map((text, index) => {
      const item = document.createElement("li");
      const number = document.createElement("span");
      number.className = "step-num";
      number.textContent = String(index + 1).padStart(2, "0");
      const body = document.createElement("span");
      body.textContent = text;
      item.append(number, body);
      return item;
    }),
  );
}

function render() {
  const state = readForm();
  const result = calculate(state);
  const items = ingredientsFor(result);
  const steps = state.glutenFree ? STEPS.glutenFree : STEPS.regular;
  const tip = tipFor(state, result);

  document.getElementById("diameter-value").textContent = formatNumber(state.diameterCm, 0);
  document.getElementById("count-value").textContent = formatNumber(state.count, 0);
  document.getElementById("diameter-inches").textContent = inchesPhrase(result.diameterIn);
  diameterInput.setAttribute(
    "aria-valuetext",
    `${formatNumber(state.diameterCm, 0)} сантиметров, ${inchesPhrase(result.diameterIn)}`,
  );
  countInput.setAttribute(
    "aria-valuetext",
    `${state.count} ${plural(state.count, "пицца", "пиццы", "пицц")}`,
  );
  fillRange(diameterInput);
  fillRange(countInput);

  for (const chip of chips) {
    chip.setAttribute("aria-pressed", String(Number(chip.dataset.cm) === state.diameterCm));
  }

  document.getElementById("stat-ball").textContent = formatNumber(result.ball, 0);
  document.getElementById("stat-flour").textContent = formatNumber(result.flour, 0);
  document.getElementById("stat-water").textContent = formatNumber(result.water, 0);
  document.getElementById("stat-hydration").textContent = formatNumber(result.hydrationPercent, 0);
  renderTable(items);

  document.getElementById("pill-type").textContent = state.glutenFree ? "Без глютена" : "Обычное тесто";
  document.getElementById("pill-ferment").textContent = state.glutenFree
    ? "В холодильнике до 48 часов"
    : "Холодная ферментация 2–4 дня";
  document.getElementById("pill-summary").textContent = summaryLine(state);

  document.getElementById("tip-title").textContent = tip.title;
  document.getElementById("tip-text").textContent = tip.text;
  document.getElementById("steps-title").textContent = state.glutenFree ? "Как замесить без глютена" : "Как замесить";
  document.getElementById("steps-hint").textContent = `${steps.length} ${plural(steps.length, "шаг", "шага", "шагов")}`;
  renderSteps(steps);
  document.getElementById("recipe-text").textContent = recipeText(state, result, items, steps);
}

function onEdit() {
  const state = readForm();
  applySettings(state);
  saveSettings(state);
  render();
}

function setStepsOpen(open) {
  stepsToggle.setAttribute("aria-expanded", String(open));
  stepsWrap.hidden = !open;
}

async function copyRecipe() {
  const text = document.getElementById("recipe-text").textContent;
  const original = "Скопировать";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (!copied) throw new Error("copy failed");
    }
    copyButton.textContent = "Скопировано";
  } catch {
    copyButton.textContent = "Не вышло скопировать";
  }
  window.clearTimeout(copyResetTimer);
  copyResetTimer = window.setTimeout(() => {
    copyButton.textContent = original;
  }, 2000);
}

function setupInstall() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) {
    installButton.hidden = true;
    return;
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt) {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      document.getElementById("install-ios").hidden = !ios;
      document.getElementById("install-other").hidden = ios;
      installDialog.showModal();
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  document.getElementById("install-close").addEventListener("click", () => {
    installDialog.close();
  });
}

diameterInput.addEventListener("input", onEdit);
countInput.addEventListener("input", onEdit);
glutenInput.addEventListener("change", onEdit);
for (const input of thicknessInputs) input.addEventListener("change", onEdit);
for (const chip of chips) {
  chip.addEventListener("click", () => {
    diameterInput.value = chip.dataset.cm;
    onEdit();
  });
}
stepsToggle.addEventListener("click", () => {
  setStepsOpen(stepsToggle.getAttribute("aria-expanded") !== "true");
});
copyButton.addEventListener("click", () => {
  copyRecipe();
});
document.getElementById("print").addEventListener("click", () => {
  window.print();
});

const stored = loadSettings();
if (stored) applySettings(stored);
render();
setupInstall();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error(error);
  });
}

const TIMERS_KEY = "testo-timers-v1";
const proofClock = document.getElementById("proof-clock");
const proofStatus = document.getElementById("proof-status");
const fermentDays = document.getElementById("ferment-days");
const fermentHms = document.getElementById("ferment-hms");
const proofHourButtons = [...document.querySelectorAll("#proof-hours button")];
const fermentStart = document.getElementById("ferment-start");
const fermentPause = document.getElementById("ferment-pause");

let timers = loadTimers();

function loadTimers() {
  try {
    return sanitizeTimers(JSON.parse(localStorage.getItem(TIMERS_KEY) || "null"));
  } catch {
    return sanitizeTimers(null);
  }
}

function saveTimers() {
  try {
    localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
  } catch {
    // The clocks still run for this visit if storage is blocked.
  }
}

function renderTimers() {
  const now = Date.now();
  const remaining = proofRemaining(timers.proof.endsAt, now);
  proofClock.classList.toggle("is-done", remaining === 0);
  if (remaining == null) {
    proofClock.textContent = formatClock(timers.proof.hours * 60 * 60 * 1000);
    proofStatus.textContent = "";
  } else if (remaining === 0) {
    proofClock.textContent = "Пора в холодильник";
    proofStatus.textContent = timers.proof.notify === "failed" ? "Уведомление не запланировано." : "";
  } else {
    proofClock.textContent = formatClock(remaining);
    proofStatus.textContent =
      timers.proof.notify === "scheduled"
        ? "Уведомление придёт, когда время выйдет."
        : timers.proof.notify === "failed"
          ? "Уведомление не запланировано."
          : "";
  }

  for (const button of proofHourButtons) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.hours) === timers.proof.hours));
  }

  const elapsed = splitElapsed(fermentElapsed(timers.ferment, now));
  fermentDays.textContent = elapsed.daysLabel;
  fermentHms.textContent = elapsed.clock;
  fermentStart.disabled = timers.ferment.running;
  fermentPause.disabled = !timers.ferment.running;
}

function urlBase64ToUint8Array(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), milliseconds);
    }),
  ]);
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await withTimeout(navigator.serviceWorker.ready, 8000);
  return registration.pushManager.getSubscription();
}

async function subscribeForPush() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("unsupported");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission");
  const registration = await withTimeout(navigator.serviceWorker.ready, 8000);
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  const response = await fetch("./api/vapid-public-key");
  if (!response.ok) throw new Error("key");
  const { publicKey } = await response.json();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

async function scheduleNotification(endsAt) {
  const subscription = await subscribeForPush();
  const response = await fetch("./api/schedule", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription, endsAt }),
  });
  if (!response.ok) throw new Error("schedule");
}

async function cancelNotification() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch("./api/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
}

function setupTimers() {
  for (const button of proofHourButtons) {
    button.addEventListener("click", () => {
      const hours = Number(button.dataset.hours);
      if (!PROOF_HOURS.includes(hours)) return;
      timers.proof.hours = hours;
      saveTimers();
      renderTimers();
    });
  }

  document.getElementById("proof-start").addEventListener("click", () => {
    timers.proof.endsAt = Date.now() + timers.proof.hours * 60 * 60 * 1000;
    timers.proof.notify = "off";
    saveTimers();
    renderTimers();
    const endsAt = timers.proof.endsAt;
    scheduleNotification(endsAt)
      .then(() => {
        if (timers.proof.endsAt !== endsAt) return;
        timers.proof.notify = "scheduled";
        saveTimers();
        renderTimers();
      })
      .catch(() => {
        if (timers.proof.endsAt !== endsAt) return;
        timers.proof.notify = "failed";
        saveTimers();
        renderTimers();
      });
  });

  document.getElementById("proof-reset").addEventListener("click", () => {
    timers.proof.endsAt = null;
    timers.proof.notify = "off";
    saveTimers();
    renderTimers();
    cancelNotification().catch(() => {
      // The countdown is already cleared on this phone.
    });
  });

  fermentStart.addEventListener("click", () => {
    timers.ferment = startFerment(timers.ferment, Date.now());
    saveTimers();
    renderTimers();
  });
  fermentPause.addEventListener("click", () => {
    timers.ferment = pauseFerment(timers.ferment, Date.now());
    saveTimers();
    renderTimers();
  });
  document.getElementById("ferment-reset").addEventListener("click", () => {
    timers.ferment = resetFerment();
    saveTimers();
    renderTimers();
  });

  renderTimers();
  window.setInterval(renderTimers, 1000);
  document.addEventListener("visibilitychange", renderTimers);
}

setupTimers();
