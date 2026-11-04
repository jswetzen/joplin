import Setting from '@joplin/lib/models/Setting';
import { _ } from '@joplin/lib/locale';
import { createAudioRecorder } from '@joplin/whisper-voice-typing';
import { Platform } from 'react-native';
import { VoiceTypingProvider } from './VoiceTyping';
import getGlossaryPrompt from './utils/getGlossaryPrompt';
import { transcribe } from './remote/api';
import { normalizeBaseUrl, serverHostname } from './remote/apiUtils';
import RemoteTranscriptionSession from './remote/RemoteTranscriptionSession';

// Matches the AudioRecorder in @joplin/whisper-voice-typing
const sampleRate = 16000;

// Transcribes using an OpenAI-compatible server (POST /audio/transcriptions), rather than on-device.
const whisperRemote: VoiceTypingProvider = {
	modelName: 'whisper-remote',
	requiresModelDownload: false,
	// Recording uses the same native recorder as on-device voice typing, which is Android-only.
	supported: () => Platform.OS === 'android' && Setting.value('buildFlag.voiceTypingEnabled') && Setting.value('voiceTyping.backend') === 'remote',
	modelLocalFilepath: () => '',
	deleteCachedModels: async () => {},
	getDownloadUrl: () => '',
	getUuidPath: () => '',
	recordingNotice: () => {
		return _('Audio is sent to %s for transcription.', serverHostname(Setting.value('voiceTyping.remote.baseUrl')));
	},
	build: async ({ callbacks, locale }) => {
		const baseUrl = Setting.value('voiceTyping.remote.baseUrl');
		// Validate now, so that configuration errors are shown before recording starts.
		normalizeBaseUrl(baseUrl);

		const language = Setting.value('voiceTyping.remote.language').trim();
		const transcribeOptions = {
			baseUrl,
			apiKey: Setting.value('voiceTyping.remote.apiKey'),
			model: Setting.value('voiceTyping.remote.model'),
			language,
			prompt: getGlossaryPrompt(language || locale),
		};

		return new RemoteTranscriptionSession({
			recorder: createAudioRecorder(),
			callbacks,
			transcribe: audio => transcribe(audio, sampleRate, transcribeOptions),
		});
	},
};

export default whisperRemote;
