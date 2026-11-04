import findLongestSilence from './findLongestSilence';

// Mirrors the tests for the C++ version in whisper-voice-typing/cpp/utils/findLongestSilence_test.cpp

const makeAudio = (generator: (time: number)=> number, sampleRate: number, duration: number) => {
	const data = new Float32Array(Math.floor(sampleRate * duration));
	for (let i = 0; i < data.length; i++) {
		data[i] = generator(i / sampleRate);
	}
	return { data, sampleRate };
};

type Audio = ReturnType<typeof makeAudio>;

const findSilence = ({ data, sampleRate }: Audio) => {
	return findLongestSilence(data, {
		sampleRate,
		minSilenceLengthSeconds: 0.02,
		maximumSilenceStartSamples: data.length,
		returnFirstMatch: false,
	});
};

const expectSilenceBetween = (audio: Audio, startSeconds: number, endSeconds: number) => {
	const silence = findSilence(audio);
	expect(silence.isValid).toBe(true);
	expect(Math.abs(silence.start / audio.sampleRate - startSeconds)).toBeLessThanOrEqual(0.1);
	expect(Math.abs(silence.end / audio.sampleRate - endSeconds)).toBeLessThanOrEqual(0.1);
};

describe('findLongestSilence', () => {
	test.each([440, 740, 1040, 1340])('should not find silence in a %d Hz tone', (frequency) => {
		const audio = makeAudio(t => Math.sin(t * frequency) * 0.2, 15000, 10);
		expect(findSilence(audio).isValid).toBe(false);
	});

	test('should find silence in a very low-frequency tone', () => {
		expectSilenceBetween(makeAudio(t => Math.sin(t * 8) * 0.3, 15000, 10), 0, 10);
	});

	test('should find silence when completely silent in a region', () => {
		const audio = makeAudio(t => (t < 5 || t > 6) ? Math.sin(t * 880) : 0, 15000, 11);
		expectSilenceBetween(audio, 5, 6);
	});

	test('should find silence in a completely silent signal', () => {
		expectSilenceBetween(makeAudio(() => 0, 16000, 10), 0, 10);
	});

	test('should find silence in low-amplitude noise', () => {
		// A deterministic generator, so that the test doesn't depend on Math.random
		let seed = 2;
		const random = () => {
			seed = (seed * 48271) % 2147483647;
			return seed / 2147483647;
		};
		expectSilenceBetween(makeAudio(() => (random() * 2 - 1) * 0.02, 16000, 5), 0, 5);
	});

	test('should return no silence for empty audio', () => {
		expect(findSilence({ data: new Float32Array(0), sampleRate: 16000 }).isValid).toBe(false);
	});
});
