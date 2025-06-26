// ============================================================================
// AI LOGIC - DECISION MAKING & ACTIONS (Refactored)
// ============================================================================

/* ================================
   Helper Functions & Utilities
   ================================ */

/**
 * Returns the Euclidean distance between two points {x, y}.
 */
function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Computes the smallest distance between any model in two clusters.
 */
function getMinDistanceBetweenClusters(clusterA, clusterB) {
  return Math.min(
    ...clusterA.models.map((m1) =>
      Math.min(...clusterB.models.map((m2) => distance(m1, m2)))
    )
  );
}

/**
 * Returns a shifted copy of a cluster (adjusts center and model positions).
 */
function shiftCluster(cluster, dx, dy) {
  return {
    ...cluster,
    cxIn: cluster.cxIn + dx,
    cyIn: cluster.cyIn + dy,
    models: cluster.models.map((m) => ({ x: m.x + dx, y: m.y + dy })),
  };
}

/**
 * Calculates final target coordinates and movement distance.
 * Mode can be "Advance", "Rush", or "Charge".
 */
function calculateFinalTargetAndMoveDistance(
  unitCluster,
  target,
  baseMoveDistance,
  mode
) {
  let finalCoords = {};
  let moveDist = baseMoveDistance;

  // Target is an objective (has x,y but no models)
  if (
    target &&
    typeof target.x === "number" &&
    typeof target.y === "number" &&
    !target.models
  ) {
    finalCoords = {
      x: target.x,
      y: target.y,
      name:
        target.name ||
        `Objective (${target.x.toFixed(1)},${target.y.toFixed(1)})`,
    };
    moveDist = Math.min(
      moveDist,
      distance({ x: unitCluster.cxIn, y: unitCluster.cyIn }, finalCoords)
    );
  }
  // Target is an enemy unit (has models)
  else if (target && target.models) {
    const ownRadius = getEffectiveRadius(unitCluster);
    const enemyRadius = getEffectiveRadius(target);
    const actualDist = distance(
      { x: unitCluster.cxIn, y: unitCluster.cyIn },
      { x: target.cxIn, y: target.cyIn }
    );
    if (mode !== "Charge") {
      const requiredDist = ownRadius + enemyRadius + 1.0;
      if (actualDist > requiredDist) {
        const dirX = (target.cxIn - unitCluster.cxIn) / actualDist;
        const dirY = (target.cyIn - unitCluster.cyIn) / actualDist;
        finalCoords = {
          x: target.cxIn - dirX * requiredDist,
          y: target.cyIn - dirY * requiredDist,
        };
        moveDist = Math.min(
          moveDist,
          distance({ x: unitCluster.cxIn, y: unitCluster.cyIn }, finalCoords)
        );
      } else {
        moveDist = 0;
        finalCoords = { x: unitCluster.cxIn, y: unitCluster.cyIn };
      }
    } else {
      // For charge: aim to reach the edge of the target.
      const idealStoppingDist = ownRadius + enemyRadius;
      if (actualDist > 0) {
        const dirX = (target.cxIn - unitCluster.cxIn) / actualDist;
        const dirY = (target.cyIn - unitCluster.cyIn) / actualDist;
        finalCoords = {
          x: target.cxIn - dirX * enemyRadius,
          y: target.cyIn - dirY * enemyRadius,
        };
      }
      const distToEdge = Math.max(0, actualDist - idealStoppingDist);
      moveDist = Math.min(moveDist, distToEdge);
    }
  }
  return { finalCoords, moveDist };
}

/**
 * Appends a message to the given log string.
 */
function appendLog(log, msg) {
  return log + msg + "\n";
}

/* ===============================
     Cache And Unit Retrieval
     =============================== */

/** Retrieves the AI side cache for the current turn. */
function getAISideCache() {
  return clusterCache[currentTurn];
}

/** Retrieves the enemy side cache (the opposite of the current turn). */
function getEnemySideCache() {
  return currentTurn === "attackers"
    ? clusterCache.defenders
    : clusterCache.attackers;
}

/* ====================================================
   Objective Contested Logic
   ==================================================== */

/**
 * Checks if an objective is contested. An objective is considered contested if:
 *   - An enemy unit is present within 3" of the objective's center, and
 *   - The current friendly force near the objective consists of a single unit,
 *     which is the unit passed in.
 */
function isObjectiveContested(objective, unit) {
  const threshold = 3; // 3 inches contest range
  const enemyUnits = getEnemySideCache() || [];
  const friendlyUnits = getAISideCache() || [];

  const enemyInRange = enemyUnits.some(
    (u) =>
      distance({ x: u.cxIn, y: u.cyIn }, { x: objective.x, y: objective.y }) <=
      threshold
  );
  const friendliesInRange = friendlyUnits.filter(
    (u) =>
      distance({ x: u.cxIn, y: u.cyIn }, { x: objective.x, y: objective.y }) <=
      threshold
  );
  return (
    enemyInRange &&
    friendliesInRange.length === 1 &&
    friendliesInRange[0].name === unit.name
  );
}

/**
 * Returns true if there are multiple friendly units near the objective.
 * (You may already have a similar function, but if not, here’s an example.)
 */
function isFriendlyForceNearObjective(objective, currentTurn) {
  const friendlies = getAISideCache() || [];
  // Count friendlies that are within a 3" diameter (or other chosen range)
  return (
    friendlies.filter(
      (u) =>
        distance(
          { x: u.cxIn, y: u.cyIn },
          { x: objective.x, y: objective.y }
        ) <= 3
    ).length > 0
  );
}

/* ============================================
     Target, Objective, and Shooting Functions
     ============================================ */

/**
 * Checks if any enemy units are close to the direct path between a unit and an objective.
 */
