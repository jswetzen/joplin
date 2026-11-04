// Encodes mono float samples (in [-1, 1]) as a 16-bit PCM WAV file.
const encodeWav = (samples: Float32Array, sampleRate: number): Uint8Array => {
	const bytesPerSample = 2;
	const headerSize = 44;
	const dataSize = samples.length * bytesPerSample;
	const output = new Uint8Array(headerSize + dataSize);
	const view = new DataView(output.buffer);

	const writeAscii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) {
			view.setUint8(offset + i, text.charCodeAt(i));
		}
	};

	writeAscii(0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(8, 'WAVE');

	writeAscii(12, 'fmt ');
	view.setUint32(16, 16, true); // Size of the fmt chunk
	view.setUint16(20, 1, true); // Format: PCM
	view.setUint16(22, 1, true); // Channels
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * bytesPerSample, true); // Byte rate
	view.setUint16(32, bytesPerSample, true); // Block align
	view.setUint16(34, bytesPerSample * 8, true); // Bits per sample

	writeAscii(36, 'data');
	view.setUint32(40, dataSize, true);

	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i] || 0));
		const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
		view.setInt16(headerSize + i * bytesPerSample, Math.round(value), true);
	}

	return output;
};

export default encodeWav;
