export const testSampleRate = 16000;

// A loud tone, which findLongestSilence treats as speech
export const speech = (seconds: number) => {
	const result = new Float32Array(Math.floor(seconds * testSampleRate));
	for (let i = 0; i < result.length; i++) {
		result[i] = 0.5 * Math.sin(2 * Math.PI * 300 * i / testSampleRate);
	}
	return result;
};

export const silence = (seconds: number) => new Float32Array(Math.floor(seconds * testSampleRate));

export const concatAudio = (...parts: Float32Array[]) => {
	const result = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
};
