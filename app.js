"use strict";

const STORAGE_KEY = "iro-katachi-lab-v1";
const SHAPE_NAMES = {
  circle: "まる",
  square: "しかく",
  triangle: "さんかく",
  line: "せん",
  blob: "ふしぎな形",
};
const PALETTE = [
  "#2457d6", "#3fa7d6", "#46b978", "#9bd356", "#ffd84a", "#f5a623",
  "#f05b54", "#db3a78", "#8f54c7", "#5a3d8a", "#272b3f", "#ffffff",
];
const CHALLENGES = [
  { title: "スピード", hint: "ななめの形を使ってみよう" },
  { title: "しずけさ", hint: "色の数を3色までにしてみよう" },
  { title: "元気", hint: "大きさのちがう形を重ねてみよう" },
  { title: "ふしぎ", hint: "同じ形を向きを変えて並べてみよう" },
  { title: "やさしさ", hint: "形と背景の色を近づけてみよう" },
  { title: "ドキドキ", hint: "反対の感じがする色をとなりに置こう" },
];

const canvas = document.querySelector("#artCanvas");
const ctx = canvas.getContext("2d");
const compareCanvasA = document.querySelector("#compareCanvasA");
const compareCanvasB = document.querySelector("#compareCanvasB");
const compareDialog = document.querySelector("#compareDialog");

const createBlankPlan = () => ({
  background: "#ffffff",
  shapes: [],
  selectedId: null,
  reflection: { feeling: "", idea: "" },
  history: [],
  future: [],
});

const app = {
  activePlan: "A",
  color: PALETTE[0],
  challengeIndex: 0,
  plans: { A: createBlankPlan(), B: createBlankPlan() },
  dragging: null,
  didDrag: false,
};

let nextId = Date.now();
let toastTimer;
let saveTimer;

function uid() {
  nextId += 1;
  return `shape-${nextId}`;
}

function activePlan() {
  return app.plans[app.activePlan];
}

function snapshot(plan = activePlan()) {
  return JSON.stringify({ background: plan.background, shapes: plan.shapes });
}

function pushHistory() {
  const plan = activePlan();
  plan.history.push(snapshot(plan));
  if (plan.history.length > 40) plan.history.shift();
  plan.future = [];
}

function restoreSnapshot(serialized) {
  const data = JSON.parse(serialized);
  const plan = activePlan();
  plan.background = data.background;
  plan.shapes = data.shapes;
  plan.selectedId = null;
  document.querySelector("#backgroundPicker").value = plan.background;
  render();
  updateInspector();
  scheduleSave();
}

function undo() {
  const plan = activePlan();
  if (!plan.history.length) return;
  plan.future.push(snapshot(plan));
  restoreSnapshot(plan.history.pop());
}

function redo() {
  const plan = activePlan();
  if (!plan.future.length) return;
  plan.history.push(snapshot(plan));
  restoreSnapshot(plan.future.pop());
}

function makeShape(type) {
  const offsets = [-90, -45, 0, 45, 90];
  const offset = offsets[activePlan().shapes.length % offsets.length];
  return {
    id: uid(),
    type,
    x: 500 + offset,
    y: 500 + offset / 2,
    size: type === "line" ? 130 : 100,
    rotation: type === "triangle" ? -10 : 0,
    color: app.color,
    opacity: 1,
  };
}

function addShape(type) {
  pushHistory();
  const shape = makeShape(type);
  activePlan().shapes.push(shape);
  activePlan().selectedId = shape.id;
  document.querySelector("#canvasTip").classList.add("hidden");
  render();
  updateInspector();
  scheduleSave();
}

function getSelectedShape() {
  const plan = activePlan();
  return plan.shapes.find((shape) => shape.id === plan.selectedId) || null;
}

function roundedBlobPath(context) {
  context.beginPath();
  context.moveTo(-.65, -.55);
  context.bezierCurveTo(-.15, -.95, .55, -.72, .68, -.18);
  context.bezierCurveTo(.88, .36, .32, .78, -.14, .69);
  context.bezierCurveTo(-.72, .82, -.92, .18, -.65, -.55);
  context.closePath();
}

function shapePath(context, shape) {
  const base = shape.type === "line" ? 165 : 100;
  switch (shape.type) {
    case "circle":
      context.beginPath();
      context.arc(0, 0, base, 0, Math.PI * 2);
      break;
    case "square":
      context.beginPath();
      context.rect(-base, -base, base * 2, base * 2);
      break;
    case "triangle":
      context.beginPath();
      context.moveTo(0, -base * 1.15);
      context.lineTo(base * 1.06, base * .82);
      context.lineTo(-base * 1.06, base * .82);
      context.closePath();
      break;
    case "line":
      context.beginPath();
      context.roundRect(-base, -24, base * 2, 48, 24);
      break;
    case "blob":
      context.save();
      context.scale(base * 1.3, base * 1.3);
      roundedBlobPath(context);
      context.restore();
      break;
  }
}