function areEnemiesOnPath(unitCluster, objective) {
  const enemyUnits = getEnemySideCache() || [];
  return enemyUnits.some((enemyCluster) =>
    enemyCluster.models.some(
      (model) =>
        calculateDistancePointToSegment(
          model,
          { x: unitCluster.cxIn, y: unitCluster.cyIn },
          objective
        ) <= 6
    )
  );
}

/**
 * Returns the enemy clusters closest to unitCluster (sorted by distance).
 */
function getNearestEnemyUnits(unitCluster) {
  const enemyUnits = getEnemySideCache();
  if (!enemyUnits || enemyUnits.length === 0) return [];
  return enemyUnits
    .map((enemy) => {
      const d = distance(
        { x: unitCluster.cxIn, y: unitCluster.cyIn },
        { x: enemy.cxIn, y: enemy.cyIn }
      );
      return { unit: enemy, dist: d };
    })
    .sort(
      (a, b) =>
        a.dist - b.dist ||
        (a.unit.activated === b.unit.activated ? 0 : a.unit.activated ? 1 : -1)
    );
}

/**
 * Returns the nearest uncontrolled objectives (sorted by distance).
 */
function getNearestUncontrolledObjectives(unitCluster) {
  return objectives
    .filter((o) => !isObjectiveUnderAIControl(o))
    .map((o) => ({
      obj: o,
      dist: distance(
        { x: unitCluster.cxIn, y: unitCluster.cyIn },
        { x: o.x, y: o.y }
      ),
    }))
    .sort((a, b) => a.dist - b.dist);
}

/**
 * Determines if targetEnemyCluster is within the charge range of aiUnitCluster.
 */
function isTargetInChargeRange(aiUnitCluster, targetEnemyCluster) {
  if (!targetEnemyCluster) return false;
  const chargeRange = getUnitChargeRange(aiUnitCluster); // from game_core_logic.js
  return (
    getMinDistanceBetweenClusters(aiUnitCluster, targetEnemyCluster) <=
    chargeRange
  );
}

/**
 * Gets the best enemy unit cluster to shoot at.
 */
function getBestShootTarget(shootingUnitCluster) {
  const enemyUnits = getEnemySideCache();
  if (
    !enemyUnits ||
    enemyUnits.length === 0 ||
    !shootingUnitCluster.bestRangeIn
  )
    return null;
  const shootable = enemyUnits
    .filter(
      (enemy) =>
        enemy.models &&
        enemy.models.length > 0 &&
        isUnitInRangeOfTarget(
          shootingUnitCluster,
          enemy,
          shootingUnitCluster.bestRangeIn
        )
    )
    .map((enemy) => ({
      unit: enemy,
      dist: getMinDistanceBetweenClusters(shootingUnitCluster, enemy),
    }))
    .sort((a, b) => {
      const aCover = !!a.unit.isInCover;
      const bCover = !!b.unit.isInCover;
      if (aCover !== bCover) return aCover ? 1 : -1;
      if (a.unit.activated !== b.unit.activated)
        return a.unit.activated ? 1 : -1;
      return a.dist - b.dist;
    });
  return shootable.length > 0 ? shootable[0].unit : null;
}

/**
 * Gets the best enemy unit cluster to charge.
 */
function getBestChargeTarget(chargingUnitCluster) {
  const enemyUnits = getEnemySideCache();
  if (!enemyUnits || enemyUnits.length === 0) return null;
  const chargeable = enemyUnits
    .filter(
      (enemy) =>
        enemy.models &&
        enemy.models.length > 0 &&
        isTargetInChargeRange(chargingUnitCluster, enemy)
    )
    .map((enemy) => ({
      unit: enemy,
      dist: getMinDistanceBetweenClusters(chargingUnitCluster, enemy),
    }))
    .sort((a, b) => {
      if (a.unit.activated !== b.unit.activated)
        return a.unit.activated ? 1 : -1;
      return a.dist - b.dist;
    });
  return chargeable.length > 0 ? chargeable[0].unit : null;
}

/**
 * Simulates an advance from a unit’s position and returns the best shoot target
 * from the future (advanced) position.
 */
function getShootTargetAfterAdvance(
  advancingUnit,
  moveDistance,
  targetDestination
) {
  let destX, destY;
  if (
    targetDestination &&
    typeof targetDestination.cxIn === "number" &&
    typeof targetDestination.cyIn === "number"
  ) {
    destX = targetDestination.cxIn;
    destY = targetDestination.cyIn;
  } else if (
    targetDestination &&
    typeof targetDestination.x === "number" &&
    typeof targetDestination.y === "number"
  ) {
    destX = targetDestination.x;
    destY = targetDestination.y;
  } else {
    return null;
  }
  const dx = destX - advancingUnit.cxIn,
    dy = destY - advancingUnit.cyIn;
  const distToDest = Math.hypot(dx, dy);
  const actualMove = Math.min(moveDistance, distToDest);
  const moveDirX = distToDest > 0 ? dx / distToDest : 0;
  const moveDirY = distToDest > 0 ? dy / distToDest : 0;
  const futureX = advancingUnit.cxIn + moveDirX * actualMove;
  const futureY = advancingUnit.cyIn + moveDirY * actualMove;
  const tempFutureCluster = {
    ...advancingUnit,
    cxIn: futureX,
    cyIn: futureY,
    models: advancingUnit.models.map((m) => ({
      x: m.x + moveDirX * actualMove,
      y: m.y + moveDirY * actualMove,
    })),
  };
  return getBestShootTarget(tempFutureCluster);
}

/**
 * Finds an advantageous advance position (one that allows a unit to shoot an enemy,
 * but not be in the enemy’s shooting range).
 */
