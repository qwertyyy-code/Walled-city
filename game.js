/*
 * game.js — Turn flow, legal placement, meeple claims, scoring, undo, and save.
 */

const SAVE_KEY = "walled-city-save";
const FARM_POINTS_PER_CITY = 4;
const SMALL_CITY_MAX_TILES = 2;
const SMALL_CITY_POINTS_PER_TILE = 1;
const PLAYER_COLORS = [
  { id: "red", hex: "#c62828", name: "Red" },
  { id: "blue", hex: "#1565c0", name: "Blue" },
  { id: "green", hex: "#2e7d32", name: "Green" },
  { id: "yellow", hex: "#f9a825", name: "Yellow" },
  { id: "black", hex: "#212121", name: "Black" }
];

function keyXY(x, y) {
  return x + "," + y;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function emptyEndGamePoints() {
  return { roads: 0, cities: 0, monasteries: 0, farms: 0 };
}

function emptyState() {
  return {
    version: 1,
    players: [],
    scoreLog: [],
    scoreHistory: [],
    current: 0,
    phase: "start",
    deck: [],
    riverEnabled: false,
    riverDeck: [],
    riverOpenEnd: null,
    riverLastTurn: null,
    discarded: [],
    board: {},
    currentTile: null,
    pending: null,
    selectedMeeple: null,
    placed: null,
    meeplePicked: false,
    undo: null,
    gameOver: false,
    finalScored: false
  };
}

function buildPlayerSetup(computerMode, humanCount, computerOpponentCount, names, autoplay) {
  const maxPlayers = PLAYER_COLORS.length;
  const humanSeats = Math.max(2, Math.min(maxPlayers, Math.floor(Number(humanCount) || 2)));
  const opponents = Math.max(
    1,
    Math.min(maxPlayers - 1, Math.floor(Number(computerOpponentCount) || 1))
  );
  const count = autoplay
    ? humanSeats
    : computerMode
      ? opponents + 1
      : humanSeats;
  const players = [];
  for (let i = 0; i < count; i++) {
    const computer = !!autoplay || (!!computerMode && i > 0);
    const defaultName = computer
      ? "Computer " + (autoplay ? i + 1 : i)
      : PLAYER_COLORS[i].name;
    players.push({
      name: computer ? defaultName : ((names && names[i] || "").trim() || defaultName),
      color: PLAYER_COLORS[i].hex,
      computer: computer
    });
  }
  return players;
}

function newGame(playerSetup, tileLimit, riverEnabled, rng) {
  const withRiver = !!riverEnabled;
  const pack = makeDeck(tileLimit, withRiver, rng);
  const state = emptyState();
  state.players = playerSetup.map(function (p) {
    return {
      name: p.name,
      color: p.color,
      computer: !!p.computer,
      meeples: 7,
      score: 0,
      endGamePoints: emptyEndGamePoints()
    };
  });
  state.deck = pack.deck;
  state.riverEnabled = withRiver;
  if (withRiver) {
    state.riverDeck = makeRiverDeck(rng);
    state.riverOpenEnd = { x: 0, y: 1, incomingEdge: N };
    state.board[keyXY(0, 0)] = {
      uid: RIVER_SPRING_ID,
      typeId: RIVER_SPRING_ID,
      rot: 0,
      meeple: null,
      start: true
    };
  } else {
    state.board[keyXY(0, 0)] = {
      uid: pack.start.uid,
      typeId: pack.start.typeId,
      rot: 0,
      meeple: null,
      start: true
    };
  }
  state.phase = "handoff";
  state.current = 0;
  persist(state);
  return state;
}

function persist(state) {
  try {
    const copy = clone(state);
    copy.undo = null;
    if (copy.pending) {
      copy.pending = null;
      copy.selectedMeeple = null;
      copy.placed = null;
      copy.phase = "place";
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
  } catch (err) {
    console.warn("save failed", err);
  }
}

function saveForHome(state) {
  persist(state);
}

function createNewGameIfConfirmed(playerSetup, tileLimit, riverEnabled, rng, replaceSavedGame) {
  if (loadSave() && !replaceSavedGame) return null;
  return newGame(playerSetup, tileLimit, riverEnabled, rng);
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1 || !state.board || !Array.isArray(state.players)) return null;
    state.pending = null;
    state.selectedMeeple = null;
    state.players.forEach(function (player) {
      if (typeof player.score !== "number") player.score = 0;
      if (!player.endGamePoints || typeof player.endGamePoints !== "object") {
        player.endGamePoints = emptyEndGamePoints();
      } else {
        const points = player.endGamePoints;
        ["roads", "cities", "monasteries", "farms"].forEach(function (kind) {
          if (typeof points[kind] !== "number") points[kind] = 0;
        });
      }
    });
    if (!Array.isArray(state.scoreLog)) state.scoreLog = [];
    if (!Array.isArray(state.scoreHistory)) {
      state.scoreHistory = state.players.map(function (player, index) {
        return { player: index, points: player.score };
      }).filter(function (entry) { return entry.points > 0; });
    }
    state.players.forEach(function (player) {
      player.computer = !!player.computer;
    });
    state.finalScored = !!state.finalScored;
    return state;
  } catch (err) {
    return null;
  }
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function shouldShowHandoff(state) {
  return !!state && state.players[state.current] &&
    !state.players[state.current].computer &&
    state.players.filter(function (player) { return !player.computer; }).length > 1;
}

function boardTile(state, x, y) {
  return state.board[keyXY(x, y)] || null;
}

function placedList(state) {
  return Object.keys(state.board).map(function (k) {
    const t = state.board[k];
    return { x: t._x, y: t._y, tile: t, key: k };
  });
}

function eachPlaced(state, fn) {
  Object.keys(state.board).forEach(function (k) {
    const parts = k.split(",");
    fn(+parts[0], +parts[1], state.board[k]);
  });
}

function neighborKeys(state) {
  const empty = {};
  eachPlaced(state, function (x, y) {
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_DELTA[d].x;
      const ny = y + DIR_DELTA[d].y;
      if (!boardTile(state, nx, ny)) empty[keyXY(nx, ny)] = { x: nx, y: ny };
    }
  });
  return Object.keys(empty).map(function (k) {
    return empty[k];
  });
}

