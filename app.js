/* ==========
   Persistence
========== */
const STORAGE_KEY = "city-road-map-v1";

function saveState() {
  const data = { nodes: state.nodes, edges: state.edges, nextId: state.nextId };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Save failed:", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return false;
    state.nodes = data.nodes;
    state.edges = data.edges;
    state.nextId =
      Number(data.nextId) ||
      Math.max(
        0,
        ...state.nodes.map((n) => n.id),
        ...state.edges.map((e) => e.id)
      ) + 1;
    return true;
  } catch (e) {
    console.warn("Load failed:", e);
    return false;
  }
}
function touchSaveRender() {
  saveState();
  render();
}

/* ==========
   App State
========== */
const state = {
  mode: "add", // 'add' | 'connect' | 'select'
  nodes: [], // {id, name, x, y}
  edges: [], // {id, a, b, w}
  nextId: 1,
  selectedNode: null,
  selectedForEdge: null,
  selectedEdgeId: null,
  pathEdges: new Set(),
};

/* ==========
   DOM
========== */
const svg = document.getElementById("svg");
const gEdges = document.getElementById("edges");
const gNodes = document.getElementById("nodes");
const gPath = document.getElementById("path");
const gGhost = document.getElementById("ghost");
const stats = document.getElementById("stats");
const listDiv = document.getElementById("list");
const startSel = document.getElementById("start");
const endSel = document.getElementById("end");
const selectedInfo = document.getElementById("selectedInfo");
const deleteNodeBtn = document.getElementById("deleteNodeBtn");

/* ==========
   Utils
========== */
function uid() {
  return state.nextId++;
}
function nodeById(id) {
  return state.nodes.find((n) => n.id === id);
}
function edgeById(id) {
  return state.edges.find((e) => e.id === id);
}
function edgeBetween(a, b) {
  return state.edges.find(
    (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)
  );
}
function svgPoint(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

/* ==========
   Rendering
========== */
function render() {
  gEdges.innerHTML = "";
  gNodes.innerHTML = "";
  gPath.innerHTML = "";
  gGhost.innerHTML = "";

  // edges + labels + hit targets
  for (const e of state.edges) {
    const na = nodeById(e.a),
      nb = nodeById(e.b);
    if (!na || !nb) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", na.x);
    line.setAttribute("y1", na.y);
    line.setAttribute("x2", nb.x);
    line.setAttribute("y2", nb.y);
    line.setAttribute("class", "edge-line");
    gEdges.appendChild(line);

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", na.x);
    hit.setAttribute("y1", na.y);
    hit.setAttribute("x2", nb.x);
    hit.setAttribute("y2", nb.y);
    hit.setAttribute("class", "edge-hit");
    hit.addEventListener("click", () => onEdgeClick(e.id));
    gEdges.appendChild(hit);

    const mx = (na.x + nb.x) / 2,
      my = (na.y + nb.y) / 2;
    const lb = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lb.setAttribute("x", mx);
    lb.setAttribute("y", my - 6);
    lb.setAttribute("class", "edge-weight");
    lb.setAttribute("text-anchor", "middle");
    lb.textContent = e.w;
    gEdges.appendChild(lb);
  }

  // highlighted path
  for (const id of state.pathEdges) {
    const e = edgeById(id);
    if (!e) continue;
    const na = nodeById(e.a),
      nb = nodeById(e.b);
    if (!na || !nb) continue;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "line");
    p.setAttribute("x1", na.x);
    p.setAttribute("y1", na.y);
    p.setAttribute("x2", nb.x);
    p.setAttribute("y2", nb.y);
    p.setAttribute("class", "edge-path");
    p.setAttribute("marker-end", "url(#arrow)");
    gPath.appendChild(p);
  }

  // nodes
  for (const n of state.nodes) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute(
      "class",
      "node" + (state.selectedNode === n.id ? " selected" : "")
    );
    g.setAttribute("data-id", n.id);

    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", n.x);
    c.setAttribute("cy", n.y);

    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", n.x);
    t.setAttribute("y", n.y + 4);
    t.setAttribute("text-anchor", "middle");
    t.textContent = n.name;

    g.appendChild(c);
    g.appendChild(t);
    attachNodeEvents(g, n.id);
    gNodes.appendChild(g);
  }

  // sidebar
  stats.textContent = `${state.nodes.length} cities, ${state.edges.length} roads`;
  const selName = state.selectedNode
    ? nodeById(state.selectedNode)?.name || "—"
    : "—";
  selectedInfo.textContent = `Selected: ${selName}`;
  refreshLists();
  refreshDropdowns();
}

