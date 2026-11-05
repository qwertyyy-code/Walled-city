/*
 * render.js — Flat canvas drawing: fields, roads, cities, chapels, shields, meeples.
 */

const COL = {
  field: "#6aa63a",
  fieldDark: "#5b9330",
  river: "#75b8d2",
  riverBank: "#477a8a",
  city: "#b56b3a",
  cityInner: "#c98452",
  wall: "#5a3218",
  road: "#ead7a6",
  roadEdge: "#c4ae7a",
  chapel: "#f3efe4",
  roof: "#8b3a32",
  door: "#5a3a28",
  shield: "#d7b23a",
  shieldDark: "#6b4e12",
  ink: "#3a2a1a",
  legal: "rgba(255, 244, 160, 0.55)",
  legalStroke: "#fff4a0"
};

const RIVER_WIDTH = 0.14;

function edgeMid(edge) {
  if (edge === N) return { x: 0.5, y: 0 };
  if (edge === E) return { x: 1, y: 0.5 };
  if (edge === S) return { x: 0.5, y: 1 };
  return { x: 0, y: 0.5 };
}

function slotPos(slot) {
  const pts = [
    { x: 0.32, y: 0.04 },
    { x: 0.68, y: 0.04 },
    { x: 0.96, y: 0.32 },
    { x: 0.96, y: 0.68 },
    { x: 0.68, y: 0.96 },
    { x: 0.32, y: 0.96 },
    { x: 0.04, y: 0.68 },
    { x: 0.04, y: 0.32 }
  ];
  return pts[slot];
}

function avgPoints(pts) {
  let x = 0, y = 0;
  pts.forEach(function (p) {
    x += p.x;
    y += p.y;
  });
  return { x: x / pts.length, y: y / pts.length };
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function inward(p, t) {
  return lerp(p, { x: 0.5, y: 0.5 }, t);
}

function featureAnchor(kind, feat) {
  const c = { x: 0.5, y: 0.5 };
  if (kind === "monastery") return feat.anchor || c;
  if (kind === "city") {
    if (feat.anchor) return feat.anchor;
    const pts = feat.edges.map(edgeMid);
    return inward(avgPoints(pts), 0.35);
  }
  if (kind === "road") {
    if (feat.anchor) return feat.anchor;
    if (!feat.edges || feat.edges.length === 0) return c;
    if (feat.edges.length === 1) return inward(edgeMid(feat.edges[0]), 0.42);
    return avgPoints(feat.edges.map(function (edge) {
      return inward(edgeMid(edge), 0.22);
    }));
  }
  if (kind === "field") {
    if (feat.anchor) return feat.anchor;
    const pts = feat.slots.map(slotPos);
    let p = avgPoints(pts);
    p = inward(p, 0.18);
    if (p.x < 0.14) p.x = 0.18;
    if (p.x > 0.86) p.x = 0.82;
    if (p.y < 0.14) p.y = 0.18;
    if (p.y > 0.86) p.y = 0.82;
    return p;
  }
  return c;
}

function meepleSpotAt(options, spec, x, y, tileSize) {
  let best = null, bestD = tileSize * 0.16;
  options.forEach(function (option) {
    if (option.blocked) return;
    let feature = { edges: option.edges || [], slots: option.slots || [] };
    if (option.kind === "city") feature = spec.cities[option.index];
    if (option.kind === "road") feature = spec.roads[option.index];
    if (option.kind === "field") feature = spec.fields[option.index];
    if (option.kind === "monastery") feature = { anchor: spec.monasteryAnchor };
    const anchor = featureAnchor(option.kind, feature);
    const dx = x - anchor.x * tileSize;
    const dy = y - anchor.y * tileSize;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestD) {
      bestD = distance;
      best = option;
    }
  });
  return best;
}

