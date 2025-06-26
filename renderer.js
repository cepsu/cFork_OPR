// --- renderer.js ---
// Handles all canvas rendering logic, including units, terrain, and UI elements.

function createImageForCluster(cluster) {
  const fillStyle = cluster.side === "attackers" ? "#aaf" : "#faa";
  const strokeStyle = cluster.side === "attackers" ? "#00f" : "#f00";
  const widthPx = Math.max(1, Math.ceil(cluster.wIn * pxPerInch));
  const heightPx = Math.max(1, Math.ceil(cluster.hIn * pxPerInch));
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = widthPx;
  offscreenCanvas.height = heightPx;
  const ctx = offscreenCanvas.getContext("2d");
  const radiusPx = (DIA_IN / 2) * pxPerInch;

  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = Math.max(1, pxPerInch * 0.05);

  (cluster.models || []).forEach((model) => {
    const x = (model.x - cluster.originXIn) * pxPerInch;
    const y = (model.y - cluster.originYIn) * pxPerInch;
    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });
  return offscreenCanvas;
}

function updateClusterCircles(cluster) {
  const numModels = cluster.currentModels;
  if (numModels <= 0) {
    cluster.img = null; // Clear image if no models
    renderGameScreen();
    return;
  }
  const cols = Math.ceil(Math.sqrt(numModels));
  cluster.wIn = cols * DIA_IN;
  cluster.hIn = Math.ceil(numModels / cols) * DIA_IN;

  const newModels = [];
  for (let i = 0; i < numModels; i++) {
    const colIndex = i % cols;
    const rowIndex = Math.floor(i / cols);
    const centerX = cluster.originXIn + colIndex * DIA_IN + DIA_IN / 2;
    const centerY = cluster.originYIn + rowIndex * DIA_IN + DIA_IN / 2;
    newModels.push({ x: centerX, y: centerY, id: `${cluster.id}-model-${i}` });
  }
  cluster.models = newModels;
  cluster.img = createImageForCluster(cluster);
  renderGameScreen();
}

