import { ServerOptions, TranscribeOptions, TranscriptionRequest } from './types';

// rn-fetch-blob isn't available on web, where voice typing isn't supported.

export const listModels = async (_options: ServerOptions): Promise<string[]> => {
	throw new Error('Remote transcription is not supported on this platform.');
};

export const transcribe = (_audio: Float32Array, _sampleRate: number, _options: TranscribeOptions): TranscriptionRequest => {
	throw new Error('Remote transcription is not supported on this platform.');
};
