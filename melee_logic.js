// --------------------------------------------------------------------------
// MELEE ACTION LOGIC
// This file contains high-level functions for orchestrating a full
// melee combat exchange, including strikes, counter-strikes, and
// post-charge resolution.
// --------------------------------------------------------------------------

/**
 * Executes a full melee combat exchange between two units.
 * @param {Object} attackerCluster - The unit initiating the melee (the charger).
 * @param {Object} defenderCluster - The unit being attacked.
 * @param {string} originalAction - The action that initiated combat (e.g., "Charge").
 */
function aiExecuteMeleeAction(
  attackerCluster,
  defenderCluster,
  originalAction
) {
  if (
    !attackerCluster ||
    !defenderCluster ||
    !attackerCluster.unitGroupData ||
    attackerCluster.unitGroupData.subUnits.length === 0
  ) {
    appendToCombatLog(
      `${
        attackerCluster?.name || "Attacker"
      } cannot perform melee action (missing data).`
    );
    return;
  }

  let defenderSubUnit;
  if (defenderCluster.unitGroupData.subUnits.length > 1) {
    defenderSubUnit =
      defenderCluster.unitGroupData.subUnits[
        defenderCluster.unitGroupData.subUnits.length - 1
      ];
  } else if (defenderCluster.unitGroupData.subUnits.length === 1) {
    defenderSubUnit = defenderCluster.unitGroupData.subUnits[0];
  } else {
    appendToCombatLog(
      `Target ${defenderCluster.name} has no sub-units to be targeted in melee.`
    );
    return;
  }

  const actionContext = {
    isMelee: true,
    isCharge: originalAction === "Charge",
    isHold: false,
  };

  let defenderSubUnitForSaveRolls = defenderSubUnit;
  const heroInDefender = defenderCluster.subUnitStates.find(
    (sus) => sus.isHeroSubUnit && sus.currentModelsInSubUnit > 0
  );
  const otherModelsInDefender = defenderCluster.subUnitStates.some(
    (sus) => !sus.isHeroSubUnit && sus.currentModelsInSubUnit > 0
  );

  if (heroInDefender && otherModelsInDefender) {
    const firstNonHeroSubUnitState = defenderCluster.subUnitStates.find(
      (sus) => !sus.isHeroSubUnit && sus.currentModelsInSubUnit > 0
    );
    if (firstNonHeroSubUnitState) {
      defenderSubUnitForSaveRolls =
        firstNonHeroSubUnitState.originalSubUnitData;
    }
  }

  const activationAttackLogs = [];
  let weaponsFiredCount = 0;
  let totalDamageAppliedToDefenderCluster = 0;

  // Attacker Strikes
  const isChargerFatigued =
    attackerCluster.hasFoughtInMeleeThisRound || attackerCluster.shaken;

  attackerCluster.unitGroupData.subUnits.forEach((currentAttackingSubUnit) => {
    const subUnitState = attackerCluster.subUnitStates.find(
      (s) =>
        s.originalSubUnitData.name === currentAttackingSubUnit.name &&
        s.id.startsWith(attackerCluster.id)
    );
    const weaponsToUse =
      subUnitState && subUnitState.effectiveWeapons
        ? subUnitState.effectiveWeapons
        : currentAttackingSubUnit.weapons;

    (weaponsToUse || []).forEach((weapon) => {
      if (weapon.range === 0) {
        weaponsFiredCount++;
        const attackResult = gameRollAttackSequence(
          currentAttackingSubUnit,
          weapon,
          defenderSubUnitForSaveRolls,
          defenderCluster.name,
          defenderCluster.currentModels,
          actionContext,
          false,
          isChargerFatigued,
          attackerCluster.unitGroupData
        );
        activationAttackLogs.push(...attackResult.log);
        totalDamageAppliedToDefenderCluster +=
          attackResult.totalDamageInflicted;
      }
    });
  });

  if (weaponsFiredCount > 0) {
    attackerCluster.hasFoughtInMeleeThisRound = true;
    let finalMessage = `${attackerCluster.name} attacks ${defenderCluster.name} in melee (Action: ${originalAction}):\n`;
    finalMessage += activationAttackLogs.join("\n");
    appendToCombatLog(finalMessage);

    if (totalDamageAppliedToDefenderCluster > 0) {
      const woundApplicationResult = applyWoundsToCluster(
        defenderCluster,
        totalDamageAppliedToDefenderCluster
      );
      if (woundApplicationResult.modelsKilledCount > 0) {
        appendToCombatLog(
          `  ${defenderCluster.name} lost ${woundApplicationResult.modelsKilledCount} models.`
        );
      }
      const summaryWoundMessage = `${defenderCluster.name} now has ${defenderCluster.currentModels}/${defenderCluster.totalModels} models remaining.`;
      showFloatingText(defenderCluster, summaryWoundMessage);
      appendToCombatLog(summaryWoundMessage);

      if (defenderCluster.currentModels <= 0) {
        showFloatingText(
          defenderCluster,
          `${defenderCluster.name} DESTROYED in melee!`
        );
        appendToCombatLog(`${defenderCluster.name} DESTROYED in melee!`);
        const enemySide =
          currentTurn === "attackers" ? "defenders" : "attackers";
        clusterCache[enemySide] = clusterCache[enemySide].filter(
          (c) => c.id !== defenderCluster.id
        );
      }
    } else {
      appendToCombatLog(`  No damage inflicted on ${defenderCluster.name}.`);
    }

    // Defender Strikes Back
    let totalDamageAppliedToAttackerCluster = 0;
    if (defenderCluster.currentModels > 0) {
      appendToCombatLog(`--- ${defenderCluster.name} strikes back! ---`);
      const returnStrikeActivationLogs = [];
      let returnStrikeWeaponsFired = 0;

      let originalAttackerSubUnitForSaveRolls =
        attackerCluster.unitGroupData.subUnits[0];
      const isDefenderFatigued =
        defenderCluster.hasFoughtInMeleeThisRound || defenderCluster.shaken;
      defenderCluster.hasFoughtInMeleeThisRound = true;

      defenderCluster.subUnitStates.forEach((sus) => {
        if (sus.currentModelsInSubUnit > 0) {
          const currentDefendingSubUnit = sus.originalSubUnitData;
          const weaponsToUse =
            sus.effectiveWeapons || currentDefendingSubUnit.weapons;
          (weaponsToUse || []).forEach((weapon) => {
            if (weapon.range === 0) {
              returnStrikeWeaponsFired++;
              const returnAttackResult = gameRollAttackSequence(
                currentDefendingSubUnit,
                weapon,
                originalAttackerSubUnitForSaveRolls,
                attackerCluster.name,
                attackerCluster.currentModels,
                { isMelee: true, isCharge: false, isHold: false },
                false,
                isDefenderFatigued,
                defenderCluster.unitGroupData
              );
              returnStrikeActivationLogs.push(...returnAttackResult.log);
              totalDamageAppliedToAttackerCluster +=
                returnAttackResult.totalDamageInflicted;
            }
          });
        }
      });

      if (returnStrikeWeaponsFired > 0) {
        appendToCombatLog(returnStrikeActivationLogs.join("\n"));
        if (totalDamageAppliedToAttackerCluster > 0) {
          const returnWoundApplication = applyWoundsToCluster(
            attackerCluster,
            totalDamageAppliedToAttackerCluster
          );
          if (returnWoundApplication.modelsKilledCount > 0) {
            appendToCombatLog(
              `  ${attackerCluster.name} lost ${returnWoundApplication.modelsKilledCount} models in return strike.`
            );
          }
          const returnStrikeSummaryMsg = `${attackerCluster.name} now has ${attackerCluster.currentModels}/${attackerCluster.totalModels} models remaining after return strike.`;
          showFloatingText(attackerCluster, returnStrikeSummaryMsg);
          appendToCombatLog(returnStrikeSummaryMsg);

          if (attackerCluster.currentModels <= 0) {
            showFloatingText(
              attackerCluster,
              `${attackerCluster.name} DESTROYED by return strike!`
            );
            appendToCombatLog(
              `${attackerCluster.name} DESTROYED by return strike!`
            );
            const chargerSide =
              currentTurn === "attackers" ? "attackers" : "defenders";
            clusterCache[chargerSide] = clusterCache[chargerSide].filter(
              (c) => c.id !== attackerCluster.id
            );
          }
        } else {
          appendToCombatLog(
            `  No damage inflicted on ${attackerCluster.name} by return strike.`
          );
        }
      }
    }

    // Resolve Melee Winner
    if (
      attackerCluster.currentModels > 0 &&
      defenderCluster.currentModels > 0
    ) {
      let attackerFearBonus = 0;
      attackerCluster.subUnitStates.forEach((sus) => {
        if (
          sus.currentModelsInSubUnit > 0 &&
          sus.originalSubUnitData.special?.fear
        ) {
          attackerFearBonus += sus.originalSubUnitData.special.fear;
        }
      });
      const attackerModifiedDamage =
        totalDamageAppliedToDefenderCluster + attackerFearBonus;

      let defenderFearBonus = 0;
      defenderCluster.subUnitStates.forEach((sus) => {
        if (
          sus.currentModelsInSubUnit > 0 &&
          sus.originalSubUnitData.special?.fear
        ) {
          defenderFearBonus += sus.originalSubUnitData.special.fear;
        }
      });
      const defenderModifiedDamage =
        totalDamageAppliedToAttackerCluster + defenderFearBonus;

      appendToCombatLog(`--- Melee Combat Resolution ---`);
      if (attackerModifiedDamage > defenderModifiedDamage) {
        appendToCombatLog(`  ${attackerCluster.name} wins the melee!`);
        performMoraleTest(defenderCluster, "for losing the melee combat", true);
      } else if (defenderModifiedDamage > attackerModifiedDamage) {
        appendToCombatLog(`  ${defenderCluster.name} wins the melee!`);
        performMoraleTest(attackerCluster, "for losing the melee combat", true);
      } else {
        appendToCombatLog(
          `  Melee is a tie. No morale tests from combat outcome.`
        );
      }
    }
  } else {
    appendToCombatLog(
      `${attackerCluster.name} has no melee weapons to use against ${defenderCluster.name}.`
    );
  }
}

/**
 * Handles post-charge separation: the charged unit moves back 1".
 * @param {Object} chargerCluster - The unit that performed the charge.
 * @param {Object} chargedTargetCluster - The unit that was charged.
 */
function resolvePostChargeSeparation(chargerCluster, chargedTargetCluster) {
  if (!chargerCluster || !chargedTargetCluster) return;

  if (areClustersColliding(chargerCluster, chargedTargetCluster, -0.1)) {
    const dx = chargedTargetCluster.cxIn - chargerCluster.cxIn;
    const dy = chargedTargetCluster.cyIn - chargerCluster.cyIn;
    const dist = Math.hypot(dx, dy) || 1;
    const pushBackDirX = dx / dist;
    const pushBackDirY = dy / dist;

    chargedTargetCluster.cxIn += pushBackDirX * 1.0;
    chargedTargetCluster.cyIn += pushBackDirY * 1.0;
    chargedTargetCluster.originXIn += pushBackDirX * 1.0;
    chargedTargetCluster.originYIn += pushBackDirY * 1.0;
    showFloatingText(
      chargedTargetCluster,
      `${chargedTargetCluster.name} pushed back 1" after charge.`
    );
  }
}
