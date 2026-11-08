/*
 * app.js — Screens, touch pan/zoom, buttons, and wiring to the game.
 */

const ui = {
  start: document.getElementById("start-screen"),
  handoff: document.getElementById("handoff-screen"),
  play: document.getElementById("play-screen"),
  end: document.getElementById("end-screen"),
  fields: document.getElementById("player-fields"),
  pCount: document.getElementById("p-count"),
  humanCountRow: document.getElementById("human-count-row"),
  computerMode: document.getElementById("computer-mode-toggle"),
  computerOpponents: document.getElementById("computer-opponents"),
  opponentButtons: document.getElementById("computer-opponent-buttons"),
  newGame: document.getElementById("btn-new"),
  newGameDialog: document.getElementById("new-game-dialog"),
  newGameCancel: document.getElementById("btn-new-cancel"),
  newGameStart: document.getElementById("btn-new-start"),
  river: document.getElementById("river-option"),
  riverScoringRule: document.getElementById("river-scoring-rule"),
  resume: document.getElementById("btn-resume"),
  board: document.getElementById("board"),
  preview: document.getElementById("preview"),
  hint: document.getElementById("hint"),
  turn: document.getElementById("turn-label"),
  left: document.getElementById("tiles-left"),
  meeples: document.getElementById("meeple-row"),
  rotate: document.getElementById("btn-rotate"),
  undo: document.getElementById("btn-undo"),
  handoffUndo: document.getElementById("btn-handoff-undo"),
  endUndo: document.getElementById("btn-end-undo"),
  confirm: document.getElementById("btn-confirm"),
  backResults: document.getElementById("btn-back-results"),
  home: document.getElementById("btn-home"),
  homeHandoff: document.getElementById("btn-home-handoff"),
  homeEnd: document.getElementById("btn-home-end"),
  viewBoard: document.getElementById("btn-view-board"),
  handoffTitle: document.getElementById("handoff-title"),
  handoffDot: document.getElementById("handoff-dot"),
  handoffScoreboard: document.getElementById("handoff-scoreboard"),
  handoffLog: document.getElementById("handoff-log"),
  playScoreboard: document.getElementById("play-scoreboard"),
  endScoreboard: document.getElementById("end-scoreboard"),
  endLog: document.getElementById("end-log"),
  endSummary: document.getElementById("end-summary"),
  updateNotice: document.getElementById("update-notice")
};

if ("serviceWorker" in navigator) {
  let waitingWorker = null;
  let reloadAfterUpdate = false;
  let registrationForUpdates = null;
  let lastUpdateCheck = 0;

  function checkForServiceWorkerUpdate() {
    if (!registrationForUpdates || !navigator.onLine) return Promise.resolve();
    lastUpdateCheck = Date.now();
    return registrationForUpdates.update().catch(function (error) {
      console.error("Service worker update check failed:", error);
    });
  }

  function offerUpdate(worker) {
    if (!worker || !navigator.serviceWorker.controller) return;
    waitingWorker = worker;
    ui.updateNotice.hidden = false;
  }

  ui.updateNotice.addEventListener("click", function () {
    if (!waitingWorker) return;
    cancelComputerTurn();
    if (state && !watch && !autoplay) saveForHome(state);
    reloadAfterUpdate = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloadAfterUpdate) window.location.reload();
  });

  navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(function (registration) {
    registrationForUpdates = registration;
    offerUpdate(registration.waiting);
    registration.addEventListener("updatefound", function () {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", function () {
        if (installing.state === "installed") offerUpdate(installing);
      });
    });
    return checkForServiceWorkerUpdate();
  }).catch(function (error) {
    console.error("Service worker registration failed:", error);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    if (Date.now() - lastUpdateCheck < 60000) return;
    checkForServiceWorkerUpdate();
  });
}

const RIVER_CHOICE_KEY = "walled-city-river-choice";
ui.river.checked = localStorage.getItem(RIVER_CHOICE_KEY) === "true";
ui.riverScoringRule.hidden = !ui.river.checked;
ui.river.addEventListener("change", function () {
  localStorage.setItem(RIVER_CHOICE_KEY, String(ui.river.checked));
  ui.riverScoringRule.hidden = !ui.river.checked;
});

