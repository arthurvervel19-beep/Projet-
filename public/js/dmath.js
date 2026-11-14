// Calculs « déterministes » pour la simulation.
// En multijoueur, chaque navigateur calcule la partie de son côté : les résultats doivent être
// identiques au bit près sur Chrome, Safari et Firefox. Math.hypot, Math.sin et Math.cos sont
// approximés différemment selon les navigateurs ; ces versions n'utilisent que + - * / et Math.sqrt,
// dont le résultat est fixé par la norme IEEE 754.

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

// distance euclidienne
export function hypot(x, y) { return Math.sqrt(x * x + y * y); }

// sinus par série de Taylor sur [-π/2, π/2] (erreur < 1e-11)
export function dsin(x) {
  x -= TWO_PI * Math.floor((x + PI) / TWO_PI);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880
    + x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))));
}

export function dcos(x) { return dsin(x + HALF_PI); }
