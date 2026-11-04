import type { AudioRecorder } from '@joplin/whisper-voice-typing';
import RemoteTranscriptionSession, { Transcribe } from './RemoteTranscriptionSession';
import { concatAudio, silence, speech } from './testUtils';

// Returns the given audio, one part per waitForData call.
const createMockRecorder = (parts: Float32Array[]) => {
	let pending = new Float32Array(0);
	let index = 0;
	let onExhausted: ()=> void;
	const exhausted = new Promise<void>(resolve => {
		onExhausted = resolve;
	});

	const recorder = {
		start: jest.fn(),
		stop: jest.fn(),
		waitForData: jest.fn(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
			if (index < parts.length) {
				pending = concatAudio(pending, parts[index++]);
			}
			if (index >= parts.length) onExhausted();
		}),
		pullAvailable: jest.fn(() => {
			const result = pending;
			pending = new Float32Array(0);
			return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
		}),
	};
	return { recorder, exhausted };
};

const createSession = (parts: Float32Array[], transcribe: Transcribe) => {
	const { recorder, exhausted } = createMockRecorder(parts);
	const onFinalize = jest.fn();
	const session = new RemoteTranscriptionSession({
		recorder: recorder as unknown as AudioRecorder,
		transcribe: jest.fn(transcribe),
		callbacks: { onFinalize, onPreview: jest.fn() },
	});
	return { session, recorder, exhausted, onFinalize };
};

const respondWith = (...texts: string[]): Transcribe => {
	let index = 0;
	return () => ({ result: Promise.resolve(texts[index++]), cancel: jest.fn() });
};

describe('RemoteTranscriptionSession', () => {
	test('should transcribe each chunk in order, with paragraph breaks at long pauses', async () => {
		const { session, exhausted, onFinalize, recorder } = createSession(
			[speech(2), silence(2), speech(2)],
			respondWith(' First paragraph. ', 'Second paragraph.'),
		);

		const started = session.start();
		await exhausted;
		await session.stop();
		await started;

		expect(onFinalize.mock.calls).toEqual([
			['First paragraph.'],
			['\n\nSecond paragraph.'],
		]);
		expect(recorder.stop).toHaveBeenCalledTimes(1);
	});

	test('should join force-split chunks with a space', async () => {
		const parts = [];
		for (let i = 0; i < 13; i++) parts.push(speech(2));
		const { session, exhausted, onFinalize } = createSession(parts, respondWith('One', 'two'));

		const started = session.start();
		await exhausted;
		await session.stop();
		await started;

		expect(onFinalize.mock.calls).toEqual([['One'], [' two']]);
	});

	test('should fail the session if a chunk fails while recording', async () => {
		const transcribe: Transcribe = () => ({
			result: Promise.reject(new Error('HTTP 401')),
			cancel: jest.fn(),
		});
		const { session, onFinalize, recorder } = createSession(
			[speech(2), silence(2), speech(2), speech(2), speech(2)],
			transcribe,
		);

		await expect(session.start()).rejects.toThrow('HTTP 401');
		expect(recorder.stop).toHaveBeenCalled();

		// Already reported by start()
		await session.stop();
		expect(onFinalize).not.toHaveBeenCalled();
	});

	test('should fail stop() if the last chunk fails', async () => {
		let calls = 0;
		const transcribe: Transcribe = () => {
			calls++;
			return {
				result: calls === 1 ? Promise.resolve('Text') : Promise.reject(new Error('Server unavailable')),
				cancel: jest.fn(),
			};
		};
		const { session, exhausted, onFinalize } = createSession(
			[speech(2), silence(2), speech(2)],
			transcribe,
		);

		const started = session.start();
		await exhausted;
		await expect(session.stop()).rejects.toThrow('Server unavailable');
		await started;
		expect(onFinalize.mock.calls).toEqual([['Text']]);
	});

	test('should cancel in-progress requests and not output their text', async () => {
		const cancel = jest.fn();
		let resolveRequest: (text: string)=> void;
		const transcribe: Transcribe = () => ({
			result: new Promise(resolve => {
				resolveRequest = resolve;
			}),
			cancel,
		});
		const { session, exhausted, onFinalize, recorder } = createSession(
			[speech(2), silence(2), speech(2)],
			transcribe,
		);

		const started = session.start();
		await exhausted;
		await session.cancel();
		await started;

		expect(cancel).toHaveBeenCalled();
		expect(recorder.stop).toHaveBeenCalledTimes(1);

		resolveRequest('Too late');
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onFinalize).not.toHaveBeenCalled();
	});

	test('should not send silent recordings', async () => {
		const transcribe = jest.fn(respondWith('Hallucination'));
		const { session, exhausted, onFinalize } = createSession([silence(2), silence(2)], transcribe);

		const started = session.start();
		await exhausted;
		await session.stop();
		await started;

		expect(transcribe).not.toHaveBeenCalled();
		expect(onFinalize).not.toHaveBeenCalled();
	});
});
