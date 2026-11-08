// Sample file: a small module to edit in the source view.
// Try `Ctrl+S`, undo/redo, and switching tabs without losing a draft.

export type Set = {
  weight: number;
  reps: number;
};

export type Entry = {
  exercise: string;
  sets: Set[];
};

/** Total volume: the sum of weight x reps over every set. */
export function volume(entry: Entry) {
  return entry.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
}

export function bestSet(entry: Entry) {
  return entry.sets.reduce<Set | undefined>(
    (best, set) => (!best || set.weight > best.weight ? set : best),
    undefined,
  );
}

const session: Entry[] = [
  { exercise: "Squat", sets: [{ weight: 80, reps: 5 }, { weight: 80, reps: 5 }] },
  { exercise: "Bench", sets: [{ weight: 60, reps: 5 }] },
];

console.log(session.map((entry) => `${entry.exercise}: ${volume(entry)}`));
