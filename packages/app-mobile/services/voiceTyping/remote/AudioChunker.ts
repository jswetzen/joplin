import findLongestSilence from './findLongestSilence';

export interface AudioChunk {
	audio: Float32Array;
	// True if the chunk ended at a long pause (and so the next chunk should start a new paragraph).
	endsParagraph: boolean;
}

export interface AudioChunkerOptions {
	sampleRate: number;
	// Pauses at least this long end a chunk (and paragraph)
	paragraphPauseSeconds: number;
	// Chunks longer than this are force-split at their longest shorter pause
	maxChunkSeconds: number;
	minForcedSplitPauseSeconds: number;
}

export const defaultChunkerOptions: AudioChunkerOptions = {
	sampleRate: 16000,
	paragraphPauseSeconds: 1.5,
	// Whisper models work on 30 second windows. Staying under that (with room for the trailing
	// silence added to each chunk) means the server never has to split a chunk mid-word itself.
	maxChunkSeconds: 25,
	minForcedSplitPauseSeconds: 0.3,
};

const concat = (a: Float32Array, b: Float32Array) => {
	const result = new Float32Array(a.length + b.length);
	result.set(a, 0);
	result.set(b, a.length);
	return result;
};

// Splits recorded audio into chunks at pauses in speech, mirroring the on-device
// WhisperSession::transcribeNextChunk (cpp/utils/WhisperSession.cpp). Sending fixed-length
// chunks instead would cut words in half at chunk boundaries.
export default class AudioChunker {
	private buffer_ = new Float32Array(0);
	private readonly options_: AudioChunkerOptions;

	public constructor(options: Partial<AudioChunkerOptions> = {}) {
		this.options_ = { ...defaultChunkerOptions, ...options };
	}

	public get bufferedSeconds() {
		return this.buffer_.length / this.options_.sampleRate;
	}

	public push(audio: Float32Array) {
		if (audio.length) {
			this.buffer_ = concat(this.buffer_, audio);
		}
	}

	// Differs from the C++ isBufferSilent_, which only scans the first 0.2s of the buffer.
	private isSilent_(audio: Float32Array) {
		const toleranceSamples = Math.floor(this.options_.sampleRate / 5);
		if (audio.length <= toleranceSamples) return true;

		const silence = findLongestSilence(audio, {
			sampleRate: this.options_.sampleRate,
			minSilenceLengthSeconds: 0.1,
			maximumSilenceStartSamples: audio.length,
			returnFirstMatch: false,
		});
		return silence.isValid && silence.start <= toleranceSamples && silence.end >= audio.length - toleranceSamples;
	}

	// Removes audio before splitStart (returning it, plus some of the following silence)
	// and drops the silence up to splitEnd. Returns null if there was nothing to split off.
	private splitAt_(splitStart: number, splitEnd: number): Float32Array|null {
		const sampleRate = this.options_.sampleRate;
		const tolerance = Math.floor(sampleRate / 8);
		const isCompletelySilent = splitStart < tolerance && splitEnd > this.buffer_.length - tolerance;

		if (isCompletelySilent) {
			this.buffer_ = new Float32Array(0);
			return null;
		}
		if (splitEnd <= tolerance) return null;

		// Whisper is more likely to omit trailing punctuation if the chunk ends right at the
		// last word, so include some of the silence.
		const silentSamplesToAdd = Math.min(sampleRate, Math.floor((splitEnd - splitStart) / 2));
		const chunk = this.buffer_.slice(0, splitStart + silentSamplesToAdd);
		this.buffer_ = this.buffer_.slice(splitEnd);
		return chunk;
	}

	// Returns the chunks that are complete. Silent chunks are dropped: Whisper tends to
	// hallucinate text (e.g. "Thanks for watching!") for silent input.
	public takeCompleteChunks(): AudioChunk[] {
		const { sampleRate, paragraphPauseSeconds, maxChunkSeconds, minForcedSplitPauseSeconds } = this.options_;
		const maximumSamples = sampleRate * maxChunkSeconds;
		const results: AudioChunk[] = [];
		const addChunk = (audio: Float32Array, endsParagraph: boolean) => {
			if (!this.isSilent_(audio)) {
				results.push({ audio, endsParagraph });
			}
		};

		while (this.buffer_.length > sampleRate * 3) {
			const pause = findLongestSilence(this.buffer_, {
				sampleRate,
				minSilenceLengthSeconds: paragraphPauseSeconds,
				maximumSilenceStartSamples: maximumSamples,
				returnFirstMatch: true,
			});
			if (!pause.isValid) break;

			const chunk = this.splitAt_(pause.start, pause.end);
			if (!chunk) break;
			addChunk(chunk, true);
		}

		if (this.buffer_.length >= maximumSamples) {
			const pause = findLongestSilence(this.buffer_, {
				sampleRate,
				minSilenceLengthSeconds: minForcedSplitPauseSeconds,
				maximumSilenceStartSamples: maximumSamples,
				returnFirstMatch: false,
			});

			// The audio must be split somewhere. Without a suitable pause, split in the middle.
			const middle = Math.floor(this.buffer_.length / 2);
			const chunk = this.splitAt_(pause.isValid ? pause.start : middle, pause.isValid ? pause.end : middle);
			if (chunk) addChunk(chunk, false);
		}

		return results;
	}

	// Returns all remaining audio (if not silent) and empties the buffer.
	public flush(): AudioChunk[] {
		const results = this.takeCompleteChunks();
		const remaining = this.buffer_;
		this.buffer_ = new Float32Array(0);
		if (remaining.length && !this.isSilent_(remaining)) {
			results.push({ audio: remaining, endsParagraph: false });
		}
		return results;
	}
}