function findAdvantageousAdvancePosition(unit) {
  if (unit.bestRangeIn === 0) return null;
  let bestSpot = null;
  const unitAdvanceDist = getUnitAdvanceDistance(unit);
  const enemies = getEnemySideCache() || [];
  if (!enemies.length) return null;
  enemies.forEach((enemy) => {
    const dx = enemy.cxIn - unit.cxIn,
      dy = enemy.cyIn - unit.cyIn;
    const distToEnemy = Math.hypot(dx, dy);
    if (distToEnemy < 0.1) return;
    for (let fraction = 1.0; fraction >= 0.05; fraction -= 0.05) {
      const moveAmount = Math.min(unitAdvanceDist * fraction, distToEnemy);
      const futureX =
        unit.cxIn + (dx / distToEnemy) * Math.max(0, moveAmount - 0.1);
      const futureY =
        unit.cyIn + (dy / distToEnemy) * Math.max(0, moveAmount - 0.1);
      const futurePos = {
        models: [{ x: futureX, y: futureY }],
        cxIn: futureX,
        cyIn: futureY,
        wIn: unit.wIn,
        hIn: unit.hIn,
        name: "Future Pos",
      };
      const canShoot = isUnitInRangeOfTarget(
        futurePos,
        enemy,
        unit.bestRangeIn
      );
      const enemyCanShoot =
        enemy.bestRangeIn > 0 &&
        isUnitInRangeOfTarget(enemy, futurePos, enemy.bestRangeIn);
      if (canShoot && !enemyCanShoot) {
        if (!bestSpot || moveAmount > bestSpot.dist) {
          bestSpot = {
            x: futureX,
            y: futureY,
            dist: moveAmount,
            reasonSuffix: ` (Adv. Pos vs ${enemy.name})`,
            targetEnemy: enemy,
          };
        }
        break; // For this enemy, found its best move.
      }
    }
  });
  return bestSpot;
}

/**
 * Checks whether a unit can secure an objective with a Rush.
 */
function canSecureObjectiveWithRush(unit, objective) {
  if (!objective) return false;
  const unitRushDistance = getUnitRushDistance(unit);
  const currDist = distance(
    { x: unit.cxIn, y: unit.cyIn },
    { x: objective.x, y: objective.y }
  );
  if (currDist <= unitRushDistance + 3 + unit.wIn / 2) {
    const dx = objective.x - unit.cxIn,
      dy = objective.y - unit.cyIn;
    const L = Math.hypot(dx, dy) || 1;
    const moveAmount = Math.min(unitRushDistance, currDist);
    const futureX = unit.cxIn + (dx / L) * moveAmount;
    const futureY = unit.cyIn + (dy / L) * moveAmount;
    return (
      distance(
        { x: futureX, y: futureY },
        { x: objective.x, y: objective.y }
      ) <=
      3 + Math.max(unit.wIn, unit.hIn) / 2
    );
  }
  return false;
}

/**
 * Checks whether a charge via an enemy would allow securing an objective.
 */
function canSecureObjectiveWithChargeToEnemy(unit, objective, enemy) {
  if (!objective || !enemy) return false;
  const chargeDistance = getUnitChargeRange(unit);
  const dx = enemy.cxIn - unit.cxIn,
    dy = enemy.cyIn - unit.cyIn;
  const currentDist = distance(
    { x: unit.cxIn, y: unit.cyIn },
    { x: enemy.cxIn, y: enemy.cyIn }
  );
  const L = Math.hypot(dx, dy) || 1;
  const moveAmount = Math.min(chargeDistance, currentDist + DIA_IN);
  const futureX = unit.cxIn + (dx / L) * moveAmount;
  const futureY = unit.cyIn + (dy / L) * moveAmount;
  return (
    distance({ x: futureX, y: futureY }, { x: objective.x, y: objective.y }) <=
    3 + Math.max(unit.wIn, unit.hIn) / 2
  );
}

/**
 * Determines if moving toward a target point by moveDist will put the unit
 * into enemy shooting range.
 */
function willEnterEnemyShootingRange(unitCluster, moveDist, targetPoint) {
  if (
    !targetPoint ||
    targetPoint.x === undefined ||
    targetPoint.y === undefined
  )
    return false;
  const dx = targetPoint.x - unitCluster.cxIn,
    dy = targetPoint.y - unitCluster.cyIn;
  const L = Math.hypot(dx, dy) || 1;
  const moveDirX = dx / L,
    moveDirY = dy / L;
  const futurePos = {
    models: [
      {
        x: unitCluster.cxIn + moveDirX * moveDist,
        y: unitCluster.cyIn + moveDirY * moveDist,
      },
    ],
    cxIn: unitCluster.cxIn + moveDirX * moveDist,
    cyIn: unitCluster.cyIn + moveDirY * moveDist,
    wIn: unitCluster.wIn,
    hIn: unitCluster.hIn,
  };
  const enemyUnits = getEnemySideCache() || [];
  return enemyUnits.some(
    (enemy) =>
      enemy.bestRangeIn > 0 &&
      isUnitInRangeOfTarget(enemy, futurePos, enemy.bestRangeIn)
  );
}

/* ================================================
     AI Decision Making
     ================================================ */

/**
 * Determines the next action for a given unit cluster.
 */
