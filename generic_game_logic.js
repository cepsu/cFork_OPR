// --------------------------------------------------------------------------
// CORE LOGIC
// This file contains functions related to fundamental game mechanics,
// such as morale tests, wound application, objective state updates,
// and general unit stat calculations.
// --------------------------------------------------------------------------

/**
 * Checks if any friendly non-shaken unit of the given side is near the objective.
 * "Near" means any part of the unit's base is within 3" of the objective marker.
 * @param {Objective} objective - The objective to check.
 * @param {string} side - The friendly side ('attackers' or 'defenders').
 * @returns {boolean} True if a friendly unit is near, false otherwise.
 */
function isAnyFriendlyUnitNearObjective(objective, side) {
  const friendlyCache =
    side === "attackers" ? clusterCache.attackers : clusterCache.defenders;
  if (!friendlyCache || friendlyCache.length === 0) {
    return false;
  }
  return friendlyCache.some(
    (unitCluster) =>
      !unitCluster.shaken && isUnitNearPoint(unitCluster, objective, 3)
  );
}

/**
 * Checks if a game objective is controlled by the AI.
 * @param {Objective} objective - The objective to check.
 * @returns {boolean} True if AI controls the objective.
 */
function isObjectiveUnderAIControl(objective) {
  // Rule: "Shaken units [...] can’t contest or seize objectives."
  // So, when checking for control, shaken units on either side don't count.
  const aiUnitsCache = getAISideCache(); // Assuming getAISideCache is available globally or imported
  const enemyUnitsCache = getEnemySideCache(); // Assuming getEnemySideCache is available globally or imported

  const aiUnitsOnObjective = (aiUnitsCache || []).filter(
    (c) => !c.shaken && isUnitNearPoint(c, objective, 3)
  ).length;
  const enemyUnitsOnObjective = (enemyUnitsCache || []).filter(
    (c) => !c.shaken && isUnitNearPoint(c, objective, 3)
  ).length;
  // Rule: "objectives count as under the AI’s control if the AI already seized them,
  // or if more non-shaken AI units than enemy units are within 3” of it."
  if (objective.controller === currentTurn) return true; // AI already seized it
  if (objective.controller && objective.controller !== null) return false; // Opponent seized it

  return aiUnitsOnObjective > enemyUnitsOnObjective;
}

/**
 * Checks if any model in the target unit is within the specified range of any model in the acting unit.
 * @param {Object} actingUnitCluster - The unit performing the check.
 * @param {Object} targetUnitCluster - The unit being checked against.
 * @param {number} rangeInches - The range to check.
 * @returns {boolean} True if the target is in range.
 */
function isUnitInRangeOfTarget(
  actingUnitCluster,
  targetUnitCluster,
  rangeInches
) {
  return actingUnitCluster.models.some((m1) =>
    targetUnitCluster.models.some(
      (m2) => Math.hypot(m1.x - m2.x, m1.y - m2.y) <= rangeInches
    )
  );
}

/**
 * A generalized helper to calculate a unit's move distance based on type and rules.
 * @param {Object} unitCluster - The AI unit cluster.
 * @param {'charge' | 'rush' | 'advance'} moveType - The type of movement.
 * @returns {number} The calculated move distance in inches.
 */
function getUnitMoveValue(unitCluster, moveType) {
  const firstSubUnit = unitCluster.unitGroupData?.subUnits?.[0];
  let baseDist, modifier;

  switch (moveType) {
    case "charge":
      baseDist = 12;
      modifier = 4;
      break;
    case "rush":
      baseDist = 12;
      modifier = 4;
      break;
    case "advance":
      baseDist = 6;
      modifier = 2;
      break;
    default:
      return 0;
  }

  if (!firstSubUnit) return baseDist;

  const keywords = (firstSubUnit.keywords || []).map((k) =>
    String(k).toLowerCase()
  );
  const special = firstSubUnit.special || {};

  let distance = baseDist;
  if (keywords.includes("fast") || special.fast) distance += modifier;
  if (keywords.includes("slow") || special.slow) distance -= modifier;

  return Math.max(0, distance);
}

/**
 * Gets the charge range of a unit based on its keywords.
 * Assumes unitCluster.unitGroupData.subUnits[0].keywords exists.
 * @param {Object} unitCluster - The AI unit cluster.
 * @returns {number} Charge range in inches.
 */
function getUnitChargeRange(unitCluster) {
  // Access keywords from the stored unitGroupData
  return getUnitMoveValue(unitCluster, "charge");
}

