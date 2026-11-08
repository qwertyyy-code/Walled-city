importScripts("./tiles.js?v=40", "./game.js?v=40", "./bot.js?v=40");

function countBoardMeeples(state, playerIndex) {
  return Object.keys(state.board).reduce(function (total, key) {
    const placed = state.board[key].meeple;
    return total + (placed && placed.player === playerIndex ? 1 : 0);
  }, 0);
}

function playGame(seed, riverEnabled, settingsByPlayer) {
  const random = createSeededRandom(seed);
  setBotRandom(random);
  const players = PLAYER_COLORS.slice(0, settingsByPlayer.length).map(function (color) {
    return { name: color.name, color: color.hex, computer: true };
  });
  const state = newGame(players, undefined, riverEnabled, random, true);
  Object.defineProperty(state, "_botSimulation", { value: true });
  const startingMeeples = state.players.map(function (player) { return player.meeples; });
  const moveTimes = state.players.map(function () {
    return { totalMs: 0, count: 0, slowestMs: 0 };
  });
  let turns = 0;
  let noMeepleTurns = 0;
  while (!state.gameOver && turns < 200) {
    beginTurn(state);
    if (state.gameOver) break;
    const current = state.current;
    const scores = state.players.map(function (player) { return player.score; });
    const moveStarted = performance.now();
    const move = chooseMove(state, current, "smart", settingsByPlayer[current]);
    const moveElapsed = performance.now() - moveStarted;
    moveTimes[current].totalMs += moveElapsed;
    moveTimes[current].count += 1;
    moveTimes[current].slowestMs = Math.max(moveTimes[current].slowestMs, moveElapsed);
    if (!move) throw new Error("No legal move on turn " + turns);
    const rotations = (move.rotation - state.currentTile.rot + 4) % 4;
    for (let i = 0; i < rotations; i++) {
      if (!rotateCurrent(state, 1)) throw new Error("A move rotation was rejected.");
    }
    if (!selectPending(state, move.x, move.y)) {
      throw new Error("A legal tile placement was rejected on turn " + turns);
    }
    if (move.action && !selectPendingMeeple(
      state,
      move.action.spot.kind,
      move.action.spot.index
    )) {
      throw new Error("A legal meeple placement was rejected on turn " + turns);
    }
    if (!move.action) noMeepleTurns += 1;
    if (!confirmPending(state, false)) throw new Error("Turn " + turns + " was rejected.");
    state.players.forEach(function (player, index) {
      if (player.meeples + countBoardMeeples(state, index) !== startingMeeples[index]) {
        throw new Error("Meeple total changed for seat " + index + " on turn " + turns);
      }
      if (player.score < scores[index]) {
        throw new Error("Score decreased for seat " + index + " on turn " + turns);
      }
    });
    turns += 1;
  }
  if (!state.gameOver) throw new Error("Game did not finish within 200 turns.");
  if (validateBoard(state).length) throw new Error("Finished board is invalid.");

  return {
    scores: state.players.map(function (player) { return player.score; }),
    meeplesInSupply: state.players.map(function (player) { return player.meeples; }),
    moveTimes: moveTimes,
    turns: turns,
    noMeepleTurns: noMeepleTurns,
    completedCities: allFeatures(state).filter(function (feature) {
      return feature.kind === "city" && featureComplete(state, feature);
    }).length,
    farmers: state.players.map(function (_, index) {
      return Object.keys(state.board).reduce(function (total, key) {
        const placed = state.board[key].meeple;
        return total + (placed && placed.player === index && placed.kind === "field" ? 1 : 0);
      }, 0);
    })
  };
}

self.onmessage = function (event) {
  const request = event.data;
  try {
    self.postMessage({
      index: request.index,
      result: playGame(request.seed, request.riverEnabled, request.settingsByPlayer)
    });
  } catch (error) {
    self.postMessage({
      index: request.index,
      error: error && error.message ? error.message : String(error)
    });
  }
};