document.getElementById("small-city-tile-limit").textContent = String(SMALL_CITY_MAX_TILES);
document.getElementById("small-city-points").textContent =
  String(SMALL_CITY_MAX_TILES * SMALL_CITY_POINTS_PER_TILE);
document.getElementById("farmer-points").textContent = String(FARM_POINTS_PER_CITY);
document.getElementById("farmer-tied-points").textContent = String(FARM_POINTS_PER_CITY);

const SETUP_PREFERENCE_KEY = "walled-city-setup-preference";
let playerCount = 2;
let names = ["", "", "", "", ""];
let computerMode = false;
let computerOpponentCount = 1;
const setupPreference = localStorage.getItem(SETUP_PREFERENCE_KEY);
if (setupPreference) {
  try {
    const preference = JSON.parse(setupPreference);
    computerMode = !!preference.computerMode;
    computerOpponentCount = Math.min(
      PLAYER_COLORS.length - 1,
      Math.max(1, Math.floor(Number(preference.computerOpponentCount) || 1))
    );
  } catch (error) {
    console.warn("Could not read setup preference:", error);
  }
}
let state = null;
const query = new URLSearchParams(window.location.search);
const shortGameTileLimit = query.get("tiles") === "10"
  ? 10
  : undefined;
const debugFields = query.get("debug") === "fields";
const autoplay = query.get("autoplay") === "1";
const watch = query.get("watch") === "1";
const requestedWatchPlayers = Number(query.get("players"));
const watchPlayerCount = Number.isInteger(requestedWatchPlayers) &&
  requestedWatchPlayers >= 2 && requestedWatchPlayers <= PLAYER_COLORS.length
  ? requestedWatchPlayers
  : 2;
const riverQuery = query.get("river");
if (riverQuery === "1" || riverQuery === "0") ui.river.checked = riverQuery === "1";
const gameSeed = query.get("seed");
const botMode = query.get("bot");
const botModes = (query.get("bots") || "").split(",");
let gameRandom = Math.random;
const cam = { x: 0, y: 0, scale: 1, tile: 96 };
const pointers = new Map();
let pinch = null;
let hover = null;
let legal = [];
let didPan = false;
let computerTimer = null;
let computerWaiting = false;
let computerActive = false;
const GAME_HISTORY_KEY = "walledCityGame";

if (gameSeed !== null) {
  gameRandom = createSeededRandom(gameSeed);
  setBotRandom(gameRandom);
}

function isComputerPlayer(index) {
  return !!(state && state.players[index] &&
    (autoplay || watch || state.players[index].computer));
}

function chooserForPlayer(index) {
  if (botMode === "random" || botMode === "smart") return botMode;
  let seat = 0;
  for (let i = 0; i < index; i++) {
    if (isComputerPlayer(i)) seat++;
  }
  return botModes[seat] === "random" ? "random" : "smart";
}

function resetGameRandom() {
  gameRandom = gameSeed === null ? Math.random : createSeededRandom(gameSeed);
  setBotRandom(gameRandom);
}

function show(screen) {
  [ui.start, ui.handoff, ui.play, ui.end].forEach(function (el) {
    el.classList.toggle("active", el === screen);
  });
}

function renderSetup() {
  ui.pCount.textContent = String(playerCount);
  ui.fields.innerHTML = "";
  ui.humanCountRow.hidden = computerMode;
  ui.computerOpponents.hidden = !computerMode;
  ui.computerMode.checked = computerMode;
  const visiblePlayers = computerMode ? 1 : playerCount;
  for (let i = 0; i < visiblePlayers; i++) {
    const row = document.createElement("div");
    row.className = "player-row";
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = PLAYER_COLORS[i].hex;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.maxLength = 16;
    inp.placeholder = PLAYER_COLORS[i].name + " player";
    inp.value = names[i];
    inp.addEventListener("input", function () {
      names[i] = inp.value;
    });
    row.appendChild(sw);
    row.appendChild(inp);
    ui.fields.appendChild(row);
  }
  ui.opponentButtons.innerHTML = "";
  for (let count = 1; count < PLAYER_COLORS.length; count++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "opponent-count" +
      (count === computerOpponentCount ? " selected" : "");
    button.textContent = String(count);
    button.setAttribute("aria-pressed", String(count === computerOpponentCount));
    button.setAttribute("aria-label", count + " computer opponents");
    button.addEventListener("click", function () {
      computerOpponentCount = count;
      saveSetupPreference();
      renderSetup();
    });
    ui.opponentButtons.appendChild(button);
  }
  ui.resume.disabled = !loadSave();
}

