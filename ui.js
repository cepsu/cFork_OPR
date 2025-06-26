// --- ui.js ---
// Handles all direct DOM manipulation, event listeners, and UI updates.

function showUnitTooltip(data, mouseX, mouseY) {
  if (!unitTooltipElement || !data) return;
  let content = "";
  if (data.unitGroupData) {
    content += `<h4>${data.name} (${data.type})</h4>`;
    data.unitGroupData.subUnits.forEach((subUnit, index) => {
      if (data.unitGroupData.subUnits.length > 1) {
        content += `<div style="margin-top: 8px; padding-top: 5px; border-top: 1px dashed #ddd;"><strong>Sub-Unit: ${subUnit.name}</strong></div>`;
      }
      content += `<p>Q${subUnit.quality}+ D${subUnit.defense}+ | ${subUnit.points}pts</p>`;
      const state = data.subUnitStates.find(
        (s) =>
          s.id.startsWith(data.id) &&
          s.originalSubUnitData.name === subUnit.name
      );
      if (state) {
        content += `<p style="margin-left: 10px;"><em>Models: ${state.currentModelsInSubUnit}/${state.originalSubUnitData.models} | <span style="color: red;">Wounds: ${state.woundsOnCurrentModelInSubUnit}</span> (Tough ${state.woundsPerModel})</em></p>`;
      }
      const specials = Object.entries(subUnit.special)
        .filter(([, val]) => val)
        .map(
          ([key]) =>
            key.charAt(0).toUpperCase() +
            key.slice(1).replace(/([A-Z])/g, " $1")
        );
      if (specials.length > 0)
        content += `<p><strong>Special:</strong> ${specials.join(", ")}</p>`;
      if (subUnit.weapons?.length > 0) {
        content += `<h5>Weapons:</h5><ul>`;
        const weaponsToDisplay =
          state && state.effectiveWeapons
            ? state.effectiveWeapons
            : subUnit.weapons;
        weaponsToDisplay.forEach(
          (weapon) =>
            (content += `<li>${weapon.amount}x ${
              weapon.name
            } ${getWeaponDisplayString(weapon, subUnit)}</li>`)
        );
        content += `</ul>`;
      }
    });
  } else if (data.properties) {
    content += `<h4>Terrain Piece</h4>`;
    const types = Object.keys(data.properties)
      .filter((k) => data.properties[k])
      .map((k) => k.charAt(0).toUpperCase() + k.slice(1));
    content += `<p><strong>Types:</strong> ${types.join(", ")}</p>`;
  }
  unitTooltipElement.innerHTML = content;
  unitTooltipElement.style.display = "block";
  const tooltipRect = unitTooltipElement.getBoundingClientRect();
  let left = mouseX + 15,
    top = mouseY + 15;
  if (left + tooltipRect.width > window.innerWidth)
    left = mouseX - tooltipRect.width - 15;
  if (top + tooltipRect.height > window.innerHeight)
    top = mouseY - tooltipRect.height - 15;
  unitTooltipElement.style.left = `${left}px`;
  unitTooltipElement.style.top = `${top}px`;
}

function hideUnitTooltip() {
  if (unitTooltipElement) unitTooltipElement.style.display = "none";
  currentlyHoveredUnitId = null;
}

function appendToCombatLog(message) {
  const logContent = $("#combat-log");
  const logContainer = $("#combat-log-container");
  logContent.append(message + "<br>");
  logContainer.scrollTop(logContainer[0].scrollHeight);
}

// THIS FUNCTION WAS MISSING. IT IS NOW RESTORED.
function showFloatingText(unit, message) {
  if (!unit || !unit.cxIn || !unit.cyIn || !pxPerInch) {
    // Handle messages not tied to a unit, like round announcements
    if (message) appendToCombatLog(message);
    return;
  }
  appendToCombatLog(`${unit.name}: ${message}`);

  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const xPx = unit.cxIn * pxPerInch;
  const yPx = unit.cyIn * pxPerInch;
  const stackKey = unit.id || `${unit.cxIn}-${unit.cyIn}`;
  const stackIndex = floatingTextStacks[stackKey] || 0;
  floatingTextStacks[stackKey] = stackIndex + 1;

  const textDiv = document.createElement("div");
  textDiv.innerText = message;
  Object.assign(textDiv.style, {
    position: "absolute",
    whiteSpace: "pre-line",
    fontWeight: "bold",
    color: "#333",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    padding: "2px 5px",
    borderRadius: "3px",
    border: "1px solid #ccc",
    pointerEvents: "none",
    opacity: "1",
    transition: "transform 4s linear, opacity 2s linear",
    willChange: "transform, opacity",
    zIndex: "1000",
  });
  document.body.appendChild(textDiv);
  const bounds = textDiv.getBoundingClientRect();
  const w = bounds.width,
    h = bounds.height;
  const margin = 4;
  const left = rect.left + window.scrollX + xPx - w / 2;
  const top =
    rect.top + window.scrollY + yPx - (stackIndex + 1) * (h + margin) - 20;
  textDiv.style.left = `${left}px`;
  textDiv.style.top = `${top}px`;

  requestAnimationFrame(() => {
    textDiv.style.transform = "translateY(-40px)";
  });

  setTimeout(() => {
    if (document.body.contains(textDiv)) textDiv.style.opacity = "0";
  }, 4000);

  setTimeout(() => {
    if (document.body.contains(textDiv)) textDiv.remove();
    if (floatingTextStacks[stackKey]) floatingTextStacks[stackKey]--;
    if (floatingTextStacks[stackKey] <= 0) delete floatingTextStacks[stackKey];
  }, 6000);
}