function aiDecideUnitAction(unitCluster) {
  // If the unit is shaken, it must idle.
  if (unitCluster.shaken) {
    console.log(
      `[AI Debug] Unit: ${unitCluster.name} is shaken. Idling to recover.`
    );
    return { action: "Idle", target: null, reason: "Shaken unit recovers." };
  }

  let debugLog = `[AI Debug] Unit: ${unitCluster.name} (${unitCluster.type})\n`;
  debugLog = appendLog(
    debugLog,
    `  - Position: (${unitCluster.cxIn.toFixed(1)}, ${unitCluster.cyIn.toFixed(
      1
    )}), Range: ${unitCluster.bestRangeIn}", Charge Range: ${getUnitChargeRange(
      unitCluster
    )}"`
  );
  debugLog = appendLog(
    debugLog,
    `  - Advance Dist: ${getUnitAdvanceDistance(
      unitCluster
    )}", Rush Dist: ${getUnitRushDistance(unitCluster)}"`
  );

  // Determine actionable objectives: not AI-controlled and with no friendly unit nearby.
  const actionableObjectives = objectives.filter(
    (o) =>
      !isObjectiveUnderAIControl(o) &&
      // Either no friendly unit in range,
      (!isFriendlyForceNearObjective(o, currentTurn) ||
        // or if it is contested, then the activated unit should be the only friendly in range.
        isObjectiveContested(o, unitCluster))
  );

  debugLog = appendLog(
    debugLog,
    `  - Actionable objectives (not controlled & no friendly nearby): ${actionableObjectives.length}`
  );

  let actionableNearestObjective = null,
    distToActionableNearestObjective = Infinity;
  if (actionableObjectives.length > 0) {
    const sortedObjs = actionableObjectives
      .map((o) => ({
        obj: o,
        dist: distance(
          { x: unitCluster.cxIn, y: unitCluster.cyIn },
          { x: o.x, y: o.y }
        ),
      }))
      .sort((a, b) => a.dist - b.dist);
    actionableNearestObjective = sortedObjs[0].obj;
    distToActionableNearestObjective = sortedObjs[0].dist;
    debugLog = appendLog(
      debugLog,
      `  - Nearest Objective: (${actionableNearestObjective.x.toFixed(
        1
      )},${actionableNearestObjective.y.toFixed(
        1
      )}) at ${distToActionableNearestObjective.toFixed(1)}"`
    );
  }

  if (
    actionableNearestObjective &&
    isObjectiveContested(actionableNearestObjective, unitCluster)
  ) {
    debugLog = appendLog(
      debugLog,
      "  - Objective contested and unit is the sole friendly; holding position to defend objective."
    );

    console.log(debugLog);
    let decision;

    // For melee units, if a charge candidate exists within 3" of the objective, then charge.
    if (
      unitCluster.type === "melee" ||
      unitCluster.type === "melee-focus" ||
      unitCluster.type === "hybrid"
    ) {
      const chargeCandidate = getBestChargeTarget(unitCluster);
      if (
        chargeCandidate &&
        distance(
          { x: chargeCandidate.cxIn, y: chargeCandidate.cyIn },
          { x: actionableNearestObjective.x, y: actionableNearestObjective.y }
        ) <= 3
      ) {
        decision = {
          action: "Charge",
          target: chargeCandidate,
          reason: "Contested objective; charging enemy within objective range.",
        };
      } else {
        // If none of the above conditions apply, use a default hold decision.
        decision = {
          action: "Hold",
          target: actionableNearestObjective,
          reason: "Contested objective; holding position to defend.",
        };
      }
    }
    // For ranged (or hybrid) units, if the unit can shoot an enemy that is within 3", then hold and shoot.
    if (
      (unitCluster.type === "hybrid" && decision.action != "Charge") ||
      unitCluster.type === "shooting"
    ) {
      const shootCandidate = getBestShootTarget(unitCluster);
      console.log(shootCandidate);
      console.log(
        shootCandidate.name +
          " is " +
          distance(
            { x: shootCandidate.cxIn, y: shootCandidate.cyIn },
            { x: actionableNearestObjective.x, y: actionableNearestObjective.y }
          ) +
          '" away'
      );
      if (
        shootCandidate &&
        distance(
          { x: shootCandidate.cxIn, y: shootCandidate.cyIn },
          { x: actionableNearestObjective.x, y: actionableNearestObjective.y }
        ) <= 3
      ) {
        decision = {
          action: "Hold",
          target: actionableNearestObjective,
          shootTarget: shootCandidate,
          reason:
            "Contested objective; holding position and shooting enemy within objective range.",
        };
      } else {
        // If none of the above conditions apply, use a default hold decision.
        decision = {
          action: "Hold",
          target: actionableNearestObjective,
          reason: "Contested objective; holding position to defend.",
        };
      }
    }
    //console.log("XXX XXX");
    debugLog = appendLog(debugLog, decision.reason);

    //debugLog += " :: " + decision.reason;
    //console.log(debugLog);
    return decision;
  }

  const nearestEnemyInfo = getNearestEnemyUnits(unitCluster)[0];
  debugLog = appendLog(
    debugLog,
    `  - Nearest Enemy: ${
      nearestEnemyInfo
        ? nearestEnemyInfo.unit.name +
          " at " +
          nearestEnemyInfo.dist.toFixed(1) +
          '"'
        : "None"
    }`
  );

  const bestChargeCandidate = getBestChargeTarget(unitCluster);
  const bestShootCandidate = getBestShootTarget(unitCluster);
  const generalNearestEnemy = getNearestEnemyUnits(unitCluster)[0]
    ? getNearestEnemyUnits(unitCluster)[0].unit
    : null;

  // Helper: when there are no objectives.
  function decideActionNoObjective(unit, nearestEnemy) {
    const advantageousPos = findAdvantageousAdvancePosition(unit);
    if (advantageousPos) {
      return {
        action: "Advance",
        target: {
          x: advantageousPos.x,
          y: advantageousPos.y,
          name: `Adv. Pos vs ${advantageousPos.targetEnemy.name}`,
        },
        shootTarget: advantageousPos.targetEnemy,
        reason: `Advancing to gain shooting advantage on ${advantageousPos.targetEnemy.name}.`,
      };
    }
    const unitAdvanceDist = getUnitAdvanceDistance(unit);
    const shootAfterAdvance = getShootTargetAfterAdvance(
      unit,
      unitAdvanceDist,
      nearestEnemy
    );
    if (shootAfterAdvance) {
      return {
        action: "Advance",
        target: nearestEnemy,
        shootTarget: shootAfterAdvance,
        reason: "No objectives: advancing to enemy to secure a shot.",
      };
    }
    return {
      action: "Rush",
      target: nearestEnemy,
      reason: "No objectives: enemy near but no shot available – rushing.",
    };
  }

  let decision = null;

  // Special: if the unit has Relentless and a valid shoot target, always Hold to shoot.
  const isRelentless = unitCluster.unitGroupData.subUnits.some(
    (su) => su.special?.relentless
  );
  if (isRelentless && bestShootCandidate) {
    debugLog = appendLog(
      debugLog,
      `  - Unit is Relentless and has shoot target (${bestShootCandidate.name}).`
    );
    decision = {
      action: "Hold",
      target: bestShootCandidate,
      shootTarget: bestShootCandidate,
      reason: "Relentless unit: Hold and shoot.",
    };
    console.log(debugLog);
    return decision;
  } else if (isRelentless) {
    debugLog = appendLog(
      debugLog,
      `  - Unit is Relentless but no shoot target found; proceeding with normal logic.`
    );
  }

  // Switch decision-making based on unit type.
  switch (unitCluster.type) {
    case "hybrid":
      debugLog = appendLog(debugLog, "  - Type: Hybrid");
      if (actionableNearestObjective) {
        const enemiesOnPath = areEnemiesOnPath(
          unitCluster,
          actionableNearestObjective
        );
        debugLog = appendLog(
          debugLog,
          `    - Enemies ${
            enemiesOnPath ? "detected" : "not detected"
          } on path to objective (${actionableNearestObjective.x.toFixed(
            1
          )},${actionableNearestObjective.y.toFixed(1)}).`
        );
        if (enemiesOnPath) {
          if (bestChargeCandidate) {
            decision = {
              action: "Charge",
              target: bestChargeCandidate,
              reason: "Enemies block objective—charging enemy.",
            };
            break;
          }
          const unitAdvanceDist = getUnitAdvanceDistance(unitCluster);
          const shootAfterAdvance = getShootTargetAfterAdvance(
            unitCluster,
            unitAdvanceDist,
            actionableNearestObjective
          );
          debugLog = appendLog(
            debugLog,
            `    - After advancing ${unitAdvanceDist.toFixed(
              1
            )}" towards objective (blocked), shoot target: ${
              shootAfterAdvance ? shootAfterAdvance.name : "None"
            }.`
          );
          decision = shootAfterAdvance
            ? {
                action: "Advance",
                target: actionableNearestObjective,
                shootTarget: shootAfterAdvance,
                reason: "Advance along blocked path; can shoot enemy.",
              }
            : {
                action: "Rush",
                target: actionableNearestObjective,
                reason:
                  "Advance to objective blocked and no shot; rushing instead.",
              };
          break;
        } else {
          const unitAdvanceDist = getUnitAdvanceDistance(unitCluster);
          if (
            canSecureObjectiveWithRush(
              unitCluster,
              actionableNearestObjective
            ) &&
            distToActionableNearestObjective > unitAdvanceDist
          ) {
            decision = {
              action: "Rush",
              target: actionableNearestObjective,
              reason: "Objective in rush range but not in advance range.",
            };
            break;
          }
          const advantageousPos = findAdvantageousAdvancePosition(unitCluster);
          if (
            advantageousPos &&
            distance(
              { x: advantageousPos.x, y: advantageousPos.y },
              {
                x: actionableNearestObjective.x,
                y: actionableNearestObjective.y,
              }
            ) < distToActionableNearestObjective
          ) {
            decision = {
              action: "Advance",
              target: {
                x: advantageousPos.x,
                y: advantageousPos.y,
                name: `Adv. Pos near Obj (${actionableNearestObjective.x.toFixed(
                  1
                )},${actionableNearestObjective.y.toFixed(1)})`,
              },
              shootTarget: advantageousPos.targetEnemy,
              reason: `Advantageous position found near objective versus ${advantageousPos.targetEnemy.name}.`,
            };
            break;
          }
          const shootAfterAdvance = getShootTargetAfterAdvance(
            unitCluster,
            unitAdvanceDist,
            actionableNearestObjective
          );
          debugLog = appendLog(
            debugLog,
            `    - After advancing ${unitAdvanceDist.toFixed(
              1
            )}" towards clear objective, shoot: ${
              shootAfterAdvance ? shootAfterAdvance.name : "None"
            }.`
          );
          decision = shootAfterAdvance
            ? {
                action: "Advance",
                target: actionableNearestObjective,
                shootTarget: shootAfterAdvance,
                reason: "Clear path to obj: advance and shoot.",
              }
            : {
                action: "Rush",
                target: actionableNearestObjective,
                reason: "Clear path to obj but no shot; rushing to secure it.",
              };
          break;
        }
      } else {
        // No objective available.
        if (bestChargeCandidate) {
          decision = {
            action: "Charge",
            target: bestChargeCandidate,
            reason: "No objective—enemy in charge range.",
          };
          break;
        } else {
          decision = generalNearestEnemy
            ? decideActionNoObjective(unitCluster, generalNearestEnemy)
            : {
                action: "Hold",
                target: null,
                reason: "No enemy and no objective.",
              };
        }
      }
      break;

    case "shooting":
    case "shooting-focus":
      debugLog = appendLog(debugLog, "  - Type: Shooting/Shooting-Focus");
      if (actionableNearestObjective) {
        const advantageousPos = findAdvantageousAdvancePosition(unitCluster);
        if (
          advantageousPos &&
          actionableNearestObjective &&
          distance(
            { x: advantageousPos.x, y: advantageousPos.y },
            { x: actionableNearestObjective.x, y: actionableNearestObjective.y }
          ) < distToActionableNearestObjective
        ) {
          decision = {
            action: "Advance",
            target: {
              x: advantageousPos.x,
              y: advantageousPos.y,
              name: `Adv. Pos near Obj (${actionableNearestObjective.x.toFixed(
                1
              )},${actionableNearestObjective.y.toFixed(1)})`,
            },
            shootTarget: advantageousPos.targetEnemy,
            reason: `Advancing to advantageous position near objective versus ${advantageousPos.targetEnemy.name}.`,
          };
          break;
        }
        const unitAdvanceDist = getUnitAdvanceDistance(unitCluster);
        const shootAfterAdvance = getShootTargetAfterAdvance(
          unitCluster,
          unitAdvanceDist,
          actionableNearestObjective
        );
        debugLog = appendLog(
          debugLog,
          `    - After advancing ${unitAdvanceDist.toFixed(
            1
          )}" toward obj, shoot: ${
            shootAfterAdvance ? shootAfterAdvance.name : "None"
          }.`
        );
        decision = shootAfterAdvance
          ? {
              action: "Advance",
              target: actionableNearestObjective,
              shootTarget: shootAfterAdvance,
              reason: "Advance to objective and shoot.",
            }
          : {
              action: "Rush",
              target: actionableNearestObjective,
              reason:
                "Advance to objective fails to yield shot; rushing instead.",
            };
        break;
      } else {
        decision = generalNearestEnemy
          ? decideActionNoObjective(unitCluster, generalNearestEnemy)
          : {
              action: "Hold",
              target: null,
              reason: "No objective and no enemy.",
            };
      }
      break;

    case "melee":
    case "melee-focus":
      debugLog = appendLog(debugLog, "  - Type: Melee/Melee-Focus");
      if (actionableNearestObjective) {
        const enemiesOnPath = areEnemiesOnPath(
          unitCluster,
          actionableNearestObjective
        );
        const chargeSecures =
          bestChargeCandidate &&
          enemiesOnPath &&
          canSecureObjectiveWithChargeToEnemy(
            unitCluster,
            actionableNearestObjective,
            bestChargeCandidate
          );
        debugLog = appendLog(
          debugLog,
          `    - For objective: Charge candidate: ${
            bestChargeCandidate ? bestChargeCandidate.name : "None"
          }, Enemies on path: ${enemiesOnPath}, Charge secures obj: ${chargeSecures}`
        );
        if (bestChargeCandidate && enemiesOnPath && chargeSecures) {
          decision = {
            action: "Charge",
            target: bestChargeCandidate,
            reason: "Objective blocked and charge secures it.",
          };
          break;
        }
        if (enemiesOnPath) {
          if (bestChargeCandidate) {
            decision = {
              action: "Charge",
              target: bestChargeCandidate,
              reason: "Objective path blocked: charging enemy.",
            };
            break;
          }
          decision = generalNearestEnemy
            ? {
                action: "Rush",
                target: generalNearestEnemy,
                reason: "Objective path blocked, rushing enemy.",
              }
            : {
                action: "Rush",
                target: actionableNearestObjective,
                reason: "Objective blocked (fallback rush).",
              };
          break;
        }
        decision = {
          action: "Rush",
          target: actionableNearestObjective,
          reason: "Objective not blocked; rushing to secure it.",
        };
      } else {
        if (bestChargeCandidate) {
          decision = {
            action: "Charge",
            target: bestChargeCandidate,
            reason: "No objective; enemy is in charge range.",
          };
          break;
        }
        decision = generalNearestEnemy
          ? {
              action: "Rush",
              target: generalNearestEnemy,
              reason: "No objective; rushing enemy.",
            }
          : { action: "Hold", target: null, reason: "No enemy to engage." };
      }
      break;

    default:
      debugLog = appendLog(
        debugLog,
        "  - Default: No specific decision branch reached."
      );
      decision = {
        action: "Hold",
        target: bestShootCandidate,
        shootTarget: bestShootCandidate,
        reason: "Default: Hold and shoot if possible.",
      };
  }

  // Fallback check
  if (!decision) {
    decision = {
      action: "Hold",
      target: bestShootCandidate,
      shootTarget: bestShootCandidate,
      reason: "Default fallback: Hold.",
    };
  }
  console.log(debugLog);
  return decision;
}