function saveSetupPreference() {
  localStorage.setItem(SETUP_PREFERENCE_KEY, JSON.stringify({
    computerMode: computerMode,
    computerOpponentCount: computerOpponentCount
  }));
}

ui.computerMode.addEventListener("change", function () {
  computerMode = ui.computerMode.checked;
  saveSetupPreference();
  renderSetup();
});

document.getElementById("p-minus").onclick = function () {
  playerCount = Math.max(2, playerCount - 1);
  renderSetup();
};
document.getElementById("p-plus").onclick = function () {
  playerCount = Math.min(5, playerCount + 1);
  renderSetup();
};

function makePlayerSetup() {
  if (watch) return buildPlayerSetup(false, watchPlayerCount, 1, [], true);
  return buildPlayerSetup(
    computerMode,
    playerCount,
    computerOpponentCount,
    names,
    autoplay
  );
}

function startConfiguredGame(replaceSavedGame) {
  resetGameRandom();
  state = createNewGameIfConfirmed(
    makePlayerSetup(),
    shortGameTileLimit,
    ui.river.checked,
    gameRandom,
    replaceSavedGame,
    watch || autoplay
  );
  if (!state) return;
  pushGameHistory();
  if (isComputerPlayer(state.current)) startComputerTurn(false);
  else if (shouldShowHandoff(state)) goHandoff();
  else startHumanTurn();
}

ui.newGame.onclick = function () {
  if (!autoplay && !watch && loadSave()) {
    ui.newGameDialog.showModal();
    return;
  }
  startConfiguredGame(autoplay);
};

ui.newGameCancel.onclick = function () {
  ui.newGameDialog.close();
};

ui.newGameStart.onclick = function () {
  ui.newGameDialog.close();
  startConfiguredGame(true);
};

ui.resume.onclick = function () {
  state = loadSave();
  if (!state) return;
  if (state.gameOver || state.phase === "end") {
    if (!state.finalScored) {
      finishGame(state);
    } else {
      state.gameOver = true;
      state.phase = "end";
      state.currentTile = null;
    }
    persist(state);
    goEnd();
  }
  else if (isComputerPlayer(state.current) && state.phase === "handoff") {
    startComputerTurn(false);
  }
  else if (state.phase === "handoff" && shouldShowHandoff(state)) goHandoff();
  else if (state.phase === "handoff") startHumanTurn();
  else if (isComputerPlayer(state.current)) startComputerTurn(true);
  else goPlay();
  pushGameHistory();
  updateTurnUndoButtons();
};

function pushGameHistory() {
  if (history.state && history.state[GAME_HISTORY_KEY]) return;
  history.pushState({
    [GAME_HISTORY_KEY]: true,
    previousState: history.state
  }, "", window.location.href);
}

function cancelComputerTurn() {
  if (computerTimer !== null) {
    window.clearTimeout(computerTimer);
    computerTimer = null;
  }
  computerWaiting = false;
  computerActive = false;
}

function showHome(fromBackNavigation) {
  cancelComputerTurn();
  if (state && !watch && !autoplay) saveForHome(state);
  show(ui.start);
  renderSetup();
  if (!fromBackNavigation && history.state && history.state[GAME_HISTORY_KEY]) {
    history.back();
  }
}

ui.home.onclick = function () {
  showHome(false);
};

ui.homeHandoff.onclick = function (event) {
  event.stopPropagation();
  showHome(false);
};

ui.homeEnd.onclick = function () {
  showHome(false);
};

