// --------------------------------------------------------------------------
// ATTACK SEQUENCE LOGIC
// This file contains the function for simulating a full attack sequence
// (hit, save, wound calculation), used by both shooting and melee.
// --------------------------------------------------------------------------

/**
 * Simulates a full attack sequence (hit, save, wound calc) for game logic.
 * @param {Object} attackerSubUnit - The specific sub-unit data of the attacker.
 * @param {Object} weapon - The weapon object being used.
 * @param {Object} defenderSubUnit - The specific sub-unit data of the defender.
 * @param {string} targetUnitName - The name of the target cluster.
 * @param {number} defenderClusterModelsForBlast - Current total models in the defending cluster (for Blast).
 * @param {Object} [actionContext={}] - Context like { isMelee: false, isCharge: false, isHold: true }.
 * @param {boolean} [isTargetInCover=false] - Whether the target is in cover.
 * @param {boolean} [isAttackerFatigued=false] - Whether the attacker is fatigued for this melee attack.
 * @param {Object} group - The attacker's unit group data.
 * @returns {{woundPackets: Array, totalDamageInflicted: number, log: Array<string>}}
 */
function gameRollAttackSequence(
  attackerSubUnit,
  weapon,
  defenderSubUnit,
  targetUnitName,
  defenderClusterModelsForBlast,
  actionContext = {},
  isTargetInCover = false,
  isAttackerFatigued = false,
  group
) {
  const combatLog = [];

  // 1. Determine Attack Parameters
  const isMelee = weapon.range === 0;
  let qTarget = attackerSubUnit.quality;

  const targetBaseD = defenderSubUnit.defense;
  const targetShieldWBonus = defenderSubUnit.special?.shieldWall ? 1 : 0;
  const targetCoverBonusForDisplay = isTargetInCover ? 1 : 0;
  const targetDForDisplay = Math.max(
    2,
    targetBaseD - targetShieldWBonus - targetCoverBonusForDisplay
  );

  if (!(isMelee && isAttackerFatigued)) {
    if (attackerSubUnit.special?.goodShot && !isMelee && actionContext.isHold) {
      qTarget = Math.min(attackerSubUnit.quality, 4);
    }
    if (weapon.special?.reliable) {
      qTarget = Math.max(2, qTarget - 1);
    }
  }
  const precisionAPBonus =
    attackerSubUnit.special?.precisionShots && !isMelee ? 1 : 0;

  const weaponDisplayDetails = getWeaponDisplayString(weapon, attackerSubUnit);
  combatLog.push(
    `${attackerSubUnit.name} (Q${qTarget}+) with ${weapon.amount}x ${weapon.name} ${weaponDisplayDetails} vs ${targetUnitName}'s D${targetDForDisplay}+`
  );

  // 2. Roll to Hit
  const diceCount = weapon.amount * weapon.attacks;
  const rawHits = [];
  let hitRollsSuccess = [];
  let hitRollsFail = [];
  let extraHitThreshold = 0;
  const extraAbils = [];

  if (actionContext.isCharge && isMelee) {
    const groupHasBattleDrills = group.subUnits.some(
      (u) => u.special?.battleDrills
    );
    if (groupHasBattleDrills && attackerSubUnit.special?.furiousOriginal) {
      extraAbils.push("Double Furious (Battle Drills)");
      extraHitThreshold = 5;
    } else if (attackerSubUnit.special?.furious || groupHasBattleDrills) {
      extraAbils.push("Furious");
      extraHitThreshold = 6;
    }
  }
  if (
    (actionContext.isHold || actionContext == "Hold") &&
    attackerSubUnit.special?.relentless
  ) {
    extraAbils.push("Relentless");
    extraHitThreshold = 6;
  }
  if (weapon.special?.flux) {
    extraAbils.push("Flux");
    extraHitThreshold = Math.max(extraHitThreshold, 6);
  }

  for (let i = 0; i < diceCount; i++) {
    const roll = rollDie();
    const currentAP =
      weapon.special?.rending && (roll === 6 || (roll > 1 && roll >= qTarget))
        ? Math.max(weapon.ap || 0, 4)
        : weapon.ap || 0;
    const finalAP = currentAP + precisionAPBonus;

    let hitOccurred = false;
    if (roll === 1 && !weapon.special?.reliable) {
      hitOccurred = false;
    } else if (isMelee && isAttackerFatigued) {
      hitOccurred = roll === 6;
    } else {
      hitOccurred = roll === 6 || roll >= qTarget;
    }

    if (hitOccurred) {
      hitRollsSuccess.push(String(roll));
      rawHits.push({ ap: finalAP, roll: roll });
      if (extraHitThreshold > 0 && roll >= extraHitThreshold)
        rawHits.push({ ap: finalAP, roll: roll, fromExtra: true });
    } else {
      hitRollsFail.push(String(roll));
    }
  }
  combatLog.push(
    `  Hits: ${rawHits.filter((h) => !h.fromExtra).length}✅ [${
      hitRollsSuccess.join(",") || "None"
    }] (${rawHits.length} total after extras) | Misses: ${
      hitRollsFail.length
    }❌ [${hitRollsFail.join(",") || "None"}]`
  );
  if (extraAbils.length > 0)
    combatLog.push(`  Special Hit Rules: ${extraAbils.join(", ")}`);

  // 3. Apply Blast
  let hitsAfterBlast = [...rawHits];
  if (weapon.special?.blast && defenderClusterModelsForBlast > 0) {
    const blastMultiplier = Math.min(
      weapon.special.blast,
      defenderClusterModelsForBlast
    );
    const originalHitCount = rawHits.length;
    hitsAfterBlast = hitsAfterBlast.flatMap((hit) =>
      Array.from({ length: blastMultiplier }, () => ({
        ...hit,
        fromBlast: true,
      }))
    );
    if (blastMultiplier > 1 && hitsAfterBlast.length > originalHitCount)
      combatLog.push(
        `  Blast(${weapon.special.blast}) vs ${defenderClusterModelsForBlast} models -> ${hitsAfterBlast.length} total hits (was ${originalHitCount})`
      );
  }

  // 4. Resolve Saves
  const baseD = defenderSubUnit.defense;
  const shieldWBonus = defenderSubUnit.special?.shieldWall ? 1 : 0;
  const coverBonus = isTargetInCover ? 1 : 0;
  const saveRollsSuccess = [];
  const saveRollsFailObjects = [];
  const deadlyValue = weapon.special?.deadly ? weapon.special?.deadly : 1;

  hitsAfterBlast.forEach((hit) => {
    const effectiveCoverForSave = hit.fromBlast ? 0 : coverBonus;
    const saveTarget = Math.max(
      2,
      baseD - shieldWBonus - effectiveCoverForSave + (hit.ap || 0)
    );
    const saveRoll = rollDie();

    if (saveRoll === 1 || !(saveRoll === 6 || saveRoll >= saveTarget)) {
      saveRollsFailObjects.push({
        roll: saveRoll,
        hitAP: hit.ap,
        deadly: deadlyValue,
      });
    } else {
      saveRollsSuccess.push(String(saveRoll));
    }
  });

  combatLog.push(
    `  Saves: ${saveRollsSuccess.length}✅ [${
      saveRollsSuccess.join(",") || "None"
    }] | Fails: ${saveRollsFailObjects.length}❌ [${
      saveRollsFailObjects.map((f) => f.roll).join(",") || "None"
    }]`
  );

  const saveFailures = saveRollsFailObjects;
  let woundPackets = [];

  if (weapon.special?.deadly) {
    combatLog.push(
      `  Applying Deadly(${weapon.special.deadly}) → ${saveFailures.length} hits → ${saveFailures.length} packets of ${weapon.special.deadly}`
    );
    woundPackets = saveFailures.map(() => weapon.special.deadly);
  } else {
    woundPackets = saveFailures.map(() => 1);
  }

  if (defenderSubUnit.special?.medicalTraining && woundPackets.length) {
    const kept = [];
    const mtRolls = [];
    const successRolls = [];
    const failRolls = [];
    woundPackets.forEach((w) => {
      let preventedCount = 0;
      for (let i = 0; i < w; i++) {
        const r = rollDie();
        if (r >= 5) {
          preventedCount++;
          successRolls.push(r);
        } else {
          failRolls.push(r);
        }
      }
      const after = w - preventedCount;
      if (after > 0) kept.push(after);
    });
    combatLog.push(
      `    Medical Training: ✅${successRolls.length} [${
        successRolls.join(",") || "–"
      }] | ❌${failRolls.length} [${failRolls.join(",") || "–"}]`
    );
    woundPackets = kept;
  }

  if (defenderSubUnit.special?.selfRepair && woundPackets.length) {
    const kept = [];
    const mtRolls = [];
    const successRolls = [];
    const failRolls = [];
    woundPackets.forEach((w) => {
      let preventedCount = 0;
      for (let i = 0; i < w; i++) {
        const r = rollDie();
        if (r === 6) {
          preventedCount++;
          successRolls.push(r);
        } else {
          failRolls.push(r);
        }
      }
      const after = w - preventedCount;
      if (after > 0) kept.push(after);
    });
    combatLog.push(
      `    Self-Repair: ✅${successRolls.length} [${
        successRolls.join(",") || "–"
      }] | ❌${failRolls.length} [${failRolls.join(",") || "–"}]`
    );
    woundPackets = kept;
  }

  const totalDamageInflicted = woundPackets.reduce((sum, p) => sum + p, 0);
  combatLog.push(
    `  → Total wound packets: ${woundPackets.length}, total wounds: ${totalDamageInflicted}`
  );
  return {
    woundPackets,
    totalDamageInflicted,
    log: combatLog,
  };
}
