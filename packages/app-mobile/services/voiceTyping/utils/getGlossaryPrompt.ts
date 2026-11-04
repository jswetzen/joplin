import Setting from '@joplin/lib/models/Setting';
import { languageCodeOnly, stringByLocale } from '@joplin/lib/locale';

const getGlossaryPrompt = (locale: string) => {
	const glossary = Setting.value('voiceTyping.glossary');
	if (!glossary) return '';

	// Re-define the "_" localization function so that it uses the transcription locale (as opposed to the UI locale).
	const _ = (text: string) => {
		return stringByLocale(locale, text);
	};
	let glossaryPrefix = _('Glossary:');

	// Prefer no prefix if no appropriate translation of "Glossary:" is available:
	if (glossaryPrefix === 'Glossary:' && languageCodeOnly(locale) !== 'en') {
		glossaryPrefix = '';
	}

	return `${glossaryPrefix} ${glossary}`.trim();
};

export default getGlossaryPrompt;