/* ===============================================
     Executing the Decided AI Action
     =============================================== */

/**
 * Executes the decided AI action (Advance, Rush, Charge, Hold, Idle).
 */
function aiPerformDecidedAction(unitCluster, decision) {
  return new Promise((resolve) => {
    const { action, target, shootTarget, reason } = decision;
    let message = "";
    switch (action) {
      case "Advance":
        message = `Advance towards ${
          target.name ||
          `Objective (${target.x.toFixed(1)},${target.y.toFixed(1)})`
        }`;
        break;
      case "Rush":
        message = `Rush towards ${
          target.name ||
          `Objective (${target.x.toFixed(1)},${target.y.toFixed(1)})`
        }`;
        break;
      case "Charge":
        message = `Charge -> ${target.name || "Objective"}`;
        break;
      case "Hold":
        message = `Hold`;
        break;
      case "Idle":
        message = `Idle (Recovering)`;
        break;
      default:
        message = `${action} -> ${
          target
            ? target.name ||
              `Objective (${target.x.toFixed(1)},${target.y.toFixed(1)})`
            : ""
        }`;
    }
    showFloatingText(unitCluster, message);
    currentActiveUnit = unitCluster;
    const onActionComplete = () => {
      unitCluster.activated = true;
      unitCluster.lastPerformedAction = action;
      if (action === "Charge" && target && target.models) {
        resolvePostChargeSeparation(unitCluster, target);
      }
      resolve();
    };

    // Execute based on action.
    switch (action) {
      case "Idle":
        unitCluster.shaken = false;
        onActionComplete();
        break;
      case "Hold":
        if (shootTarget) {
          aiExecuteShootAction(unitCluster, shootTarget, action);
        }
        onActionComplete();
        break;
      case "Advance": {
        let advanceMoveDist = getUnitAdvanceDistance(unitCluster);
        let finalTargetCoordsAdvance = { ...target };
        if (
          target &&
          typeof target.x === "number" &&
          typeof target.y === "number" &&
          !target.models
        ) {
          const distToObj = distance(
            { x: unitCluster.cxIn, y: unitCluster.cyIn },
            { x: target.x, y: target.y }
          );
          advanceMoveDist = Math.min(advanceMoveDist, distToObj);
        } else if (target && target.models) {
          const ownRadius = getEffectiveRadius(unitCluster);
          const enemyRadius = getEffectiveRadius(target);
          const requiredGap = ownRadius + enemyRadius + 1.0;
          const actualDist = distance(
            { x: unitCluster.cxIn, y: unitCluster.cyIn },
            { x: target.cxIn, y: target.cyIn }
          );
          if (actualDist > requiredGap) {
            const dirX = (target.cxIn - unitCluster.cxIn) / actualDist;
            const dirY = (target.cyIn - unitCluster.cyIn) / actualDist;
            finalTargetCoordsAdvance.x = target.cxIn - dirX * requiredGap;
            finalTargetCoordsAdvance.y = target.cyIn - dirY * requiredGap;
            const adjustedDist = distance(
              { x: unitCluster.cxIn, y: unitCluster.cyIn },
              finalTargetCoordsAdvance
            );
            advanceMoveDist = Math.min(advanceMoveDist, adjustedDist);
          } else {
            advanceMoveDist = 0;
          }
        }
        animateUnitMovement(
          unitCluster,
          finalTargetCoordsAdvance,
          advanceMoveDist,
          () => {
            if (shootTarget || (target && target.models)) {
              const finalShootTarget =
                shootTarget || (target.models ? target : null);
              if (finalShootTarget) {
                aiExecuteShootAction(unitCluster, finalShootTarget);
              }
            }
            onActionComplete();
          }
        );
        break;
      }
      case "Rush": {
        let rushMoveDist = getUnitRushDistance(unitCluster);
        let finalTargetCoordsRush = { ...target };
        if (
          target &&
          typeof target.x === "number" &&
          typeof target.y === "number" &&
          !target.models
        ) {
          const distToObj = distance(
            { x: unitCluster.cxIn, y: unitCluster.cyIn },
            { x: target.x, y: target.y }
          );
          rushMoveDist = Math.min(rushMoveDist, distToObj);
        } else if (target && target.models) {
          const ownRadius = getEffectiveRadius(unitCluster);
          const enemyRadius = getEffectiveRadius(target);
          const requiredGap = ownRadius + enemyRadius + 1.0;
          const actualDist = distance(
            { x: unitCluster.cxIn, y: unitCluster.cyIn },
            { x: target.cxIn, y: target.cyIn }
          );
          if (actualDist > requiredGap) {
            const dirX = (target.cxIn - unitCluster.cxIn) / actualDist;
            const dirY = (target.cyIn - unitCluster.cyIn) / actualDist;
            finalTargetCoordsRush.x = target.cxIn - dirX * requiredGap;
            finalTargetCoordsRush.y = target.cyIn - dirY * requiredGap;
            const adjustedDist = distance(
              { x: unitCluster.cxIn, y: unitCluster.cyIn },
              finalTargetCoordsRush
            );
            rushMoveDist = Math.min(rushMoveDist, adjustedDist);
          } else {
            rushMoveDist = 0;
          }
        }
        animateUnitMovement(
          unitCluster,
          finalTargetCoordsRush,
          rushMoveDist,
          onActionComplete
        );
        break;
      }
      case "Charge": {
        let chargeMoveDist = getUnitChargeRange(unitCluster);
        let finalTargetCoordsCharge = { ...target };
        if (target && target.models) {
          const chargerRadius = getEffectiveRadius(unitCluster);
          const targetRadius = getEffectiveRadius(target);
          const idealStoppingDist = chargerRadius + targetRadius;
          const actualDist = distance(
            { x: unitCluster.cxIn, y: unitCluster.cyIn },
            { x: target.cxIn, y: target.cyIn }
          );
          if (actualDist > 0) {
            const dirX = (target.cxIn - unitCluster.cxIn) / actualDist;
            const dirY = (target.cyIn - unitCluster.cyIn) / actualDist;
            finalTargetCoordsCharge.x = target.cxIn - dirX * targetRadius;
            finalTargetCoordsCharge.y = target.cyIn - dirY * targetRadius;
          } else {
            finalTargetCoordsCharge = {
              x: unitCluster.cxIn,
              y: unitCluster.cyIn,
            };
          }
          const distEdge = Math.max(0, actualDist - idealStoppingDist);
          chargeMoveDist = Math.min(distEdge, chargeMoveDist);
        }
        animateUnitMovement(
          unitCluster,
          finalTargetCoordsCharge,
          chargeMoveDist,
          () => {
            if (target && target.name) {
              aiExecuteMeleeAction(unitCluster, target, action);
            }
            onActionComplete();
          }
        );
        break;
      }
      default:
        showFloatingText(unitCluster, `Unknown action: ${action}`);
        onActionComplete();
    }
  });
}

