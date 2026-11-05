/*
 * tiles.js — Base-game tile catalogue (72 tiles, no river).
 *
 * Each type stores: count, four edges (N,E,S,W), which edges belong to the
 * same city or road, pennant, monastery, and field areas as 8 rim slots.
 * Fields also store the local city areas they touch and an optional meeple spot.
 *
 * Slot numbers, clockwise from the west half of the north edge:
 *   0 = N-west, 1 = N-east, 2 = E-north, 3 = E-south,
 *   4 = S-east, 5 = S-west, 6 = W-south, 7 = W-north.
 * A road splits the two slots on that edge; a city edge has no field slots.
 *
 * Comment table (letter = common fan reference, not an official name):
 *
 *  Letter  Count  Edges N,E,S,W     Notes
 *  A       2      F F R F           monastery + road south
 *  B       4      F F F F           monastery, all field
 *  C       1      C C C C           4-sided city + pennant
 *  D       4      C R F R           city north, straight road (includes START)
 *  E       5      C F F F           city north, rest field
 *  F       2      F C F C           opposite cities joined + pennant
 *  G       1      F C F C           opposite cities joined, no pennant
 *  H       3      C F C F           opposite cities NOT joined
 *  I       2      C C F F           adjacent cities NOT joined
 *  J       3      C R R F           city north, road E–S
 *  K       3      C F R R           city north, road W–S
 *  L       3      C R R R           city north, 3-way road (village)
 *  M       2      C F F C           city N+W joined + pennant
 *  N       3      C F F C           city N+W joined, no pennant
 *  O       2      C R R C           city N+W joined + pennant, road E–S
 *  P       3      C R R C           city N+W joined, road E–S
 *  Q       1      C C F C           3-sided city + pennant, field south
 *  R       3      C C F C           3-sided city, field south
 *  S       2      C C R C           3-sided city + pennant, road south
 *  T       1      C C R C           3-sided city, road south
 *  U       8      R F R F           straight road
 *  V       9      F F R R           curved road
 *  W       4      F R R R           3-way road (village)
 *  X       1      R R R R           4-way crossing (village)
 *  Total  72
 *
 * T-junctions and crossings end each road (they are separate features).
 */

const N = 0, E = 1, S = 2, W = 3;
const CITY = "city", ROAD = "road", FIELD = "field", RIVER = "river";
const RIVER_TILE_TOTAL = 12;
const RIVER_SPRING_ID = "river-spring";
const RIVER_LAKE_ID = "river-lake";
const INCLUDE_NORMAL_START_IN_RIVER_GAME = true;

const SLOT_NEIGHBOR = [5, 4, 7, 6, 1, 0, 3, 2];
const SLOT_DIR = [N, N, E, E, S, S, W, W];
const DIR_DELTA = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];
const OPPOSITE = [S, W, N, E];

function C(edges, pennant, anchor) {
  return {
    edges: edges.slice(),
    pennant: !!pennant,
    anchor: anchor ? { x: anchor.x, y: anchor.y } : null
  };
}
function Rd(edges, start, anchor) {
  return {
    edges: edges.slice(),
    start: start ? { x: start.x, y: start.y } : null,
    anchor: anchor ? { x: anchor.x, y: anchor.y } : null
  };
}
function Fd(slots, anchor, cityAreas) {
  return {
    slots: slots.slice(),
    anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
    cityAreas: (cityAreas || []).slice()
  };
}