function drawShape(context, shape, selected = false) {
  context.save();
  context.translate(shape.x, shape.y);
  context.rotate((shape.rotation * Math.PI) / 180);
  context.scale(shape.size / 100, shape.size / 100);
  shapePath(context, shape);
  context.globalAlpha = shape.opacity;
  context.fillStyle = shape.color;
  context.fill();

  if (selected) {
    context.globalAlpha = 1;
    context.strokeStyle = "#17213d";
    context.lineWidth = 7 / (shape.size / 100);
    context.setLineDash([15 / (shape.size / 100), 10 / (shape.size / 100)]);
    context.stroke();
  }
  context.restore();
}

function drawPlan(targetContext, plan, showSelection = false) {
  targetContext.save();
  targetContext.clearRect(0, 0, 1000, 1000);
  targetContext.fillStyle = plan.background;
  targetContext.fillRect(0, 0, 1000, 1000);
  plan.shapes.forEach((shape) => drawShape(targetContext, shape, showSelection && shape.id === plan.selectedId));
  targetContext.restore();
}

function render() {
  drawPlan(ctx, activePlan(), true);
  document.querySelector("#undoButton").disabled = activePlan().history.length === 0;
  document.querySelector("#redoButton").disabled = activePlan().future.length === 0;
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function hitTest(point) {
  const shapes = activePlan().shapes;
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index];
    const dx = point.x - shape.x;
    const dy = point.y - shape.y;
    const angle = (-shape.rotation * Math.PI) / 180;
    const localX = (dx * Math.cos(angle) - dy * Math.sin(angle)) / (shape.size / 100);
    const localY = (dx * Math.sin(angle) + dy * Math.cos(angle)) / (shape.size / 100);
    const hitCtx = document.createElement("canvas").getContext("2d");
    shapePath(hitCtx, shape);
    if (hitCtx.isPointInPath(localX, localY)) return shape;
  }
  return null;
}

function pointerDown(event) {
  event.preventDefault();
  const point = canvasPoint(event);
  const shape = hitTest(point);
  activePlan().selectedId = shape?.id || null;
  app.didDrag = false;
  if (shape) {
    pushHistory();
    app.dragging = { id: shape.id, offsetX: point.x - shape.x, offsetY: point.y - shape.y };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  }
  render();
  updateInspector();
}

function pointerMove(event) {
  if (!app.dragging) return;
  event.preventDefault();
  const shape = getSelectedShape();
  if (!shape) return;
  const point = canvasPoint(event);
  shape.x = Math.max(-150, Math.min(1150, point.x - app.dragging.offsetX));
  shape.y = Math.max(-150, Math.min(1150, point.y - app.dragging.offsetY));
  app.didDrag = true;
  render();
}

function pointerUp(event) {
  if (!app.dragging) return;
  canvas.classList.remove("dragging");
  app.dragging = null;
  try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* pointer already released */ }
  if (!app.didDrag) activePlan().history.pop();
  scheduleSave();
  render();
}

function updateSelected(patch, addHistory = true) {
  const shape = getSelectedShape();
  if (!shape) return;
  if (addHistory) pushHistory();
  Object.assign(shape, patch);
  render();
  updateInspector();
  scheduleSave();
}

function updateInspector() {
  const shape = getSelectedShape();
  const controls = document.querySelector("#shapeControls");
  const preview = document.querySelector("#selectionPreview");
  document.querySelector("#selectedShapeName").textContent = shape ? SHAPE_NAMES[shape.type] : "まだありません";
  controls.classList.toggle("disabled", !shape);

  if (!shape) {
    preview.style.background = "#dce2ee";
    preview.style.transform = "none";
    preview.style.borderRadius = "9px";
    return;
  }

  document.querySelector("#sizeSlider").value = Math.round(shape.size);
  document.querySelector("#rotationSlider").value = Math.round((shape.rotation + 360) % 360);
  document.querySelector("#opacitySlider").value = Math.round(shape.opacity * 100);
  document.querySelector("#sizeOutput").textContent = `${Math.round(shape.size)}%`;
  document.querySelector("#rotationOutput").textContent = `${Math.round((shape.rotation + 360) % 360)}°`;
  document.querySelector("#opacityOutput").textContent = `${Math.round(shape.opacity * 100)}%`;
  preview.style.background = shape.color;
  preview.style.opacity = shape.opacity;
  preview.style.transform = `rotate(${shape.rotation}deg)`;
  preview.style.borderRadius = shape.type === "circle" ? "50%" : shape.type === "blob" ? "66% 34% 45% 55% / 45% 58% 42% 55%" : "8px";

  document.querySelectorAll(".swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.color.toLowerCase() === shape.color.toLowerCase());
  });
}