/**
 * Gets the effective advance distance of a unit based on its keywords.
 * @param {Object} unitCluster - The AI unit cluster.
 * @returns {number} Advance distance in inches.
 */
function getUnitAdvanceDistance(unitCluster) {
  return getUnitMoveValue(unitCluster, "advance");
}

/**
 * Gets the effective rush distance of a unit based on its keywords.
 * @param {Object} unitCluster - The AI unit cluster.
 * @returns {number} Rush distance in inches.
 */
function getUnitRushDistance(unitCluster) {
  return getUnitMoveValue(unitCluster, "rush");
}

/**
 * Performs a morale test for a unit, applying rules like Fearless and Hold the Line.
 * @param {Object} unitCluster - The unit taking the test.
 * @param {string} reasonForTest - The reason for the test, for logging.
 * @param {boolean} isMeleeTest - True if this is a morale test for losing melee combat.
 */
function performMoraleTest(
  unitCluster,
  reasonForTest = "due to game rule",
  isMeleeTest = false
) {
  if (!unitCluster || unitCluster.currentModels <= 0) {
    return; // Unit is destroyed or invalid, no morale test
  }

  appendToCombatLog(
    `--- ${unitCluster.name} must take a Morale Test (${reasonForTest}) ---`
  );

  let testFailedInitially = false; // Indicates if the primary test (roll or auto-fail) was failed
  let roll = null; // Initialize roll for logging

  // Rule: Already shaken units auto-fail morale without rolling.
  if (unitCluster.shaken) {
    appendToCombatLog(
      `  ${unitCluster.name} is already Shaken and automatically fails this Morale Test.`
    );
    testFailedInitially = true;
    const side = clusterCache.attackers.some((c) => c.id === unitCluster.id)
      ? "attackers"
      : "defenders";

    clusterCache[side] = clusterCache[side].filter(
      (c) => c.id !== unitCluster.id
    );

    unitCluster.currentModels = 0; // Ensure model count is zeroed out
  } else {
    // Determine Quality for the test.
    let qualityToTest = 6; // Default value.
    if (unitCluster.unitGroupData?.subUnits?.[0]) {
      qualityToTest = unitCluster.unitGroupData.subUnits[0].quality;
    }

    roll = rollDie();
    const passed = roll === 6 || (roll > 1 && roll >= qualityToTest);

    if (passed) {
      appendToCombatLog(
        `  Morale Test (Q${qualityToTest}+): Rolled ${roll}. PASSED!`
      );
      showFloatingText(
        unitCluster,
        `Morale: Passed (Rolled ${roll} vs Q${qualityToTest}+)`
      );
    } else {
      appendToCombatLog(
        `  Morale Test (Q${qualityToTest}+): Rolled ${roll}. FAILED!`
      );
      testFailedInitially = true;
    }
  }

  let finalTestOutcomeIsFailure = testFailedInitially;

  if (testFailedInitially) {
    // Check Fearless rule.
    let unitIsFearless = false;
    if (unitCluster.unitGroupData && unitCluster.unitGroupData.subUnits) {
      let fearlessModelsCount = 0;
      unitCluster.unitGroupData.subUnits.forEach((su) => {
        if (su.special && su.special.fearless) {
          fearlessModelsCount += su.models;
        }
      });
      if (fearlessModelsCount > unitCluster.totalModels / 2) {
        unitIsFearless = true;
      }
    }

    if (unitIsFearless) {
      appendToCombatLog(
        `  Unit has Fearless. Rolling to ignore failed morale test (4+)...`
      );
      const fearlessRoll = rollDie();
      if (fearlessRoll >= 4) {
        appendToCombatLog(
          `  Fearless roll: ${fearlessRoll}. PASSED! The morale test is now considered passed.`
        );
        showFloatingText(
          unitCluster,
          `Fearless Save! (Rolled ${fearlessRoll})`
        );
        finalTestOutcomeIsFailure = false;
      } else {
        appendToCombatLog(
          `  Fearless roll: ${fearlessRoll}. FAILED. The morale test remains failed.`
        );
      }
    }

    // If still failed, check for Hold the Line / Robot.
    if (finalTestOutcomeIsFailure) {
      let unitHasHoldTheLine = false;
      let activeRobotSubUnitsCount = 0;
      let totalActiveSubUnits = 0;

      if (unitCluster.subUnitStates) {
        unitCluster.subUnitStates.forEach((sus) => {
          if (sus.currentModelsInSubUnit > 0) {
            totalActiveSubUnits++;
            if (
              sus.originalSubUnitData.special &&
              sus.originalSubUnitData.special.holdTheLine
            ) {
              unitHasHoldTheLine = true;
            }
            if (
              sus.originalSubUnitData.special &&
              sus.originalSubUnitData.special.robot
            ) {
              activeRobotSubUnitsCount++;
            }
          }
        });
      }

      if (
        unitHasHoldTheLine ||
        (totalActiveSubUnits > 0 &&
          activeRobotSubUnitsCount > totalActiveSubUnits / 2)
      ) {
        unitHasHoldTheLine = true;
      } else {
        unitHasHoldTheLine = false;
      }

      if (unitHasHoldTheLine) {
        appendToCombatLog(
          `  Unit has Hold the Line / Robot! The morale test counts as PASSED.`
        );
        showFloatingText(unitCluster, `Hold the Line! Test Passed.`);
        finalTestOutcomeIsFailure = false;

        let woundsToDestroyUnit = 0;
        if (unitCluster.subUnitStates) {
          unitCluster.subUnitStates.forEach((sus) => {
            if (sus.currentModelsInSubUnit > 0) {
              woundsToDestroyUnit +=
                sus.woundsPerModel - sus.woundsOnCurrentModelInSubUnit;
              if (sus.currentModelsInSubUnit > 1) {
                woundsToDestroyUnit +=
                  (sus.currentModelsInSubUnit - 1) * sus.woundsPerModel;
              }
            }
          });
        }
        appendToCombatLog(
          `  Calculating wounds to destroy: ${woundsToDestroyUnit}. Rolling ${woundsToDestroyUnit} dice (1-3 = 1 wound)...`
        );
        let damageFromHtL = 0;
        const htlRolls = [];
        for (let i = 0; i < woundsToDestroyUnit; i++) {
          const htlRoll = rollDie();
          htlRolls.push(htlRoll);
          if (htlRoll <= 3) damageFromHtL++;
        }
        appendToCombatLog(
          `  Hold the Line rolls: [${htlRolls.join(
            ", "
          )}]. Unit takes ${damageFromHtL} wounds.`
        );
        showFloatingText(unitCluster, `HtL Damage: ${damageFromHtL}`);
        if (damageFromHtL > 0) {
          applyWoundsToCluster(unitCluster, damageFromHtL);
        }
      }
    }
  }

  // Apply final outcome.
  if (finalTestOutcomeIsFailure) {
    if (isMeleeTest) {
      const initialTotalModels = unitCluster.totalModels;
      let isHalfStrengthOrLess = false;
      if (unitCluster.currentModels <= initialTotalModels / 2) {
        isHalfStrengthOrLess = true;
      } else if (unitCluster.currentModels === 1) {
        const singleSubUnitState = unitCluster.subUnitStates.find(
          (sus) => sus.currentModelsInSubUnit > 0
        );
        if (
          singleSubUnitState &&
          singleSubUnitState.woundsOnCurrentModelInSubUnit >=
            singleSubUnitState.woundsPerModel / 2
        ) {
          isHalfStrengthOrLess = true;
        }
      }

      if (isHalfStrengthOrLess) {
        appendToCombatLog(
          `  Unit is at half strength or less and failed melee morale. ROUTED!`
        );
        showFloatingText(
          unitCluster,
          `MORALE FAILED (Rolled ${roll !== null ? roll : "Auto"}) -> ROUTED!`
        );
        const side = clusterCache.attackers.some((c) => c.id === unitCluster.id)
          ? "attackers"
          : "defenders";
        clusterCache[side] = clusterCache[side].filter(
          (c) => c.id !== unitCluster.id
        );
        unitCluster.currentModels = 0;
      } else {
        appendToCombatLog(
          `  Unit failed melee morale but retains over half its strength. It is now SHAKEN.`
        );
        unitCluster.shaken = true;
        showFloatingText(
          unitCluster,
          `MORALE FAILED (Rolled ${roll !== null ? roll : "Auto"}) -> SHAKEN!`
        );
      }
    } else {
      appendToCombatLog(`  Unit failed morale and is now SHAKEN.`);
      unitCluster.shaken = true;
      showFloatingText(
        unitCluster,
        `MORALE FAILED (Rolled ${roll !== null ? roll : "Auto"}) -> SHAKEN!`
      );
    }
    renderGameScreen();
  }
}

