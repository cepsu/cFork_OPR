// --- game_setup.js ---
// Handles the setup phase of the game, including terrain and unit deployment.

// (Keep all other functions like createImageForTerrainFeature, defineTerrainPieces, etc. the same)

const terrainColorMapping = {
  dangerous: "rgba(204, 0, 0, 0.2)",
  blocking: "rgba(85, 85, 85, 0.2)",
  difficult: "rgba(0, 100, 0, 0.2)",
  cover: "rgba(160, 82, 45, 0.2)",
};

function isScoutUnit(unit) {
  return unit.subUnits?.every((su) => su.special?.scout);
}

function startDeploymentPhase() {
  isDeploymentComplete = false;
  clusterCache.attackers = [];
  clusterCache.defenders = [];
  const allAttackers = Object.values(currentAttackerUnits);
  unitsToDeploy.attackers = allAttackers
    .filter((u) => !isScoutUnit(u))
    .sort((a, b) => (a.subUnits[0].points || 0) - (b.subUnits[0].points || 0));
  scoutUnits.attackers = allAttackers.filter(isScoutUnit);
  const allDefenders = Object.values(currentDefenderUnits);
  unitsToDeploy.defenders = allDefenders
    .filter((u) => !isScoutUnit(u))
    .sort((a, b) => (a.subUnits[0].points || 0) - (b.subUnits[0].points || 0));
  scoutUnits.defenders = allDefenders.filter(isScoutUnit);
  const rollOffWinner = Math.random() < 0.5 ? "attackers" : "defenders";
  attackerDeploymentEdge = rollOffWinner === "attackers" ? "top" : "bottom";
  defenderDeploymentEdge = rollOffWinner === "attackers" ? "bottom" : "top";
  currentDeploymentPlayer = rollOffWinner;
  appendToCombatLog(
    `--- Starting Deployment Phase. ${rollOffWinner} to place first. ---`
  );
  setTimeout(() => deployUnit(false), 100);
}

function deployUnit(isScoutPhase) {
  const deployList = isScoutPhase ? scoutUnits : unitsToDeploy;
  const player = currentDeploymentPlayer;
  const opponent = player === "attackers" ? "defenders" : "attackers";

  if (deployList[player].length === 0) {
    if (deployList[opponent].length === 0) {
      if (
        !isScoutPhase &&
        (scoutUnits.attackers.length > 0 || scoutUnits.defenders.length > 0)
      ) {
        appendToCombatLog(
          "--- Main deployment complete. Starting Scout deployment. ---"
        );
        setTimeout(() => deployUnit(true), 100);
      } else {
        appendToCombatLog("--- All units deployed. Deployment Complete! ---");
        isDeploymentComplete = true;
        $("#startDeploymentButton").hide();
        $("#aiButton").show().prop("disabled", false);
        $("#playRoundButton").show().prop("disabled", false);
        displayRoundMessage("Deployment Complete!");
      }
      return;
    }
    currentDeploymentPlayer = opponent;
    setTimeout(() => deployUnit(isScoutPhase), 100);
    return;
  }

  const unitToDeploy = deployList[player].shift();
  const deploymentEdge =
    player === "attackers" ? attackerDeploymentEdge : defenderDeploymentEdge;
  const sectionIndex = Math.floor(Math.random() * 3);
  const placementInfo = findValidPlacementInSection(
    unitToDeploy,
    player,
    deploymentEdge,
    clusterCache,
    sectionIndex
  );

  if (placementInfo) {
    const newCluster = createUnitCluster({
      unitGroupData: unitToDeploy,
      side: player,
      cx: placementInfo.finalCxIn,
      cy: placementInfo.finalCyIn,
      originX: placementInfo.originXInches,
      originY: placementInfo.originYInches,
    });
    if (!newCluster) {
      deployList[player].unshift(unitToDeploy);
      return;
    }
    clusterCache[player].push(newCluster);

    if (isScoutPhase) {
      let nearestObj = objectives.sort(
        (a, b) =>
          distance(a, { x: newCluster.cxIn, y: newCluster.cyIn }) -
          distance(b, { x: newCluster.cxIn, y: newCluster.cyIn })
      )[0];
      if (nearestObj) {
        const dx = nearestObj.x - newCluster.cxIn,
          dy = nearestObj.y - newCluster.cyIn;
        const dist = Math.hypot(dx, dy);
        const moveAmount = Math.min(12, dist);
        const moveX = dist > 0 ? (dx / dist) * moveAmount : 0;
        const moveY = dist > 0 ? (dy / dist) * moveAmount : 0;

        // Update cluster center and origin
        newCluster.cxIn += moveX;
        newCluster.cyIn += moveY;
        newCluster.originXIn += moveX;
        newCluster.originYIn += moveY;

        // *** FIX: UPDATE MODEL POSITIONS ***
        newCluster.models.forEach((model) => {
          model.x += moveX;
          model.y += moveY;
        });

        newCluster.img = createImageForCluster(newCluster); // Redraw the image at the new location
        appendToCombatLog(
          `   > Scout ${newCluster.name} moves ${moveAmount.toFixed(
            1
          )}" towards objective.`
        );
      }
    }
  } else {
    appendToCombatLog(
      `Warning: Could not place ${unitToDeploy.name}, re-queueing.`
    );
    deployList[player].unshift(unitToDeploy);
  }

  renderGameScreen();
  currentDeploymentPlayer = opponent;
  setTimeout(() => deployUnit(isScoutPhase), 100);
}

