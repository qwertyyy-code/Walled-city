/*
 * bot.js — Replaceable computer move selection.
 */

const COMPLETION_CHANCE = {
  oneOpenSide: 0.75,
  twoOpenSides: 0.5,
  threeOrMoreOpenSides: 0.3
};
const MONASTERY_COMPLETION_CHANCE = {
  oneEmptyNeighbor: 0.9,
  perAdditionalEmptyNeighbor: 0.12,
  floor: 0.3
};
const COMPLETION_TILE_WINDOW = 15;
const FARMER_WEIGHT = { early: 0.3, late: 1.0 };
const FARMER_WEIGHT_TRANSITION_PROGRESS = 0.5;
const MEEPLE_VALUE = 3;
const MEEPLE_ACTION_SHORTLIST_SIZE = 8;

let botRandom = Math.random;

function effectiveBotSettings(settings) {
  const overrides = settings || {};
  const farmerWeightOverride = overrides.FARMER_WEIGHT || {};
  return {
    COMPLETION_CHANCE: Object.assign({}, COMPLETION_CHANCE, overrides.COMPLETION_CHANCE),
    MONASTERY_COMPLETION_CHANCE: Object.assign(
      {},
      MONASTERY_COMPLETION_CHANCE,
      overrides.MONASTERY_COMPLETION_CHANCE
    ),
    COMPLETION_TILE_WINDOW: overrides.COMPLETION_TILE_WINDOW === undefined
      ? COMPLETION_TILE_WINDOW
      : overrides.COMPLETION_TILE_WINDOW,
    FARMER_WEIGHT_START: overrides.FARMER_WEIGHT_START === undefined
      ? (farmerWeightOverride.early === undefined ? FARMER_WEIGHT.early : farmerWeightOverride.early)
      : overrides.FARMER_WEIGHT_START,
    FARMER_WEIGHT_END: overrides.FARMER_WEIGHT_END === undefined
      ? (farmerWeightOverride.late === undefined ? FARMER_WEIGHT.late : farmerWeightOverride.late)
      : overrides.FARMER_WEIGHT_END,
    FARMER_WEIGHT_TRANSITION_PROGRESS: overrides.FARMER_WEIGHT_TRANSITION_PROGRESS === undefined
      ? FARMER_WEIGHT_TRANSITION_PROGRESS
      : overrides.FARMER_WEIGHT_TRANSITION_PROGRESS,
    MEEPLE_VALUE: overrides.MEEPLE_VALUE === undefined ? MEEPLE_VALUE : overrides.MEEPLE_VALUE,
    MEEPLE_ACTION_SHORTLIST_SIZE: overrides.MEEPLE_ACTION_SHORTLIST_SIZE === undefined
      ? MEEPLE_ACTION_SHORTLIST_SIZE
      : overrides.MEEPLE_ACTION_SHORTLIST_SIZE
  };
}

