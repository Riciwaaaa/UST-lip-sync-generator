import yaml from 'js-yaml';

const ustx = `
name: "test"
bpm: 120
resolution: 480
voice_parts:
  - name: "part1"
    position: 0
    notes:
      - position: 0
        duration: 480
        lyric: "a"
      - position: 480
        duration: 480
        lyric: "i"
`;

const parsed = yaml.load(ustx);
console.log(JSON.stringify(parsed, null, 2));