function canPlaceAt(state, typeId, rot, x, y) {
  if (boardTile(state, x, y)) return false;
  if (RIVER_TILE_TYPES[typeId]) {
    return canPlaceRiverAt(state, typeId, rot, x, y);
  }
  return canPlaceMatchingEdges(state, typeId, rot, x, y);
}

function legalRotationsAt(state, typeId, x, y) {
  const rotations = [];
  for (let rot = 0; rot < 4; rot++) {
    if (canPlaceAt(state, typeId, rot, x, y)) rotations.push(rot);
  }
  return rotations;
}

function canPlaceMatchingEdges(state, typeId, rot, x, y) {
  if (boardTile(state, x, y)) return false;
  const incoming = rotatedType(typeId, rot);
  let adj = 0;
  for (let d = 0; d < 4; d++) {
    const n = boardTile(state, x + DIR_DELTA[d].x, y + DIR_DELTA[d].y);
    if (!n) continue;
    adj += 1;
    const theirs = rotatedType(n.typeId, n.rot);
    if (incoming.edges[d] !== theirs.edges[OPPOSITE[d]]) return false;
  }
  return adj > 0;
}

function canPlaceRiverAt(state, typeId, rot, x, y) {
  const openEnd = state.riverOpenEnd;
  if (!openEnd || x !== openEnd.x || y !== openEnd.y) return false;
  const incoming = rotatedType(typeId, rot);
  if (incoming.edges[openEnd.incomingEdge] !== RIVER) return false;
  const riverEdges = incoming.edges.map(function (edge, index) {
    return edge === RIVER ? index : -1;
  }).filter(function (edge) { return edge >= 0; });
  const isLake = typeId === RIVER_LAKE_ID;
  if (isLake) {
    if (riverEdges.length !== 1) return false;
  } else if (riverEdges.length !== 2) {
    return false;
  }

  let outgoingEdge = -1;
  if (!isLake) {
    outgoingEdge = riverEdges.filter(function (edge) {
      return edge !== openEnd.incomingEdge;
    })[0];
    if (outgoingEdge === undefined) return false;
    const travelDirection = OPPOSITE[openEnd.incomingEdge];
    const turnDelta = (outgoingEdge - travelDirection + 4) % 4;
    const turn = turnDelta === 1 ? 1 : turnDelta === 3 ? -1 : 0;
    if (turn && state.riverLastTurn === turn) return false;
    const nextX = x + DIR_DELTA[outgoingEdge].x;
    const nextY = y + DIR_DELTA[outgoingEdge].y;
    if (boardTile(state, nextX, nextY)) return false;
  }
  return canPlaceMatchingEdges(state, typeId, rot, x, y);
}

