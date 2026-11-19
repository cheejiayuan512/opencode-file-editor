// One budget for every property test.
//
// `npm test` runs a short pass that keeps the suite quick. The nightly workflow
// raises FUZZ_RUNS and picks a fresh seed, so the input space keeps being
// explored instead of being fixed to the cases that happened to pass once.
// A failure prints the seed and the shrunk counterexample; paste both into the
// issue so the case is reproducible.

function budget(name, fallback, min) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

export const FUZZ = {
  numRuns: budget("FUZZ_RUNS", 200, 1),
  seed: budget("FUZZ_SEED", 20261114, 0),
};