const TILE_TYPES = {
  A: {
    id: "A",
    count: 2,
    edges: [FIELD, FIELD, ROAD, FIELD],
    cities: [],
    roads: [Rd([S])],
    monastery: true,
    fields: [Fd([0, 1, 2, 3, 4, 5, 6, 7], { x: 0.25, y: 0.25 }, [])]
  },
  B: {
    id: "B",
    count: 4,
    edges: [FIELD, FIELD, FIELD, FIELD],
    cities: [],
    roads: [],
    monastery: true,
    fields: [Fd([0, 1, 2, 3, 4, 5, 6, 7], { x: 0.25, y: 0.25 }, [])]
  },
  C: {
    id: "C",
    count: 1,
    edges: [CITY, CITY, CITY, CITY],
    cities: [C([N, E, S, W], true)],
    roads: [],
    monastery: false,
    fields: []
  },
  D: {
    id: "D",
    count: 4,
    edges: [CITY, ROAD, FIELD, ROAD],
    cities: [C([N], false)],
    roads: [Rd([E, W])],
    monastery: false,
    fields: [Fd([2, 7], { x: 0.25, y: 0.36 }, [0]), Fd([3, 4, 5, 6], null, [])]
  },
  E: {
    id: "E",
    count: 5,
    edges: [CITY, FIELD, FIELD, FIELD],
    cities: [C([N], false)],
    roads: [],
    monastery: false,
    fields: [Fd([2, 3, 4, 5, 6, 7], null, [0])]
  },
  F: {
    id: "F",
    count: 2,
    edges: [FIELD, CITY, FIELD, CITY],
    cities: [C([E, W], true)],
    roads: [],
    monastery: false,
    fields: [Fd([0, 1], null, [0]), Fd([4, 5], null, [0])]
  },
  G: {
    id: "G",
    count: 1,
    edges: [FIELD, CITY, FIELD, CITY],
    cities: [C([E, W], false)],
    roads: [],
    monastery: false,
    fields: [Fd([0, 1], null, [0]), Fd([4, 5], null, [0])]
  },
  H: {
    id: "H",
    count: 3,
    edges: [CITY, FIELD, CITY, FIELD],
    cities: [C([N], false), C([S], false)],
    roads: [],
    monastery: false,
    fields: [Fd([2, 3, 6, 7], null, [0, 1])]
  },
  I: {
    id: "I",
    count: 2,
    edges: [CITY, CITY, FIELD, FIELD],
    cities: [C([N], false), C([E], false)],
    roads: [],
    monastery: false,
    fields: [Fd([4, 5, 6, 7], null, [0, 1])]
  },
  J: {
    id: "J",
    count: 3,
    edges: [CITY, ROAD, ROAD, FIELD],
    cities: [C([N], false)],
    roads: [Rd([E, S])],
    monastery: false,
    fields: [Fd([3, 4], { x: 0.88, y: 0.88 }, []), Fd([2, 5, 6, 7], { x: 0.25, y: 0.5 }, [0])]
  },
  K: {
    id: "K",
    count: 3,
    edges: [CITY, FIELD, ROAD, ROAD],
    cities: [C([N], false)],
    roads: [Rd([S, W])],
    monastery: false,
    fields: [Fd([5, 6], { x: 0.12, y: 0.88 }, []), Fd([2, 3, 4, 7], { x: 0.75, y: 0.5 }, [0])]
  },
  L: {
    id: "L",
    count: 3,
    edges: [CITY, ROAD, ROAD, ROAD],
    cities: [C([N], false, { x: 0.5, y: 0.14 })],
    roads: [Rd([E]), Rd([S]), Rd([W])],
    monastery: false,
    fields: [Fd([3, 4], { x: 0.88, y: 0.88 }, []), Fd([5, 6], { x: 0.12, y: 0.88 }, []), Fd([2, 7], { x: 0.5, y: 0.37 }, [0])]
  },
  M: {
    id: "M",
    count: 2,
    edges: [CITY, FIELD, FIELD, CITY],
    cities: [C([N, W], true)],
    roads: [],
    monastery: false,
    fields: [Fd([2, 3, 4, 5], null, [0])]
  },
  N: {
    id: "N",
    count: 3,
    edges: [CITY, FIELD, FIELD, CITY],
    cities: [C([N, W], false)],
    roads: [],
    monastery: false,
    fields: [Fd([2, 3, 4, 5], null, [0])]
  },
  O: {
    id: "O",
    count: 2,
    edges: [CITY, ROAD, ROAD, CITY],
    cities: [C([N, W], true)],
    roads: [Rd([E, S])],
    monastery: false,
    fields: [Fd([3, 4], { x: 0.88, y: 0.88 }, []), Fd([2, 5], { x: 0.4, y: 0.88 }, [0])]
  },
  P: {
    id: "P",
    count: 3,
    edges: [CITY, ROAD, ROAD, CITY],
    cities: [C([N, W], false)],
    roads: [Rd([E, S])],
    monastery: false,
    fields: [Fd([3, 4], { x: 0.88, y: 0.88 }, []), Fd([2, 5], { x: 0.4, y: 0.88 }, [0])]
  },
  Q: {
    id: "Q",
    count: 1,
    edges: [CITY, CITY, FIELD, CITY],
    cities: [C([N, E, W], true)],
    roads: [],
    monastery: false,
    fields: [Fd([4, 5], null, [0])]
  },
  R: {
    id: "R",
    count: 3,
    edges: [CITY, CITY, FIELD, CITY],
    cities: [C([N, E, W], false)],
    roads: [],
    monastery: false,
    fields: [Fd([4, 5], null, [0])]
  },
  S: {
    id: "S",
    count: 2,
    edges: [CITY, CITY, ROAD, CITY],
    cities: [C([N, E, W], true)],
    roads: [Rd([S], { x: 0.5, y: 0.42 })],
    monastery: false,
    fields: [Fd([4], { x: 0.75, y: 0.88 }, [0]), Fd([5], { x: 0.25, y: 0.88 }, [0])]
  },
  T: {
    id: "T",
    count: 1,
    edges: [CITY, CITY, ROAD, CITY],
    cities: [C([N, E, W], false)],
    roads: [Rd([S], { x: 0.5, y: 0.42 })],
    monastery: false,
    fields: [Fd([4], { x: 0.75, y: 0.88 }, [0]), Fd([5], { x: 0.25, y: 0.88 }, [0])]
  },
  U: {
    id: "U",
    count: 8,
    edges: [ROAD, FIELD, ROAD, FIELD],
    cities: [],
    roads: [Rd([N, S])],
    monastery: false,
    fields: [Fd([1, 2, 3, 4], null, []), Fd([0, 5, 6, 7], null, [])]
  },
  V: {
    id: "V",
    count: 9,
    edges: [FIELD, FIELD, ROAD, ROAD],
    cities: [],
    roads: [Rd([S, W])],
    monastery: false,
    fields: [Fd([5, 6], { x: 0.12, y: 0.88 }, []), Fd([0, 1, 2, 3, 4, 7], null, [])]
  },
  W: {
    id: "W",
    count: 4,
    edges: [FIELD, ROAD, ROAD, ROAD],
    cities: [],
    roads: [Rd([E]), Rd([S]), Rd([W])],
    monastery: false,
    fields: [Fd([3, 4], null, []), Fd([5, 6], null, []), Fd([7, 0, 1, 2], null, [])]
  },
  X: {
    id: "X",
    count: 1,
    edges: [ROAD, ROAD, ROAD, ROAD],
    cities: [],
    roads: [Rd([N]), Rd([E]), Rd([S]), Rd([W])],
    monastery: false,
    fields: [Fd([1, 2], null, []), Fd([3, 4], null, []), Fd([5, 6], null, []), Fd([7, 0], null, [])]
  }
};