function validateBoard(state) {
  const mismatches = [];
  const edgeMismatchTiles = {};
  eachPlaced(state, function (x, y, tile) {
    const spec = rotatedType(tile.typeId, tile.rot);
    [E, S].forEach(function (edge) {
      const nx = x + DIR_DELTA[edge].x;
      const ny = y + DIR_DELTA[edge].y;
      const neighbor = boardTile(state, nx, ny);
      if (!neighbor) return;
      const neighborEdge = OPPOSITE[edge];
      const neighborSpec = rotatedType(neighbor.typeId, neighbor.rot);
      if (spec.edges[edge] !== neighborSpec.edges[neighborEdge]) {
        edgeMismatchTiles[keyXY(x, y)] = true;
        edgeMismatchTiles[keyXY(nx, ny)] = true;
        mismatches.push({
          x: x,
          y: y,
          edge: edge,
          edgeType: spec.edges[edge],
          neighborX: nx,
          neighborY: ny,
          neighborEdge: neighborEdge,
          neighborEdgeType: neighborSpec.edges[neighborEdge]
        });
      }
    });
  });

  const checkedState = Object.assign({}, state, { board: Object.assign({}, state.board) });
  const illegalTiles = [];
  Object.keys(state.board).forEach(function (key) {
    const tile = state.board[key];
    if (tile.start || tile.typeId === RIVER_SPRING_ID) return;
    if (RIVER_TILE_TYPES[tile.typeId]) return;
    delete checkedState.board[key];
    const coords = key.split(",").map(Number);
    const rotations = legalRotationsAt(checkedState, tile.typeId, coords[0], coords[1]);
    checkedState.board[key] = tile;
    if (rotations.indexOf(tile.rot) < 0 && !edgeMismatchTiles[key]) {
      illegalTiles.push({ x: coords[0], y: coords[1], typeId: tile.typeId, rot: tile.rot });
    }
  });

  const riverState = Object.assign({}, state, { board: Object.assign({}, state.board) });
  Object.keys(riverState.board).forEach(function (key) {
    const tile = riverState.board[key];
    if (RIVER_TILE_TYPES[tile.typeId] && tile.typeId !== RIVER_SPRING_ID) {
      delete riverState.board[key];
    }
  });
  if (riverState.board[keyXY(0, 0)] && riverState.board[keyXY(0, 0)].typeId === RIVER_SPRING_ID) {
    riverState.riverOpenEnd = { x: 0, y: 1, incomingEdge: N };
    riverState.riverLastTurn = null;
    let remaining = Object.keys(state.board).filter(function (key) {
      const tile = state.board[key];
      return RIVER_TILE_TYPES[tile.typeId] && tile.typeId !== RIVER_SPRING_ID;
    }).length;
    while (remaining > 0 && riverState.riverOpenEnd) {
      const open = riverState.riverOpenEnd;
      const key = keyXY(open.x, open.y);
      const tile = state.board[key];
      if (!tile || !RIVER_TILE_TYPES[tile.typeId]) break;
      const rotations = legalRotationsAt(riverState, tile.typeId, open.x, open.y);
      if (rotations.indexOf(tile.rot) < 0 && !edgeMismatchTiles[key]) {
        illegalTiles.push({ x: open.x, y: open.y, typeId: tile.typeId, rot: tile.rot });
      }
      riverState.board[key] = tile;
      advanceRiver(riverState, tile.typeId, tile.rot, open.x, open.y);
      remaining--;
    }
    if (remaining > 0) {
      Object.keys(state.board).forEach(function (key) {
        const tile = state.board[key];
        if (!RIVER_TILE_TYPES[tile.typeId] || tile.typeId === RIVER_SPRING_ID) return;
        if (riverState.board[key]) return;
        const coords = key.split(",").map(Number);
        illegalTiles.push({ x: coords[0], y: coords[1], typeId: tile.typeId, rot: tile.rot });
      });
    }
  }
  illegalTiles.forEach(function (tile) {
    mismatches.push({
      x: tile.x,
      y: tile.y,
      type: "illegal-placement",
      typeId: tile.typeId,
      rot: tile.rot
    });
  });
  return mismatches;
}

function legalCells(state, typeId, rot) {
  return neighborKeys(state).filter(function (c) {
    const rotations = legalRotationsAt(state, typeId, c.x, c.y);
    return rot === undefined ? rotations.length > 0 : rotations.indexOf(rot) >= 0;
  });
}

function anyLegalRotation(state, typeId) {
  return legalCells(state, typeId).length > 0;
}

function snapshot(state) {
  return clone({
    board: state.board,
    players: state.players,
    current: state.current,
    currentTile: state.currentTile,
    pending: state.pending,
    selectedMeeple: state.selectedMeeple,
    placed: state.placed,
    riverOpenEnd: state.riverOpenEnd,
    riverLastTurn: state.riverLastTurn,
    phase: state.phase,
    meeplePicked: state.meeplePicked,
    scoreLog: state.scoreLog,
    scoreHistory: state.scoreHistory,
    gameOver: state.gameOver,
    finalScored: state.finalScored
  });
}

function restoreSnap(state, snap) {
  state.board = snap.board;
  state.players = snap.players;
  state.current = snap.current;
  state.currentTile = snap.currentTile;
  state.pending = snap.pending || null;
  state.selectedMeeple = snap.selectedMeeple || null;
  state.placed = snap.placed;
  state.riverOpenEnd = snap.riverOpenEnd;
  state.riverLastTurn = snap.riverLastTurn;
  state.phase = snap.phase;
  state.meeplePicked = snap.meeplePicked;
  state.scoreLog = snap.scoreLog || [];
  state.scoreHistory = snap.scoreHistory || [];
  state.gameOver = !!snap.gameOver;
  state.finalScored = !!snap.finalScored;
}