window.addEventListener("popstate", function () {
  if (!state || ui.start.classList.contains("active")) return;
  showHome(true);
});

ui.viewBoard.onclick = function () {
  if (!state || !state.gameOver) return;
  goPlay(true);
};

ui.backResults.onclick = function () {
  if (!state || !state.gameOver) return;
  goEnd();
};

document.getElementById("handoff-tap").onclick = function () {
  if (!state || state.phase !== "handoff") return;
  startHumanTurn();
};

function startHumanTurn() {
  if (!state) return;
  beginTurn(state);
  if (state.gameOver) goEnd();
  else goPlay();
}

function continueAfterTurn(previousWasComputer) {
  if (!state || state.gameOver) {
    goEnd();
    return;
  }
  if (isComputerPlayer(state.current)) {
    if (autoplay || previousWasComputer) {
      startComputerTurn(false);
      return;
    }
    computerWaiting = true;
    goPlay();
    ui.hint.textContent = state.players[state.current].name + " will play shortly. Undo to take back your turn.";
    computerTimer = window.setTimeout(function () {
      computerTimer = null;
      startComputerTurn(false);
    }, 1500);
    return;
  }
  if (shouldShowHandoff(state)) goHandoff();
  else startHumanTurn();
}

function startComputerTurn(resumeExisting) {
  if (!state || state.gameOver) return;
  if (computerTimer !== null) {
    window.clearTimeout(computerTimer);
    computerTimer = null;
  }
  computerWaiting = false;
  computerActive = true;
  state.undo = null;
  if (!resumeExisting || state.phase !== "place") beginTurn(state);
  if (state.gameOver) {
    computerActive = false;
    goEnd();
    return;
  }
  goPlay();
  const playerIndex = state.current;
  const player = state.players[playerIndex];
  const thinkingStarted = performance.now();
  const move = chooseMove(state, playerIndex, chooserForPlayer(playerIndex));
  if (!move) {
    computerActive = false;
    console.error("Computer could not find a legal move for a placeable tile.");
    ui.hint.textContent = "Computer could not find a legal move.";
    return;
  }
  const rotationSteps = (move.rotation - state.currentTile.rot + 4) % 4;
  for (let i = 0; i < rotationSteps; i++) rotateCurrent(state, 1);
  if (!selectPending(state, move.x, move.y) ||
      (move.action && !selectPendingMeeple(
        state,
        move.action.spot.kind,
        move.action.spot.index
      ))) {
    computerActive = false;
    console.error("Computer move was rejected by the normal turn functions:", move);
    ui.hint.textContent = "Computer move could not be applied.";
    return;
  }
  refreshPlay();
  ui.turn.textContent = player.name + " is playing...";
  if (autoplay && !watch) {
    finishComputerTurn();
  } else {
    computerTimer = window.setTimeout(
      finishComputerTurn,
      Math.max(0, 1000 - (performance.now() - thinkingStarted))
    );
  }
}

function finishComputerTurn() {
  computerTimer = null;
  if (!computerActive || !state) return;
  if (!confirmPending(state, false)) {
    computerActive = false;
    console.error("Computer move failed the standard confirmation check.");
    ui.hint.textContent = "Computer move could not be confirmed.";
    return;
  }
  computerActive = false;
  if (state.gameOver) goEnd();
  else continueAfterTurn(true);
}

function goHandoff() {
  const p = state.players[state.current];
  ui.handoffTitle.textContent = p.name + "'s turn";
  ui.handoffDot.style.background = p.color;
  renderScoreboard(ui.handoffScoreboard, false, state.current);
  updateCurrentPlayerHighlight(ui.playScoreboard, null, false);
  renderLog(ui.handoffLog, state.scoreLog.length ? state.scoreLog : ["Scores update after your first turn."]);
  show(ui.handoff);
  updateTurnUndoButtons();
}

