/**
 * DigitalVision — Place-to-Place Navigation Guidance Engine
 *
 * Provides real-time assistive walking directions:
 * - Divides field of view into Left, Center Path, and Right zones
 * - Calculates object proximity and collision hazard ratings
 * - Detects clear walking corridors, doorways, and obstacles
 * - Generates timely, concise directional guidance (straight, steer left, steer right, stop)
 */

/**
 * Spatial corridor evaluation.
 *
 * @param {Array} predictions - Array of COCO-SSD detected objects
 * @param {number} frameWidth - Width of video frame
 * @param {number} frameHeight - Height of video frame
 * @param {string} [destination=''] - Optional target destination
 * @returns {{
 *   spokenAdvice: string,
 *   isUrgent: boolean,
 *   direction: 'straight'|'left'|'right'|'blocked',
 *   centerObstacles: Array,
 *   doorwaysFound: Array,
 *   destinationFound: boolean
 * }}
 */
export function evaluateNavigationGuidance(
  predictions = [],
  frameWidth = 640,
  frameHeight = 480,
  destination = ''
) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    const destNote = destination ? ` towards ${destination}` : '';
    return {
      spokenAdvice: `Path is clear ahead${destNote}. Continue walking forward carefully.`,
      isUrgent: false,
      direction: 'straight',
      centerObstacles: [],
      doorwaysFound: [],
      destinationFound: false,
    };
  }

  const leftZoneWidth = frameWidth * 0.33;
  const rightZoneStart = frameWidth * 0.67;

  const centerObstacles = [];
  const leftObstacles = [];
  const rightObstacles = [];
  const doorways = [];
  let destinationMatched = false;

  const destLower = (destination || '').toLowerCase();

  for (const pred of predictions) {
    const [x, _y, w, h] = pred.bbox;
    const centerX = x + w / 2;
    const relativeHeight = h / frameHeight;
    const label = (pred.label || '').toLowerCase();

    // Estimate proximity: relative height >= 0.6 is very close (~1m), >= 0.35 is near (~2m)
    let distanceMeters = '3 meters';
    let isImmediate = false;

    if (relativeHeight > 0.62) {
      distanceMeters = '1 meter';
      isImmediate = true;
    } else if (relativeHeight > 0.38) {
      distanceMeters = '2 meters';
    }

    const itemInfo = {
      label: pred.label,
      score: pred.score,
      distance: distanceMeters,
      isImmediate,
      relativeHeight,
    };

    // Check if item matches user destination
    if (destLower && label.includes(destLower)) {
      destinationMatched = true;
    }

    // Identify doorways / open passages
    if (label.includes('door') || label.includes('entrance') || label.includes('exit')) {
      doorways.push(itemInfo);
    }

    // Categorize into zones
    if (centerX < leftZoneWidth) {
      leftObstacles.push(itemInfo);
    } else if (centerX > rightZoneStart) {
      rightObstacles.push(itemInfo);
    } else {
      centerObstacles.push(itemInfo);
    }
  }

  // 1. Destination Landmark Found Check
  if (destinationMatched) {
    return {
      spokenAdvice: `Approaching your destination: ${destination} is visible directly ahead!`,
      isUrgent: false,
      direction: 'straight',
      centerObstacles,
      doorwaysFound: doorways,
      destinationFound: true,
    };
  }

  // 2. Doorway Found Check
  if (doorways.length > 0) {
    const door = doorways[0];
    return {
      spokenAdvice: `Doorway detected straight ahead at about ${door.distance}. Path is open.`,
      isUrgent: false,
      direction: 'straight',
      centerObstacles,
      doorwaysFound: doorways,
      destinationFound: false,
    };
  }

  // 3. Immediate Center Hazard Check (Collision warning)
  const urgentCenter = centerObstacles.find((o) => o.isImmediate);
  if (urgentCenter) {
    const alternative = leftObstacles.length <= rightObstacles.length ? 'step left' : 'step right';
    return {
      spokenAdvice: `Caution! ${urgentCenter.label} directly in front at 1 meter. Please stop and ${alternative}.`,
      isUrgent: true,
      direction: 'blocked',
      centerObstacles,
      doorwaysFound: doorways,
      destinationFound: false,
    };
  }

  // 4. Moderate Center Obstacle (Steer around)
  if (centerObstacles.length > 0) {
    const obs = centerObstacles[0];
    const steerDir = leftObstacles.length <= rightObstacles.length ? 'left' : 'right';
    return {
      spokenAdvice: `${obs.label} ahead at ${obs.distance}. Clear corridor on your ${steerDir}. Steer slightly ${steerDir}.`,
      isUrgent: false,
      direction: steerDir,
      centerObstacles,
      doorwaysFound: doorways,
      destinationFound: false,
    };
  }

  // 5. Center is Clear, check peripheral obstacles
  if (leftObstacles.length > 0 && rightObstacles.length === 0) {
    return {
      spokenAdvice: `Walking path is clear ahead. ${leftObstacles[0].label} on your left. Continue straight.`,
      isUrgent: false,
      direction: 'straight',
      centerObstacles,
      doorwaysFound: doorways,
      destinationFound: false,
    };
  }

  if (rightObstacles.length > 0 && leftObstacles.length === 0) {
    return {
      spokenAdvice: `Walking path is clear ahead. ${rightObstacles[0].label} on your right. Continue straight.`,
      isUrgent: false,
      direction: 'straight',
      centerObstacles,
      doorwaysFound: doorways,
      destinationFound: false,
    };
  }

  // 6. Both flanks have obstacles but center is clear
  if (leftObstacles.length > 0 && rightObstacles.length > 0) {
    return {
      spokenAdvice: `Corridor clear straight ahead. Keep to the center between objects on your left and right.`,
      isUrgent: false,
      direction: 'straight',
      centerObstacles,
      doorwaysFound: doorways,
      destinationFound: false,
    };
  }

  // Default: clear walking path
  const destSuffix = destination ? ` towards ${destination}` : '';
  return {
    spokenAdvice: `Path is clear ahead${destSuffix}. Walk forward steadily.`,
    isUrgent: false,
    direction: 'straight',
    centerObstacles,
    doorwaysFound: doorways,
    destinationFound: false,
  };
}