function drawPlaceable(state) {
  if (state.riverOpenEnd) {
    while (state.riverDeck.length) {
      const tile = state.riverDeck.shift();
      if (tile.typeId === RIVER_LAKE_ID || anyLegalRotation(state, tile.typeId)) {
        state.currentTile = { uid: tile.uid, typeId: tile.typeId, rot: 0 };
        return true;
      }
      state.discarded.push(tile);
    }
    state.currentTile = null;
    return false;
  }
  while (state.deck.length) {
    const t = state.deck.shift();
    if (anyLegalRotation(state, t.typeId)) {
      state.currentTile = { uid: t.uid, typeId: t.typeId, rot: 0 };
      return true;
    }
    state.discarded.push(t);
  }
  state.currentTile = null;
  return false;
}

function beginTurn(state) {
  if (state.gameOver) return;
  state.pending = null;
  state.selectedMeeple = null;
  state.placed = null;
  state.meeplePicked = false;
  state.undo = null;
  if (!drawPlaceable(state)) {
    finishGame(state);
    persist(state);
    return;
  }
  state.phase = "place";
  persist(state);
}

function rotateCurrent(state, dir) {
  if (state.phase !== "place" || !state.currentTile) return false;
  if (state.pending) return rotatePending(state);
  state.currentTile.rot = (state.currentTile.rot + dir + 4) % 4;
  return true;
}

function selectPending(state, x, y) {
  if (state.phase !== "place" || !state.currentTile) return false;
  const tile = state.currentTile;
  const rotations = legalRotationsAt(state, tile.typeId, x, y);
  if (!rotations.length) return false;
  if (rotations.indexOf(tile.rot) < 0) {
    for (let offset = 1; offset <= 4; offset++) {
      const rotation = (tile.rot + offset) % 4;
      if (rotations.indexOf(rotation) >= 0) {
        tile.rot = rotation;
        break;
      }
    }
  }
  state.pending = { x: x, y: y };
  state.selectedMeeple = null;
  persist(state);
  return true;
}

function movePending(state, x, y) {
  if (state.phase !== "place" || !state.currentTile || !state.pending) return false;
  const rotations = legalRotationsAt(state, state.currentTile.typeId, x, y);
  if (!rotations.length) return false;
  if (rotations.indexOf(state.currentTile.rot) < 0) {
    for (let offset = 1; offset <= 4; offset++) {
      const rotation = (state.currentTile.rot + offset) % 4;
      if (rotations.indexOf(rotation) >= 0) {
        state.currentTile.rot = rotation;
        break;
      }
    }
  }
  state.pending = { x: x, y: y };
  state.selectedMeeple = null;
  persist(state);
  return true;
}

function rotatePending(state) {
  if (state.phase !== "place" || !state.currentTile || !state.pending) return false;
  const rotations = legalRotationsAt(
    state,
    state.currentTile.typeId,
    state.pending.x,
    state.pending.y
  );
  if (rotations.length <= 1) return false;
  for (let offset = 1; offset <= 4; offset++) {
    const rotation = (state.currentTile.rot + offset) % 4;
    if (rotations.indexOf(rotation) >= 0) {
      state.currentTile.rot = rotation;
      state.selectedMeeple = null;
      persist(state);
      return true;
    }
  }
  return false;
}

function lockPending(state) {
  if (state.phase !== "place" || !state.currentTile || !state.pending) return false;
  const x = state.pending.x;
  const y = state.pending.y;
  const tile = state.currentTile;
  if (legalRotationsAt(state, tile.typeId, x, y).indexOf(tile.rot) < 0) return false;
  state.undo = snapshot(state);
  state.board[keyXY(x, y)] = {
    uid: tile.uid,
    typeId: tile.typeId,
    rot: tile.rot,
    meeple: null,
    start: false
  };
  if (RIVER_TILE_TYPES[tile.typeId]) advanceRiver(state, tile.typeId, tile.rot, x, y);
  state.currentTile = null;
  state.pending = null;
  state.selectedMeeple = null;
  state.placed = { x: x, y: y };
  state.phase = "meeple";
  state.meeplePicked = false;
  persist(state);
  return true;
}

function placeCurrent(state, x, y) {
  if (state.phase !== "place" || !state.currentTile) return false;
  if (legalRotationsAt(state, state.currentTile.typeId, x, y)
    .indexOf(state.currentTile.rot) < 0) return false;
  state.pending = { x: x, y: y };
  return lockPending(state);
}

function advanceRiver(state, typeId, rot, x, y) {
  if (typeId === RIVER_LAKE_ID) {
    state.riverOpenEnd = null;
    state.riverLastTurn = null;
    return;
  }
  const incomingEdge = state.riverOpenEnd.incomingEdge;
  const spec = rotatedType(typeId, rot);
  const outgoingEdge = spec.edges.map(function (edge, index) {
    return edge === RIVER && index !== incomingEdge ? index : -1;
  }).filter(function (edge) { return edge >= 0; })[0];
  const travelDirection = OPPOSITE[incomingEdge];
  const turn = (outgoingEdge - travelDirection + 4) % 4;
  state.riverLastTurn = turn === 1 ? 1 : turn === 3 ? -1 : null;
  state.riverOpenEnd = {
    x: x + DIR_DELTA[outgoingEdge].x,
    y: y + DIR_DELTA[outgoingEdge].y,
    incomingEdge: OPPOSITE[outgoingEdge]
  };
}

