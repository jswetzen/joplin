import Logger from '@joplin/utils/Logger';
import { _ } from '@joplin/lib/locale';
import type { AudioRecorder } from '@joplin/whisper-voice-typing';
import type { SpeechToTextCallbacks, VoiceTypingSession } from '../VoiceTyping';
import type { TranscriptionRequest } from './types';
import AudioChunker, { AudioChunk } from './AudioChunker';

const logger = Logger.create('voiceTyping/remote');

export type Transcribe = (audio: Float32Array)=> TranscriptionRequest;

interface Options {
	recorder: AudioRecorder;
	transcribe: Transcribe;
	callbacks: SpeechToTextCallbacks;
	// How often to check the recording for pauses
	pollIntervalSeconds?: number;
}

// Records audio, splits it into chunks at pauses and transcribes each chunk remotely.
// Chunks are transcribed one at a time, in order, while recording continues.
export default class RemoteTranscriptionSession implements VoiceTypingSession {
	private recorder_: AudioRecorder|null;
	private chunker_ = new AudioChunker();
	private recording_: Promise<void>|null = null;
	private stopRequested_ = false;
	private closed_ = false;

	// Any failure ends the session: dropping a chunk would silently lose part of the text.
	private error_: Error|null = null;
	private errorReported_ = false;

	private uploads_: Promise<void> = Promise.resolve();
	private pendingUploads_ = 0;
	private currentRequest_: TranscriptionRequest|null = null;
	private nextSeparator_ = '';

	public constructor(private options_: Options) {
		this.recorder_ = options_.recorder;
	}

	// Resolves when recording stops, or rejects if transcription fails.
	public async start() {
		if (this.closed_) throw new Error('Session closed.');

		if (!this.recording_) {
			this.recorder_.start();
			this.recording_ = this.record_();
		}
		await this.recording_;
		this.throwIfFailed_();
	}

	// Transcribes any remaining audio before closing the session.
	public async stop() {
		if (this.closed_) return;
		this.stopRequested_ = true;

		if (this.recording_) {
			await this.recording_;
			if (!this.error_ && this.recorder_) {
				try {
					this.chunker_.push(new Float32Array(this.recorder_.pullAvailable()));
				} catch (error) {
					this.fail_(error);
				}
			}
		}
		this.closeRecorder_();

		if (!this.error_) {
			for (const chunk of this.chunker_.flush()) {
				this.enqueue_(chunk);
			}
		}
		await this.uploads_;

		await this.cancel();
		this.throwIfFailed_();
	}

	public async cancel() {
		if (this.closed_) return;
		this.closed_ = true;
		this.currentRequest_?.cancel();
		this.closeRecorder_();
	}

	private async record_() {
		const pollInterval = this.options_.pollIntervalSeconds ?? 2;
		try {
			while (!this.stopRequested_ && !this.closed_ && !this.error_) {
				await this.recorder_.waitForData(pollInterval);
				// stop() reads the remaining audio itself.
				if (this.stopRequested_ || this.closed_ || this.error_ || !this.recorder_) break;

				this.chunker_.push(new Float32Array(this.recorder_.pullAvailable()));
				for (const chunk of this.chunker_.takeCompleteChunks()) {
					this.enqueue_(chunk);
				}
			}
		} catch (error) {
			this.fail_(error);
		}
	}

	private enqueue_(chunk: AudioChunk) {
		this.pendingUploads_++;
		this.updatePreview_();

		const previousUploads = this.uploads_;
		this.uploads_ = (async () => {
			await previousUploads;
			try {
				if (this.error_ || this.closed_) return;

				this.currentRequest_ = this.options_.transcribe(chunk.audio);
				const text = await this.currentRequest_.result;
				if (!this.closed_) {
					this.onText_(text, chunk.endsParagraph);
				}
			} catch (error) {
				this.fail_(error);
			} finally {
				this.currentRequest_ = null;
				this.pendingUploads_--;
				this.updatePreview_();
			}
		})();
	}

	private onText_(text: string, endsParagraph: boolean) {
		text = text.trim();
		if (text) {
			this.options_.callbacks.onFinalize(`${this.nextSeparator_}${text}`);
			// A chunk can also end at a forced split in the middle of continuous speech.
			this.nextSeparator_ = endsParagraph ? '\n\n' : ' ';
		} else if (endsParagraph && this.nextSeparator_) {
			this.nextSeparator_ = '\n\n';
		}
	}

	private updatePreview_() {
		if (this.closed_) return;
		this.options_.callbacks.onPreview(this.pendingUploads_ > 0 ? _('Transcribing...') : '');
	}

	private fail_(error: Error) {
		// Requests and the recorder fail when cancelled.
		if (this.closed_) return;

		logger.error('Remote transcription failed:', error);
		this.error_ ??= error;
		this.closeRecorder_();
	}

	private throwIfFailed_() {
		if (this.error_ && !this.errorReported_) {
			this.errorReported_ = true;
			throw this.error_;
		}
	}

	private closeRecorder_() {
		if (!this.recorder_) return;
		try {
			this.recorder_.stop();
		} catch (error) {
			logger.warn('Error stopping the recorder:', error);
		}
		this.recorder_ = null;
	}
}