function selectColor(color) {
  app.color = color;
  document.querySelector("#colorPicker").value = color;
  document.querySelectorAll(".swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.color.toLowerCase() === color.toLowerCase());
  });
  if (getSelectedShape()) updateSelected({ color });
}

function moveLayer(direction) {
  const plan = activePlan();
  const index = plan.shapes.findIndex((shape) => shape.id === plan.selectedId);
  if (index < 0) return;
  pushHistory();
  const [shape] = plan.shapes.splice(index, 1);
  if (direction === "front") plan.shapes.push(shape);
  else plan.shapes.unshift(shape);
  render();
  scheduleSave();
}

function duplicateSelected() {
  const shape = getSelectedShape();
  if (!shape) return;
  pushHistory();
  const duplicate = { ...shape, id: uid(), x: shape.x + 45, y: shape.y + 45 };
  activePlan().shapes.push(duplicate);
  activePlan().selectedId = duplicate.id;
  render();
  updateInspector();
  scheduleSave();
}

function deleteSelected() {
  const plan = activePlan();
  const index = plan.shapes.findIndex((shape) => shape.id === plan.selectedId);
  if (index < 0) return;
  pushHistory();
  plan.shapes.splice(index, 1);
  plan.selectedId = null;
  render();
  updateInspector();
  scheduleSave();
}

function switchPlan(planKey) {
  saveReflectionFields();
  app.activePlan = planKey;
  document.querySelector("#planAButton").classList.toggle("active", planKey === "A");
  document.querySelector("#planBButton").classList.toggle("active", planKey === "B");
  document.querySelector("#planAButton").setAttribute("aria-selected", planKey === "A");
  document.querySelector("#planBButton").setAttribute("aria-selected", planKey === "B");
  document.querySelector("#backgroundPicker").value = activePlan().background;
  document.querySelector("#reflectionFeeling").value = activePlan().reflection.feeling;
  document.querySelector("#reflectionIdea").value = activePlan().reflection.idea;
  render();
  updateInspector();
}

function saveReflectionFields() {
  activePlan().reflection.feeling = document.querySelector("#reflectionFeeling").value;
  activePlan().reflection.idea = document.querySelector("#reflectionIdea").value;
}

function scheduleSave() {
  document.querySelector("#saveStatus").textContent = "保存しています…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveReflectionFields();
    const data = {
      activePlan: app.activePlan,
      color: app.color,
      challengeIndex: app.challengeIndex,
      plans: {
        A: { background: app.plans.A.background, shapes: app.plans.A.shapes, reflection: app.plans.A.reflection },
        B: { background: app.plans.B.background, shapes: app.plans.B.shapes, reflection: app.plans.B.reflection },
      },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      document.querySelector("#saveStatus").textContent = "この端末に自動保存";
    } catch (_) {
      document.querySelector("#saveStatus").textContent = "端末に保存できませんでした";
    }
  }, 350);
}

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved?.plans?.A || !saved?.plans?.B) return false;
    app.activePlan = saved.activePlan === "B" ? "B" : "A";
    app.color = saved.color || PALETTE[0];
    app.challengeIndex = Number.isInteger(saved.challengeIndex) ? saved.challengeIndex % CHALLENGES.length : 0;
    ["A", "B"].forEach((key) => {
      app.plans[key] = {
        ...createBlankPlan(),
        background: saved.plans[key].background || "#ffffff",
        shapes: Array.isArray(saved.plans[key].shapes) ? saved.plans[key].shapes : [],
        reflection: saved.plans[key].reflection || { feeling: "", idea: "" },
      };
    });
    return true;
  } catch (_) {
    return false;
  }
}

function clearPlan() {
  const plan = activePlan();
  if (!plan.shapes.length) return;
  pushHistory();
  plan.shapes = [];
  plan.selectedId = null;
  render();
  updateInspector();
  scheduleSave();
  showToast(`作品${app.activePlan}を白紙にしました`);
}

function showCompare() {
  drawPlan(compareCanvasA.getContext("2d"), app.plans.A);
  drawPlan(compareCanvasB.getContext("2d"), app.plans.B);
  compareDialog.showModal();
}