function createSeededRandom(seed) {
  let value = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    value = (Math.imul(value, 31) + text.charCodeAt(i)) | 0;
  }
  return function () {
    value = (value + 0x6D2B79F5) | 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function setBotRandom(random) {
  botRandom = random || Math.random;
}

function generateMoveCandidates(game, playerIndex, placementFilter, includeMeeple) {
  const tile = game.currentTile;
  const player = game.players[playerIndex];
  if (!tile || !player) return [];
  const allowedPlacements = placementFilter
    ? placementFilter.reduce(function (set, move) {
      set[move.x + "," + move.y + ":" + move.rotation] = true;
      return set;
    }, {})
    : null;

  const candidates = [];
  neighborKeys(game).forEach(function (cell) {
    legalRotationsAt(game, tile.typeId, cell.x, cell.y).forEach(function (rotation) {
      if (allowedPlacements && !allowedPlacements[cell.x + "," + cell.y + ":" + rotation]) return;
      candidates.push({
        x: cell.x,
        y: cell.y,
        rotation: rotation,
        action: null
      });

      if (!includeMeeple || player.meeples <= 0) return;
      const pendingState = Object.assign({}, game, {
        phase: "place",
        current: playerIndex,
        currentTile: Object.assign({}, tile, { rot: rotation }),
        pending: { x: cell.x, y: cell.y },
        selectedMeeple: null
      });
      pendingMeepleOptions(pendingState).forEach(function (spot) {
        candidates.push({
          x: cell.x,
          y: cell.y,
          rotation: rotation,
          action: {
            type: "meeple",
            spot: { kind: spot.kind, index: spot.index }
          }
        });
      });
    });
  });
  return candidates;
}

function chooseRandomMove(game, playerIndex) {
  const player = game.players[playerIndex];
  const placements = generateMoveCandidates(game, playerIndex, null, false);
  if (!player || !placements.length) return null;

  const move = placements[Math.floor(botRandom() * placements.length)];
  let action = null;
  if (player.meeples > 0 && botRandom() < 1 / 3) {
    const spots = generateMoveCandidates(game, playerIndex, [move], true)
      .filter(function (candidate) { return candidate.action !== null; });
    if (spots.length) action = spots[Math.floor(botRandom() * spots.length)].action;
  }
  return {
    x: move.x,
    y: move.y,
    rotation: move.rotation,
    action: action
  };
}

function openFeatureSides(game, feature) {
  let open = 0;
  feature.nodes.forEach(function (node) {
    const spec = rotatedType(node.tile.typeId, node.tile.rot);
    const groups = feature.kind === "city" ? spec.cities : spec.roads;
    groups[node.index].edges.forEach(function (edge) {
      const neighbor = boardTile(
        game,
        node.x + DIR_DELTA[edge].x,
        node.y + DIR_DELTA[edge].y
      );
      if (!neighbor) {
        open += 1;
        return;
      }
      const neighborSpec = rotatedType(neighbor.typeId, neighbor.rot);
      const findIndex = feature.kind === "city" ? cityIndexOnEdge : roadIndexOnEdge;
      if (findIndex(neighborSpec, OPPOSITE[edge]) < 0) open += 1;
    });
  });
  return open;
}

function monasteryEmptyNeighbors(game, feature) {
  const node = feature.nodes[0];
  let empty = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && !boardTile(game, node.x + dx, node.y + dy)) empty += 1;
    }
  }
  return empty;
}

function completionChance(game, feature, tilesLeft, settings) {
  const tileFactor = Math.min(1, tilesLeft / settings.COMPLETION_TILE_WINDOW);
  if (feature.kind === "monastery") {
    const empty = monasteryEmptyNeighbors(game, feature);
    const chance = Math.max(
      settings.MONASTERY_COMPLETION_CHANCE.floor,
      settings.MONASTERY_COMPLETION_CHANCE.oneEmptyNeighbor -
        (empty - 1) * settings.MONASTERY_COMPLETION_CHANCE.perAdditionalEmptyNeighbor
    );
    return chance * tileFactor;
  }

  const open = openFeatureSides(game, feature);
  const chance = open === 1
    ? settings.COMPLETION_CHANCE.oneOpenSide
    : open === 2
      ? settings.COMPLETION_CHANCE.twoOpenSides
      : settings.COMPLETION_CHANCE.threeOrMoreOpenSides;
  return chance * tileFactor;
}

function countTilesAtStart(game) {
  const placed = Object.keys(game.board).filter(function (key) {
    return !game.board[key].start;
  }).length;
  return game.deck.length + game.riverDeck.length + game.discarded.length +
    placed + (game.currentTile ? 1 : 0);
}

function farmerWeight(tilesLeft, tilesAtStart, settings) {
  const progress = tilesAtStart > 0
    ? Math.max(0, Math.min(1, 1 - tilesLeft / tilesAtStart))
    : 1;
  if (progress <= settings.FARMER_WEIGHT_TRANSITION_PROGRESS) return settings.FARMER_WEIGHT_START;
  const lateProgress = (progress - settings.FARMER_WEIGHT_TRANSITION_PROGRESS) /
    (1 - settings.FARMER_WEIGHT_TRANSITION_PROGRESS);
  return settings.FARMER_WEIGHT_START +
    (settings.FARMER_WEIGHT_END - settings.FARMER_WEIGHT_START) * lateProgress;
}