// (Rest of the file remains the same: isPositionValid, createImageForTerrainFeature, attemptPlaceTerrain, etc.)
// ...
function isPositionValid(candidate, placed, minSep = 4) {
  if (
    candidate.x < 0 ||
    candidate.y < 0 ||
    candidate.x + candidate.widthIn > ZONE_W_IN ||
    candidate.y + candidate.heightIn > ZONE_H_IN
  )
    return false;
  for (const p of placed) {
    if (
      candidate.x < p.x + p.widthIn + minSep &&
      candidate.x + candidate.widthIn + minSep > p.x &&
      candidate.y < p.y + p.heightIn + minSep &&
      candidate.y + candidate.heightIn + minSep > p.y
    )
      return false;
  }
  return true;
}

function createImageForTerrainFeature(feature) {
  if (!pxPerInch || pxPerInch <= 0) return null;
  const widthPx = Math.max(1, Math.ceil(feature.widthIn * pxPerInch));
  const heightPx = Math.max(1, Math.ceil(feature.heightIn * pxPerInch));
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (feature.properties.dangerous)
    ctx.fillStyle = terrainColorMapping.dangerous;
  else if (feature.properties.blocking)
    ctx.fillStyle = terrainColorMapping.blocking;
  else if (feature.properties.difficult)
    ctx.fillStyle = terrainColorMapping.difficult;
  else if (feature.properties.cover) ctx.fillStyle = terrainColorMapping.cover;
  else ctx.fillStyle = "rgba(200,200,200,0.2)";
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.strokeStyle = "rgba(50,50,50,0.2)";
  ctx.lineWidth = Math.max(1, pxPerInch * 0.05);
  ctx.strokeRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.font = `${Math.max(8, Math.round(8 * (pxPerInch / 15)))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const propertiesList = Object.keys(feature.properties).filter(
    (key) => feature.properties[key]
  );
  if (propertiesList.length > 0) {
    const lineHeight = Math.ceil(parseInt(ctx.font) * 1.2);
    let startY =
      (heightPx - propertiesList.length * lineHeight) / 2 + lineHeight / 2;
    propertiesList.forEach((item) => {
      ctx.fillText(item.toUpperCase(), widthPx / 2, startY);
      startY += lineHeight;
    });
  }
  return canvas;
}

function attemptPlaceTerrain(pieceSpec, placed) {
  for (let i = 0; i < 20; i++) {
    const candidate = {
      x: Math.random() * (ZONE_W_IN - pieceSpec.widthIn),
      y: Math.random() * (ZONE_H_IN - pieceSpec.heightIn),
      widthIn: pieceSpec.widthIn,
      heightIn: pieceSpec.heightIn,
    };
    if (isPositionValid(candidate, placed, 4))
      return { ...pieceSpec, ...candidate };
  }
  return null;
}

function defineTerrainPieces() {
  const numPieces = 25;
  const terrainTypes = [
    { name: "blocking", weight: 0.45 },
    { name: "cover", weight: 0.35 },
    { name: "difficult", weight: 0.3 },
  ];
  const totalWeight = terrainTypes.reduce((sum, t) => sum + t.weight, 0);
  return Array.from({ length: numPieces }, (_, i) => {
    const isLarge = i < Math.ceil(numPieces * 0.4);
    let widthIn = isLarge ? 6 + Math.random() * 4 : 3 + Math.random() * 2;
    let heightIn = isLarge ? 6 + Math.random() * 4 : 3 + Math.random() * 2;
    widthIn = Math.ceil(widthIn * 2) / 2;
    heightIn = Math.ceil(heightIn * 2) / 2;
    const rnd = Math.random() * totalWeight;
    let cumulative = 0,
      chosenType = "cover";
    for (let t of terrainTypes) {
      cumulative += t.weight;
      if (rnd < cumulative) {
        chosenType = t.name;
        break;
      }
    }
    return {
      id: `terrain-${i}`,
      widthIn,
      heightIn,
      properties: { [chosenType]: true },
    };
  });
}

function generateAndPlaceAllTerrain() {
  let newTerrain = [];
  const terrainSpecs = defineTerrainPieces();
  terrainSpecs.forEach((spec) => {
    const placed = attemptPlaceTerrain(spec, newTerrain);
    if (placed) newTerrain.push(placed);
  });
  const topHalf = newTerrain.filter(
    (p) => p.y + p.heightIn / 2 < ZONE_H_IN / 2
  );
  const bottomHalf = newTerrain.filter(
    (p) => p.y + p.heightIn / 2 >= ZONE_H_IN / 2
  );
  if (topHalf.length > 0)
    topHalf[
      Math.floor(Math.random() * topHalf.length)
    ].properties.dangerous = true;
  if (bottomHalf.length > 0)
    bottomHalf[
      Math.floor(Math.random() * bottomHalf.length)
    ].properties.dangerous = true;
  appendToCombatLog(`--- Placed ${newTerrain.length} terrain features. ---`);
  return newTerrain;
}

function setupObjectives() {
  const numMarkers = rollD3() + 2;
  const regionTop = MARGIN_Y,
    regionHeight = ZONE_H_IN - 2 * MARGIN_Y;
  objectives = Array.from({ length: numMarkers }, () => ({
    x: Math.random() * ZONE_W_IN,
    y: regionTop + Math.random() * regionHeight,
    controller: null,
  }));
}
