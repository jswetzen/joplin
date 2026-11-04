import AudioChunker from './AudioChunker';
import { concatAudio, silence, speech, testSampleRate } from './testUtils';

const seconds = (audio: Float32Array) => audio.length / testSampleRate;

describe('AudioChunker', () => {
	test('should split at long pauses and end the paragraph there', () => {
		const chunker = new AudioChunker();
		chunker.push(concatAudio(speech(2), silence(2), speech(2)));

		const chunks = chunker.takeCompleteChunks();
		expect(chunks).toHaveLength(1);
		expect(chunks[0].endsParagraph).toBe(true);
		// Includes up to a second of the following pause
		expect(seconds(chunks[0].audio)).toBeGreaterThan(2.5);
		expect(seconds(chunks[0].audio)).toBeLessThan(3.1);

		const remaining = chunker.flush();
		expect(remaining).toHaveLength(1);
		expect(remaining[0].endsParagraph).toBe(false);
		expect(seconds(remaining[0].audio)).toBeCloseTo(2, 1);
	});

	test('should not split at short pauses', () => {
		const chunker = new AudioChunker();
		chunker.push(concatAudio(speech(2), silence(0.5), speech(2)));

		expect(chunker.takeCompleteChunks()).toHaveLength(0);
		const chunks = chunker.flush();
		expect(chunks).toHaveLength(1);
		expect(seconds(chunks[0].audio)).toBeCloseTo(4.5, 2);
	});

	test('should wait for more audio before splitting short recordings', () => {
		const chunker = new AudioChunker();
		chunker.push(concatAudio(speech(1), silence(1.6)));
		expect(chunker.takeCompleteChunks()).toHaveLength(0);
		expect(chunker.bufferedSeconds).toBeCloseTo(2.6, 2);
	});

	test('should drop silent audio', () => {
		const chunker = new AudioChunker();
		chunker.push(silence(5));
		expect(chunker.takeCompleteChunks()).toHaveLength(0);
		expect(chunker.flush()).toHaveLength(0);
	});

	test('should drop leading silence', () => {
		const chunker = new AudioChunker();
		chunker.push(concatAudio(silence(2), speech(2)));

		expect(chunker.takeCompleteChunks()).toHaveLength(0);
		const chunks = chunker.flush();
		expect(chunks).toHaveLength(1);
		expect(seconds(chunks[0].audio)).toBeCloseTo(2, 1);
	});

	test('should drop a silent remainder when flushing', () => {
		const chunker = new AudioChunker();
		chunker.push(concatAudio(speech(2), silence(2)));
		const chunks = chunker.flush();
		expect(chunks).toHaveLength(1);
		expect(chunks[0].endsParagraph).toBe(true);
	});

	test('should force a split, without a paragraph break, when there are no long pauses', () => {
		const chunker = new AudioChunker({ maxChunkSeconds: 25 });
		const chunks = [];
		// Push audio in small pieces, as while recording
		for (let i = 0; i < 13; i++) {
			chunker.push(speech(2));
			chunks.push(...chunker.takeCompleteChunks());
		}

		// No pause, so split in the middle
		expect(chunks).toHaveLength(1);
		expect(chunks[0].endsParagraph).toBe(false);
		expect(seconds(chunks[0].audio)).toBeCloseTo(13, 2);
		expect(chunker.bufferedSeconds).toBeCloseTo(13, 2);
	});

	test('should prefer splitting at a shorter pause when forcing a split', () => {
		const chunker = new AudioChunker({ maxChunkSeconds: 25 });
		chunker.push(concatAudio(speech(20), silence(0.5), speech(5)));

		const chunks = chunker.takeCompleteChunks();
		expect(chunks).toHaveLength(1);
		expect(chunks[0].endsParagraph).toBe(false);
		expect(seconds(chunks[0].audio)).toBeGreaterThan(20);
		expect(seconds(chunks[0].audio)).toBeLessThan(20.5);
		expect(chunker.bufferedSeconds).toBeGreaterThan(5);
		expect(chunker.bufferedSeconds).toBeLessThan(5.5);
	});
});
