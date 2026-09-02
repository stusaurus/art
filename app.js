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
  editMode: false,
  addPointMode: false,
  activePointIndex: null,
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
  exitShapeEditing(false);
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

function defaultGeometry(type) {
  switch (type) {
    case "circle":
      return {
        smooth: true,
        points: Array.from({ length: 8 }, (_, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / 8;
          return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 };
        }),
      };
    case "square":
      return {
        smooth: false,
        points: [
          { x: -100, y: -100 }, { x: 100, y: -100 },
          { x: 100, y: 100 }, { x: -100, y: 100 },
        ],
      };
    case "triangle":
      return {
        smooth: false,
        points: [{ x: 0, y: -115 }, { x: 106, y: 82 }, { x: -106, y: 82 }],
      };
    case "line":
      return {
        smooth: false,
        points: [
          { x: -165, y: -24 }, { x: 165, y: -24 },
          { x: 165, y: 24 }, { x: -165, y: 24 },
        ],
      };
    case "blob":
    default:
      return {
        smooth: true,
        points: [
          { x: -84, y: -72 }, { x: -20, y: -116 }, { x: 72, y: -85 },
          { x: 92, y: -22 }, { x: 68, y: 54 }, { x: -18, y: 90 },
          { x: -95, y: 45 },
        ],
      };
  }
}

function ensureShapeGeometry(shape) {
  if (!Array.isArray(shape.points) || shape.points.length < 3) {
    const geometry = defaultGeometry(shape.type);
    shape.points = geometry.points;
    shape.smooth = geometry.smooth;
  }
  if (typeof shape.smooth !== "boolean") shape.smooth = defaultGeometry(shape.type).smooth;
  return shape;
}

function makeShape(type) {
  const offsets = [-90, -45, 0, 45, 90];
  const offset = offsets[activePlan().shapes.length % offsets.length];
  const shape = {
    id: uid(),
    type,
    x: 500 + offset,
    y: 500 + offset / 2,
    size: type === "line" ? 130 : 100,
    rotation: type === "triangle" ? -10 : 0,
    color: app.color,
    opacity: 1,
  };
  return ensureShapeGeometry(shape);
}

function addShape(type) {
  if (app.editMode) exitShapeEditing(false);
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

function shapePath(context, shape) {
  ensureShapeGeometry(shape);
  const points = shape.points;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  if (shape.smooth && points.length > 2) {
    const count = points.length;
    for (let index = 0; index < count; index += 1) {
      const previous = points[(index - 1 + count) % count];
      const current = points[index];
      const next = points[(index + 1) % count];
      const afterNext = points[(index + 2) % count];
      context.bezierCurveTo(
        current.x + (next.x - previous.x) / 6,
        current.y + (next.y - previous.y) / 6,
        next.x - (afterNext.x - current.x) / 6,
        next.y - (afterNext.y - current.y) / 6,
        next.x,
        next.y,
      );
    }
  } else {
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  }
  context.closePath();
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

function localToWorld(shape, point) {
  const scale = shape.size / 100;
  const angle = (shape.rotation * Math.PI) / 180;
  const scaledX = point.x * scale;
  const scaledY = point.y * scale;
  return {
    x: shape.x + scaledX * Math.cos(angle) - scaledY * Math.sin(angle),
    y: shape.y + scaledX * Math.sin(angle) + scaledY * Math.cos(angle),
  };
}

function worldToLocal(shape, point) {
  const scale = shape.size / 100;
  const dx = point.x - shape.x;
  const dy = point.y - shape.y;
  const angle = (-shape.rotation * Math.PI) / 180;
  return {
    x: (dx * Math.cos(angle) - dy * Math.sin(angle)) / scale,
    y: (dx * Math.sin(angle) + dy * Math.cos(angle)) / scale,
  };
}

function drawEditHandles(context, shape) {
  ensureShapeGeometry(shape);
  const worldPoints = shape.points.map((point) => localToWorld(shape, point));

  context.save();
  context.beginPath();
  context.moveTo(worldPoints[0].x, worldPoints[0].y);
  worldPoints.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.strokeStyle = "rgba(36, 87, 214, .65)";
  context.lineWidth = 3;
  context.setLineDash([8, 7]);
  context.stroke();
  context.setLineDash([]);

  worldPoints.forEach((point, index) => {
    const active = index === app.activePointIndex;
    context.beginPath();
    context.arc(point.x, point.y, active ? 18 : 15, 0, Math.PI * 2);
    context.fillStyle = active ? "#ffd84a" : "#ffffff";
    context.fill();
    context.strokeStyle = active ? "#17213d" : "#2457d6";
    context.lineWidth = active ? 6 : 5;
    context.stroke();
  });
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
  if (app.editMode && getSelectedShape()) drawEditHandles(ctx, getSelectedShape());
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
    const local = worldToLocal(shape, point);
    const hitCtx = document.createElement("canvas").getContext("2d");
    shapePath(hitCtx, shape);
    if (hitCtx.isPointInPath(local.x, local.y)) return shape;
  }
  return null;
}

function hitControlPoint(shape, point) {
  ensureShapeGeometry(shape);
  let closestIndex = -1;
  let closestDistance = 30;
  shape.points.forEach((controlPoint, index) => {
    const world = localToWorld(shape, controlPoint);
    const distance = Math.hypot(point.x - world.x, point.y - world.y);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function closestSegment(points, target) {
  let best = { index: -1, distance: Infinity, point: null };
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const amount = Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared));
    const projected = { x: start.x + dx * amount, y: start.y + dy * amount };
    const distance = Math.hypot(target.x - projected.x, target.y - projected.y);
    if (distance < best.distance) best = { index, distance, point: target };
  });
  return best;
}

