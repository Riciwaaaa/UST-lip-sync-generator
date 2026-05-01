const notes = [
  { startTimeMs: 0, durationMs: 100 },
  { startTimeMs: 200, durationMs: 100 },
  { startTimeMs: 400, durationMs: 100 }
];

const findNote = (visualTime) => {
    let l = 0, r = notes.length - 1;
    let activeNote = null;
    while (l <= r) {
      const m = Math.floor((l + r) / 2);
      const note = notes[m];
      if (visualTime >= note.startTimeMs && visualTime < note.startTimeMs + note.durationMs) {
        activeNote = note;
        break;
      } else if (visualTime < note.startTimeMs) {
        r = m - 1;
      } else {
        l = m + 1;
      }
    }
    return activeNote;
};

console.log("50:", findNote(50));
console.log("150:", findNote(150));
console.log("250:", findNote(250));
