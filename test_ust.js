import fs from 'fs';

const ustContent = `
[#VERSION]
UST Version1.2
[#SETTING]
Tempo=120.00
Tracks=1
[#0000]
Length=480
Lyric=a
[#0001]
Length=480
Lyric=i
`;

export const parseUst = (content: string) => {
    try {
      const lines = content.split(/\r?\n/);
      let currentTempo = 120;
      let currentSection = '';
      let currentNote: any = {};
      const notes: any[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const sectionMatch = trimmedLine.match(/^\[#(.+)\]$/);
        if (sectionMatch) {
          if (currentSection.match(/^\d+$/) && currentNote.length !== undefined && currentNote.originalLyric !== undefined) {
            notes.push({
              index: notes.length + 1,
              originalLyric: currentNote.originalLyric,
              lyric: currentNote.lyric || '',
              length: currentNote.length,
              startTimeMs: 0,
              durationMs: 0,
            });
          }
          currentSection = sectionMatch[1];
          if (currentSection.match(/^\d+$/)) {
            currentNote = { indexStr: currentSection };
          }
          continue;
        }

        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex !== -1) {
          const key = trimmedLine.substring(0, equalIndex).trim();
          const value = trimmedLine.substring(equalIndex + 1).trim();

          if (currentSection === 'SETTING' && key === 'Tempo') {
            const parsedTempo = parseFloat(value);
            if (!isNaN(parsedTempo) && parsedTempo > 0) {
              currentTempo = parsedTempo;
            }
          } else if (currentSection.match(/^\d+$/)) {
            if (key === 'Length') {
              currentNote.length = parseInt(value, 10);
            } else if (key === 'Lyric') {
              currentNote.originalLyric = value;
              const parts = value.split(' ');
              currentNote.lyric = parts[parts.length - 1];
            }
          }
        }
      }

      if (currentSection.match(/^\d+$/) && currentNote.length !== undefined && currentNote.originalLyric !== undefined) {
        notes.push({
          index: notes.length + 1,
           originalLyric: currentNote.originalLyric,
          lyric: currentNote.lyric || '',
          length: currentNote.length,
          startTimeMs: 0,
          durationMs: 0,
        });
      }

      console.log('Notes:', notes);
    } catch (err) {
      console.error(err);
    }
}

parseUst(ustContent);