/* ===============================================
     Unit Activation & Turn Finalization
     =============================================== */

/**
 * Selects and activates one eligible unit for the current side.
 */
function activateSingleUnitForCurrentSide() {
  const aiUnits = getAISideCache();
  if (!aiUnits || aiUnits.length === 0) {
    showFloatingText(
      null,
      `${currentTurn} has no units to activate this turn.`
    );
    return null;
  }
  // Prefer non-shaken units.
  let candidates = aiUnits.filter((u) => !u.activated && !u.shaken);
  let activatingShaken = false;
  if (candidates.length === 0) {
    console.log("All non-shaken units activated; trying shaken ones.");
    candidates = aiUnits.filter((u) => !u.activated && u.shaken);
    activatingShaken = true;
  }
  if (candidates.length === 0) {
    showFloatingText(
      null,
      `${currentTurn} has no more units to activate this round.`
    );
    return null;
  }
  // Divide units into three sections based on their x-position.
  const sectionWidth = ZONE_W_IN / 3;
  const sections = [[], [], []];
  candidates.forEach((u) => {
    if (typeof u.cxIn !== "number" || isNaN(u.cxIn)) {
      console.error(
        `Error: Unit ${u.name} has invalid cxIn: ${u.cxIn}. Skipping.`
      );
      return;
    }
    let ix = Math.floor(u.cxIn / sectionWidth);
    ix = Math.max(0, Math.min(2, ix));
    sections[ix].push(u);
  });
  let chosenSection = rollD3() - 1;
  let sectionUnits = sections[chosenSection];
  if (sectionUnits.length === 0) {
    for (let i = 1; i < 3; i++) {
      const nextSection = (chosenSection + i) % 3;
      if (sections[nextSection].length > 0) {
        chosenSection = nextSection;
        sectionUnits = sections[nextSection];
        break;
      }
    }
  }
  if (sectionUnits.length === 0) {
    showFloatingText(
      null,
      `Error: No units available for activation for ${currentTurn}.`
    );
    return null;
  }
  // Randomly choose one unit from the section.
  let unitToActivate = null;
  let attempts = 0,
    MAX_ATTEMPTS = 10;
  do {
    unitToActivate =
      sectionUnits[Math.floor(Math.random() * sectionUnits.length)];
    attempts++;
  } while (
    (unitToActivate.activated ||
      (unitToActivate.shaken && !activatingShaken)) &&
    attempts < MAX_ATTEMPTS
  );
  if (
    !unitToActivate ||
    unitToActivate.activated ||
    (unitToActivate.shaken && !activatingShaken)
  ) {
    showFloatingText(
      null,
      `Error: Could not select an eligible unit after ${MAX_ATTEMPTS} attempts for ${currentTurn}.`
    );
    return null;
  }
  const decision = activatingShaken
    ? { action: "Idle", reason: "Shaken unit recovers." }
    : aiDecideUnitAction(unitToActivate);
  return aiPerformDecidedAction(unitToActivate, decision);
}

