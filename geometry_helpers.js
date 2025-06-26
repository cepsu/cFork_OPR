// --- geometry_helpers.js ---
// Helper functions for collision detection, distance calculations, and board geometry.

function getEffectiveRadius(cluster) {
  if (!cluster?.wIn || !cluster?.hIn) return DIA_IN / 2;
  return Math.max(cluster.wIn, cluster.hIn) / 2;
}

function areClustersColliding(cluster1, cluster2, minSeparationIn = 0) {
  if (!cluster1 || !cluster2) return false;
  const dist = Math.hypot(
    cluster1.cxIn - cluster2.cxIn,
    cluster1.cyIn - cluster2.cyIn
  );
  return (
    dist <
    getEffectiveRadius(cluster1) +
      getEffectiveRadius(cluster2) +
      minSeparationIn
  );
}

function isUnitNearPoint(unitCluster, pointInches, distanceInches) {
  if (!unitCluster?.models?.length) return false;
  return unitCluster.models.some(
    (model) =>
      Math.hypot(model.x - pointInches.x, model.y - pointInches.y) <=
      distanceInches
  );
}

function calculateDistancePointToSegment(point, segmentA, segmentB) {
  const l2 = (segmentB.x - segmentA.x) ** 2 + (segmentB.y - segmentA.y) ** 2;
  if (l2 === 0) return Math.hypot(point.x - segmentA.x, point.y - segmentA.y);
  let t =
    ((point.x - segmentA.x) * (segmentB.x - segmentA.x) +
      (point.y - segmentA.y) * (segmentB.y - segmentA.y)) /
    l2;
  t = Math.max(0, Math.min(1, t));
  const closestPointX = segmentA.x + t * (segmentB.x - segmentA.x);
  const closestPointY = segmentA.y + t * (segmentB.y - segmentA.y);
  return Math.hypot(point.x - closestPointX, point.y - closestPointY);
}

function getQuadrantCenter(quadrantIndex) {
  const halfW = ZONE_W_IN / 2,
    halfH = ZONE_H_IN / 2;
  switch (quadrantIndex) {
    case 0:
      return { x: halfW / 2, y: halfH / 2 };
    case 1:
      return { x: halfW + halfW / 2, y: halfH / 2 };
    case 2:
      return { x: halfW / 2, y: halfH + halfH / 2 };
    case 3:
      return { x: halfW + halfW / 2, y: halfH + halfH / 2 };
    default:
      return { x: ZONE_W_IN / 2, y: ZONE_H_IN / 2 };
  }
}

function findValidPlacementInSection(
  unitGroupData,
  side,
  deploymentEdge,
  existingClusters,
  sectionIndex
) {
  const modelCount = unitGroupData.subUnits.reduce(
    (sum, su) => sum + (su.models || 1),
    0
  );
  const cols = Math.ceil(Math.sqrt(modelCount));
  const unitW = cols * DIA_IN,
    unitH = Math.ceil(modelCount / cols) * DIA_IN;
  const halfW = unitW / 2,
    halfH = unitH / 2;
  const tempUnit = { name: unitGroupData.name, wIn: unitW, hIn: unitH };

  const yStart =
    deploymentEdge === "top" ? MARGIN_Y - halfH : ZONE_H_IN - MARGIN_Y + halfH;
  const yStep = deploymentEdge === "top" ? -DIA_IN / 2 : DIA_IN / 2;
  const sectionWidth = ZONE_W_IN / 3;
  const sectionXMin = sectionIndex * sectionWidth;
  const sectionXMax = (sectionIndex + 1) * sectionWidth;

  for (let yAttempt = 0; yAttempt < 20; yAttempt++) {
    const testCy = yStart + yAttempt * yStep;
    for (let xAttempt = 0; xAttempt < 10; xAttempt++) {
      const testCx = sectionXMin + sectionWidth * Math.random();
      if (testCx < sectionXMin + halfW || testCx > sectionXMax - halfW)
        continue;
      tempUnit.cxIn = testCx;
      tempUnit.cyIn = testCy;
      let collision = Object.values(existingClusters)
        .flat()
        .some((ec) => areClustersColliding(tempUnit, ec, 0.5));
      if (!collision) {
        return {
          finalCxIn: testCx,
          finalCyIn: testCy,
          originXInches: testCx - halfW,
          originYInches: testCy - halfH,
        };
      }
    }
  }
  return null;
}
