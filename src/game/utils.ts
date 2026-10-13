import { ASTEROID, SHIP } from './config';

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export interface Vec2 {
  x: number;
  y: number;
}

export function genAsteroidPolygon(baseRadius: number, vertexCount: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const angle = (i / vertexCount) * Math.PI * 2;
    const scale =
      ASTEROID.minRadiusScale +
      Math.random() * (ASTEROID.maxRadiusScale - ASTEROID.minRadiusScale);
    const r = baseRadius * scale;
    pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return pts;
}

export function computeShipInertia(): number {
  // Rectangle approximation: (m * (w^2 + h^2)) / 12, scaled to feel responsive
  const w = SHIP.radius * 1.6;
  const h = SHIP.radius * 1.9;
  return (SHIP.mass * (w * w + h * h)) / 12 * SHIP.angularInertia;
}

export function computeAsteroidInertia(
  points: Vec2[],
  mass: number
): { com: Vec2; inertia: number } {
  // Polygon second moment of area about origin, shifted to centroid
  let area = 0;
  let cx = 0;
  let cy = 0;
  let I = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const cross = p1.x * p2.y - p2.x * p1.y;
    area += cross * 0.5;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
    I +=
      (cross *
        (p1.x * p1.x + p1.x * p2.x + p2.x * p2.x +
         p1.y * p1.y + p1.y * p2.y + p2.y * p2.y)) / 12;
  }
  area = Math.abs(area);
  cx /= 6 * area;
  cy /= 6 * area;
  I = Math.abs(I) - area * (cx * cx + cy * cy);
  return { com: { x: cx, y: cy }, inertia: mass * (I / area) };
}

export function computeAsteroidMass(points: Vec2[]): number {
  // Shoelace area, scaled by density
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area2 += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area2) * 0.5 * ASTEROID.density;
}