function downloadArt() {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 1000;
  exportCanvas.height = 1000;
  drawPlan(exportCanvas.getContext("2d"), activePlan());
  const link = document.createElement("a");
  link.download = `iro-katachi-sakuhin-${app.activePlan}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
  showToast(`作品${app.activePlan}を画像にしました`);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1900);
}

function showChallenge() {
  const challenge = CHALLENGES[app.challengeIndex];
  document.querySelector("#challengeTitle").textContent = challenge.title;
  document.querySelector("#challengeHint").textContent = challenge.hint;
}

function bindRange(selector, property, transform = Number) {
  const input = document.querySelector(selector);
  input.addEventListener("pointerdown", () => { if (getSelectedShape()) pushHistory(); });
  input.addEventListener("input", (event) => {
    const shape = getSelectedShape();
    if (!shape) return;
    shape[property] = transform(event.target.value);
    render();
    updateInspector();
  });
  input.addEventListener("change", scheduleSave);
}

function initializeSwatches() {
  const container = document.querySelector("#swatches");
  PALETTE.forEach((color, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.dataset.color = color;
    button.style.background = color;
    button.setAttribute("aria-label", `色${index + 1}を選ぶ`);
    button.addEventListener("click", () => selectColor(color));
    container.append(button);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-shape]").forEach((button) => {
    button.addEventListener("click", () => addShape(button.dataset.shape));
  });
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);

  document.querySelector("#colorPicker").addEventListener("input", (event) => selectColor(event.target.value));
  document.querySelector("#backgroundPicker").addEventListener("input", (event) => {
    pushHistory();
    activePlan().background = event.target.value;
    render();
    scheduleSave();
  });
  document.querySelector("#challengeButton").addEventListener("click", () => {
    app.challengeIndex = (app.challengeIndex + 1) % CHALLENGES.length;
    showChallenge();
    scheduleSave();
  });

  document.querySelector("#planAButton").addEventListener("click", () => switchPlan("A"));
  document.querySelector("#planBButton").addEventListener("click", () => switchPlan("B"));
  document.querySelector("#undoButton").addEventListener("click", undo);
  document.querySelector("#redoButton").addEventListener("click", redo);
  document.querySelector("#clearButton").addEventListener("click", clearPlan);
  document.querySelector("#duplicateButton").addEventListener("click", duplicateSelected);
  document.querySelector("#deleteButton").addEventListener("click", deleteSelected);
  document.querySelector("#frontButton").addEventListener("click", () => moveLayer("front"));
  document.querySelector("#backButton").addEventListener("click", () => moveLayer("back"));
  document.querySelector("#compareButton").addEventListener("click", showCompare);
  document.querySelector("#closeCompareButton").addEventListener("click", () => compareDialog.close());
  document.querySelector("#downloadButton").addEventListener("click", downloadArt);
  compareDialog.addEventListener("click", (event) => {
    if (event.target === compareDialog) compareDialog.close();
  });

  ["#reflectionFeeling", "#reflectionIdea"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", scheduleSave);
  });

  bindRange("#sizeSlider", "size", Number);
  bindRange("#rotationSlider", "rotation", Number);
  bindRange("#opacitySlider", "opacity", (value) => Number(value) / 100);

  window.addEventListener("keydown", (event) => {
    const shape = getSelectedShape();
    if ((event.key === "Delete" || event.key === "Backspace") && shape && !event.target.matches("input, textarea")) {
      event.preventDefault();
      deleteSelected();
    }
    if (shape && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      pushHistory();
      const amount = event.shiftKey ? 20 : 5;
      if (event.key === "ArrowUp") shape.y -= amount;
      if (event.key === "ArrowDown") shape.y += amount;
      if (event.key === "ArrowLeft") shape.x -= amount;
      if (event.key === "ArrowRight") shape.x += amount;
      render();
      scheduleSave();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
  });
}

function seedExample() {
  app.plans.A.shapes = [
    { id: uid(), type: "line", x: 350, y: 420, size: 95, rotation: -26, color: "#2457d6", opacity: .92 },
    { id: uid(), type: "triangle", x: 565, y: 515, size: 115, rotation: 22, color: "#f05b54", opacity: .88 },
    { id: uid(), type: "circle", x: 720, y: 330, size: 55, rotation: 0, color: "#ffd84a", opacity: 1 },
  ];
  app.plans.B.shapes = [
    { id: uid(), type: "circle", x: 430, y: 480, size: 120, rotation: 0, color: "#3fa7d6", opacity: .65 },
    { id: uid(), type: "blob", x: 610, y: 530, size: 90, rotation: 35, color: "#8f54c7", opacity: .72 },
  ];
}

initializeSwatches();
const restored = loadSaved();
if (!restored) seedExample();
bindEvents();
showChallenge();
switchPlan(app.activePlan);
selectColor(app.color);
document.querySelector("#canvasTip").classList.toggle("hidden", activePlan().shapes.length > 0);