/**
 * Applies wound packets to a target cluster, handling Tough, hero status, and model removal.
 * @param {Object} targetCluster - The unit cluster taking wounds.
 * @param {number[] | number} packets - An array of wound packets or a single number for total 1-wound hits.
 * @returns {{modelsKilledCount: number, log: string[]}} Summary of the result.
 */
function applyWoundsToCluster(targetCluster, packets) {
  let modelsKilled = 0;
  const log = [];
  const woundPackets = Array.isArray(packets)
    ? packets
    : Array(packets).fill(1);

  const allocation = [
    ...targetCluster.subUnitStates
      .filter((s) => !s.isHeroSubUnit && s.currentModelsInSubUnit > 0)
      .sort((a, b) => a.woundsPerModel - b.woundsPerModel),
    ...targetCluster.subUnitStates
      .filter((s) => s.isHeroSubUnit && s.currentModelsInSubUnit > 0)
      .sort((a, b) => a.woundsPerModel - b.woundsPerModel),
  ];

  woundPackets.forEach((packet, idx) => {
    for (const sus of allocation) {
      if (sus.currentModelsInSubUnit <= 0) continue;
      const remainingHP =
        sus.woundsPerModel - sus.woundsOnCurrentModelInSubUnit;
      if (packet >= remainingHP) {
        modelsKilled++;
        targetCluster.currentModels--;
        sus.currentModelsInSubUnit--;
        sus.woundsOnCurrentModelInSubUnit = 0;
        log.push(
          `  Packet#${idx + 1}: ${packet} → ${
            sus.originalSubUnitData.name
          } model killed`
        );
      } else {
        sus.woundsOnCurrentModelInSubUnit += packet;
        log.push(
          `  Packet#${idx + 1}: ${packet} → applied to ${
            sus.originalSubUnitData.name
          }, now ${sus.woundsOnCurrentModelInSubUnit}/${sus.woundsPerModel}`
        );
      }
      if (
        sus.originalSubUnitData.models > 1 &&
        sus.currentModelsInSubUnit < sus.originalSubUnitData.models
      ) {
        sus.effectiveWeapons = getUpdatedWeaponLoadoutForSubUnit(sus);
      }
      break;
    }
  });

  targetCluster.subUnitStates.forEach((sus) => {
    if (sus.currentModelsInSubUnit === 0) {
      log.push(`  Sub-unit ${sus.originalSubUnitData.name} wiped out`);
    }
  });

  targetCluster.currentModels = Math.max(0, targetCluster.currentModels);
  if (targetCluster.currentModels > 0) {
    updateClusterCircles(targetCluster);
  }

  return { modelsKilledCount: modelsKilled, log };
}