function updateCurrentPlayerHighlight(container, playerIndex, pulsing) {
  Array.from(container.children).forEach(function (entry) {
    const active = playerIndex !== null &&
      Number(entry.dataset.playerIndex) === playerIndex;
    entry.classList.toggle("current-player", active);
    entry.classList.toggle("current-player-pulsing", active && !!pulsing);
    if (active) entry.setAttribute("aria-current", "true");
    else entry.removeAttribute("aria-current");
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function trap(ctx, size, edge, depth, sideInset) {
  const s = size;
  const d = size * depth;
  const m = 0;
  const inset = size * (sideInset == null ? 0.08 : sideInset);
  ctx.beginPath();
  if (edge === N) {
    ctx.moveTo(m, m);
    ctx.lineTo(s - m, m);
    ctx.lineTo(s - inset, d);
    ctx.lineTo(inset, d);
  } else if (edge === E) {
    ctx.moveTo(s - m, m);
    ctx.lineTo(s - m, s - m);
    ctx.lineTo(s - d, s - inset);
    ctx.lineTo(s - d, inset);
  } else if (edge === S) {
    ctx.moveTo(m, s - m);
    ctx.lineTo(s - m, s - m);
    ctx.lineTo(s - inset, s - d);
    ctx.lineTo(inset, s - d);
  } else {
    ctx.moveTo(m, m);
    ctx.lineTo(m, s - m);
    ctx.lineTo(d, s - inset);
    ctx.lineTo(d, inset);
  }
  ctx.closePath();
}

function cornerSq(ctx, size, a, b, depth) {
  const d = size * depth;
  const s = size;
  ctx.beginPath();
  if ((a === N && b === E) || (a === E && b === N)) {
    ctx.rect(s - d, 0, d, d);
  } else if ((a === E && b === S) || (a === S && b === E)) {
    ctx.rect(s - d, s - d, d, d);
  } else if ((a === S && b === W) || (a === W && b === S)) {
    ctx.rect(0, s - d, d, d);
  } else {
    ctx.rect(0, 0, d, d);
  }
}

function fillCityGroup(ctx, size, edges, depthOverride, sideInset) {
  const uniq = edges.slice().sort();
  if (uniq.length === 4) {
    ctx.fillRect(0, 0, size, size);
    return;
  }
  const depth = depthOverride == null ? (uniq.length >= 3 ? 0.58 : 0.46) : depthOverride;
  if (uniq.length === 2 && Math.abs(uniq[0] - uniq[1]) === 2) {
    ctx.beginPath();
    if (uniq[0] === N) {
      ctx.rect(size * 0.22, 0, size * 0.56, size);
    } else {
      ctx.rect(0, size * 0.22, size, size * 0.56);
    }
    ctx.fill();
    return;
  }
  if (uniq.length === 3) {
    const missing = [N, E, S, W].filter(function (e) {
      return uniq.indexOf(e) === -1;
    })[0];
    const d = size * (depthOverride == null ? 0.4 : depthOverride);
    const cornerInset = d * 0.35;
    ctx.beginPath();
    if (missing === S) {
      ctx.moveTo(0, 0);
      ctx.lineTo(size, 0);
      ctx.lineTo(size, size);
      ctx.lineTo(size - cornerInset, size);
      ctx.lineTo(size - d * 0.15, size * 0.42);
      ctx.lineTo(d * 0.15, size * 0.42);
      ctx.lineTo(cornerInset, size);
      ctx.lineTo(0, size);
    } else if (missing === N) {
      ctx.moveTo(0, size);
      ctx.lineTo(size, size);
      ctx.lineTo(size, 0);
      ctx.lineTo(size - cornerInset, 0);
      ctx.lineTo(size - d * 0.15, size * 0.58);
      ctx.lineTo(d * 0.15, size * 0.58);
      ctx.lineTo(cornerInset, 0);
      ctx.lineTo(0, 0);
    } else if (missing === W) {
      ctx.moveTo(size, 0);
      ctx.lineTo(size, size);
      ctx.lineTo(0, size);
      ctx.lineTo(0, size - cornerInset);
      ctx.lineTo(size * 0.58, size - d * 0.15);
      ctx.lineTo(size * 0.58, d * 0.15);
      ctx.lineTo(0, cornerInset);
      ctx.lineTo(0, 0);
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(size, size);
      ctx.lineTo(size, size - cornerInset);
      ctx.lineTo(size * 0.42, size - d * 0.15);
      ctx.lineTo(size * 0.42, d * 0.15);
      ctx.lineTo(size, cornerInset);
      ctx.lineTo(size, 0);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  uniq.forEach(function (e) {
    trap(ctx, size, e, depth, sideInset);
    ctx.fill();
  });
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const a = uniq[i], b = uniq[j];
      if ((a + 1) % 4 === b || (b + 1) % 4 === a) {
        cornerSq(ctx, size, a, b, depth);
        ctx.fill();
      }
    }
  }
}

function drawRoadLine(ctx, size, edges, start, reachesCenter) {
  const w = size * 0.16;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.strokeStyle = COL.roadEdge;
  ctx.lineWidth = w + 2;
  const mids = edges.map(function (e) {
    const m = edgeMid(e);
    return { x: m.x * size, y: m.y * size };
  });
  const c = { x: size / 2, y: size / 2 };
  ctx.beginPath();
  if (edges.length === 1) {
    const stop = start
      ? { x: start.x * size, y: start.y * size }
      : reachesCenter ? c : lerp(mids[0], c, 0.55);
    ctx.moveTo(mids[0].x, mids[0].y);
    ctx.lineTo(stop.x, stop.y);
  } else if (edges.length === 2 && Math.abs(edges[0] - edges[1]) === 2) {
    ctx.moveTo(mids[0].x, mids[0].y);
    ctx.lineTo(mids[1].x, mids[1].y);
  } else if (edges.length === 2) {
    ctx.moveTo(mids[0].x, mids[0].y);
    ctx.quadraticCurveTo(c.x, c.y, mids[1].x, mids[1].y);
  } else {
    mids.forEach(function (m) {
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(c.x, c.y);
    });
  }
  ctx.stroke();
  ctx.strokeStyle = COL.road;
  ctx.lineWidth = w;
  ctx.stroke();
}

function drawRiver(ctx, size, edges) {
  const mids = edges.map(function (edge) {
    const midpoint = edgeMid(edge);
    return { x: midpoint.x * size, y: midpoint.y * size };
  });
  const center = { x: size / 2, y: size / 2 };
  if (mids.length === 1) {
    center.x += DIR_DELTA[edges[0]].x * size * 0.15;
    center.y += DIR_DELTA[edges[0]].y * size * 0.15;
  }

  function strokeRiver(color, width) {
    ctx.beginPath();
    if (mids.length === 1) {
      ctx.moveTo(mids[0].x, mids[0].y);
      ctx.lineTo(center.x, center.y);
    } else if (mids.length === 2 && Math.abs(edges[0] - edges[1]) === 2) {
      ctx.moveTo(mids[0].x, mids[0].y);
      ctx.lineTo(mids[1].x, mids[1].y);
    } else if (mids.length === 2) {
      const inset = size * 0.32;
      function control(edge, midpoint) {
        if (edge === N) return { x: midpoint.x, y: midpoint.y + inset };
        if (edge === E) return { x: midpoint.x - inset, y: midpoint.y };
        if (edge === S) return { x: midpoint.x, y: midpoint.y - inset };
        return { x: midpoint.x + inset, y: midpoint.y };
      }
      const start = control(edges[0], mids[0]);
      const end = control(edges[1], mids[1]);
      ctx.moveTo(mids[0].x, mids[0].y);
      ctx.bezierCurveTo(start.x, start.y, end.x, end.y, mids[1].x, mids[1].y);
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  strokeRiver(COL.riverBank, size * (RIVER_WIDTH + 0.02));
  strokeRiver(COL.river, size * RIVER_WIDTH);
  if (mids.length === 1) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, size * (RIVER_WIDTH + 0.02) / 2, 0, Math.PI * 2);
    ctx.fillStyle = COL.riverBank;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(center.x, center.y, size * RIVER_WIDTH / 2, 0, Math.PI * 2);
    ctx.fillStyle = COL.river;
    ctx.fill();
  }
}

function drawTileOutline(ctx, size, isStart, riverEdges) {
  const inset = 0.6;
  const radius = size * 0.06;
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;
  const middle = size / 2;
  const gap = size * (RIVER_WIDTH + 0.02) / 2;

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function corner(x1, y1, x2, y2, x3, y3) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.arcTo(x2, y2, x3, y3, radius);
    ctx.stroke();
  }

  function hasRiver(edge) {
    return riverEdges.indexOf(edge) !== -1;
  }

  function horizontal(y, start, end, edge) {
    if (!hasRiver(edge)) {
      line(start, y, end, y);
      return;
    }
    line(start, y, middle - gap, y);
    line(middle + gap, y, end, y);
  }

  function vertical(x, start, end, edge) {
    if (!hasRiver(edge)) {
      line(x, start, x, end);
      return;
    }
    line(x, start, x, middle - gap);
    line(x, middle + gap, x, end);
  }

  ctx.strokeStyle = isStart ? "#c9a227" : COL.ink;
  ctx.lineWidth = isStart ? 2.4 : 1.2;
  horizontal(top, left + radius, right - radius, N);
  vertical(right, top + radius, bottom - radius, E);
  horizontal(bottom, left + radius, right - radius, S);
  vertical(left, top + radius, bottom - radius, W);
  corner(left, top + radius, left, top, left + radius, top);
  corner(right - radius, top, right, top, right, top + radius);
  corner(right, bottom - radius, right, bottom, right - radius, bottom);
  corner(left + radius, bottom, left, bottom, left, bottom - radius);
}

function drawChapel(ctx, size, anchor) {
  const cx = anchor ? anchor.x * size : size / 2;
  const cy = anchor ? anchor.y * size : size / 2;
  const w = size * 0.28, h = size * 0.24;
  ctx.fillStyle = COL.chapel;
  ctx.strokeStyle = COL.ink;
  ctx.lineWidth = 1;
  ctx.fillRect(cx - w / 2, cy - h * 0.15, w, h);
  ctx.strokeRect(cx - w / 2, cy - h * 0.15, w, h);
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - 2, cy - h * 0.15);
  ctx.lineTo(cx, cy - h * 0.85);
  ctx.lineTo(cx + w / 2 + 2, cy - h * 0.15);
  ctx.closePath();
  ctx.fillStyle = COL.roof;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COL.door;
  ctx.fillRect(cx - w * 0.12, cy + h * 0.15, w * 0.24, h * 0.42);
  ctx.fillStyle = COL.roof;
  ctx.fillRect(cx - 1.5, cy - h * 0.85, 3, size * 0.08);
  ctx.fillRect(cx - 5, cy - h * 0.78, 10, 2.5);
}

function drawShield(ctx, size, pt) {
  const x = pt.x * size, y = pt.y * size;
  const s = size * 0.14;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, y - s * 0.45);
  ctx.lineTo(x + s * 0.55, y - s * 0.45);
  ctx.lineTo(x + s * 0.5, y + s * 0.1);
  ctx.lineTo(x, y + s * 0.7);
  ctx.lineTo(x - s * 0.5, y + s * 0.1);
  ctx.closePath();
  ctx.fillStyle = COL.shield;
  ctx.strokeStyle = COL.shieldDark;
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.35);
  ctx.lineTo(x, y + s * 0.4);
  ctx.moveTo(x - s * 0.28, y - s * 0.05);
  ctx.lineTo(x + s * 0.28, y - s * 0.05);
  ctx.stroke();
}