function featureList(state, x, y) {
  const tile = boardTile(state, x, y);
  const spec = rotatedType(tile.typeId, tile.rot);
  const list = [];
  spec.cities.forEach(function (c, i) {
    list.push({ kind: "city", index: i, pennant: c.pennant, edges: c.edges });
  });
  spec.roads.forEach(function (r, i) {
    list.push({ kind: "road", index: i, edges: r.edges });
  });
  if (spec.monastery) {
    list.push({ kind: "monastery", index: 0, anchor: spec.monasteryAnchor });
  }
  spec.fields.forEach(function (f, i) {
    list.push({ kind: "field", index: i, slots: f.slots });
  });
  return list;
}

function meepleOptionsAt(state, x, y, tile) {
  const placementState = Object.assign({}, state, {
    board: Object.assign({}, state.board)
  });
  placementState.board[keyXY(x, y)] = tile;
  const player = placementState.players[placementState.current];
  return featureList(placementState, x, y).map(function (feature) {
    return {
      kind: feature.kind,
      index: feature.index,
      blocked: player.meeples <= 0 ||
        featureOccupied(placementState, x, y, feature.kind, feature.index),
      edges: feature.edges,
      slots: feature.slots
    };
  });
}

function pendingMeepleOptions(state) {
  if (state.phase !== "place" || !state.pending || !state.currentTile) return [];
  return meepleOptionsAt(
    state,
    state.pending.x,
    state.pending.y,
    {
      uid: state.currentTile.uid,
      typeId: state.currentTile.typeId,
      rot: state.currentTile.rot,
      meeple: null,
      start: false
    }
  ).filter(function (option) { return !option.blocked; });
}

function selectPendingMeeple(state, kind, index) {
  if (state.phase !== "place" || !state.pending || !state.currentTile) return false;
  const option = pendingMeepleOptions(state).filter(function (spot) {
    return spot.kind === kind && spot.index === index;
  })[0];
  if (!option) return false;
  if (state.selectedMeeple && state.selectedMeeple.kind === kind &&
    state.selectedMeeple.index === index) {
    state.selectedMeeple = null;
  } else {
    state.selectedMeeple = { kind: kind, index: index };
  }
  persist(state);
  return true;
}

function cityIndexOnEdge(spec, edge) {
  for (let i = 0; i < spec.cities.length; i++) {
    if (spec.cities[i].edges.indexOf(edge) !== -1) return i;
  }
  return -1;
}

function roadIndexOnEdge(spec, edge) {
  for (let i = 0; i < spec.roads.length; i++) {
    if (spec.roads[i].edges.indexOf(edge) !== -1) return i;
  }
  return -1;
}

function fieldIndexOnSlot(spec, slot) {
  for (let i = 0; i < spec.fields.length; i++) {
    if (spec.fields[i].slots.indexOf(slot) !== -1) return i;
  }
  return -1;
}

function walkFeature(state, x, y, kind, index, visit) {
  const seen = {};
  const stack = [{ x: x, y: y, index: index }];
  while (stack.length) {
    const n = stack.pop();
    const id = n.x + "," + n.y + ":" + kind + ":" + n.index;
    if (seen[id]) continue;
    seen[id] = true;
    const tile = boardTile(state, n.x, n.y);
    if (!tile) continue;
    if (visit(n.x, n.y, tile, n.index)) return true;
    const spec = rotatedType(tile.typeId, tile.rot);
    if (kind === "monastery") continue;
    if (kind === "city") {
      const group = spec.cities[n.index];
      if (!group) continue;
      group.edges.forEach(function (edge) {
        const nx = n.x + DIR_DELTA[edge].x;
        const ny = n.y + DIR_DELTA[edge].y;
        const nt = boardTile(state, nx, ny);
        if (!nt) return;
        const ns = rotatedType(nt.typeId, nt.rot);
        const gi = cityIndexOnEdge(ns, OPPOSITE[edge]);
        if (gi >= 0) stack.push({ x: nx, y: ny, index: gi });
      });
    } else if (kind === "road") {
      const group = spec.roads[n.index];
      if (!group) continue;
      group.edges.forEach(function (edge) {
        const nx = n.x + DIR_DELTA[edge].x;
        const ny = n.y + DIR_DELTA[edge].y;
        const nt = boardTile(state, nx, ny);
        if (!nt) return;
        const ns = rotatedType(nt.typeId, nt.rot);
        const gi = roadIndexOnEdge(ns, OPPOSITE[edge]);
        if (gi >= 0) stack.push({ x: nx, y: ny, index: gi });
      });
    } else if (kind === "field") {
      const group = spec.fields[n.index];
      if (!group) continue;
      group.slots.forEach(function (slot) {
        const dir = SLOT_DIR[slot];
        const nx = n.x + DIR_DELTA[dir].x;
        const ny = n.y + DIR_DELTA[dir].y;
        const nt = boardTile(state, nx, ny);
        if (!nt) return;
        const ns = rotatedType(nt.typeId, nt.rot);
        const gi = fieldIndexOnSlot(ns, SLOT_NEIGHBOR[slot]);
        if (gi >= 0) stack.push({ x: nx, y: ny, index: gi });
      });
    }
  }
  return false;
}