function goEnd() {
  const ranked = state.players.slice().sort(function (a, b) { return b.score - a.score; });
  const winners = ranked.filter(function (player) { return player.score === ranked[0].score; });
  ui.endSummary.textContent = winners.length === 1
    ? winners[0].name + " wins with " + winners[0].score + " points."
    : "Tie: " + winners.map(function (player) { return player.name; }).join(" and ") +
      " finish with " + winners[0].score + " points each.";
  renderScoreboard(ui.endScoreboard, true);
  updateCurrentPlayerHighlight(ui.playScoreboard, null, false);
  updateCurrentPlayerHighlight(ui.handoffScoreboard, null, false);
  renderLog(ui.endLog, state.scoreLog);
  show(ui.end);
  updateTurnUndoButtons();
}

function updateTurnUndoButtons() {
  const canUndoTurn = !!(state && state.undo && (state.phase === "handoff" || state.phase === "end"));
  ui.handoffUndo.hidden = !canUndoTurn || state.phase !== "handoff";
  ui.endUndo.hidden = !canUndoTurn || state.phase !== "end";
}

function goPlay(readOnly) {
  ui.play.classList.toggle("read-only", !!readOnly);
  show(ui.play);
  resizeBoard();
  fitBoard();
  refreshPlay();
}

function resizeBoard() {
  const wrap = ui.board.parentElement;
  const dpr = window.devicePixelRatio || 1;
  ui.board.width = Math.floor(wrap.clientWidth * dpr);
  ui.board.height = Math.floor(wrap.clientHeight * dpr);
  ui.board.style.width = wrap.clientWidth + "px";
  ui.board.style.height = wrap.clientHeight + "px";
}

function fitBoard() {
  if (!state) return;
  const b = boardBounds(state);
  const pad = 2;
  const cellsW = b.maxX - b.minX + 1 + pad * 2;
  const cellsH = b.maxY - b.minY + 1 + pad * 2;
  const dpr = window.devicePixelRatio || 1;
  const vw = ui.board.width / dpr;
  const vh = ui.board.height / dpr;
  const scale = Math.min(vw / (cellsW * cam.tile), vh / (cellsH * cam.tile), 1.35);
  cam.scale = Math.max(0.35, scale) * dpr;
  const cx = (b.minX + b.maxX + 1) / 2 * cam.tile;
  const cy = (b.minY + b.maxY + 1) / 2 * cam.tile;
  cam.x = (vw / 2) * dpr - cx * cam.scale;
  cam.y = (vh / 2) * dpr - cy * cam.scale;
}

function refreshPlay() {
  const readOnly = state.gameOver || state.phase === "end";
  legal = [];
  hover = null;
  if (!readOnly && state.phase === "place" && state.currentTile) {
    legal = legalCells(state, state.currentTile.typeId).filter(function (cell) {
      return !state.pending || cell.x !== state.pending.x || cell.y !== state.pending.y;
    });
  }
  const p = state.players[state.current];
  renderScoreboard(ui.playScoreboard, false, readOnly ? null : state.current, computerActive);
  updateCurrentPlayerHighlight(ui.handoffScoreboard, null, false);
  ui.turn.innerHTML = readOnly
    ? "Finished board"
    : '<span class="dot" style="background:' + p.color + '"></span>' + p.name;
  if (computerActive) ui.turn.textContent = p.name + " is playing...";
  ui.left.textContent = readOnly ? "Game finished" : state.riverOpenEnd
    ? state.riverDeck.length + " river tiles · " + state.deck.length + " normal tiles left"
    : state.deck.length + " tiles left";
  ui.meeples.innerHTML = "";
  state.players.forEach(function (pl, i) {
    const chip = document.createElement("div");
    chip.className = "meeple-chip" + (i === state.current ? " turn" : "");
    chip.innerHTML = '<span class="dot" style="background:' + pl.color + '"></span>' + pl.meeples;
    ui.meeples.appendChild(chip);
  });

  ui.rotate.disabled = readOnly || computerActive || state.phase !== "place";
  ui.undo.disabled = readOnly || computerActive || !state.undo;
  ui.confirm.disabled = readOnly || computerActive || state.phase !== "place" || !state.pending;
  ui.backResults.hidden = !readOnly;

  if (state.phase === "place") {
    ui.hint.textContent = state.pending
      ? state.selectedMeeple
        ? "Meeple selected. Tap it again to remove it, or Confirm to finish."
        : "Tap a meeple spot to select it, anywhere else on the tile to rotate."
      : legal.length
        ? "Tap a highlighted square to place the tile. Choose a meeple spot, then Confirm."
        : state.riverOpenEnd && RIVER_TILE_TYPES[state.currentTile.typeId]
          ? "River tiles must continue the open end."
          : "No legal placement is available for this tile.";
  }

  const pctx = ui.preview.getContext("2d");
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, 144, 144);
  if (state.currentTile) {
    paintTile(pctx, state.currentTile.typeId, state.currentTile.rot, 144, false);
  } else if (state.placed) {
    const t = boardTile(state, state.placed.x, state.placed.y);
    paintTile(pctx, t.typeId, t.rot, 144, false);
  }
  redraw();
}