const RIVER_TILE_TYPES = {
  "river-spring": {
    id: "river-spring",
    count: 1,
    edges: [FIELD, FIELD, RIVER, FIELD],
    cities: [],
    roads: [],
    monastery: false,
    fields: [Fd([0, 1, 2, 3, 4, 5, 6, 7], { x: 0.5, y: 0.34 }, [])]
  },
  "river-lake": {
    id: "river-lake",
    count: 1,
    edges: [RIVER, FIELD, FIELD, FIELD],
    cities: [],
    roads: [],
    monastery: false,
    fields: [Fd([0, 1, 2, 3, 4, 5, 6, 7], { x: 0.5, y: 0.66 }, [])]
  },
  "river-straight": {
    id: "river-straight",
    count: 2,
    edges: [FIELD, RIVER, FIELD, RIVER],
    cities: [],
    roads: [],
    monastery: false,
    fields: [
      Fd([0, 1, 2, 7], { x: 0.5, y: 0.24 }, []),
      Fd([3, 4, 5, 6], { x: 0.5, y: 0.76 }, [])
    ]
  },
  "river-curve": {
    id: "river-curve",
    count: 2,
    edges: [FIELD, FIELD, RIVER, RIVER],
    cities: [],
    roads: [],
    monastery: false,
    fields: [
      Fd([0, 1, 2, 3, 4, 7], { x: 0.75, y: 0.25 }, []),
      Fd([5, 6], { x: 0.2, y: 0.8 }, [])
    ]
  },
  "river-bridge": {
    id: "river-bridge",
    count: 1,
    edges: [RIVER, ROAD, RIVER, ROAD],
    cities: [],
    roads: [Rd([W, E])],
    monastery: false,
    fields: [
      Fd([0, 7], { x: 0.25, y: 0.25 }, []),
      Fd([1, 2], { x: 0.75, y: 0.25 }, []),
      Fd([5, 6], { x: 0.25, y: 0.75 }, []),
      Fd([3, 4], { x: 0.75, y: 0.75 }, [])
    ]
  },
  "river-curve-road": {
    id: "river-curve-road",
    count: 1,
    edges: [ROAD, ROAD, RIVER, RIVER],
    cities: [],
    roads: [Rd([N, E], null, { x: 0.53125, y: 0.21875 })],
    monastery: false,
    fields: [
      Fd([0, 7, 3, 4], { x: 0.5, y: 0.5 }, []),
      Fd([1, 2], { x: 0.8, y: 0.2 }, []),
      Fd([5, 6], { x: 0.2, y: 0.8 }, [])
    ]
  },
  "river-monastery-road": {
    id: "river-monastery-road",
    count: 1,
    edges: [FIELD, RIVER, ROAD, RIVER],
    cities: [],
    roads: [Rd([S], { x: 0.5, y: 0.24 })],
    monastery: true,
    monasteryAnchor: { x: 0.5, y: 0.24 },
    fields: [
      Fd([0, 1, 2, 7], { x: 0.25, y: 0.24 }, []),
      Fd([3, 4], { x: 0.72, y: 0.76 }, []),
      Fd([5, 6], { x: 0.28, y: 0.76 }, [])
    ]
  },
  "river-city-road": {
    id: "river-city-road",
    count: 1,
    edges: [CITY, RIVER, ROAD, RIVER],
    cities: [C([N], false)],
    roads: [Rd([S], { x: 0.5, y: 0.34 })],
    monastery: false,
    fields: [
      Fd([7], { x: 0.12, y: 0.305 }, [0]),
      Fd([2], { x: 0.88, y: 0.305 }, [0]),
      Fd([3, 4], { x: 0.75, y: 0.76 }, []),
      Fd([5, 6], { x: 0.25, y: 0.76 }, [])
    ]
  },
  "river-two-cities": {
    id: "river-two-cities",
    count: 1,
    edges: [CITY, RIVER, CITY, RIVER],
    cities: [C([N], false), C([S], false)],
    roads: [],
    monastery: false,
    fields: [
      Fd([2, 7], { x: 0.25, y: 0.305 }, [0]),
      Fd([3, 6], { x: 0.75, y: 0.695 }, [1])
    ]
  },
  "river-city-corner": {
    id: "river-city-corner",
    count: 1,
    edges: [CITY, CITY, RIVER, RIVER],
    cities: [C([N, E], false, { x: 0.8, y: 0.2 })],
    roads: [],
    monastery: false,
    fields: [
      Fd([4, 7], { x: 0.63, y: 0.6 }, [0]),
      Fd([5, 6], { x: 0.22, y: 0.78 }, [])
    ]
  }
};