function featureOccupied(state, x, y, kind, index) {
  return walkFeature(state, x, y, kind, index, function (fx, fy, tile, fi) {
    return !!(tile.meeple && tile.meeple.kind === kind && tile.meeple.index === fi);
  });
}

function collectFeature(state, x, y, kind, index) {
  const nodes = [];
  walkFeature(state, x, y, kind, index, function (fx, fy, tile, fi) {
    nodes.push({ x: fx, y: fy, tile: tile, index: fi });
    return false;
  });
  return { kind: kind, nodes: nodes };
}

function featureComplete(state, feature) {
  if (feature.kind === "monastery") {
    const node = feature.nodes[0];
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && boardTile(state, node.x + dx, node.y + dy)) neighbors += 1;
      }
    }
    return neighbors === 8;
  }

  return feature.nodes.every(function (node) {
    const spec = rotatedType(node.tile.typeId, node.tile.rot);
    const groups = feature.kind === "city" ? spec.cities : spec.roads;
    const group = groups[node.index];
    return group.edges.every(function (edge) {
      const neighbor = boardTile(
        state,
        node.x + DIR_DELTA[edge].x,
        node.y + DIR_DELTA[edge].y
      );
      if (!neighbor) return false;
      const neighborSpec = rotatedType(neighbor.typeId, neighbor.rot);
      const findIndex = feature.kind === "city" ? cityIndexOnEdge : roadIndexOnEdge;
      return findIndex(neighborSpec, OPPOSITE[edge]) >= 0;
    });
  });
}

function featureMeeples(state, feature) {
  const counts = state.players.map(function () { return 0; });
  feature.nodes.forEach(function (node) {
    const meeple = node.tile.meeple;
    if (!meeple || meeple.kind !== feature.kind || meeple.index !== node.index) return;
    counts[meeple.player] = (counts[meeple.player] || 0) + 1;
  });
  return counts;
}

function isSmallCity(feature, complete) {
  return complete && feature.kind === "city" && feature.nodes.length === SMALL_CITY_MAX_TILES;
}

function featurePoints(state, feature, complete) {
  if (feature.kind === "monastery") {
    if (complete) return 9;
    let neighbors = 0;
    const node = feature.nodes[0];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && boardTile(state, node.x + dx, node.y + dy)) neighbors += 1;
      }
    }
    return 1 + neighbors;
  }
  if (feature.kind === "road") return feature.nodes.length;
  const pennants = feature.nodes.reduce(function (total, node) {
    const spec = rotatedType(node.tile.typeId, node.tile.rot);
    return total + (spec.cities[node.index].pennant ? 1 : 0);
  }, 0);
  const pointsPerTile = isSmallCity(feature, complete) ? SMALL_CITY_POINTS_PER_TILE : (complete ? 2 : 1);
  const tilePoints = feature.nodes.length * pointsPerTile;
  const pennantPoints = pennants * pointsPerTile;
  return tilePoints + pennantPoints;
}

function featureReason(state, feature, complete, points) {
  if (feature.kind === "monastery") {
    if (complete) return "completed monastery: 9 points (the tile and all 8 neighbours)";
    const node = feature.nodes[0];
    let neighbors = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && boardTile(state, node.x + dx, node.y + dy)) neighbors += 1;
      }
    }
    return "unfinished monastery: 1 + " + neighbors + " neighbouring tile" +
      (neighbors === 1 ? "" : "s") + " = " + points;
  }
  if (feature.kind === "road") {
    return (complete ? "completed" : "unfinished") + " road: " + feature.nodes.length +
      " tile" + (feature.nodes.length === 1 ? "" : "s") + " × 1 = " + points;
  }
  const pennants = feature.nodes.reduce(function (total, node) {
    const spec = rotatedType(node.tile.typeId, node.tile.rot);
    return total + (spec.cities[node.index].pennant ? 1 : 0);
  }, 0);
  const smallCity = isSmallCity(feature, complete);
  const tileValue = smallCity ? SMALL_CITY_POINTS_PER_TILE : (complete ? 2 : 1);
  const pennantValue = tileValue;
  return (smallCity ? "small" : (complete ? "completed" : "unfinished")) + " city: " + feature.nodes.length +
    " tile" + (feature.nodes.length === 1 ? "" : "s") + " × " + tileValue +
    " + " + pennants + " pennant" + (pennants === 1 ? "" : "s") + " × " +
    pennantValue + " = " + points;
}