/**
 * Displays a large message in the center of the game canvas that fades out.
 * @param {string} message - The message to display.
 */
function displayRoundMessage(message) {
  roundMessageInfo = {
    text: message,
    alpha: 1.0,
    startTime: Date.now(),
  };
  renderGameScreen();

  setTimeout(() => {
    if (roundMessageInfo && roundMessageInfo.text === message) {
      const fadeInterval = setInterval(() => {
        if (!roundMessageInfo) {
          clearInterval(fadeInterval);
          return;
        }
        roundMessageInfo.alpha -= 0.05;
        if (roundMessageInfo.alpha <= 0) {
          roundMessageInfo = null;
          clearInterval(fadeInterval);
        }
        renderGameScreen();
      }, 50);
    }
  }, 1500);
}

/**
 * Updates the controller status of all objectives based on unit presence at the end of a turn.
 */
function updateObjectiveControlAtTurnEnd() {
  objectives.forEach((obj) => {
    const attackerUnitsNear =
      clusterCache.attackers.filter(
        (u) => !u.shaken && isUnitNearPoint(u, obj, 3)
      ).length > 0;
    const defenderUnitsNear =
      clusterCache.defenders.filter(
        (u) => !u.shaken && isUnitNearPoint(u, obj, 3)
      ).length > 0;

    let newController = obj.controller;

    if (attackerUnitsNear && !defenderUnitsNear) {
      if (obj.controller !== "attackers") {
        newController = "attackers";
      }
    } else if (defenderUnitsNear && !attackerUnitsNear) {
      if (obj.controller !== "defenders") {
        newController = "defenders";
      }
    } else if (attackerUnitsNear && defenderUnitsNear) {
      if (obj.controller !== null) {
        newController = null;
      }
    }
    obj.controller = newController;
  });
}
