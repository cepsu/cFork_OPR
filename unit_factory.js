// --- unit_factory.js ---
// Responsible for creating unit cluster objects and calculating their dynamic properties.

function calculateWeaponGoodness(weapon) {
  if (
    !weapon ||
    typeof weapon.attacks !== "number" ||
    typeof weapon.amount !== "number"
  )
    return 0;
  const totalAttacks = weapon.attacks * weapon.amount;
  const blast = weapon.special?.blast || 1;
  const deadly = weapon.special?.deadly || 1;
  const ap = weapon.ap || 0;
  const apMultiplier = 1 + ap * 0.25;
  return totalAttacks * blast * deadly * apMultiplier;
}

function getUpdatedWeaponLoadoutForSubUnit(subUnitState) {
  const currentModels = subUnitState.currentModelsInSubUnit;
  const originalModels = subUnitState.originalSubUnitData.models;
  const originalWeapons = subUnitState.originalSubUnitData.weapons;
  if (currentModels <= 0) return [];
  if (currentModels >= originalModels)
    return JSON.parse(JSON.stringify(originalWeapons));
  const virtualLoadouts = Array.from({ length: originalModels }, () => ({
    weapons: [],
    totalGoodness: 0,
  }));
  const allIndividualWeapons = originalWeapons.flatMap((spec) =>
    Array(spec.amount)
      .fill(null)
      .map(() => ({
        ...spec,
        amount: 1,
        goodness: calculateWeaponGoodness({ ...spec, amount: 1 }),
      }))
  );
  allIndividualWeapons.sort((a, b) => b.goodness - a.goodness);
  allIndividualWeapons.forEach((weapon, index) => {
    const modelIdx = index % originalModels;
    virtualLoadouts[modelIdx].weapons.push(weapon);
    virtualLoadouts[modelIdx].totalGoodness += weapon.goodness;
  });
  virtualLoadouts.sort((a, b) => a.totalGoodness - b.totalGoodness);
  const keptLoadouts = virtualLoadouts.slice(originalModels - currentModels);
  const finalWeapons = keptLoadouts.flatMap((loadout) => loadout.weapons);
  const weaponMap = new Map();
  finalWeapons.forEach((weapon) => {
    const key = `${weapon.name}|${weapon.range}|${weapon.attacks}|${
      weapon.ap
    }|${JSON.stringify(weapon.special || {})}`;
    if (weaponMap.has(key)) {
      weaponMap.get(key).count++;
    } else {
      const template = { ...weapon };
      delete template.goodness;
      weaponMap.set(key, { count: 1, template });
    }
  });
  return Array.from(weaponMap.values()).map((value) => ({
    ...value.template,
    amount: value.count,
  }));
}

function classifyUnitType(unitGroup) {
  let meleeGoodness = 0,
    rangedGoodness = 0;
  unitGroup.subUnits?.forEach((su) => {
    su.weapons?.forEach((w) => {
      const goodness = calculateWeaponGoodness(w);
      if (w.range > 0) rangedGoodness += goodness;
      else meleeGoodness += goodness;
    });
  });
  if (rangedGoodness === 0 && meleeGoodness > 0) return "melee";
  if (meleeGoodness === 0 && rangedGoodness > 0) return "shooting";
  return meleeGoodness > rangedGoodness ? "melee-focus" : "shooting-focus";
}

function getUnitMaxWeaponRange(unitGroup) {
  return Math.max(
    0,
    ...unitGroup.subUnits.flatMap((su) => su.weapons.map((w) => w.range || 0))
  );
}

function createUnitCluster({ unitGroupData, side, cx, cy, originX, originY }) {
  if (!unitGroupData?.subUnits?.length) return null;
  const modelCount = unitGroupData.subUnits.reduce(
    (sum, su) => sum + (su.models || 1),
    0
  );
  const type = classifyUnitType(unitGroupData);
  const bestRangeInches = getUnitMaxWeaponRange(unitGroupData);
  const cols = Math.ceil(Math.sqrt(modelCount));
  const unitWidthInches = cols * DIA_IN;
  const unitHeightInches = Math.ceil(modelCount / cols) * DIA_IN;
  const clusterId = `${side}-${unitGroupData.name.replace(
    /\s+/g,
    "_"
  )}-${Date.now()}`;
  const models = Array.from({ length: modelCount }, (_, j) => ({
    x: originX + (j % cols) * DIA_IN + DIA_IN / 2,
    y: originY + Math.floor(j / cols) * DIA_IN + DIA_IN / 2,
    id: `${clusterId}-model-${j}`,
  }));
  const subUnitStates = unitGroupData.subUnits.map((su, i) => ({
    originalSubUnitData: su,
    id: `${clusterId}-subunit-${i}`,
    currentModelsInSubUnit: su.models,
    woundsOnCurrentModelInSubUnit: 0,
    woundsPerModel: su.special?.tough || 1,
    effectiveWeapons: JSON.parse(JSON.stringify(su.weapons)),
    isHeroSubUnit: !!su.special?.hero,
  }));
  const newCluster = {
    id: clusterId,
    name: unitGroupData.name,
    side,
    type,
    bestRangeIn: bestRangeInches,
    cxIn: cx,
    cyIn: cy,
    originXIn: originX,
    originYIn: originY,
    wIn: unitWidthInches,
    hIn: unitHeightInches,
    models,
    unitGroupData,
    activated: false,
    shaken: false,
    totalModels: modelCount,
    currentModels: modelCount,
    hasFoughtInMeleeThisRound: false,
    subUnitStates,
    img: null,
  };
  if (pxPerInch > 0) {
    newCluster.img = createImageForCluster(newCluster);
  }
  return newCluster;
}
