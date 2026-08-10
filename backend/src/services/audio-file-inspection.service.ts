import { spawn } from 'child_process';
import fs from 'fs';
import ffmpegStatic from 'ffmpeg-static';

const PROBE_TIMEOUT_MS = 20_000;

export type DetectedAudioFormat = 'webm' | 'wav' | 'mp3' | 'mp4' | 'ogg';

export class AudioFileInspectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function detectFormat(header: Buffer): DetectedAudioFormat | null {
  if (header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE') {
    return 'wav';
  }
  if (header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return 'webm';
  }
  if (header.length >= 4 && header.toString('ascii', 0, 4) === 'OggS') {
    return 'ogg';
  }
  if (header.length >= 3 && header.toString('ascii', 0, 3) === 'ID3') {
    return 'mp3';
  }
  if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    return 'mp3';
  }
  if (header.length >= 12 && header.toString('ascii', 4, 8) === 'ftyp') {
    return 'mp4';
  }
  return null;
}

function timestampSeconds(value: string): number | null {
  const match = value.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function durationFromFfmpeg(stderr: string): number | null {
  const declared = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/)?.[1];
  if (declared) return timestampSeconds(declared);

  const progress = [...stderr.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
  return progress.length ? timestampSeconds(progress[progress.length - 1]?.[1] ?? '') : null;
}

async function probeAudio(filePath: string): Promise<number> {
  const executable = ffmpegStatic;
  if (!executable) {
    throw new AudioFileInspectionError(
      'Проверка аудиофайла временно недоступна',
      'AUDIO_PROBE_UNAVAILABLE',
      503,
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      '-hide_banner',
      '-i', filePath,
      '-map', '0:a:0',
      '-f', 'null',
      '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new AudioFileInspectionError(
        'Не удалось проверить аудиофайл',
        'AUDIO_PROBE_TIMEOUT',
        422,
      )));
    }, PROBE_TIMEOUT_MS);

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
    });
    child.on('error', () => finish(() => reject(new AudioFileInspectionError(
      'Проверка аудиофайла временно недоступна',
      'AUDIO_PROBE_UNAVAILABLE',
      503,
    ))));
    child.on('close', (code) => finish(() => {
      const durationSec = durationFromFfmpeg(stderr);
      if (code !== 0 || !stderr.includes('Audio:') || !durationSec || durationSec <= 0) {
        reject(new AudioFileInspectionError(
          'Файл не содержит корректной аудиозаписи',
          'AUDIO_FILE_INVALID',
          422,
        ));
        return;
      }
      resolve(durationSec);
    }));
  });
}

export const audioFileInspectionService = {
  async inspect(filePath: string): Promise<{
    format: DetectedAudioFormat;
    durationSec: number;
  }> {
    const handle = await fs.promises.open(filePath, 'r');
    const header = Buffer.alloc(64);
    try {
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const format = detectFormat(header.subarray(0, bytesRead));
      if (!format) {
        throw new AudioFileInspectionError(
          'Неподдерживаемый или повреждённый формат аудио',
          'AUDIO_FORMAT_UNSUPPORTED',
        );
      }

      const durationSec = await probeAudio(filePath);
      return { format, durationSec };
    } finally {
      await handle.close();
    }
  },
};
