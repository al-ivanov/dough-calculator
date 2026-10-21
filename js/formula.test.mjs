import assert from "node:assert/strict";
import test from "node:test";
import { calculate } from "./formula.js";

const cases = [
  {
    name: "16 in × 6 regular",
    inches: 16,
    count: 6,
    thickness: "regular",
    glutenFree: false,
    expect: { ball: 480, flour: 1705, water: 1057, hydrationPercent: 62, yeast: 6.8, salt: 43, sugar: 34, oil: 56 },
  },
  {
    name: "10 in × 1 thin",
    inches: 10,
    count: 1,
    thickness: "thin",
    glutenFree: false,
    expect: { ball: 160, flour: 95, water: 59, hydrationPercent: 62, yeast: 0.4, salt: 2, sugar: 2, oil: 3 },
  },
  {
    name: "20 in × 10 thick",
    inches: 20,
    count: 10,
    thickness: "thick",
    glutenFree: false,
    expect: { ball: 977, flour: 5787, water: 3588, hydrationPercent: 62, yeast: 23.1, salt: 145, sugar: 116, oil: 191 },
  },
  {
    name: "12 in × 4 regular",
    inches: 12,
    count: 4,
    thickness: "regular",
    glutenFree: false,
    expect: { ball: 270, flour: 639, water: 396, hydrationPercent: 62, yeast: 2.6, salt: 16, sugar: 13, oil: 21 },
  },
  {
    name: "16 in × 6 regular gluten-free",
    inches: 16,
    count: 6,
    thickness: "regular",
    glutenFree: true,
    expect: { ball: 562, flour: 1998, water: 1598, hydrationPercent: 80, yeast: 8, salt: 50, sugar: 40, oil: 66 },
  },
  {
    name: "18 in × 2 thin",
    inches: 18,
    count: 2,
    thickness: "thin",
    glutenFree: false,
    expect: { ball: 518, flour: 614, water: 380, hydrationPercent: 62, yeast: 2.5, salt: 15, sugar: 12, oil: 20 },
  },
  {
    name: "14 in × 8 regular",
    inches: 14,
    count: 8,
    thickness: "regular",
    glutenFree: false,
    expect: { ball: 368, flour: 1741, water: 1079, hydrationPercent: 62, yeast: 7, salt: 44, sugar: 35, oil: 57 },
  },
  {
    name: "12 in × 2 thick gluten-free",
    inches: 12,
    count: 2,
    thickness: "thick",
    glutenFree: true,
    expect: { ball: 412, flour: 488, water: 391, hydrationPercent: 80, yeast: 2, salt: 12, sugar: 10, oil: 16 },
  },
];

for (const sample of cases) {
  test(sample.name, () => {
    const result = calculate({
      diameterCm: sample.inches * 2.54,
      count: sample.count,
      thickness: sample.thickness,
      glutenFree: sample.glutenFree,
    });
    assert.deepEqual(
      {
        ball: result.ball,
        flour: result.flour,
        water: result.water,
        hydrationPercent: result.hydrationPercent,
        yeast: result.yeast,
        salt: result.salt,
        sugar: result.sugar,
        oil: result.oil,
      },
      sample.expect,
    );
  });
}
