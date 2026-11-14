import { solve, sensitivity, residual, example, normalize } from "./core.js";
const $ = (id) => document.getElementById(id),
  svgNS = "http://www.w3.org/2000/svg";
let result,
  impacts,
  step = 0,
  selected = 0,
  timer = null,
  history = [];
function stop() {
  clearInterval(timer);
  timer = null;
  $("play").textContent = "Play";
}
function node(tag, attrs = {}, text = null) {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  return e;
}
let drawnResult, drawnStep, drawnResidual;
function draw() {
  const residualVisible = $("show-residual").checked;
  if (
    drawnResult === result &&
    drawnStep === step &&
    drawnResidual === residualVisible
  ) {
    for (const group of $("graph").querySelectorAll("[data-edge]")) {
      group
        .querySelector(".edge")
        .classList.toggle("selected", Number(group.dataset.edge) === selected);
      group.setAttribute(
        "aria-pressed",
        String(Number(group.dataset.edge) === selected),
      );
    }
    return;
  }
  drawnResult = result;
  drawnStep = step;
  drawnResidual = residualVisible;
  const n = result.network,
    s = result.snapshots[step],
    g = $("graph");
  g.replaceChildren();
  const defs = node("defs");
  for (const [id, color] of [
    ["arrow", "#668882"],
    ["active-arrow", "#7be2bb"],
    ["reverse-arrow", "#efb070"],
  ]) {
    const m = node("marker", {
      id,
      viewBox: "0 0 10 10",
      refX: 9,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: "auto-start-reverse",
    });
    m.append(node("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }));
    defs.append(m);
  }
  g.append(defs);
  const positions = new Map([
      [n.source, [65, 230]],
      [n.sink, [835, 230]],
    ]),
    middle = n.nodes.filter((v) => v !== n.source && v !== n.sink);
  middle.forEach((v, i) => {
    const cols = Math.ceil(middle.length / 2),
      col = Math.floor(i / 2);
    positions.set(v, [
      200 + (cols === 1 ? 250 : (col * 500) / (cols - 1)),
      i % 2 ? 340 : 120,
    ]);
  });
  function geometry(from, to, offset = 0) {
    const a = positions.get(from),
      b = positions.get(to),
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy),
      ux = dx / len,
      uy = dy / len,
      cx = (a[0] + b[0]) / 2 - uy * offset,
      cy = (a[1] + b[1]) / 2 + ux * offset;
    const ax = cx - a[0],
      ay = cy - a[1],
      al = Math.hypot(ax, ay),
      bx = b[0] - cx,
      by = b[1] - cy,
      bl = Math.hypot(bx, by);
    return {
      d: `M ${a[0] + (ax / al) * 27} ${a[1] + (ay / al) * 27} Q ${cx} ${cy} ${b[0] - (bx / bl) * 30} ${b[1] - (by / bl) * 30}`,
      x: 0.36 * a[0] + 0.48 * cx + 0.16 * b[0],
      y: 0.36 * a[1] + 0.48 * cy + 0.16 * b[1],
    };
  }
  n.edges.forEach((e, i) => {
    const parallels = n.edges.filter(
      (a) =>
        (a.from === e.from && a.to === e.to) ||
        (a.from === e.to && a.to === e.from),
    );
    const k = parallels.findIndex((a) => a.id === e.id);
    let off = (k - (parallels.length - 1) / 2) * 52;
    if (e.from > e.to) off = -off;
    const aug = s.path.find((a) => a.edge === i),
      p =
        aug?.direction === -1
          ? geometry(e.to, e.from, -off)
          : geometry(e.from, e.to, off),
      group = node("g", {
        role: "button",
        "data-edge": i,
        "aria-pressed": String(selected === i),
        tabindex: 0,
        "aria-label": `${e.id}: ${e.from} to ${e.to}, flow ${s.flow[i]}, capacity ${e.capacity}`,
      });
    group.append(node("path", { d: p.d, class: "edge-hit" }));
    const cls = aug ? (aug.direction === -1 ? "cancel" : "active") : "edge";
    group.append(
      node("path", {
        d: p.d,
        class: `edge ${cls} ${selected === i ? "selected" : ""}`,
        "marker-end": `url(#${aug ? (aug.direction === -1 ? "reverse-arrow" : "active-arrow") : "arrow"})`,
      }),
    );
    group.append(
      node(
        "text",
        { x: p.x, y: p.y - 7, "text-anchor": "middle" },
        `${e.id}  ${s.flow[i]} / ${e.capacity}`,
      ),
    );
    const choose = () => {
      selected = i;
      render();
    };
    group.addEventListener("click", choose);
    group.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        choose();
      }
    });
    g.append(group);
  });
  if ($("show-residual").checked)
    for (const a of residual(n, s.flow).filter((a) => a.direction === -1)) {
      const p = geometry(a.from, a.to, 32);
      g.append(
        node("path", {
          d: p.d,
          class: "residual",
          "marker-end": "url(#arrow)",
        }),
      );
      g.append(
        node(
          "text",
          { x: p.x, y: p.y + 14, "text-anchor": "middle" },
          `−${a.id}: ${a.capacity}`,
        ),
      );
    }
  for (const v of n.nodes) {
    const [x, y] = positions.get(v);
    g.append(
      node("circle", {
        cx: x,
        cy: y,
        r: 26,
        class:
          "node " +
          (result.certificate.reachable.includes(v) ? "source-side" : ""),
      }),
    );
    g.append(
      node(
        "text",
        { x, y: y + 4, "text-anchor": "middle", class: "node-text" },
        v,
      ),
    );
  }
}
function render() {
  const n = result.network,
    s = result.snapshots[step],
    c = result.certificate,
    e = n.edges[selected];
  $("value").textContent = c.value;
  $("cut-value").textContent = c.cutCapacity;
  $("side").textContent = c.reachable.join(", ");
  $("augmentations").textContent = result.snapshots.length - 1;
  $("current").textContent = s.value;
  $("certificate").textContent =
    "Conservation and capacity checks passed. Final flow equals cut capacity.";
  $("step").max = result.snapshots.length - 1;
  $("step").value = step;
  $("step-count").textContent = `${step} / ${result.snapshots.length - 1}`;
  $("step-label").textContent = step
    ? `After augmentation ${step}`
    : "Initial flow · all edges empty";
  $("path").textContent = step
    ? `+${s.delta} units: ` +
      s.path
        .map(
          (a) =>
            `${a.from} → ${a.to} [${a.direction === -1 ? "cancel " : ""}${a.id}]`,
        )
        .join(" · ")
    : "Start at zero. Each step follows a shortest residual path.";
  $("back").disabled = step === 0;
  $("next").disabled = step === result.snapshots.length - 1;
  $("play").disabled = result.snapshots.length === 1;
  $("undo").disabled = !history.length;
  $("edge").replaceChildren(
    ...n.edges.map((x, i) => new Option(`${x.id} · ${x.from} → ${x.to}`, i)),
  );
  $("edge").value = selected;
  $("capacity-form").hidden = !e;
  $("edge").disabled = !e;
  if (e) {
    $("capacity").value = e.capacity;
    $("edge-info").textContent =
      `At this step: ${s.flow[selected]} flowing, ${e.capacity - s.flow[selected]} forward residual, ${s.flow[selected]} cancellable.`;
    const impact = impacts[selected];
    $("impact").textContent =
      `Outage: ${impact.without} total (loss ${impact.loss}). ${impact.upgradeAvailable ? `One extra capacity: ${impact.upgraded} total (gain ${impact.gain}).` : "Capacity limit reached."}`;
  } else {
    $("edge-info").textContent = "No edges in this network.";
    $("impact").textContent = "";
  }
  $("edges").replaceChildren(
    ...n.edges.map((x, i) => {
      const tr = document.createElement("tr");
      if (c.cutEdges.includes(x.id)) tr.className = "cut";
      const td = document.createElement("td"),
        b = document.createElement("button");
      b.textContent = x.id;
      b.dataset.edgeRow = i;
      b.onclick = () => {
        selected = i;
        render();
        $("edges").querySelector(`[data-edge-row="${i}"]`)?.focus();
      };
      td.append(b);
      tr.append(td);
      for (const text of [
        `${x.from} → ${x.to}`,
        `${result.snapshots.at(-1).flow[i]} / ${x.capacity}`,
        c.cutEdges.includes(x.id) ? "S → T" : "—",
        impacts[i].loss,
        impacts[i].upgradeAvailable ? impacts[i].gain : "—",
      ]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        tr.append(cell);
      }
      return tr;
    }),
  );
  draw();
}
function apply(input, remember = true) {
  const next = solve(input),
    nextImpacts = sensitivity(next.network);
  stop();
  if (remember && result) {
    history.push(result.network);
    if (history.length > 30) history.shift();
  }
  result = next;
  $("preset").value =
    ["harbor", "reroute"].find(
      (k) => JSON.stringify(example(k)) === JSON.stringify(result.network),
    ) || "custom";
  $("reset").disabled = $("preset").value === "custom";
  impacts = nextImpacts;
  step = 0;
  selected = Math.min(selected, Math.max(0, result.network.edges.length - 1));
  $("editor").value = JSON.stringify(result.network, null, 2);
  $("error").textContent = "";
  $("status").textContent = "Network solved · certificate verified";
  render();
}
function attempt(fn) {
  try {
    fn();
    $("error").textContent = "";
  } catch (e) {
    $("error").textContent = e.message;
  }
}
$("reset").onclick = () => attempt(() => apply(example($("preset").value)));
$("preset").onchange = () => {
  $("reset").disabled = $("preset").value === "custom";
};
$("apply").onclick = () =>
  attempt(() => {
    if ($("editor").value.length > 100000)
      throw Error("JSON must be at most 100 KB.");
    apply(JSON.parse($("editor").value));
  });
