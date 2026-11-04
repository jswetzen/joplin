import RNFetchBlob from 'rn-fetch-blob';
import { Buffer } from 'buffer';
import shim from '@joplin/lib/shim';
import uuid from '@joplin/lib/uuid';
import { _ } from '@joplin/lib/locale';
import Logger from '@joplin/utils/Logger';
import encodeWav from './encodeWav';
import { httpErrorMessage, normalizeBaseUrl, parseModelList, parseTranscriptionResponse, serverHostname, transcriptionFormFields } from './apiUtils';
import { ServerOptions, TranscribeOptions, TranscriptionRequest } from './types';

const logger = Logger.create('voiceTyping/remote/api');

// Uploading a chunk and running inference on it can take far longer than the default
// timeout, especially on a slow mobile connection or a busy server.
const transcriptionTimeoutMs = 5 * 60 * 1000;
const listModelsTimeoutMs = 30 * 1000;

type Request = ReturnType<ReturnType<typeof RNFetchBlob.config>['fetch']>;

const authHeaders = (apiKey: string): Record<string, string> => {
	return apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {};
};

const runRequest = async (baseUrl: string, request: Request) => {
	let response;
	try {
		response = await request;
	} catch (error) {
		throw new Error(_('Could not reach the remote transcription server (%s): %s', serverHostname(baseUrl), error?.message ?? String(error)));
	}

	const status = response.respInfo.status;
	const body = response.text() as string;
	if (status >= 400) {
		throw new Error(httpErrorMessage(status, body));
	}
	return body;
};

export const listModels = async ({ baseUrl, apiKey }: ServerOptions) => {
	const apiBaseUrl = normalizeBaseUrl(baseUrl);
	const request = RNFetchBlob.config({ timeout: listModelsTimeoutMs })
		.fetch('GET', `${apiBaseUrl}/models`, authHeaders(apiKey));
	return parseModelList(await runRequest(apiBaseUrl, request));
};

// React Native's fetch can't reliably send binary request bodies, so the audio is written
// to a temporary file that rn-fetch-blob uploads as multipart form data.
export const transcribe = (audio: Float32Array, sampleRate: number, options: TranscribeOptions): TranscriptionRequest => {
	let request: Request|null = null;
	let cancelled = false;

	const run = async () => {
		const apiBaseUrl = normalizeBaseUrl(options.baseUrl);
		const wav = encodeWav(audio, sampleRate);
		const wavPath = `${shim.fsDriver().getCacheDirectoryPath()}/voice-typing-${uuid.createNano()}.wav`;

		try {
			await shim.fsDriver().writeFile(wavPath, Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength).toString('base64'), 'base64');
			if (cancelled) return '';

			const fields = Object.entries(transcriptionFormFields(options)).map(([name, data]) => ({ name, data }));
			request = RNFetchBlob.config({ timeout: transcriptionTimeoutMs }).fetch(
				'POST',
				`${apiBaseUrl}/audio/transcriptions`,
				{ ...authHeaders(options.apiKey), 'Content-Type': 'multipart/form-data' },
				[
					{ name: 'file', filename: 'audio.wav', type: 'audio/wav', data: RNFetchBlob.wrap(wavPath) },
					...fields,
				],
			);

			const startTime = Date.now();
			const body = await runRequest(apiBaseUrl, request);
			logger.debug(`Transcribed ${(audio.length / sampleRate).toFixed(1)}s of audio in ${Date.now() - startTime}ms`);
			return parseTranscriptionResponse(body);
		} finally {
			await shim.fsDriver().remove(wavPath);
		}
	};

	return {
		result: run(),
		cancel: () => {
			cancelled = true;
			void request?.cancel();
		},
	};
};