/**
 * Finalizes the AI turn by updating objectives, switching turns, and resetting state as needed.
 */
function finalizeAITurn() {
  updateObjectiveControlAtTurnEnd(); // from game_core_logic.js
  const finishedPlayer = currentTurn;
  const currentCache = getAISideCache();
  const opponentCache = getEnemySideCache();
  const currentDone = currentCache.every((u) => u.activated);
  const opponentDone = opponentCache.every((u) => u.activated);
  let roundOver = false;
  if (currentDone) {
    if (playerWhoFinishedLastRoundFirst === null) {
      playerWhoFinishedLastRoundFirst = finishedPlayer;
    }
    if (opponentDone) {
      roundOver = true;
      currentRound++;
      displayRoundMessage(`Round ${currentRound} Starting`);
      clusterCache.attackers.forEach((u) => {
        u.activated = false;
        u.hasFoughtInMeleeThisRound = false;
      });
      clusterCache.defenders.forEach((u) => {
        u.activated = false;
        u.hasFoughtInMeleeThisRound = false;
      });
      currentTurn =
        playerWhoFinishedLastRoundFirst || playerWhoStartedCurrentRound;
      playerWhoStartedCurrentRound = currentTurn;
      playerWhoFinishedLastRoundFirst = null;
    } else {
      currentTurn = finishedPlayer === "attackers" ? "defenders" : "attackers";
    }
  } else {
    currentTurn = finishedPlayer === "attackers" ? "defenders" : "attackers";
  }
  currentActiveUnit = null;
  renderGameScreen();
  let turnMsg = `--- End of ${finishedPlayer}'s activation. `;
  turnMsg += roundOver
    ? `Round ${currentRound} begins. Now ${currentTurn}'s turn. ---`
    : `Now ${currentTurn}'s turn. ---`;
  showFloatingText(null, turnMsg);
  $("#aiButton").text(`Activate unit`);
}

