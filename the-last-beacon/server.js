const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function createInitialState() {
  return {
    day: 19,
    minute: 0,
    currentLocation: "start",
    survivors: {
      aarav: { health: 82, stamina: 68 },
      mira: { health: 91, stamina: 76 }
    },
    supplies: { food: 6, water: 7, medkits: 2, battery: 4 },
    threats: { horde: 80, centralRuins: 70, industrialZone: 75, oldFactory: 45 },
    routeBlocked: false,
    blockedDestination: null,
    encounterUsed: false,
    hasCrossedGrocery: false,
    status: "active",
    journal: ["12:00 — Beacon signal detected."]
  };
}

let state = createInitialState();

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function log(message) {
  const total = 12 * 60 + state.minute;
  const clock = String(Math.floor(total / 60) % 24).padStart(2, "0") +
    ":" + String(total % 60).padStart(2, "0");
  state.journal.unshift(`${clock} — ${message}`);
  state.journal = state.journal.slice(0, 20);
}

function changeStamina(amount) {
  Object.values(state.survivors).forEach(s => s.stamina = clamp(s.stamina + amount));
}

function changeHealth(amount) {
  Object.values(state.survivors).forEach(s => s.health = clamp(s.health + amount));
}

function checkGameStatus() {
  if (Object.values(state.survivors).every(s => s.health <= 0)) {
    state.status = "failed";
  } else if (state.currentLocation === "beacon") {
    state.status = "completed";
  }
}

app.get("/api/state", (_req, res) => res.json({ state }));

app.post("/api/decision", (req, res) => {
  const { action } = req.body || {};
  const allowed = ["grocery", "safe", "direct", "detour", "detourSafe", "detourRisky", "retreat", "medkit"];

  if (!allowed.includes(action)) return res.status(400).json({ error: "Invalid survival decision." });
  if (state.status !== "active") return res.status(409).json({ error: "Simulation ended. Reset to play again." });

  if (state.routeBlocked) {
    if (!["detourSafe", "detourRisky", "retreat"].includes(action)) {
      return res.status(409).json({ error: "The road is blocked. Choose an escape route." });
    }
    if (action === "retreat" && state.hasCrossedGrocery) {
      return res.status(409).json({ error: "The starting checkpoint is no longer accessible." });
    }

    const destination = state.blockedDestination;
    state.routeBlocked = false;
    state.blockedDestination = null;

    if (action === "detourSafe") {
      state.supplies.food = Math.max(0, state.supplies.food - 1);
      state.supplies.water = Math.max(0, state.supplies.water - 1);
      changeStamina(-8);
      state.currentLocation = "detour";
      state.minute += 25;
      log("Used the southern detour and avoided the zombies.");
      state.currentLocation = destination;
    } else if (action === "detourRisky") {
      changeStamina(-14);
      if (state.threats.horde >= 80) changeHealth(-10);
      state.currentLocation = "detour";
      state.minute += 15;
      log("Escaped through the dangerous alley.");
      state.currentLocation = destination;
    } else {
      state.currentLocation = state.hasCrossedGrocery ? "grocery" : "start";
      changeStamina(-3);
      state.minute += 10;
      log("Retreated to the last checkpoint.");
    }
    if (state.currentLocation === "grocery") state.hasCrossedGrocery = true;
    checkGameStatus();
    return res.json({ message: "Escape decision completed.", state });
  }

  switch (action) {
    case "grocery":
      if (!state.encounterUsed && state.currentLocation === "safe") {
        state.encounterUsed = true;
        state.routeBlocked = true;
        state.blockedDestination = "grocery";
        state.minute += 10;
        log("Zombies blocked the road to the grocery store.");
        break;
      }
      state.currentLocation = "grocery";
      state.supplies.food = Math.min(15, state.supplies.food + 3);
      changeStamina(-10);
      state.minute += 20;
      state.hasCrossedGrocery = true;
      log("Reached the grocery store and collected food.");
      break;

    case "safe":
      if (!state.encounterUsed && ["start", "grocery"].includes(state.currentLocation)) {
        state.encounterUsed = true;
        state.routeBlocked = true;
        state.blockedDestination = "safe";
        state.minute += 10;
        log("Zombie ambush! The road to the safe house is blocked.");
        break;
      }
      state.currentLocation = "safe";
      state.supplies.food = Math.max(0, state.supplies.food - 1);
      state.supplies.water = Math.max(0, state.supplies.water - 1);
      changeStamina(18);
      state.minute += 20;
      log("Reached the safe house and recovered stamina.");
      break;

    case "direct":
      state.currentLocation = "beacon";
      changeStamina(-8);
      state.minute += 30;
      if (state.threats.centralRuins >= 70) {
        state.survivors.aarav.health = clamp(state.survivors.aarav.health - 18);
        state.survivors.mira.health = clamp(state.survivors.mira.health - 12);
        log("The dangerous direct route caused injuries.");
      } else log("Reached the final beacon by the direct route.");
      break;

    case "detour":
      state.currentLocation = "detour";
      state.supplies.food = Math.max(0, state.supplies.food - 1);
      state.supplies.water = Math.max(0, state.supplies.water - 1);
      changeStamina(-7);
      state.minute += 30;
      log("Completed the longer southern detour.");
      break;

    case "medkit":
      if (state.supplies.medkits <= 0) return res.status(409).json({ error: "No medkits remain." });
      state.supplies.medkits--;
      changeHealth(15);
      log("Used a medkit to restore survivor health.");
      break;
  }

  checkGameStatus();
  res.json({ message: "Decision processed.", state });
});

app.post("/api/threats", (req, res) => {
  if (state.status !== "active") return res.status(409).json({ error: "Simulation has ended." });
  for (const zone of Object.keys(state.threats)) {
    state.threats[zone] = clamp(state.threats[zone] + Math.floor(Math.random() * 31) - 15);
  }
  changeStamina(-2);
  state.minute += 15;
  log("Zombie threat levels updated across the city.");
  res.json({ message: "Threat levels updated.", state });
});

app.post("/api/supplies", (req, res) => {
  const { item, delta } = req.body || {};
  if (!Object.hasOwn(state.supplies, item)) return res.status(400).json({ error: "Unknown supply item." });
  if (!Number.isInteger(delta) || Math.abs(delta) > 15) {
    return res.status(400).json({ error: "Supply change must be an integer between -15 and 15." });
  }
  const next = state.supplies[item] + delta;
  if (next < 0 || next > 15) return res.status(400).json({ error: "Supply must remain between 0 and 15." });
  state.supplies[item] = next;
  log(`${item} inventory updated.`);
  res.json({ message: "Inventory updated.", state });
});

app.post("/api/reset", (_req, res) => {
  state = createInitialState();
  res.json({ message: "Simulation reset.", state });
});

app.listen(PORT, () => {
  console.log(`The Last Beacon server is running at http://localhost:${PORT}`);
});
