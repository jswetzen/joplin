// A port of packages/whisper-voice-typing/cpp/utils/findLongestSilence.cpp, so that the
// remote backend splits audio at the same pauses as the on-device one. Keep the two in sync.

export interface SilenceRange {
	isValid: boolean;
	start: number;
	end: number;
}

export interface LongestSilenceOptions {
	sampleRate: number;
	// Minimum length of a silence range (e.g. 3.0 seconds)
	minSilenceLengthSeconds: number;
	// Ignore all silences that start after this position.
	maximumSilenceStartSamples: number;
	// Return the first silence satisfying the conditions instead of the longest.
	returnFirstMatch: boolean;
}

const highpass = (data: Float32Array, sampleRate: number) => {
	const highpassCutoffHz = 60;
	const rc = 1 / (2 * 3.1416 * highpassCutoffHz);
	const timePerSample = 1 / sampleRate;
	const alpha = rc / (rc + timePerSample);

	let lastInput = data[0];
	for (let i = 1; i < data.length; i++) {
		const currentInput = data[i];
		data[i] = alpha * data[i - 1] + alpha * (currentInput - lastInput);
		lastInput = currentInput;
	}
};

const findLongestSilence = (audioData: Float32Array, options: LongestSilenceOptions): SilenceRange => {
	const { sampleRate, minSilenceLengthSeconds, returnFirstMatch } = options;
	const maxSilencePosition = options.maximumSilenceStartSamples;

	let bestCandidateLength = 0;
	let bestCandidateStart = -1;
	let bestCandidateEnd = -1;
	let currentCandidateStart = -1;

	if (!audioData.length) return { isValid: false, start: 0, end: 0 };

	const processedAudio = new Float32Array(audioData);
	highpass(processedAudio, sampleRate);

	const windowSize = 256;
	const windowsPerSecond = Math.floor(sampleRate / windowSize);
	let quietWindows = 0;

	const finalizeCandidate = (currentOffset: number) => {
		if (currentCandidateStart < 0) return;

		const currentCandidateLength = currentOffset - currentCandidateStart;
		if (currentCandidateLength > bestCandidateLength && currentCandidateStart <= maxSilencePosition) {
			bestCandidateLength = currentCandidateLength;
			bestCandidateStart = currentCandidateStart;
			bestCandidateEnd = currentOffset;
		}

		currentCandidateStart = -1;
	};

	const rollingAverageSize = 24;
	const threshold = rollingAverageSize / 80;
	const minQuietWindows = Math.floor(windowsPerSecond * minSilenceLengthSeconds);

	let windowOffset;
	for (windowOffset = 0; windowOffset < processedAudio.length && windowOffset <= maxSilencePosition; windowOffset += windowSize) {
		// Count the samples that, averaged with nearby samples, are below the threshold.
		let absSum = 0;
		let silentSamples = 0;
		for (let i = windowOffset; i < windowOffset + windowSize && i < processedAudio.length; i++) {
			absSum += Math.abs(processedAudio[i]);

			const isSumComplete = i - rollingAverageSize >= windowOffset;
			if (isSumComplete) {
				absSum -= Math.abs(processedAudio[i - rollingAverageSize]);

				if (absSum < threshold) {
					silentSamples++;
				}
			}
		}

		// Don't require every sample to be quiet, to allow for clicks and pops.
		if (silentSamples >= Math.floor(windowSize * 3 / 4)) {
			quietWindows++;
		} else {
			quietWindows = 0;
		}

		if (quietWindows >= minQuietWindows && currentCandidateStart === -1) {
			// Ignore the first window (probably contains the end of the speech) and the
			// most recent one (which comes after windowOffset).
			const windowsToIgnore = 2;
			const estimatedQuietSamples = Math.max(0, quietWindows - windowsToIgnore) * windowSize;
			currentCandidateStart = windowOffset - estimatedQuietSamples;
		} else if (quietWindows === 0) {
			finalizeCandidate(windowOffset);

			if (returnFirstMatch && bestCandidateLength > 0) {
				break;
			}
		}
	}

	finalizeCandidate(windowOffset);

	if (bestCandidateLength === 0) {
		return { isValid: false, start: 0, end: 0 };
	}
	return { isValid: true, start: bestCandidateStart, end: bestCandidateEnd };
};

export default findLongestSilence;
