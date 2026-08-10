import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  audioFileInspectionService,
  AudioFileInspectionError,
} from '../../src/services/audio-file-inspection.service';

const createdPaths: string[] = [];

function wavBuffer(durationSeconds = 1): Buffer {
  const sampleRate = 8_000;
  const channels = 1;
  const bitsPerSample = 16;
  const dataLength = sampleRate * durationSeconds * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

async function tempFile(contents: Buffer): Promise<string> {
  const filePath = path.join(os.tmpdir(), `lumaiq-audio-test-${Date.now()}-${Math.random()}`);
  await fs.promises.writeFile(filePath, contents);
  createdPaths.push(filePath);
  return filePath;
}

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map((filePath) => fs.promises.unlink(filePath).catch(() => undefined)));
});

describe('audioFileInspectionService', () => {
  it('detects a real WAV file and measures its duration', async () => {
    const filePath = await tempFile(wavBuffer());

    const result = await audioFileInspectionService.inspect(filePath);

    expect(result.format).toBe('wav');
    expect(result.durationSec).toBeGreaterThan(0.9);
    expect(result.durationSec).toBeLessThan(1.1);
  });

  it('rejects bytes that do not match a supported media container', async () => {
    const filePath = await tempFile(Buffer.from('not-an-audio-file'));

    await expect(audioFileInspectionService.inspect(filePath)).rejects.toMatchObject({
      code: 'AUDIO_FORMAT_UNSUPPORTED',
      status: 400,
    } satisfies Partial<AudioFileInspectionError>);
  });

  it('rejects a forged WAV signature without a valid audio stream', async () => {
    const fake = Buffer.alloc(128);
    fake.write('RIFF', 0);
    fake.write('WAVE', 8);
    const filePath = await tempFile(fake);

    await expect(audioFileInspectionService.inspect(filePath)).rejects.toMatchObject({
      code: 'AUDIO_FILE_INVALID',
      status: 422,
    } satisfies Partial<AudioFileInspectionError>);
  });
});
