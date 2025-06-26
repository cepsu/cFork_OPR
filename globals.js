// --- globals.js ---
// Global configuration and state variables for the game simulation.

// GAME STATE
let currentTurn = "attackers";
let currentRound = 1;
let isDeploymentComplete = false;
let playerWhoFinishedLastRoundFirst = null;
let playerWhoStartedCurrentRound = "attackers";
let currentActiveUnit = null;
let cacheStale = true;

// ARMY DATA
let currentAttackerUnits = {};
let currentDefenderUnits = {};
let unitsToDeploy = { attackers: [], defenders: [] };
let scoutUnits = { attackers: [], defenders: [] };
let currentAttackerArmyName = "Attackers";
let currentDefenderArmyName = "Defenders";
let clusterCache = { attackers: [], defenders: [] };

// DEPLOYMENT STATE
let currentDeploymentPlayer = null;
let attackerDeploymentEdge = null;
let defenderDeploymentEdge = null;

// BOARD & UI
const ZONE_W_IN = 72;
const ZONE_H_IN = 48;
const DIA_IN = 1.26;
const MARGIN_Y = 12;
let pxPerInch = 0;
let unitTooltipElement = null;
let currentlyHoveredUnitId = null;
let roundMessageInfo = null;
const floatingTextStacks = {};

// GAME ELEMENTS
let objectives = [];
let terrainFeatures = [];