function tryAddPoint(shape, worldPoint) {
  const local = worldToLocal(shape, worldPoint);
  const closest = closestSegment(shape.points, local);
  const allowedDistance = 55 / (shape.size / 100);
  if (closest.index < 0 || closest.distance > allowedDistance) {
    showToast("形のふちをタップしてください");
    return false;
  }
  pushHistory();
  shape.points.splice(closest.index + 1, 0, {
    x: Math.round(closest.point.x),
    y: Math.round(closest.point.y),
  });
  app.activePointIndex = closest.index + 1;
  app.addPointMode = false;
  updateEditUI();
  render();
  scheduleSave();
  showToast("新しい点を追加しました");
  return true;
}

function pointerDown(event) {
  event.preventDefault();
  const point = canvasPoint(event);

  if (app.editMode) {
    const editedShape = getSelectedShape();
    if (!editedShape) {
      exitShapeEditing();
      return;
    }
    const pointIndex = hitControlPoint(editedShape, point);
    if (pointIndex >= 0) {
      app.activePointIndex = pointIndex;
      app.didDrag = false;
      pushHistory();
      app.dragging = { mode: "point", id: editedShape.id, pointIndex };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("dragging");
      updateEditUI();
      render();
      return;
    }
    if (app.addPointMode) {
      tryAddPoint(editedShape, point);
      return;
    }
    app.activePointIndex = null;
    updateEditUI();
    render();
    return;
  }

  const shape = hitTest(point);
  activePlan().selectedId = shape?.id || null;
  app.didDrag = false;
  if (shape) {
    pushHistory();
    app.dragging = { mode: "shape", id: shape.id, offsetX: point.x - shape.x, offsetY: point.y - shape.y };
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

  if (app.dragging.mode === "point") {
    const local = worldToLocal(shape, point);
    shape.points[app.dragging.pointIndex] = {
      x: Math.max(-320, Math.min(320, local.x)),
      y: Math.max(-320, Math.min(320, local.y)),
    };
    app.activePointIndex = app.dragging.pointIndex;
  } else {
    shape.x = Math.max(-150, Math.min(1150, point.x - app.dragging.offsetX));
    shape.y = Math.max(-150, Math.min(1150, point.y - app.dragging.offsetY));
  }
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

function enterShapeEditing() {
  const shape = getSelectedShape();
  if (!shape) return;
  ensureShapeGeometry(shape);
  app.editMode = true;
  app.addPointMode = false;
  app.activePointIndex = null;
  updateEditUI();
  render();
}

function exitShapeEditing(shouldRender = true) {
  app.editMode = false;
  app.addPointMode = false;
  app.activePointIndex = null;
  updateEditUI();
  if (shouldRender) render();
}

function updateEditUI() {
  const shape = getSelectedShape();
  const tools = document.querySelector("#shapeEditTools");
  const editButton = document.querySelector("#editShapeButton");
  const label = document.querySelector("#editModeLabel");
  const tip = document.querySelector("#canvasTip");
  if (!tools || !editButton || !label || !tip) return;

  tools.hidden = !app.editMode;
  editButton.hidden = app.editMode;
  label.hidden = !app.editMode;
  document.querySelector("#smoothButton").classList.toggle("active", Boolean(shape?.smooth));
  document.querySelector("#angularButton").classList.toggle("active", Boolean(shape && !shape.smooth));
  document.querySelector("#addPointButton").classList.toggle("active", app.addPointMode);
  document.querySelector("#deletePointButton").disabled = app.activePointIndex === null || (shape?.points.length || 0) <= 3;

  if (app.editMode) {
    tip.textContent = app.addPointMode
      ? "形のふちをタップすると点が増えます"
      : "青い点を指で引っぱって形を変えよう";
    tip.classList.remove("hidden");
  } else {
    tip.textContent = "形をタップして追加し、指で動かせます";
    tip.classList.toggle("hidden", activePlan().shapes.length > 0);
  }
}

function setEdgeStyle(smooth) {
  const shape = getSelectedShape();
  if (!shape || shape.smooth === smooth) return;
  pushHistory();
  shape.smooth = smooth;
  updateEditUI();
  render();
  scheduleSave();
}

function deleteActivePoint() {
  const shape = getSelectedShape();
  if (!shape || app.activePointIndex === null || shape.points.length <= 3) return;
  pushHistory();
  shape.points.splice(app.activePointIndex, 1);
  app.activePointIndex = null;
  updateEditUI();
  render();
  scheduleSave();
  showToast("点を1つ消しました");
}

function resetSelectedShape() {
  const shape = getSelectedShape();
  if (!shape) return;
  pushHistory();
  const geometry = defaultGeometry(shape.type);
  shape.points = geometry.points;
  shape.smooth = geometry.smooth;
  app.activePointIndex = null;
  app.addPointMode = false;
  updateEditUI();
  render();
  scheduleSave();
  showToast("最初の形にもどしました");
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
    app.editMode = false;
    app.addPointMode = false;
    app.activePointIndex = null;
    preview.style.background = "#dce2ee";
    preview.style.transform = "none";
    preview.style.borderRadius = "9px";
    updateEditUI();
    return;
  }

  ensureShapeGeometry(shape);

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
  updateEditUI();
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
  const duplicate = {
    ...shape,
    id: uid(),
    x: shape.x + 45,
    y: shape.y + 45,
    points: shape.points.map((point) => ({ ...point })),
  };
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
  exitShapeEditing(false);
  render();
  updateInspector();
  scheduleSave();
}

function switchPlan(planKey) {
  saveReflectionFields();
  exitShapeEditing(false);
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
        shapes: Array.isArray(saved.plans[key].shapes)
          ? saved.plans[key].shapes.map((shape) => ensureShapeGeometry(shape))
          : [],
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
  exitShapeEditing(false);
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
  document.querySelector("#editShapeButton").addEventListener("click", enterShapeEditing);
  document.querySelector("#doneEditingButton").addEventListener("click", () => exitShapeEditing());
  document.querySelector("#smoothButton").addEventListener("click", () => setEdgeStyle(true));
  document.querySelector("#angularButton").addEventListener("click", () => setEdgeStyle(false));
  document.querySelector("#addPointButton").addEventListener("click", () => {
    app.addPointMode = !app.addPointMode;
    app.activePointIndex = null;
    updateEditUI();
    render();
  });
  document.querySelector("#deletePointButton").addEventListener("click", deleteActivePoint);
  document.querySelector("#resetShapeButton").addEventListener("click", resetSelectedShape);
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
      if (app.editMode && app.activePointIndex !== null) deleteActivePoint();
      else if (!app.editMode) deleteSelected();
    }
    if (shape && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      pushHistory();
      const amount = event.shiftKey ? 20 : 5;
      const target = app.editMode && app.activePointIndex !== null
        ? shape.points[app.activePointIndex]
        : shape;
      if (event.key === "ArrowUp") target.y -= amount;
      if (event.key === "ArrowDown") target.y += amount;
      if (event.key === "ArrowLeft") target.x -= amount;
      if (event.key === "ArrowRight") target.x += amount;
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