(function assertTileSet() {
  let total = 0;
  let riverTotal = 0;
  Object.keys(TILE_TYPES).forEach(function (id) {
    const t = TILE_TYPES[id];
    total += t.count;
    if (t.edges.length !== 4) throw new Error("bad edges " + id);
  });
  if (total !== 72) throw new Error("expected 72 tiles, got " + total);
  Object.keys(RIVER_TILE_TYPES).forEach(function (id) {
    const t = RIVER_TILE_TYPES[id];
    riverTotal += t.count;
    if (t.edges.length !== 4) throw new Error("bad river edges " + id);
    if (t.cities.some(function (city) { return city.pennant; })) {
      throw new Error("river city has pennant " + id);
    }
  });
  if (riverTotal !== RIVER_TILE_TOTAL) throw new Error("expected 12 river tiles, got " + riverTotal);
})();

function rotateEdgeIndex(edge, rot) {
  return (edge + (rot % 4) + 4) % 4;
}

function rotateSlot(slot, rot) {
  return (slot + (rot % 4) * 2 + 8) % 8;
}

function rotatePoint(point, rot) {
  let x = point.x, y = point.y;
  for (let i = 0; i < rot; i++) {
    const nextX = 1 - y;
    y = x;
    x = nextX;
  }
  return { x: x, y: y };
}

