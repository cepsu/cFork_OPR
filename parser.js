// --- parser.js ---
// Handles the parsing of armybook text into structured unit data.

const SPECIAL_RULE_DEFINITIONS = {
  Hero: { key: "hero", type: "boolean" },
  Relentless: { key: "relentless", type: "boolean" },
  "Medical Training": { key: "medicalTraining", type: "boolean" },
  "Shield Wall": { key: "shieldWall", type: "boolean" },
  "Combat Shield": { key: "shieldWall", type: "boolean" },
  "Good Shot": { key: "goodShot", type: "boolean" },
  Fast: { key: "fast", type: "boolean" },
  Robot: { key: "robot", type: "boolean" },
  Scout: { key: "scout", type: "boolean" },
  Strider: { key: "strider", type: "boolean" },
  Fearless: { key: "fearless", type: "boolean" },
  "Self-Repair": { key: "selfRepair", type: "boolean" },
  Ambush: { key: "ambush", type: "boolean" },
  "Company Standard": { key: "companyStandard", type: "boolean" },
  "Take Aim": { key: "takeAim", type: "boolean" },
  "Hold the Line": { key: "holdTheLine", type: "boolean" },
  Stealth: { key: "stealth", type: "boolean" },
  Flying: { key: "flying", type: "boolean" },
  "Precision Shots": { key: "precisionShots", type: "boolean" },
  Tough: { key: "tough", type: "numeric" },
  Deadly: { key: "deadly", type: "numeric" },
  Fear: { key: "fear", type: "numeric" },
  Impact: { key: "impact", type: "numeric" },
  Caster: { key: "caster", type: "numeric" },
  Transport: { key: "transport", type: "numeric" },
  Furious: {
    type: "custom",
    handler: (special) => {
      special.furious = true;
      special.furiousOriginal = true;
    },
  },
  "Battle Drills": {
    type: "custom",
    handler: (special) => {
      special.battleDrills = true;
      if (!special.furious) {
        special.furious = true;
        special.furiousOriginal = false;
      }
    },
  },
};

const WEAPON_TAG_DEFINITIONS = {
  furious: {
    text: "Furious",
    condition: (w, su) => w.range === 0 && su?.special?.furious,
  },
  relentless: {
    text: "Relentless",
    condition: (w, su) => w.range > 0 && su?.special?.relentless,
  },
  goodShot: {
    text: "Good Shot",
    condition: (w, su) => w.range > 0 && su?.special?.goodShot,
  },
  precisionShots: {
    text: "Precision",
    condition: (w, su) => w.range > 0 && su?.special?.precisionShots,
  },
  rending: { text: "Rending", condition: (w) => !!w.special?.rending },
  reliable: { text: "Reliable", condition: (w) => !!w.special?.reliable },
  flux: { text: "Flux", condition: (w) => !!w.special?.flux },
  sniper: { text: "Sniper", condition: (w) => !!w.special?.sniper },
  limited: { text: "Limited", condition: (w) => !!w.special?.limited },
  blast: {
    text: (w) => `Blast(${w.special.blast})`,
    condition: (w) => !!w.special?.blast,
  },
  deadly: {
    text: (w) => `Deadly(${w.special.deadly})`,
    condition: (w) => !!w.special?.deadly,
  },
};