function refreshLists() {
  const cn = state.nodes
    .map(
      (n) =>
        `<div class="pill" title="ID ${n.id}"><span>🏙️ ${n.name}</span></div>`
    )
    .join(" ");
  const ce = state.edges
    .map((e) => {
      const a = nodeById(e.a)?.name ?? "?",
        b = nodeById(e.b)?.name ?? "?";
      const onPath = state.pathEdges.has(e.id) ? 'style="color:#ffc857"' : "";
      return `<div ${onPath}>🛣️ ${a} — ${b} <span class="hint">(w=${e.w})</span></div>`;
    })
    .join("");
  listDiv.innerHTML = `<div style="margin-bottom:8px">${
    cn || '<span class="hint">No cities yet.</span>'
  }</div>${ce || '<span class="hint">No roads yet.</span>'}`;
}

function refreshDropdowns() {
  const opts = state.nodes
    .map((n) => `<option value="${n.id}">${n.name}</option>`)
    .join("");
  startSel.innerHTML = `<option value="">—</option>${opts}`;
  endSel.innerHTML = `<option value="">—</option>${opts}`;
}

/* ==========
   Node Removal
========== */
function removeNode(id) {
  // remove all edges incident to this node
  state.edges = state.edges.filter((e) => e.a !== id && e.b !== id);
  // clear any path highlights (they may reference removed edges)
  state.pathEdges.clear();
  // remove the node
  state.nodes = state.nodes.filter((n) => n.id !== id);
  // clear selections if they referenced this node
  if (state.selectedNode === id) state.selectedNode = null;
  if (state.selectedForEdge === id) state.selectedForEdge = null;
  touchSaveRender();
}

/* ==========
   Interactions
========== */
function setMode(m) {
  state.mode = m;
  document
    .getElementById("modeAddCity")
    .classList.toggle("primary", m === "add");
  document
    .getElementById("modeConnect")
    .classList.toggle("primary", m === "connect");
  document
    .getElementById("modeSelect")
    .classList.toggle("primary", m === "select");
  state.selectedForEdge = null;
  state.selectedEdgeId = null;
  render();
}

document
  .getElementById("modeAddCity")
  .addEventListener("click", () => setMode("add"));
document
  .getElementById("modeConnect")
  .addEventListener("click", () => setMode("connect"));
document
  .getElementById("modeSelect")
  .addEventListener("click", () => setMode("select"));

document.getElementById("resetView").addEventListener("click", () => {
  state.selectedNode = null;
  state.selectedForEdge = null;
  state.selectedEdgeId = null;
  render();
});

document.getElementById("clearAll").addEventListener("click", () => {
  if (!confirm("Clear all cities and roads?")) return;
  state.nodes = [];
  state.edges = [];
  state.pathEdges.clear();
  state.nextId = 1;
  touchSaveRender();
});

svg.addEventListener("click", (evt) => {
  if (state.mode !== "add") return;
  if (evt.target.closest(".node") || evt.target.closest(".edge-hit")) return; // prevent click-through
  const { x, y } = svgPoint(evt);
  const name = prompt(
    "City name (e.g., A, B, Yangon)…",
    "City " + state.nextId
  );
  if (!name) return;
  state.nodes.push({ id: uid(), name: name.trim(), x, y });
  touchSaveRender();
});

function attachNodeEvents(el, id) {
  // select / connect
  el.addEventListener("click", (evt) => {
    evt.stopPropagation();
    if (state.mode === "connect") {
      if (!state.selectedForEdge) {
        state.selectedForEdge = id;
        state.selectedNode = id;
        render();
        return;
      }
      if (state.selectedForEdge === id) return; // same node
      if (edgeBetween(state.selectedForEdge, id)) {
        alert("Road already exists between these cities.");
        state.selectedForEdge = null;
        state.selectedNode = null;
        render();
        return;
      }
      const wStr = prompt("Road weight (distance/cost):", "10");
      const w = Number(wStr);
      if (Number.isFinite(w) && w > 0) {
        state.edges.push({ id: uid(), a: state.selectedForEdge, b: id, w });
      }
      state.selectedForEdge = null;
      state.selectedNode = null;
      touchSaveRender();
      return;
    }
    // select mode: just select (drag handled below)
    state.selectedNode = id;
    render();
  });

  // drag to move (select mode)
  let dragging = false;
  let offset = { x: 0, y: 0 };
  el.addEventListener("mousedown", (evt) => {
    if (state.mode !== "select") return;
    dragging = true;
    el.style.cursor = "grabbing";
    const pt = svgPoint(evt);
    const n = nodeById(id);
    offset.x = n.x - pt.x;
    offset.y = n.y - pt.y;
    evt.preventDefault();
  });
  window.addEventListener("mousemove", (evt) => {
    if (!dragging) return;
    const pt = svgPoint(evt);
    const n = nodeById(id);
    n.x = pt.x + offset.x;
    n.y = pt.y + offset.y;
    render(); // live
  });
  window.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      el.style.cursor = "grab";
      saveState();
    }
  });
}

