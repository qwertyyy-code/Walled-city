/*
 * bot.js — Replaceable computer move selection.
 */

let botRandom = Math.random;

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

function chooseMove(game, playerIndex) {
  const tile = game.currentTile;
  const player = game.players[playerIndex];
  if (!tile || !player) return null;

  const candidates = [];
  neighborKeys(game).forEach(function (cell) {
    legalRotationsAt(game, tile.typeId, cell.x, cell.y).forEach(function (rotation) {
      candidates.push({ x: cell.x, y: cell.y, rotation: rotation });
    });
  });
  if (!candidates.length) return null;

  const move = candidates[Math.floor(botRandom() * candidates.length)];
  let meepleSpot = null;
  if (player.meeples > 0 && botRandom() < 1 / 3) {
    const pendingState = Object.assign({}, game, {
      phase: "place",
      current: playerIndex,
      currentTile: Object.assign({}, tile, { rot: move.rotation }),
      pending: { x: move.x, y: move.y },
      selectedMeeple: null
    });
    const spots = pendingMeepleOptions(pendingState);
    if (spots.length) {
      const spot = spots[Math.floor(botRandom() * spots.length)];
      meepleSpot = { kind: spot.kind, index: spot.index };
    }
  }

  return {
    x: move.x,
    y: move.y,
    rotation: move.rotation,
    meepleSpot: meepleSpot
  };
}