function drawVillage(ctx, size) {
  const s = size * 0.16;
  ctx.fillStyle = "#9a6a3a";
  ctx.strokeStyle = COL.wall;
  ctx.lineWidth = 1;
  roundRect(ctx, size / 2 - s / 2, size / 2 - s / 2, s, s, 2);
  ctx.fill();
  ctx.stroke();
}

function drawMeeple(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, -size * 0.38, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.42, -size * 0.18);
  ctx.lineTo(size * 0.42, -size * 0.18);
  ctx.lineTo(size * 0.18, size * 0.12);
  ctx.lineTo(size * 0.28, size * 0.48);
  ctx.lineTo(size * 0.06, size * 0.48);
  ctx.lineTo(0, size * 0.18);
  ctx.lineTo(-size * 0.06, size * 0.48);
  ctx.lineTo(-size * 0.28, size * 0.48);
  ctx.lineTo(-size * 0.18, size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function paintTile(ctx, typeId, rot, size, isStart) {
  const spec = rotatedType(typeId, rot);
  ctx.save();
  roundRect(ctx, 0.5, 0.5, size - 1, size - 1, size * 0.06);
  ctx.clip();
  ctx.fillStyle = COL.field;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(0,0,0,0.04)";
  ctx.fillRect(0, size * 0.5, size, size * 0.5);

  const cityDepthByType = {
    D: 0.3,
    E: 0.3,
    H: 0.3,
    I: 0.3,
    J: 0.3,
    K: 0.3,
    L: 0.3,
    O: 0.3,
    P: 0.3,
    "river-city-corner": 0.25,
    "river-city-road": 0.46,
    "river-two-cities": 0.18
  };
  const cityDepth = Object.prototype.hasOwnProperty.call(cityDepthByType, typeId)
    ? cityDepthByType[typeId]
    : null;
  const citySideInset = typeId === "river-city-road" ? 0.34 : null;
  spec.cities.forEach(function (city) {
    ctx.fillStyle = COL.city;
    fillCityGroup(ctx, size, city.edges, cityDepth, citySideInset);
    ctx.strokeStyle = COL.wall;
    ctx.lineWidth = Math.max(2, size * 0.035);
    fillCityGroup(ctx, size, city.edges, cityDepth, citySideInset);
    ctx.stroke();
    if (city.pennant) {
      const a = featureAnchor("city", city);
      drawShield(ctx, size, a);
    }
  });

  drawRiver(ctx, size, spec.edges.map(function (edge, index) {
    return edge === RIVER ? index : -1;
  }).filter(function (edge) { return edge >= 0; }));

  spec.roads.forEach(function (road) {
    drawRoadLine(ctx, size, road.edges, road.start, spec.roads.length >= 3);
  });
  if (spec.roads.length >= 3) drawVillage(ctx, size);
  if (spec.monastery) drawChapel(ctx, size, spec.monasteryAnchor);

  ctx.restore();
  const riverEdges = spec.edges.map(function (edge, index) {
    return edge === RIVER ? index : -1;
  }).filter(function (edge) { return edge >= 0; });
  if (riverEdges.length) {
    drawTileOutline(ctx, size, isStart, riverEdges);
  } else {
    ctx.strokeStyle = isStart ? "#c9a227" : COL.ink;
    ctx.lineWidth = isStart ? 2.4 : 1.2;
    roundRect(ctx, 0.6, 0.6, size - 1.2, size - 1.2, size * 0.06);
    ctx.stroke();
  }
}

function drawTileAt(ctx, typeId, rot, x, y, size, isStart) {
  ctx.save();
  ctx.translate(x, y);
  paintTile(ctx, typeId, rot, size, isStart);
  ctx.restore();
}

function boardBounds(state) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  eachPlaced(state, function (x, y) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}

function fieldDebugColor(index) {
  const hue = (index * 137.508) % 360;
  return "hsl(" + hue + ", 82%, 48%)";
}

function drawFieldDebug(ctx, x, y, size, field, color) {
  const slots = field.slots.slice().sort(function (a, b) { return a - b; });
  const anchor = featureAnchor("field", field);
  ctx.save();
  ctx.translate(x, y);
  if (!slots.length) {
    ctx.beginPath();
    ctx.arc(anchor.x * size, anchor.y * size, size * 0.13, 0, Math.PI * 2);
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  slots.forEach(function (slot, index) {
    const point = slotPos(slot);
    if (index === 0) ctx.moveTo(point.x * size, point.y * size);
    else ctx.lineTo(point.x * size, point.y * size);
  });
  ctx.lineTo(anchor.x * size, anchor.y * size);
  ctx.closePath();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawBoard(ctx, state, cam, legal, hover, debugFields) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#c8b48a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(90,70,40,0.08)";
  const g = 28;
  for (let x = 0; x < w; x += g) ctx.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += g) ctx.fillRect(0, y, w, 1);

  const ts = cam.tile;
  ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.x, cam.y);
  let fieldColors = null;
  if (debugFields) {
    fieldColors = {};
    allFieldFeatures(state).forEach(function (field, index) {
      const color = fieldDebugColor(index);
      field.nodes.forEach(function (node) {
        fieldColors[node.x + "," + node.y + ":" + node.index] = color;
      });
    });
  }

  if (legal) {
    legal.forEach(function (c) {
      ctx.fillStyle = COL.legal;
      ctx.strokeStyle = COL.legalStroke;
      ctx.lineWidth = 2 / cam.scale;
      roundRect(ctx, c.x * ts + 3, c.y * ts + 3, ts - 6, ts - 6, 6);
      ctx.fill();
      ctx.stroke();
    });
  }

  eachPlaced(state, function (x, y, tile) {
    drawTileAt(ctx, tile.typeId, tile.rot, x * ts, y * ts, ts - 2, tile.start);
    if (fieldColors) {
      const spec = rotatedType(tile.typeId, tile.rot);
      spec.fields.forEach(function (field, index) {
        const color = fieldColors[x + "," + y + ":" + index];
        if (color) drawFieldDebug(ctx, x * ts, y * ts, ts - 2, field, color);
      });
    }
    if (tile.meeple) {
      const spec = rotatedType(tile.typeId, tile.rot);
      let feat = { edges: [], slots: [] };
      if (tile.meeple.kind === "city") feat = spec.cities[tile.meeple.index];
      if (tile.meeple.kind === "road") feat = spec.roads[tile.meeple.index];
      if (tile.meeple.kind === "field") feat = spec.fields[tile.meeple.index];
      if (tile.meeple.kind === "monastery") feat = { anchor: spec.monasteryAnchor };
      const a = featureAnchor(tile.meeple.kind, feat || { edges: [], slots: [] });
      const color = state.players[tile.meeple.player].color;
      drawMeeple(ctx, x * ts + a.x * ts, y * ts + a.y * ts, ts * 0.22, color);
    }
  });

  if (state.placed) {
    ctx.strokeStyle = "#fff8d0";
    ctx.lineWidth = 4 / cam.scale;
    roundRect(
      ctx,
      state.placed.x * ts + 1,
      state.placed.y * ts + 1,
      ts - 2,
      ts - 2,
      8
    );
    ctx.stroke();
  }

  if (state.pending && state.currentTile) {
    drawTileAt(
      ctx,
      state.currentTile.typeId,
      state.currentTile.rot,
      state.pending.x * ts,
      state.pending.y * ts,
      ts - 2,
      false
    );
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#fff8d0";
    ctx.lineWidth = 4 / cam.scale;
    roundRect(
      ctx,
      state.pending.x * ts + 2,
      state.pending.y * ts + 2,
      ts - 6,
      ts - 6,
      8
    );
    ctx.stroke();
    ctx.restore();
  }

  if (hover && state.currentTile && state.phase === "place") {
    ctx.globalAlpha = 0.72;
    drawTileAt(
      ctx,
      state.currentTile.typeId,
      state.currentTile.rot,
      hover.x * ts,
      hover.y * ts,
      ts - 2,
      false
    );
    ctx.globalAlpha = 1;
  }
}

function screenToGrid(cam, sx, sy) {
  const wx = (sx - cam.x) / cam.scale;
  const wy = (sy - cam.y) / cam.scale;
  return {
    x: Math.floor(wx / cam.tile),
    y: Math.floor(wy / cam.tile)
  };
}
