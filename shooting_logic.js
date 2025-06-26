// --------------------------------------------------------------------------
// SHOOTING ACTION LOGIC
// This file contains the high-level function for orchestrating a
// shooting action.
// --------------------------------------------------------------------------

/**
 * Executes a shooting action from one unit to another.
 * @param {Object} shootingUnitCluster - The unit performing the shooting.
 * @param {Object} targetUnitCluster - The unit being shot at.
 * @param {Object} actionContext - The context of the action (e.g., { isHold: true }).
 */
function aiExecuteShootAction(
  shootingUnitCluster,
  targetUnitCluster,
  actionContext
) {
  if (
    !shootingUnitCluster ||
    !targetUnitCluster ||
    !shootingUnitCluster.unitGroupData ||
    shootingUnitCluster.unitGroupData.subUnits.length === 0
  ) {
    showFloatingText(
      shootingUnitCluster,
      `${
        shootingUnitCluster?.name || "Shooter"
      } cannot perform shoot action (missing data).`
    );
    return;
  }
  let defenderSubUnit;
  if (targetUnitCluster.unitGroupData.subUnits.length > 1) {
    defenderSubUnit =
      targetUnitCluster.unitGroupData.subUnits[
        targetUnitCluster.unitGroupData.subUnits.length - 1
      ];
  } else if (targetUnitCluster.unitGroupData.subUnits.length === 1) {
    defenderSubUnit = targetUnitCluster.unitGroupData.subUnits[0];
  } else {
    showFloatingText(
      shootingUnitCluster,
      `Target ${targetUnitCluster.name} has no sub-units to be targeted.`
    );
    return;
  }

  if (!defenderSubUnit) {
    showFloatingText(
      shootingUnitCluster,
      `Target ${targetUnitCluster.name} has no valid sub-unit to be targeted.`
    );
    return;
  }

  const isTargetInCover = targetUnitCluster.isInCover || false;
  let defenderSubUnitForSaveRolls = defenderSubUnit;
  const heroInDefender = targetUnitCluster.subUnitStates.find(
    (sus) => sus.isHeroSubUnit && sus.currentModelsInSubUnit > 0
  );
  const otherModelsInDefender = targetUnitCluster.subUnitStates.some(
    (sus) => !sus.isHeroSubUnit && sus.currentModelsInSubUnit > 0
  );

  if (heroInDefender && otherModelsInDefender) {
    const firstNonHeroSubUnitState = targetUnitCluster.subUnitStates.find(
      (sus) => !sus.isHeroSubUnit && sus.currentModelsInSubUnit > 0
    );
    if (firstNonHeroSubUnitState) {
      defenderSubUnitForSaveRolls =
        firstNonHeroSubUnitState.originalSubUnitData;
    }
  }

  const activationAttackLogs = [];
  let totalDamageToApplyToCluster = [];
  const allShootableWeaponsFromCluster = [];

  shootingUnitCluster.unitGroupData.subUnits.forEach(
    (currentShootingSubUnit) => {
      const subUnitState = shootingUnitCluster.subUnitStates.find(
        (s) =>
          s.originalSubUnitData.name === currentShootingSubUnit.name &&
          s.id.startsWith(shootingUnitCluster.id)
      );
      const weaponsToUse =
        subUnitState && subUnitState.effectiveWeapons
          ? subUnitState.effectiveWeapons
          : currentShootingSubUnit.weapons;

      if (weaponsToUse) {
        weaponsToUse.forEach((weapon) => {
          if (
            weapon.range > 0 &&
            isUnitInRangeOfTarget(
              shootingUnitCluster,
              targetUnitCluster,
              weapon.range
            )
          ) {
            allShootableWeaponsFromCluster.push({
              subUnit: currentShootingSubUnit,
              weapon: weapon,
            });
          }
        });
      }
    }
  );

  if (allShootableWeaponsFromCluster.length === 0) {
    showFloatingText(
      shootingUnitCluster,
      `${shootingUnitCluster.name} has no weapons in range of ${targetUnitCluster.name}.`
    );
    appendToCombatLog(
      `${shootingUnitCluster.name} dealt a total of 0 damage this activation.`
    );
    return;
  }

  allShootableWeaponsFromCluster.forEach((item, index) => {
    const { subUnit, weapon } = item;
    const attackResult = gameRollAttackSequence(
      subUnit,
      weapon,
      defenderSubUnitForSaveRolls,
      targetUnitCluster.name,
      targetUnitCluster.currentModels,
      actionContext,
      isTargetInCover,
      false, // isAttackerFatigued is false for shooting
      shootingUnitCluster.unitGroupData
    );
    activationAttackLogs.push(...attackResult.log);
    if (attackResult.woundPackets) {
      totalDamageToApplyToCluster.push(...attackResult.woundPackets);
    }
    if (index < allShootableWeaponsFromCluster.length - 1) {
      activationAttackLogs.push("   ");
    }
  });

  if (allShootableWeaponsFromCluster.length > 0) {
    let finalMessage = `${shootingUnitCluster.name} shoots at ${targetUnitCluster.name}:\n`;
    finalMessage += activationAttackLogs.join("\n");
    appendToCombatLog(finalMessage);

    if (totalDamageToApplyToCluster.length > 0) {
      const woundApplicationResult = applyWoundsToCluster(
        targetUnitCluster,
        totalDamageToApplyToCluster
      );
      if (woundApplicationResult.modelsKilledCount > 0) {
        appendToCombatLog(
          `  ${targetUnitCluster.name} lost ${woundApplicationResult.modelsKilledCount} models.`
        );
      }

      if (
        targetUnitCluster.currentModels > 0 &&
        totalDamageToApplyToCluster.length > 0
      ) {
        let reportedSubUnit = targetUnitCluster.subUnitStates.find(
          (sus) => sus.currentModelsInSubUnit > 0
        );
        if (reportedSubUnit) {
          appendToCombatLog(
            `  Current model in ${reportedSubUnit.originalSubUnitData.name} (Tough ${reportedSubUnit.woundsPerModel}) has ${reportedSubUnit.woundsOnCurrentModelInSubUnit} wounds.`
          );
        }
      }
      const summaryWoundMessage = `${targetUnitCluster.name} now has ${targetUnitCluster.currentModels}/${targetUnitCluster.totalModels} models remaining.`;
      showFloatingText(targetUnitCluster, summaryWoundMessage);
      appendToCombatLog(summaryWoundMessage);

      if (targetUnitCluster.currentModels <= 0) {
        showFloatingText(
          targetUnitCluster,
          `${targetUnitCluster.name} DESTROYED!`
        );
        appendToCombatLog(`${targetUnitCluster.name} DESTROYED!`);
        const enemySide =
          currentTurn === "attackers" ? "defenders" : "attackers";
        clusterCache[enemySide] = clusterCache[enemySide].filter(
          (c) => c.id !== targetUnitCluster.id
        );
      } else {
        const initialModels = targetUnitCluster.totalModels;
        let needsCasualtyMoraleTest = false;
        if (initialModels > 1) {
          if (targetUnitCluster.currentModels <= initialModels / 2) {
            needsCasualtyMoraleTest = true;
          }
        } else {
          const subUnitState = targetUnitCluster.subUnitStates.find(
            (sus) => sus.currentModelsInSubUnit > 0
          );
          if (subUnitState) {
            const toughValue = subUnitState.woundsPerModel;
            const remainingHP =
              toughValue - subUnitState.woundsOnCurrentModelInSubUnit;
            if (remainingHP <= toughValue / 2) {
              needsCasualtyMoraleTest = true;
            }
          }
        }
        if (needsCasualtyMoraleTest) {
          performMoraleTest(
            targetUnitCluster,
            "due to taking heavy casualties from shooting",
            false
          );
        }
      }
    } else {
      appendToCombatLog(`  No damage inflicted on ${targetUnitCluster.name}.`);
    }
  }
}
