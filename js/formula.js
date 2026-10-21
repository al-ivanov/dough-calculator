/**
 * Pizza dough weights.
 *
 * Reference batch: 6 pizzas, 16 inches, regular thickness.
 * Regular flour for that batch is 1,509.797685 g scaled by 480/425,
 * so each ball weighs 480 g. Gluten-free flour for the same batch is 1,998 g.
 * Flour then scales with pizza area (diameter squared), count, and thickness.
 * Dough-ball weight uses the reference dough-to-flour ratio 2,550 / 1,509.797685,
 * including for gluten-free dough.
 *
 * Diameters enter in centimetres and are converted to inches (÷ 2.54)
 * before that scaling, so a given physical size matches the original.
 */

const CM_PER_INCH = 2.54;

const THICKNESS_FACTOR = {
  thin: 1.8,
  regular: 2.11,
  thick: 2.75,
};

const REFERENCE_COUNT = 6;
const REFERENCE_DIAMETER_IN = 16;
const REFERENCE_THICKNESS = THICKNESS_FACTOR.regular;

const REGULAR_REFERENCE_FLOUR = 1509.797685 * (480 / 425);
const GLUTEN_FREE_REFERENCE_FLOUR = 333 * 6;
const DOUGH_PER_FLOUR = 2550 / 1509.797685;

const BAKER = {
  yeast: 0.004,
  salt: 0.025,
  sugar: 0.02,
  oil: 0.033,
  hydration: 0.62,
  hydrationGlutenFree: 0.8,
};

export function calculate({ diameterCm, count, thickness, glutenFree }) {
  const thicknessFactor = THICKNESS_FACTOR[thickness];
  if (!thicknessFactor) {
    throw new Error(`Unknown thickness: ${thickness}`);
  }
  if (!(diameterCm > 0) || !(count > 0)) {
    throw new Error("Diameter and count must be positive");
  }

  const diameterIn = diameterCm / CM_PER_INCH;
  const baseFlour = glutenFree ? GLUTEN_FREE_REFERENCE_FLOUR : REGULAR_REFERENCE_FLOUR;
  const flour =
    baseFlour *
    Math.pow(diameterIn / REFERENCE_DIAMETER_IN, 2) *
    (count / REFERENCE_COUNT) *
    (thicknessFactor / REFERENCE_THICKNESS);

  const hydration = glutenFree ? BAKER.hydrationGlutenFree : BAKER.hydration;

  return {
    diameterCm,
    diameterIn,
    count,
    thickness,
    glutenFree,
    ball: Math.round((flour * DOUGH_PER_FLOUR) / count),
    flour: Math.round(flour),
    water: Math.round(flour * hydration),
    hydrationPercent: Math.round(hydration * 100),
    yeast: Number((flour * BAKER.yeast).toFixed(1)),
    salt: Math.round(flour * BAKER.salt),
    sugar: Math.round(flour * BAKER.sugar),
    oil: Math.round(flour * BAKER.oil),
  };
}