function displayRoundMessage(message) {
  roundMessageInfo = { text: message, alpha: 1.0, startTime: Date.now() };
  renderGameScreen();
  setTimeout(() => {
    if (roundMessageInfo && roundMessageInfo.text === message) {
      const fadeInterval = setInterval(() => {
        if (!roundMessageInfo) return clearInterval(fadeInterval);
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

function parseAndPopulateArmybook(textAreaId, isAttacker) {
  const text = $(`#${textAreaId}`).val();
  const parsedResult = parseArmybook(text);
  if (isAttacker) {
    currentAttackerUnits = parsedResult.units;
    currentAttackerArmyName = parsedResult.armyName;
  } else {
    currentDefenderUnits = parsedResult.units;
    currentDefenderArmyName = parsedResult.armyName;
  }
  cacheStale = true;
}

function setupInitialUI() {
  unitTooltipElement = document.getElementById("unit-tooltip");
  $("#generateTerrainButton, #skipTerrainButton").show();
  $("#startDeploymentButton, #aiButton, #playRoundButton").hide();
  $("body").toggleClass(
    "game-tab-active",
    $(".tab-button.active").data("tab") === "tab-game"
  );
  parseAndPopulateArmybook("attackerTextBox", true);
  parseAndPopulateArmybook("defenderTextBox", false);
}

function initializeApp() {
  setupInitialUI();

  $(".tab-button").on("click", function () {
    const tabId = $(this).data("tab");
    $(".tab-button, .tab-content").removeClass("active");
    $(this).addClass("active");
    $("#" + tabId).addClass("active");
    $("body").toggleClass("game-tab-active", tabId === "tab-game");
    if (tabId === "tab-game") {
      renderGameScreen();
    }
  });

  $("#parseAttackerButton").on("click", () => {
    parseAndPopulateArmybook("attackerTextBox", true);
    if ($("#tab-game").hasClass("active")) renderGameScreen();
  });

  $("#parseDefenderButton").on("click", () => {
    parseAndPopulateArmybook("defenderTextBox", false);
    if ($("#tab-game").hasClass("active")) renderGameScreen();
  });

  $("#generateTerrainButton").on("click", function () {
    $(this).parent().find("button").hide();
    terrainFeatures = generateAndPlaceAllTerrain();
    setupObjectives();
    renderGameScreen();
    $("#startDeploymentButton").show();
  });

  $("#skipTerrainButton").on("click", function () {
    $(this).parent().find("button").hide();
    terrainFeatures = [];
    setupObjectives();
    renderGameScreen();
    $("#startDeploymentButton").show();
  });

  $("#startDeploymentButton").on("click", function () {
    $(this).prop("disabled", true);
    startDeploymentPhase();
  });

  $("#aiButton").on("click", async () => {
    if (!isDeploymentComplete) return;
    $("#aiButton, #playRoundButton").prop("disabled", true);
    await activateSingleUnitForCurrentSide();
    finalizeAITurn();
    $("#aiButton, #playRoundButton").prop("disabled", false);
  });

  $("#playRoundButton").on("click", async () => {
    if (!isDeploymentComplete) return;
    $("#aiButton, #playRoundButton").prop("disabled", true);
    await playFullRound();
    $("#aiButton, #playRoundButton").prop("disabled", false);
  });

  $("#gameCanvas").on("mousemove", (event) => {
    if (!pxPerInch || !$("#tab-game").hasClass("active"))
      return hideUnitTooltip();
    const rect = event.target.getBoundingClientRect();
    const mouseXIn = (event.clientX - rect.left) / pxPerInch;
    const mouseYIn = (event.clientY - rect.top) / pxPerInch;
    let foundData = null;
    const allClusters = [...clusterCache.attackers, ...clusterCache.defenders];
    for (const cluster of allClusters) {
      const radius = getEffectiveRadius(cluster);
      if (
        Math.hypot(mouseXIn - cluster.cxIn, mouseYIn - cluster.cyIn) < radius
      ) {
        foundData = cluster;
        break;
      }
    }
    if (!foundData) {
      for (const terrain of terrainFeatures) {
        if (
          mouseXIn >= terrain.x &&
          mouseXIn <= terrain.x + terrain.widthIn &&
          mouseYIn >= terrain.y &&
          mouseYIn <= terrain.y + terrain.heightIn
        ) {
          foundData = terrain;
          break;
        }
      }
    }
    if (foundData && currentlyHoveredUnitId !== foundData.id) {
      showUnitTooltip(foundData, event.pageX, event.pageY);
      currentlyHoveredUnitId = foundData.id;
    } else if (!foundData) {
      hideUnitTooltip();
    }
  });

  $("#gameCanvas").on("mouseout", hideUnitTooltip);
  $(window).on("resize", renderGameScreen);
}

// This is the single entry point that kicks everything off.
$(document).ready(initializeApp);
