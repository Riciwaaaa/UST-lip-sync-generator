import Encoding from 'encoding-japanese';

export function decodeProjectBytes(buffer: ArrayBuffer, fileName: string): string {
  const isUstx = fileName.toLowerCase().endsWith('.ustx');
  const isVsqx = fileName.toLowerCase().endsWith('.vsqx');

  if (isUstx || isVsqx) {
    return new TextDecoder('utf-8').decode(buffer);
  }

  try {
    const uint8Array = new Uint8Array(buffer);
    const detected = Encoding.detect(uint8Array);
    const detectedStr = detected ? detected.toString().toUpperCase() : 'SJIS';

    if (detectedStr.includes('UTF8') || detectedStr.includes('UNICODE')) {
      return new TextDecoder('utf-8').decode(buffer);
    }
    if (detectedStr === 'UTF16' || detectedStr === 'UTF16LE') {
      return new TextDecoder('utf-16le').decode(buffer);
    }
    if (detectedStr === 'UTF16BE') {
      return new TextDecoder('utf-16be').decode(buffer);
    }

    return Encoding.convert(uint8Array, {
      to: 'UNICODE',
      from: detected || 'SJIS',
      type: 'string',
    }) as unknown as string;
  } catch (encodingErr) {
    console.error('encoding-japanese failed, falling back to utf-8 decoder:', encodingErr);
    return new TextDecoder('utf-8').decode(buffer);
  }
}