/**
 * Plays a full round with alternating activations until all units on both sides have acted.
 */
async function playFullRoundAlternating() {
  const initialRound = currentRound;
  showFloatingText(null, `--- Playing Full Round ${initialRound} ---`);
  while (currentRound === initialRound) {
    const anyUnitLeft =
      clusterCache.attackers.some((u) => !u.activated) ||
      clusterCache.defenders.some((u) => !u.activated);
    if (
      !anyUnitLeft &&
      !(
        clusterCache.attackers.every((u) => u.shaken) &&
        clusterCache.defenders.every((u) => u.shaken)
      )
    ) {
      if (
        clusterCache.attackers.every((u) => u.activated || u.shaken) &&
        clusterCache.defenders.every((u) => u.activated || u.shaken)
      ) {
        finalizeAITurn();
        if (currentRound === initialRound) {
          console.warn(
            "playFullRoundAlternating: Stuck in round; forcing break."
          );
          break;
        }
      }
    }
    const actionPromise = activateSingleUnitForCurrentSide();
    if (actionPromise) {
      await actionPromise;
      if (currentActiveUnit && currentActiveUnit.lastPerformedAction) {
        appendToCombatLog(
          `--- ${
            currentActiveUnit.name
          } finished ${currentActiveUnit.lastPerformedAction.toUpperCase()} ---`
        );
      }
      finalizeAITurn();
    } else {
      finalizeAITurn();
    }
    // Optional delay for pacing:
    // await new Promise(resolve => setTimeout(resolve, 50));
  }
  showFloatingText(
    null,
    `--- Full Round ${initialRound} Completed. Next round is ${currentRound}. ---`
  );
}

/**
 * Plays a full round of the game.
 */
async function playFullRound() {
  return playFullRoundAlternating();
}