$("capacity-form").onsubmit = (e) => {
  e.preventDefault();
  attempt(() => {
    const n = structuredClone(result.network);
    n.edges[selected].capacity = Number($("capacity").value);
    apply(n);
  });
};
$("undo").onclick = () =>
  attempt(() => {
    if (history.length) {
      const previous = history.at(-1);
      apply(previous, false);
      history.pop();
      render();
    }
  });
$("edge").onchange = () => {
  selected = Number($("edge").value);
  render();
};
$("show-residual").onchange = draw;
function jump(i) {
  stop();
  step = i;
  render();
}
$("step").oninput = () => jump(Number($("step").value));
$("back").onclick = () => jump(Math.max(0, step - 1));
$("next").onclick = () => jump(Math.min(result.snapshots.length - 1, step + 1));
$("play").onclick = () => {
  if (timer) {
    stop();
    return;
  }
  if (step === result.snapshots.length - 1) step = 0;
  $("play").textContent = "Pause";
  render();
  timer = setInterval(() => {
    step++;
    render();
    if (step === result.snapshots.length - 1) stop();
  }, 900);
};
function download(name, data) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("save").onclick = () =>
  attempt(() =>
    download(
      "cut-current-network.json",
      normalize(JSON.parse($("editor").value)),
    ),
  );
$("export").onclick = () =>
  download("cut-current-evidence.json", {
    format: "cut-current-evidence-v1",
    ...result,
    sensitivity: impacts,
    inspectedStep: step,
  });
$("open").onclick = () => $("file").click();
$("file").onchange = async () => {
  const f = $("file").files[0];
  $("file").value = "";
  if (!f) return;
  try {
    if (f.size > 100000) throw Error("JSON must be at most 100 KB.");
    apply(JSON.parse(await f.text()));
  } catch (e) {
    $("error").textContent = e.message;
  }
};
$("editor").oninput = () => {
  $("status").textContent = "Editor draft · apply to update results";
};
apply(example(), false);
