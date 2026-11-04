import { _ } from '@joplin/lib/locale';

// Returns the API base URL (e.g. https://example.com/v1), or throws a user-facing error.
// A bare origin gets "/v1" appended, since that's the most common mistake.
export const normalizeBaseUrl = (baseUrl: string) => {
	const trimmed = baseUrl.trim().replace(/\/+$/, '');
	if (!trimmed) {
		throw new Error(_('No remote transcription server URL is set. Set it in the voice typing settings.'));
	}

	const match = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(.*)$/i);
	if (!match) {
		throw new Error(_('Invalid remote transcription server URL: %s', trimmed));
	}
	const [, scheme, host, path] = match;
	// Android blocks cleartext HTTP by default, and the audio and API key shouldn't be sent in the clear.
	if (scheme.toLowerCase() !== 'https') {
		throw new Error(_('The remote transcription server URL must start with https://'));
	}

	return path ? trimmed : `https://${host}/v1`;
};

export const serverHostname = (baseUrl: string) => {
	const match = baseUrl.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
	return match ? match[1] : baseUrl.trim();
};

export interface TranscriptionFields {
	model: string;
	language: string;
	prompt: string;
}

// Most OpenAI-compatible servers reject an empty or "auto" model or language, so these
// are only sent when set to a real value.
export const transcriptionFormFields = ({ model, language, prompt }: TranscriptionFields) => {
	const fields: Record<string, string> = {};
	const isSet = (value: string) => !!value?.trim() && value.trim().toLowerCase() !== 'auto';

	if (isSet(model)) fields.model = model.trim();
	if (isSet(language)) fields.language = language.trim();
	if (prompt?.trim()) fields.prompt = prompt.trim();
	return fields;
};

const parseJson = (body: string): unknown => {
	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
};

const errorDetail = (body: string) => {
	const json = parseJson(body);
	if (json && typeof json === 'object') {
		const error = 'error' in json ? json.error : null;
		if (typeof error === 'string') return error;
		if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
		if ('detail' in json && typeof json.detail === 'string') return json.detail;
	}
	return body.trim().slice(0, 200);
};

export const httpErrorMessage = (status: number, body: string) => {
	const detail = errorDetail(body);
	if (status === 401 || status === 403) {
		return _('The remote transcription server rejected the API key (HTTP %d). %s', status, detail).trim();
	}
	return _('The remote transcription server returned an error (HTTP %d): %s', status, detail);
};

export const parseTranscriptionResponse = (body: string) => {
	const json = parseJson(body);
	if (!json || typeof json !== 'object' || !('text' in json) || typeof json.text !== 'string') {
		throw new Error(_('Unexpected response from the remote transcription server: %s', body.slice(0, 200)));
	}
	return json.text;
};

export const parseModelList = (body: string) => {
	const json = parseJson(body);
	if (!json || typeof json !== 'object' || !('data' in json) || !Array.isArray(json.data)) {
		throw new Error(_('Unexpected response from the remote transcription server: %s', body.slice(0, 200)));
	}

	const ids: string[] = [];
	for (const item of json.data) {
		if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
			ids.push(item.id);
		}
	}
	return ids.sort();
};
