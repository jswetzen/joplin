import encodeWav from './encodeWav';

const readAscii = (data: Uint8Array, offset: number, length: number) => {
	return String.fromCharCode(...data.slice(offset, offset + length));
};

describe('encodeWav', () => {
	test('should write a 16-bit mono PCM header', () => {
		const wav = encodeWav(new Float32Array(10), 16000);
		const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

		expect(wav.length).toBe(44 + 10 * 2);
		expect(readAscii(wav, 0, 4)).toBe('RIFF');
		expect(view.getUint32(4, true)).toBe(wav.length - 8);
		expect(readAscii(wav, 8, 4)).toBe('WAVE');
		expect(readAscii(wav, 12, 4)).toBe('fmt ');
		expect(view.getUint32(16, true)).toBe(16);
		expect(view.getUint16(20, true)).toBe(1); // PCM
		expect(view.getUint16(22, true)).toBe(1); // Mono
		expect(view.getUint32(24, true)).toBe(16000);
		expect(view.getUint32(28, true)).toBe(32000);
		expect(view.getUint16(32, true)).toBe(2);
		expect(view.getUint16(34, true)).toBe(16);
		expect(readAscii(wav, 36, 4)).toBe('data');
		expect(view.getUint32(40, true)).toBe(20);
	});

	test('should convert, round and clamp samples', () => {
		const wav = encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -3, NaN]), 8000);
		const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
		const samples = [];
		for (let offset = 44; offset < wav.length; offset += 2) {
			samples.push(view.getInt16(offset, true));
		}

		expect(samples).toEqual([0, 32767, -32768, 16384, 32767, -32768, 0]);
	});

	test('should encode empty audio', () => {
		const wav = encodeWav(new Float32Array(0), 16000);
		expect(wav.length).toBe(44);
	});
});