function renderGameScreen() {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const clientWidth = canvas.clientWidth;
  const clientHeight = canvas.clientHeight;
  let pxPerInchChanged = false;

  if (clientWidth === 0 || clientHeight === 0) return;

  const oldPxPerInch = pxPerInch;
  const newPxPerInch = Math.min(
    clientWidth / ZONE_W_IN,
    clientHeight / ZONE_H_IN
  );
  if (pxPerInch !== newPxPerInch) {
    pxPerInch = newPxPerInch;
    pxPerInchChanged = true;
  }

  const targetCanvasWidth = Math.round(ZONE_W_IN * pxPerInch);
  const targetCanvasHeight = Math.round(ZONE_H_IN * pxPerInch);
  if (
    canvas.width !== targetCanvasWidth ||
    canvas.height !== targetCanvasHeight
  ) {
    canvas.width = targetCanvasWidth;
    canvas.height = targetCanvasHeight;
    pxPerInchChanged = true;
  }

  if (pxPerInchChanged) {
    if (clusterCache.attackers)
      clusterCache.attackers.forEach((c) => (c.img = createImageForCluster(c)));
    if (clusterCache.defenders)
      clusterCache.defenders.forEach((c) => (c.img = createImageForCluster(c)));
    if (terrainFeatures)
      terrainFeatures.forEach((f) => (f.img = createImageForTerrainFeature(f)));
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2a2a2a"; // Darker background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  terrainFeatures.forEach((feature) => {
    if (feature.img)
      ctx.drawImage(feature.img, feature.x * pxPerInch, feature.y * pxPerInch);
  });

  const objectiveRadiusPx = 3 * pxPerInch;
  objectives.forEach((obj) => {
    const xPx = obj.x * pxPerInch,
      yPx = obj.y * pxPerInch;
    ctx.beginPath();
    ctx.arc(xPx, yPx, objectiveRadiusPx, 0, 2 * Math.PI);
    ctx.fillStyle =
      obj.controller === "attackers"
        ? "rgba(0,100,255,0.3)"
        : obj.controller === "defenders"
        ? "rgba(255,100,0,0.3)"
        : "rgba(200,200,0,0.3)";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  ["attackers", "defenders"].forEach((side) => {
    clusterCache[side].forEach((cluster) => {
      if (!cluster.img) return;
      ctx.drawImage(
        cluster.img,
        cluster.originXIn * pxPerInch,
        cluster.originYIn * pxPerInch
      );
      ctx.textAlign = "center";
      const baseFontSize = Math.max(8, Math.round(8 * (pxPerInch / 15)));
      ctx.font = `bold ${baseFontSize}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "black";
      ctx.shadowBlur = 2;
      ctx.fillText(
        cluster.name,
        cluster.cxIn * pxPerInch,
        (cluster.originYIn - 0.7) * pxPerInch
      );
      if (cluster.activated) {
        ctx.fillStyle = "#0f0";
        ctx.fillText(
          "✔",
          cluster.cxIn * pxPerInch +
            ctx.measureText(cluster.name).width / 2 +
            5 * (pxPerInch / 15),
          (cluster.originYIn - 0.7) * pxPerInch
        );
      }
      if (cluster.shaken) {
        ctx.fillStyle = "red";
        ctx.font = `bold ${baseFontSize + 1}px sans-serif`;
        ctx.fillText(
          "SHAKEN",
          cluster.cxIn * pxPerInch,
          cluster.cyIn * pxPerInch
        );
      }
      ctx.shadowBlur = 0; // reset shadow
    });
  });

  if (currentActiveUnit) {
    const c = currentActiveUnit;
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      c.originXIn * pxPerInch,
      c.originYIn * pxPerInch,
      c.wIn * pxPerInch,
      c.hIn * pxPerInch
    );
  }

  // (rest of renderGameScreen)
  // ...
}

function animateUnitMovement(
  unitCluster,
  targetCoordsIn,
  distanceToMoveIn,
  callback
) {
  const MOVEMENT_SPEED_IN_PER_MS = 0.012; // slightly faster
  const originalCenter = { x: unitCluster.cxIn, y: unitCluster.cyIn };
  const originalOrigin = { x: unitCluster.originXIn, y: unitCluster.originYIn };

  // *** FIX: Capture the original positions of each model ***
  const originalModelPositions = unitCluster.models.map((m) => ({ ...m }));

  let dX = targetCoordsIn.x - originalCenter.x;
  let dY = targetCoordsIn.y - originalCenter.y;
  const totalDistToTarget = Math.hypot(dX, dY);
  if (totalDistToTarget < 0.01 || distanceToMoveIn <= 0) {
    if (callback) callback();
    return;
  }
  dX /= totalDistToTarget;
  dY /= totalDistToTarget;

  let movedSoFarIn = 0;
  let lastTimestamp = null;
  function step(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaTimeMs = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const moveThisFrameIn = Math.min(
      deltaTimeMs * MOVEMENT_SPEED_IN_PER_MS,
      distanceToMoveIn - movedSoFarIn
    );
    movedSoFarIn += moveThisFrameIn;

    const moveXThisFrame = dX * moveThisFrameIn;
    const moveYThisFrame = dY * moveThisFrameIn;

    // Update cluster's main points
    unitCluster.cxIn += moveXThisFrame;
    unitCluster.cyIn += moveYThisFrame;
    unitCluster.originXIn += moveXThisFrame;
    unitCluster.originYIn += moveYThisFrame;

    // *** FIX: Update EACH model's position every frame ***
    unitCluster.models.forEach((model, index) => {
      model.x += moveXThisFrame;
      model.y += moveYThisFrame;
    });

    renderGameScreen();

    if (movedSoFarIn < distanceToMoveIn) {
      requestAnimationFrame(step);
    } else {
      // Snap to final position to correct any floating point inaccuracies
      const finalMoveX = dX * distanceToMoveIn;
      const finalMoveY = dY * distanceToMoveIn;
      unitCluster.cxIn = originalCenter.x + finalMoveX;
      unitCluster.cyIn = originalCenter.y + finalMoveY;
      unitCluster.originXIn = originalOrigin.x + finalMoveX;
      unitCluster.originYIn = originalOrigin.y + finalMoveY;
      unitCluster.models.forEach((model, index) => {
        model.x = originalModelPositions[index].x + finalMoveX;
        model.y = originalModelPositions[index].y + finalMoveY;
      });

      renderGameScreen();
      if (callback) callback();
    }
  }
  requestAnimationFrame(step);
}
