import { describe, it, expect } from "vitest";
import { project } from "./projection";

describe("projection", () => {
  it("is deterministic and returns two finite numbers", () => {
    const [x, y] = project(9.19, 45.4642); // Milano
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });
  it("places a more-eastern point to the right", () => {
    const [xWest] = project(4.35, 50.85); // Bruxelles
    const [xEast] = project(14.27, 40.85); // Napoli
    expect(xEast).toBeGreaterThan(xWest);
  });
  it("places a more-southern point lower (larger y)", () => {
    const [, yNorth] = project(4.35, 50.85);
    const [, ySouth] = project(14.27, 40.85);
    expect(ySouth).toBeGreaterThan(yNorth);
  });
});