function renderScoreboard(container, final, currentPlayerIndex, pulsing) {
  container.innerHTML = "";
  const players = state.players.map(function (player, index) {
    return { player: player, index: index };
  });
  if (final) players.sort(function (a, b) {
    return b.player.score - a.player.score || a.index - b.index;
  });
  if (final) {
    container.classList.add("final-scoreboard");
    const header = document.createElement("div");
    header.className = "final-score-header";
    ["Player", "Roads", "Cities", "Monast.", "Farms", "Total"].forEach(function (label) {
      const cell = document.createElement("span");
      cell.textContent = label;
      header.appendChild(cell);
    });
    container.appendChild(header);
  } else {
    container.classList.remove("final-scoreboard");
  }
  players.forEach(function (item) {
    const row = document.createElement("div");
    row.dataset.playerIndex = String(item.index);
    row.style.setProperty("--player-color", item.player.color);
    row.className = "score-row" + (final ? " final-score-row" : "") +
      (final && item.player.score === players[0].player.score ? " winner" : "");
    const dot = document.createElement("span");
    dot.className = "score-dot";
    dot.style.background = item.player.color;
    const name = document.createElement("span");
    name.className = "score-name";
    name.textContent = item.player.name;
    if (final) {
      const identity = document.createElement("span");
      identity.className = "final-player";
      identity.appendChild(dot);
      identity.appendChild(name);
      row.appendChild(identity);
      const points = item.player.endGamePoints || { roads: 0, cities: 0, monasteries: 0, farms: 0 };
      [points.roads, points.cities, points.monasteries, points.farms || 0, item.player.score].forEach(function (value) {
        const score = document.createElement("strong");
        score.textContent = String(value);
        row.appendChild(score);
      });
    } else {
      row.appendChild(dot);
      row.appendChild(name);
      const score = document.createElement("strong");
      score.textContent = String(item.player.score);
      row.appendChild(score);
    }
    container.appendChild(row);
  });
  updateCurrentPlayerHighlight(
    container,
    final ? null : currentPlayerIndex,
    !final && pulsing
  );
}

function renderLog(container, messages) {
  container.innerHTML = "";
  messages.forEach(function (message) {
    const line = document.createElement("p");
    line.textContent = message;
    container.appendChild(line);
  });
}

function redraw() {
  const ctx = ui.board.getContext("2d");
  drawBoard(ctx, state, cam, legal, hover, debugFields);
  if ((state.phase === "place" && state.pending) || (state.phase === "meeple" && state.placed)) {
    drawMeepleSpots(ctx);
  }
}

function canvasPoint(ev) {
  const r = ui.board.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (ev.clientX - r.left) * dpr,
    y: (ev.clientY - r.top) * dpr,
    clientX: ev.clientX,
    clientY: ev.clientY
  };
}

