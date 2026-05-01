import { TextDecoder } from 'util';

try {
  const decoder = new TextDecoder('shift-jis', { fatal: true });
  console.log("shift-jis supported!");
} catch (e) {
  console.error("error!", e);
}