function awardFeature(state, feature, complete, endGame) {
  const counts = featureMeeples(state, feature);
  const highest = Math.max.apply(null, counts.concat([0]));
  if (!highest) return null;
  const winners = [];
  counts.forEach(function (count, player) {
    if (count === highest) winners.push(player);
  });
  const points = featurePoints(state, feature, complete);
  winners.forEach(function (player) {
    state.players[player].score += points;
    if (endGame) {
      const category = feature.kind === "road" ? "roads" :
        feature.kind === "city" ? "cities" : "monasteries";
      state.players[player].endGamePoints[category] += points;
    }
  });
  feature.nodes.forEach(function (node) {
    const meeple = node.tile.meeple;
    if (!meeple || meeple.kind !== feature.kind || meeple.index !== node.index) return;
    state.players[meeple.player].meeples += 1;
    node.tile.meeple = null;
  });
  if (isSmallCity(feature, complete)) {
    return "Small city (" + SMALL_CITY_MAX_TILES + " tiles): " +
      winners.map(function (player) {
        return state.players[player].name + " +" + points;
      }).join(", ") + ".";
  }
  const reason = featureReason(state, feature, complete, points);
  if (winners.length === 1) {
    return state.players[winners[0]].name + " scores " + points + " for " + reason + ".";
  }
  return winners.map(function (player) {
    return state.players[player].name;
  }).join(" and ") + " each score " + points + " for " + reason + ".";
}

function allFeatures(state) {
  const features = [];
  const seen = {};
  eachPlaced(state, function (x, y, tile) {
    const spec = rotatedType(tile.typeId, tile.rot);
    ["city", "road"].forEach(function (kind) {
      const groups = kind === "city" ? spec.cities : spec.roads;
      groups.forEach(function (_, index) {
        const feature = collectFeature(state, x, y, kind, index);
        const id = kind + ":" + feature.nodes.map(function (node) {
          return node.x + "," + node.y + ":" + node.index;
        }).sort().join("|");
        if (!seen[id]) {
          seen[id] = true;
          features.push(feature);
        }
      });
    });
    if (spec.monastery) {
      features.push({ kind: "monastery", nodes: [{ x: x, y: y, tile: tile, index: 0 }] });
    }
  });
  return features;
}

function featureKey(feature) {
  return feature.kind + ":" + feature.nodes.map(function (node) {
    return node.x + "," + node.y + ":" + node.index;
  }).sort().join("|");
}

function allFieldFeatures(state) {
  const features = [];
  const seen = {};
  eachPlaced(state, function (x, y, tile) {
    const spec = rotatedType(tile.typeId, tile.rot);
    spec.fields.forEach(function (_, index) {
      const feature = collectFeature(state, x, y, "field", index);
      const id = featureKey(feature);
      if (seen[id]) return;
      seen[id] = true;
      features.push(feature);
    });
  });
  return features;
}

function scoreFarms(state) {
  const logs = [];
  allFeatures(state).filter(function (feature) {
    return feature.kind === "city" && featureComplete(state, feature);
  }).forEach(function (city) {
    const fields = {};
    city.nodes.forEach(function (node) {
      const spec = rotatedType(node.tile.typeId, node.tile.rot);
      spec.fields.forEach(function (field, index) {
        if (field.cityAreas.indexOf(node.index) === -1) return;
        const connectedField = collectFeature(state, node.x, node.y, "field", index);
        fields[featureKey(connectedField)] = connectedField;
      });
    });

    const counts = state.players.map(function () { return 0; });
    Object.keys(fields).forEach(function (key) {
      featureMeeples(state, fields[key]).forEach(function (count, player) {
        counts[player] += count;
      });
    });
    const highest = Math.max.apply(null, counts.concat([0]));
    const winners = [];
    if (highest > 0) {
      counts.forEach(function (count, player) {
        if (count === highest) winners.push(player);
      });
    }
    const points = FARM_POINTS_PER_CITY;
    winners.forEach(function (player) {
      state.players[player].score += points;
      state.players[player].endGamePoints.farms += points;
    });
    const farmerCounts = counts.map(function (count, player) {
      return count ? state.players[player].name + " " + count : null;
    }).filter(Boolean);
    const awards = winners.map(function (player) {
      return state.players[player].name + " +" + points;
    });
    const details = farmerCounts.concat(awards);
    logs.push("City (" + city.nodes.length + " tiles): " +
      (details.length ? details.join(", ") : "no farmers, no points") + ".");
  });
  return logs;
}

function scoreCompletedFeatures(state) {
  const logs = [];
  allFeatures(state).forEach(function (feature) {
    if (!featureComplete(state, feature)) return;
    const message = awardFeature(state, feature, true);
    if (message) logs.push(message);
  });
  return logs;
}

function scoreCompletedMonasteriesAround(state, x, y) {
  const logs = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const monasteryX = x + dx;
      const monasteryY = y + dy;
      const tile = boardTile(state, monasteryX, monasteryY);
      if (!tile || !tile.meeple || tile.meeple.kind !== "monastery") continue;
      const spec = rotatedType(tile.typeId, tile.rot);
      if (!spec.monastery || tile.meeple.index !== 0) continue;
      const feature = {
        kind: "monastery",
        nodes: [{ x: monasteryX, y: monasteryY, tile: tile, index: 0 }]
      };
      if (!featureComplete(state, feature)) continue;
      const message = awardFeature(state, feature, true);
      if (message) logs.push(message);
    }
  }
  return logs;
}