function rotatedType(typeId, rot) {
  const src = TILE_TYPES[typeId] || RIVER_TILE_TYPES[typeId];
  if (!src) throw new Error("unknown tile type " + typeId);
  rot = ((rot % 4) + 4) % 4;
  if (rot === 0) {
    return {
      id: src.id,
      edges: src.edges.slice(),
      cities: src.cities.map(function (c) {
        return C(c.edges, c.pennant, c.anchor);
      }),
      roads: src.roads.map(function (r) {
        return Rd(r.edges, r.start, r.anchor);
      }),
      monastery: src.monastery,
      monasteryAnchor: src.monasteryAnchor
        ? { x: src.monasteryAnchor.x, y: src.monasteryAnchor.y }
        : null,
      fields: src.fields.map(function (f) {
        return Fd(f.slots, f.anchor, f.cityAreas);
      })
    };
  }
  const edges = [null, null, null, null];
  for (let i = 0; i < 4; i++) edges[rotateEdgeIndex(i, rot)] = src.edges[i];
  return {
    id: src.id,
    edges: edges,
    cities: src.cities.map(function (c) {
      return C(
        c.edges.map(function (e) {
          return rotateEdgeIndex(e, rot);
        }),
        c.pennant,
        c.anchor ? rotatePoint(c.anchor, rot) : null
      );
    }),
    roads: src.roads.map(function (r) {
      return Rd(
        r.edges.map(function (e) {
          return rotateEdgeIndex(e, rot);
        }),
        r.start ? rotatePoint(r.start, rot) : null,
        r.anchor ? rotatePoint(r.anchor, rot) : null
      );
    }),
    monastery: src.monastery,
    monasteryAnchor: src.monasteryAnchor ? rotatePoint(src.monasteryAnchor, rot) : null,
    fields: src.fields.map(function (f) {
      return Fd(
        f.slots.map(function (s) {
          return rotateSlot(s, rot);
        }),
        f.anchor ? rotatePoint(f.anchor, rot) : null,
        f.cityAreas
      );
    })
  };
}

function fisherYates(arr, rng) {
  rng = rng || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function makeDeck(tileLimit, riverGame, rng) {
  const rest = [];
  let start = null;
  Object.keys(TILE_TYPES).forEach(function (id) {
    const n = TILE_TYPES[id].count;
    for (let i = 0; i < n; i++) {
      const tile = { uid: id + "-" + i, typeId: id };
      if (id === "D" && i === 0) start = tile;
      else rest.push(tile);
    }
  });
  if (riverGame && INCLUDE_NORMAL_START_IN_RIVER_GAME) rest.push(start);
  fisherYates(rest, rng);
  if (Number.isInteger(tileLimit) && tileLimit >= 0) {
    rest.length = Math.min(rest.length, tileLimit);
  }
  return { start: start, deck: rest };
}

function makeRiverDeck(rng) {
  const riverTiles = [];
  Object.keys(RIVER_TILE_TYPES).forEach(function (id) {
    if (id === RIVER_SPRING_ID || id === RIVER_LAKE_ID) return;
    for (let i = 0; i < RIVER_TILE_TYPES[id].count; i++) {
      riverTiles.push({ uid: id + "-" + i, typeId: id });
    }
  });
  fisherYates(riverTiles, rng);
  riverTiles.push({ uid: RIVER_LAKE_ID, typeId: RIVER_LAKE_ID });
  return riverTiles;
}
