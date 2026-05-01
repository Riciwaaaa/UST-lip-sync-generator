import * as fs from 'fs';
import * as Encoding from 'encoding-japanese';

function run() {
  const fileContent = fs.readFileSync('a.ust');
  
  // same logic as in handleFile
  const buffer = fileContent.buffer;
  let result = '';
  try {
    const uint8Array = new Uint8Array(buffer);
    const detected = Encoding.detect(uint8Array);
    const detectedStr = detected ? detected.toString().toUpperCase() : 'SJIS';
    
    if (detectedStr.includes('UTF8') || detectedStr.includes('UNICODE')) {
      result = new TextDecoder('utf-8').decode(buffer);
    } else if (detectedStr === 'UTF16' || detectedStr === 'UTF16LE') {
      result = new TextDecoder('utf-16le').decode(buffer);
    } else if (detectedStr === 'UTF16BE') {
      result = new TextDecoder('utf-16be').decode(buffer);
    } else {
      result = Encoding.convert(uint8Array, {
        to: 'UNICODE',
        from: detected || 'SJIS',
        type: 'string'
      }) as unknown as string;
    }
  } catch (encodingErr) {
    console.error("encoding error", encodingErr);
    result = new TextDecoder('utf-8').decode(buffer);
  }

  // same logic as in parseUst
  try {
    const lines = result.split(/\r\n|\n|\r/);
    let currentTempo = 120;
    let currentSection = '';
    let currentNote: any = {};
    const notes: any[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const sectionMatch = trimmedLine.match(/^\[#(.+)\]$/) || trimmedLine.match(/^\uFEFF?\[#(.+)\]$/);
      if (sectionMatch) {
         if (currentSection.match(/^\d+$/) && currentNote) {
            notes.push({
               index: notes.length + 1,
               originalLyric: currentNote.originalLyric || 'R',
               lyric: currentNote.lyric || 'R',
               length: currentNote.length || 480,
               startTimeMs: 0,
               durationMs: 0,
            });
         }
         currentSection = sectionMatch[1];
         if (currentSection.match(/^\d+$/)) {
           currentNote = { indexStr: currentSection, length: 480, lyric: 'R', originalLyric: 'R' };
         } else {
           currentNote = {};
         }
         continue;
      }

      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex !== -1) {
          const key = trimmedLine.substring(0, equalIndex).trim().toLowerCase();
          const value = trimmedLine.substring(equalIndex + 1).trim();

          if (currentSection === 'SETTING' && key === 'tempo') {
             const parsedTempo = parseFloat(value.replace(',', '.'));
             if (!isNaN(parsedTempo) && parsedTempo > 0) {
               currentTempo = parsedTempo;
             }
          } else if (currentSection.match(/^\d+$/)) {
             if (key === 'length') {
                const parsedLen = parseInt(value, 10);
                if (!isNaN(parsedLen)) currentNote.length = parsedLen;
             } else if (key === 'lyric') {
                currentNote.originalLyric = value || 'R';
                const parts = currentNote.originalLyric.split(' ');
                currentNote.lyric = parts[parts.length - 1] || 'R';
             }
          }
      }
    }

    if (currentSection.match(/^\d+$/) && currentNote) {
       notes.push({
           index: notes.length + 1,
           originalLyric: currentNote.originalLyric || 'R',
           lyric: currentNote.lyric || 'R',
           length: currentNote.length || 480,
           startTimeMs: 0,
           durationMs: 0,
       });
    }

    if (notes.length === 0) {
      throw new Error("No notes found in .ust file (maybe corrupted?)");
    }
    
    console.log("Success", notes);
  } catch (err) {
    console.error("parse error", err);
  }
}

run();