function parseWeapons(equipLine) {
  if (!equipLine || !equipLine.trim()) return [];
  return splitTopLevel(equipLine, ",")
    .map((s) => s.trim())
    .filter((s) => /\w+\s*\(.*\)/.test(s))
    .map((spec) => {
      const m = spec.match(/^(?:(\d+)x\s*)?([^(]+?)\s*\((.+)\)$/);
      if (!m) return null;
      const [, amountStr, name, inner] = m;
      const amount = amountStr ? parseInt(amountStr, 10) : 1;
      const parts = splitTopLevel(inner, ",").map((p) => p.trim());
      let range = 0,
        attacks = 1,
        ap = 0;
      const flags = {};
      parts.forEach((p) => {
        let match;
        if ((match = p.match(/^(\d+)"$/))) range = +match[1];
        else if ((match = p.match(/^[Aa]?(\d+)$/i))) attacks = +match[1];
        else if ((match = p.match(/^AP\((-?\d+)\)$/i))) ap = +match[1];
        else {
          const ruleMatch = p.match(/^([a-zA-Z\s-]+)(?:\((\d+)\))?$/);
          if (ruleMatch)
            flags[ruleMatch[1].trim().toLowerCase()] = ruleMatch[2]
              ? parseInt(ruleMatch[2], 10)
              : true;
        }
      });
      return { amount, name: name.trim(), range, attacks, ap, special: flags };
    })
    .filter(Boolean);
}

function parseRule(ruleString, special) {
  for (const [ruleName, def] of Object.entries(SPECIAL_RULE_DEFINITIONS)) {
    const regex = new RegExp(`^${ruleName}(?:\\([+]?(\\d+)\\))?$`, "i");
    const match = ruleString.match(regex);
    if (match) {
      if (def.type === "boolean") special[def.key] = true;
      else if (def.type === "numeric")
        special[def.key] = match[1] ? parseInt(match[1], 10) : true;
      else if (def.type === "custom") def.handler(special);
      return true;
    }
  }
  return false;
}

function parseSpecialsAndKeywords(specItems) {
  const special = {},
    keywords = [];
  specItems.forEach((item) => {
    item = item.trim();
    let matched = parseRule(item, special);
    if (!matched) {
      const embeddedMatch = item.match(/.*\((.+)\)/);
      if (embeddedMatch && parseRule(embeddedMatch[1].trim(), special))
        matched = true;
    }
    if (!matched && !item.includes("(") && !item.includes(")"))
      keywords.push(item);
  });
  return { special, keywords };
}

function parseUnit(headerLine, equipLine) {
  const unitRegex =
    /^(.+?)\s*\[(\d+)\]\s*Q(\d+)\+\s*D(\d+)\+\s*\|\s*(\d+)pts\s*(?:\|\s*(.*))?$/i;
  const m = headerLine.match(unitRegex);
  if (!m) return null;
  const [, name, models, q, d, pts, specText = ""] = m;
  const { special, keywords } = parseSpecialsAndKeywords(
    specText ? splitTopLevel(specText, ",").map((s) => s.trim()) : []
  );
  return {
    name: name.trim(),
    models: +models,
    quality: +q,
    defense: +d,
    points: +pts,
    special,
    weapons: parseWeapons(equipLine),
    keywords,
  };
}

function getWeaponDisplayString(weapon, subUnit = null) {
  const stats = [];
  if (weapon.range > 0) stats.push(`${weapon.range}"`);
  stats.push(`A${weapon.attacks}`);
  if (weapon.ap) stats.push(`AP(${weapon.ap})`);
  const tags = Object.values(WEAPON_TAG_DEFINITIONS)
    .filter((def) => def.condition(weapon, subUnit))
    .map((def) =>
      typeof def.text === "function" ? def.text(weapon) : def.text
    );
  return (
    `(${stats.join(", ")})` + (tags.length > 0 ? ` [${tags.join(", ")}]` : "")
  );
}

function parseArmybook(rawText) {
  const units = {};
  let parsedArmyName = "Unnamed Army";
  const armyNameRegex =
    /^\+\+\s*(.+?)\s*(?:\(v[\d.]+\))?(?:\s*\[\w+\s*\d*pts\])?\s*\+\+$/i;
  const firstLine = rawText.split(/\r?\n/).find((line) => line.trim());
  if (firstLine) {
    const nameMatch = firstLine.trim().match(armyNameRegex);
    if (nameMatch) parsedArmyName = nameMatch[1].trim();
  }
  const blocks = rawText
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  blocks.forEach((block) => {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const unitHeaderRegex =
      /^(.+?)\s*\[(\d+)\]\s*Q(\d+)\+\s*D(\d+)\+\s*\|\s*(\d+)pts/i;
    if (!unitHeaderRegex.test(lines[0])) return;
    const primaryUnit = parseUnit(
      lines[0],
      lines[1] && /\(.*\)/.test(lines[1]) ? lines[1] : ""
    );
    if (!primaryUnit) return;
    const group = { name: primaryUnit.name, subUnits: [primaryUnit] };
    const joinIdx = lines.findIndex((l) => /^\|\s*Joined to:/i.test(l));
    if (
      joinIdx > -1 &&
      lines[joinIdx + 1] &&
      unitHeaderRegex.test(lines[joinIdx + 1])
    ) {
      const secondaryUnit = parseUnit(
        lines[joinIdx + 1],
        lines[joinIdx + 2] && /\(.*\)/.test(lines[joinIdx + 2])
          ? lines[joinIdx + 2]
          : ""
      );
      if (secondaryUnit) {
        group.subUnits.push(secondaryUnit);
        group.name = `${primaryUnit.name} + ${secondaryUnit.name}`;
      }
    }
    let finalGroupName = group.name,
      counter = 1;
    while (units[finalGroupName])
      finalGroupName = `${group.name} (${++counter})`;
    group.name = finalGroupName;
    units[finalGroupName] = group;
  });
  return { units, armyName: parsedArmyName };
}