function simulatedTurn(game, playerIndex, move) {
  const copy = clone(game);
  Object.defineProperty(copy, "_botSimulation", { value: true });

  const rotationSteps = (move.rotation - copy.currentTile.rot + 4) % 4;
  for (let i = 0; i < rotationSteps; i++) {
    if (!rotateCurrent(copy, 1)) {
      throw new Error("Bot candidate rotation was rejected.");
    }
  }
  if (!selectPending(copy, move.x, move.y)) {
    throw new Error("Bot candidate placement was rejected.");
  }
  if (move.action && (
    move.action.type !== "meeple" ||
    !selectPendingMeeple(
      copy,
      move.action.spot.kind,
      move.action.spot.index
    )
  )) {
    throw new Error("Bot candidate action was rejected.");
  }
  if (!confirmPending(copy, false)) {
    throw new Error("Bot candidate confirmation was rejected.");
  }
  return copy;
}

function playerValues(game, tilesLeft, tilesAtStart, settings) {
  const originalScores = game.players.map(function (player) { return player.score; });
  if (!game.finalScored) scoreFarms(game);
  const weight = farmerWeight(tilesLeft, tilesAtStart, settings);
  const features = allFeatures(game).filter(function (feature) {
    return !featureComplete(game, feature);
  }).map(function (feature) {
    const counts = featureMeeples(game, feature);
    const highest = Math.max.apply(null, counts.concat([0]));
    if (!highest) return null;
    const endValue = featurePoints(game, feature, false);
    const finishedValue = featurePoints(game, feature, true);
    const chance = completionChance(game, feature, tilesLeft, settings);
    return {
      counts: counts,
      highest: highest,
      value: endValue + chance * (finishedValue - endValue)
    };
  }).filter(Boolean);

  return game.players.map(function (player, playerIndex) {
    const farmPoints = player.score - originalScores[playerIndex];
    let value = originalScores[playerIndex] + farmPoints * weight;

    features.forEach(function (feature) {
      if (feature.counts[playerIndex] === feature.highest) {
        value += feature.value;
      }
    });

    value += settings.MEEPLE_VALUE * player.meeples *
      (tilesAtStart > 0 ? tilesLeft / tilesAtStart : 0);
    return value;
  });
}

function scoreMove(game, playerIndex, move, tilesAtStart, settings) {
  const simulated = simulatedTurn(game, playerIndex, move);
  const tilesLeft = simulated.deck.length + simulated.riverDeck.length;
  const values = playerValues(simulated, tilesLeft, tilesAtStart, settings);
  const opponents = values.filter(function (_, index) { return index !== playerIndex; });
  return values[playerIndex] - Math.max.apply(null, opponents.concat([0]));
}

function chooseSmartMove(game, playerIndex, overrides) {
  const candidates = generateMoveCandidates(game, playerIndex, null, false);
  if (!candidates.length) return null;

  const settings = effectiveBotSettings(overrides);
  const tilesAtStart = countTilesAtStart(game);
  const scoredMoves = candidates.map(function (candidate) {
    return {
      move: candidate,
      score: scoreMove(game, playerIndex, candidate, tilesAtStart, settings)
    };
  });
  const bestPlacements = scoredMoves.slice().sort(function (a, b) {
    return b.score - a.score;
  }).slice(0, settings.MEEPLE_ACTION_SHORTLIST_SIZE).map(function (item) {
    return item.move;
  });
  const meepleCandidates = generateMoveCandidates(
    game,
    playerIndex,
    bestPlacements,
    true
  ).filter(function (candidate) { return candidate.action !== null; });
  meepleCandidates.forEach(function (candidate) {
    scoredMoves.push({
      move: candidate,
      score: scoreMove(game, playerIndex, candidate, tilesAtStart, settings)
    });
  });

  let bestScore = -Infinity;
  let bestMoves = [];
  scoredMoves.forEach(function (item) {
    const candidate = item.move;
    const score = item.score;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestMoves = [candidate];
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      bestMoves.push(candidate);
    }
  });
  return bestMoves[Math.floor(botRandom() * bestMoves.length)];
}

function chooseMove(game, playerIndex, chooser, settings) {
  return chooser === "random"
    ? chooseRandomMove(game, playerIndex)
    : chooseSmartMove(game, playerIndex, settings);
}
