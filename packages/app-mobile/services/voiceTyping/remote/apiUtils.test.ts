import { httpErrorMessage, normalizeBaseUrl, parseModelList, parseTranscriptionResponse, serverHostname, transcriptionFormFields } from './apiUtils';

describe('apiUtils', () => {
	test.each([
		['https://example.com', 'https://example.com/v1'],
		['https://example.com/', 'https://example.com/v1'],
		['  https://example.com:8443  ', 'https://example.com:8443/v1'],
		['https://example.com/v1', 'https://example.com/v1'],
		['https://example.com/v1/', 'https://example.com/v1'],
		['HTTPS://example.com/api/openai/v1', 'HTTPS://example.com/api/openai/v1'],
	])('should normalize the base URL %j', (url, expected) => {
		expect(normalizeBaseUrl(url)).toBe(expected);
	});

	test.each([
		'',
		'   ',
		'http://example.com/v1',
		'example.com/v1',
		'ftp://example.com',
	])('should reject the base URL %j', (url) => {
		expect(() => normalizeBaseUrl(url)).toThrow();
	});

	test('should get the hostname of the server', () => {
		expect(serverHostname('https://whisper.example.com/v1')).toBe('whisper.example.com');
		expect(serverHostname('https://example.com:8443')).toBe('example.com:8443');
	});

	test('should omit blank and "auto" fields from transcription requests', () => {
		expect(transcriptionFormFields({ model: '', language: '', prompt: '' })).toEqual({});
		expect(transcriptionFormFields({ model: ' ', language: 'auto', prompt: ' ' })).toEqual({});
		expect(transcriptionFormFields({ model: 'AUTO', language: ' sv ', prompt: 'Glossary: Joplin' })).toEqual({
			language: 'sv',
			prompt: 'Glossary: Joplin',
		});
		expect(transcriptionFormFields({ model: 'kb-whisper-large', language: 'en', prompt: '' })).toEqual({
			model: 'kb-whisper-large',
			language: 'en',
		});
	});

	test('should describe HTTP errors', () => {
		expect(httpErrorMessage(401, '{"detail":"Invalid API key"}')).toContain('API key');
		expect(httpErrorMessage(401, '{"detail":"Invalid API key"}')).toContain('Invalid API key');
		expect(httpErrorMessage(500, '{"error":{"message":"Model not loaded"}}')).toContain('Model not loaded');
		expect(httpErrorMessage(502, 'Bad gateway')).toContain('502');
		expect(httpErrorMessage(502, 'Bad gateway')).toContain('Bad gateway');
	});

	test('should parse transcription responses', () => {
		expect(parseTranscriptionResponse('{"text":" Hej hej. "}')).toBe(' Hej hej. ');
		expect(() => parseTranscriptionResponse('not json')).toThrow();
		expect(() => parseTranscriptionResponse('{"result":"test"}')).toThrow();
	});

	test('should parse model lists', () => {
		expect(parseModelList('{"object":"list","data":[{"id":"b"},{"id":"a"},{"name":"no-id"}]}')).toEqual(['a', 'b']);
		expect(parseModelList('{"data":[]}')).toEqual([]);
		expect(() => parseModelList('{"models":[]}')).toThrow();
	});
});