// delete selected city via button
deleteNodeBtn.addEventListener("click", () => {
  if (!state.selectedNode) {
    alert("Select a city first (Edit/Move mode), then delete.");
    return;
  }
  const n = nodeById(state.selectedNode);
  const countEdges = state.edges.filter(
    (e) => e.a === state.selectedNode || e.b === state.selectedNode
  ).length;
  const msg = `Delete city "${
    n?.name ?? state.selectedNode
  }" and its ${countEdges} road(s)?`;
  if (confirm(msg)) removeNode(state.selectedNode);
});

// edit/delete road
function onEdgeClick(edgeId) {
  const e = edgeById(edgeId);
  if (!e) return;
  const a = nodeById(e.a)?.name ?? "A",
    b = nodeById(e.b)?.name ?? "B";
  const choice = prompt(
    `Edit road ${a}—${b}\nEnter new weight, or type "delete" to remove:`,
    String(e.w)
  );
  if (choice === null) return;
  if (choice.trim().toLowerCase() === "delete") {
    const idx = state.edges.findIndex((x) => x.id === edgeId);
    if (idx >= 0) state.edges.splice(idx, 1);
    state.pathEdges.delete(edgeId);
  } else {
    const w = Number(choice);
    if (Number.isFinite(w) && w > 0) e.w = w;
  }
  touchSaveRender();
}

/* ==========
   Dijkstra (undirected)
========== */
function buildAdj() {
  const adj = new Map();
  for (const n of state.nodes) adj.set(n.id, []);
  for (const e of state.edges) {
    adj.get(e.a).push({ to: e.b, w: e.w, id: e.id });
    adj.get(e.b).push({ to: e.a, w: e.w, id: e.id });
  }
  return adj;
}

function dijkstra(startId, endId) {
  const adj = buildAdj();
  const dist = new Map(),
    prev = new Map(),
    prevEdge = new Map();
  const Q = new Set(state.nodes.map((n) => n.id));
  for (const id of Q) dist.set(id, Infinity);
  dist.set(startId, 0);

  while (Q.size) {
    // extract-min
    let u = null,
      best = Infinity;
    for (const v of Q) {
      const dv = dist.get(v);
      if (dv < best) {
        best = dv;
        u = v;
      }
    }
    if (u === null) break;
    Q.delete(u);
    if (u === endId) break;

    for (const { to, w, id } of adj.get(u) || []) {
      if (!Q.has(to)) continue;
      const alt = dist.get(u) + w;
      if (alt < dist.get(to)) {
        dist.set(to, alt);
        prev.set(to, u);
        prevEdge.set(to, id);
      }
    }
  }
  if (dist.get(endId) === Infinity) return { distance: Infinity, edges: [] };

  // reconstruct path edges
  const usedEdges = [];
  let cur = endId;
  while (cur !== startId) {
    const pe = prevEdge.get(cur);
    usedEdges.push(pe);
    cur = prev.get(cur);
  }
  usedEdges.reverse();
  return { distance: dist.get(endId), edges: usedEdges };
}

/* ==========
   Controls
========== */
document.getElementById("runDijkstra").addEventListener("click", () => {
  const s = Number(startSel.value),
    t = Number(endSel.value);
  if (!s || !t || s === t) {
    alert("Choose distinct Start and End cities.");
    return;
  }
  const res = dijkstra(s, t);
  state.pathEdges = new Set(res.edges);
  render();
  if (res.distance === Infinity)
    alert("No path exists between selected cities.");
  else alert(`Shortest distance: ${res.distance}`);
});

document.getElementById("clearPath").addEventListener("click", () => {
  state.pathEdges.clear();
  render();
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const data = { nodes: state.nodes, edges: state.edges, nextId: state.nextId };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "city-road-map.json";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("seedBtn").addEventListener("click", () => {
  state.nodes = [
    { id: 1, name: "A", x: 250, y: 220 },
    { id: 2, name: "B", x: 520, y: 180 },
    { id: 3, name: "C", x: 820, y: 280 },
    { id: 4, name: "D", x: 420, y: 460 },
    { id: 5, name: "E", x: 760, y: 520 },
  ];
  state.edges = [
    { id: 6, a: 1, b: 2, w: 8 },
    { id: 7, a: 2, b: 3, w: 6 },
    { id: 8, a: 1, b: 4, w: 7 },
    { id: 9, a: 4, b: 5, w: 5 },
    { id: 10, a: 2, b: 4, w: 3 },
    { id: 11, a: 3, b: 5, w: 4 },
  ];
  state.nextId = 12;
  state.pathEdges.clear();
  touchSaveRender();
});

/* ==========
   Init
========== */
function init() {
  setMode("add");
  loadState();
  render();

  // bonus: allow Delete key to delete selected node while in select mode
  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.mode === "select" && state.selectedNode) {
        const n = nodeById(state.selectedNode);
        if (n && confirm(`Delete city "${n.name}" and its connected roads?`)) {
          removeNode(state.selectedNode);
        }
      }
    }
  });
}
init();