function scoreUnfinishedFeatures(state, endGame) {
  const logs = [];
  allFeatures(state).forEach(function (feature) {
    if (featureComplete(state, feature)) return;
    const message = awardFeature(state, feature, false, endGame);
    if (message) logs.push(message);
  });
  return logs;
}

function finishGame(state) {
  if (state.finalScored) return;
  const scores = state.players.map(function (player) { return player.score; });
  const logs = scoreCompletedFeatures(state)
    .concat(scoreUnfinishedFeatures(state, true), scoreFarms(state));
  recordScoreChanges(state, scores);
  state.scoreLog = logs.length ? logs : ["No road, city, monastery, or farm scored at the end of the game."];
  state.finalScored = true;
  state.gameOver = true;
  state.phase = "end";
  state.currentTile = null;
}

function recordScoreChanges(state, previousScores) {
  state.players.forEach(function (player, index) {
    const points = player.score - previousScores[index];
    if (points > 0) state.scoreHistory.push({ player: index, points: points });
  });
}

function meepleOptions(state) {
  if (!state.placed) return [];
  const p = state.players[state.current];
  const x = state.placed.x;
  const y = state.placed.y;
  return featureList(state, x, y).map(function (f) {
    const blocked = p.meeples <= 0 || featureOccupied(state, x, y, f.kind, f.index);
    return {
      kind: f.kind,
      index: f.index,
      blocked: blocked,
      edges: f.edges,
      slots: f.slots
    };
  });
}

function placeMeeple(state, kind, index) {
  if (state.phase !== "meeple" || !state.placed) return false;
  const opt = meepleOptions(state).filter(function (o) {
    return o.kind === kind && o.index === index;
  })[0];
  if (!opt || opt.blocked) return false;
  const tile = boardTile(state, state.placed.x, state.placed.y);
  tile.meeple = { player: state.current, kind: kind, index: index };
  state.players[state.current].meeples -= 1;
  state.meeplePicked = true;
  persist(state);
  return true;
}

function chooseNoMeeple(state) {
  if (state.phase !== "meeple") return;
  if (state.meeplePicked && boardTile(state, state.placed.x, state.placed.y).meeple) {
    const tile = boardTile(state, state.placed.x, state.placed.y);
    state.players[tile.meeple.player].meeples += 1;
    tile.meeple = null;
  }
  state.meeplePicked = true;
  persist(state);
}

function undoLast(state) {
  if (!state.undo) return false;
  restoreSnap(state, state.undo);
  state.undo = null;
  persist(state);
  return true;
}

function confirmTurn(state, preserveUndo) {
  if (state.phase !== "meeple" || !state.placed || !state.meeplePicked) return false;
  const scores = state.players.map(function (player) { return player.score; });
  const monasteryLogs = scoreCompletedMonasteriesAround(state, state.placed.x, state.placed.y);
  state.currentTile = null;
  state.placed = null;
  state.selectedMeeple = null;
  if (!preserveUndo) state.undo = null;
  state.meeplePicked = false;
  const logs = monasteryLogs.concat(scoreCompletedFeatures(state));
  const edgeMismatches = validateBoard(state);
  if (edgeMismatches.length) {
    console.warn("Board has mismatched neighbouring tile edges:", edgeMismatches);
  }
  if (state.deck.length === 0) {
    const endLogs = scoreUnfinishedFeatures(state, true).concat(scoreFarms(state));
    logs.push.apply(logs, endLogs);
    recordScoreChanges(state, scores);
    state.scoreLog = logs.length ? logs : ["No road, city, or monastery scored this turn."];
    state.finalScored = true;
    state.gameOver = true;
    state.phase = "end";
    persist(state);
    return true;
  }
  recordScoreChanges(state, scores);
  state.scoreLog = logs.length ? logs : ["No road, city, or monastery scored this turn."];
  state.current = (state.current + 1) % state.players.length;
  state.phase = "handoff";
  persist(state);
  return true;
}

function confirmPending(state, preserveUndo) {
  if (state.phase !== "place" || !state.pending || !state.currentTile) return false;
  const x = state.pending.x;
  const y = state.pending.y;
  const tile = state.currentTile;
  if (legalRotationsAt(state, tile.typeId, x, y).indexOf(tile.rot) < 0) return false;
  const selected = state.selectedMeeple;
  if (selected && !pendingMeepleOptions(state).some(function (option) {
    return option.kind === selected.kind && option.index === selected.index;
  })) return false;
  if (!lockPending(state)) return false;
  if (selected) {
    if (!placeMeeple(state, selected.kind, selected.index)) return false;
  } else {
    chooseNoMeeple(state);
  }
  return confirmTurn(state, preserveUndo !== false);
}