function drawMeepleSpots(ctx) {
  const pending = state.phase === "place" && state.pending;
  const opts = pending ? pendingMeepleOptions(state) : meepleOptions(state);
  const ts = cam.tile;
  const x = pending ? state.pending.x : state.placed.x;
  const y = pending ? state.pending.y : state.placed.y;
  const tile = pending ? state.currentTile : boardTile(state, x, y);
  const spec = rotatedType(tile.typeId, tile.rot);
  ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.x, cam.y);
  opts.forEach(function (o) {
    let feat = { edges: o.edges || [], slots: o.slots || [] };
    if (o.kind === "city") feat = spec.cities[o.index];
    if (o.kind === "road") feat = spec.roads[o.index];
    if (o.kind === "field") feat = spec.fields[o.index];
    if (o.kind === "monastery") feat = { anchor: spec.monasteryAnchor };
    const a = featureAnchor(o.kind, feat);
    const px = x * ts + a.x * ts;
    const py = y * ts + a.y * ts;
    ctx.beginPath();
    ctx.arc(px, py, ts * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.strokeStyle = state.players[state.current].color;
    ctx.lineWidth = 3 / cam.scale;
    ctx.fill();
    ctx.stroke();
  });
  if (pending && state.selectedMeeple) {
    const selected = opts.filter(function (option) {
      return option.kind === state.selectedMeeple.kind &&
        option.index === state.selectedMeeple.index;
    })[0];
    if (selected) {
      let feature = { edges: selected.edges || [], slots: selected.slots || [] };
      if (selected.kind === "city") feature = spec.cities[selected.index];
      if (selected.kind === "road") feature = spec.roads[selected.index];
      if (selected.kind === "field") feature = spec.fields[selected.index];
      if (selected.kind === "monastery") feature = { anchor: spec.monasteryAnchor };
      const anchor = featureAnchor(selected.kind, feature);
      ctx.globalAlpha = 0.55;
      drawMeeple(
        ctx,
        x * ts + anchor.x * ts,
        y * ts + anchor.y * ts,
        ts * 0.22,
        state.players[state.current].color
      );
      ctx.globalAlpha = 1;
    }
  }
}

function hitMeeple(sx, sy) {
  const g = screenToGrid(cam, sx, sy);
  const pending = state.phase === "place" && state.pending;
  const target = pending ? state.pending : state.placed;
  if (!target || g.x !== target.x || g.y !== target.y) return null;
  const ts = cam.tile;
  const tile = pending ? state.currentTile : boardTile(state, g.x, g.y);
  const spec = rotatedType(tile.typeId, tile.rot);
  const wx = (sx - cam.x) / cam.scale;
  const wy = (sy - cam.y) / cam.scale;
  return meepleSpotAt(
    pending ? pendingMeepleOptions(state) : meepleOptions(state),
    spec,
    wx - g.x * ts,
    wy - g.y * ts,
    ts
  );
}

ui.rotate.onclick = function () {
  if (!state || state.gameOver || computerActive || computerWaiting) return;
  const rotated = rotateCurrent(state, 1);
  refreshPlay();
  if (!rotated && state.pending) ui.hint.textContent = "Only one way fits here";
};
ui.undo.onclick = function () {
  if (!state || state.gameOver || computerActive) return;
  if (computerWaiting) {
    if (computerTimer !== null) window.clearTimeout(computerTimer);
    computerTimer = null;
    computerWaiting = false;
  }
  if (!undoLast(state)) return;
  refreshPlay();
};
ui.confirm.onclick = function () {
  if (!state || state.gameOver || computerActive || computerWaiting) return;
  if (confirmPending(state, !isComputerPlayer(state.current))) {
    if (state.gameOver) goEnd();
    else continueAfterTurn(false);
  } else {
    ui.hint.textContent = "Placement or meeple is no longer legal. Adjust your choice and try again.";
  }
};

function undoFinishedTurn(ev) {
  ev.stopPropagation();
  if (!state || !undoLast(state)) return;
  goPlay();
}

ui.handoffUndo.onclick = undoFinishedTurn;
ui.endUndo.onclick = undoFinishedTurn;

document.getElementById("zoom-in").onclick = function () { zoomAt(1.2); };
document.getElementById("zoom-out").onclick = function () { zoomAt(1 / 1.2); };
document.getElementById("zoom-fit").onclick = function () { fitBoard(); redraw(); };

function zoomAt(factor, cx, cy) {
  const dpr = window.devicePixelRatio || 1;
  const px = cx != null ? cx : ui.board.width / 2;
  const py = cy != null ? cy : ui.board.height / 2;
  const next = Math.min(3.2 * dpr, Math.max(0.28 * dpr, cam.scale * factor));
  const wx = (px - cam.x) / cam.scale;
  const wy = (py - cam.y) / cam.scale;
  cam.scale = next;
  cam.x = px - wx * cam.scale;
  cam.y = py - wy * cam.scale;
  redraw();
}

ui.board.addEventListener("pointerdown", function (ev) {
  ui.board.setPointerCapture(ev.pointerId);
  const p = canvasPoint(ev);
  p.sx = p.x;
  p.sy = p.y;
  pointers.set(ev.pointerId, p);
  if (pointers.size === 1) didPan = false;
  if (pointers.size === 2) {
    const arr = Array.from(pointers.values());
    pinch = {
      dist: Math.hypot(arr[0].clientX - arr[1].clientX, arr[0].clientY - arr[1].clientY),
      scale: cam.scale
    };
    didPan = true;
  }
});

ui.board.addEventListener("pointermove", function (ev) {
  if (!pointers.has(ev.pointerId)) return;
  const p = canvasPoint(ev);
  const prev = pointers.get(ev.pointerId);
  p.sx = prev.sx;
  p.sy = prev.sy;
  pointers.set(ev.pointerId, p);
  if (pointers.size === 1 && !pinch) {
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (Math.abs(p.x - p.sx) + Math.abs(p.y - p.sy) > 12) didPan = true;
    if (didPan) {
      cam.x += dx;
      cam.y += dy;
    }
    const g = screenToGrid(cam, p.x, p.y);
    hover = legal.some(function (c) { return c.x === g.x && c.y === g.y; }) ? g : null;
    redraw();
  } else if (pointers.size >= 2 && pinch && pinch.dist > 10) {
    const arr = Array.from(pointers.values());
    const dist = Math.hypot(arr[0].clientX - arr[1].clientX, arr[0].clientY - arr[1].clientY);
    const midX = (arr[0].x + arr[1].x) / 2;
    const midY = (arr[0].y + arr[1].y) / 2;
    zoomAt(dist / pinch.dist, midX, midY);
    pinch.dist = dist;
    pinch.scale = cam.scale;
  }
});

function endPointer(ev) {
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
}

ui.board.addEventListener("pointerup", function (ev) {
  const p = canvasPoint(ev);
  const moved = pointers.get(ev.pointerId);
  const travel = moved ? Math.abs(p.x - moved.sx) + Math.abs(p.y - moved.sy) : 0;
  const wasPan = didPan || pointers.size > 1;
  endPointer(ev);
  if (wasPan || travel > 14 * (window.devicePixelRatio || 1)) return;
  onTap(p.x, p.y);
});
ui.board.addEventListener("pointercancel", endPointer);

function onTap(sx, sy) {
  if (!state || state.gameOver || computerActive || computerWaiting) return;
  if (state.phase === "place") {
    const g = screenToGrid(cam, sx, sy);
    if (state.pending) {
      if (g.x === state.pending.x && g.y === state.pending.y) {
        const hit = hitMeeple(sx, sy);
        if (hit) {
          selectPendingMeeple(state, hit.kind, hit.index);
          refreshPlay();
        } else if (!rotatePending(state)) {
          ui.hint.textContent = "Only one way fits here";
          redraw();
        } else {
          refreshPlay();
        }
        return;
      }
    }
    const highlighted = legal.some(function (cell) {
      return cell.x === g.x && cell.y === g.y;
    });
    const placed = state.pending
      ? highlighted && movePending(state, g.x, g.y)
      : highlighted && selectPending(state, g.x, g.y);
    if (placed) refreshPlay();
    return;
  }
  if (state.phase === "meeple") {
    const hit = hitMeeple(sx, sy);
    if (hit) {
      placeMeeple(state, hit.kind, hit.index);
      refreshPlay();
    }
  }
}

window.addEventListener("resize", function () {
  if (ui.play.classList.contains("active")) {
    resizeBoard();
    redraw();
  }
});

renderSetup();
if (autoplay || watch) document.getElementById("btn-new").click();
