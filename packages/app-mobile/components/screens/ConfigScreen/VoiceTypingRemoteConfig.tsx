import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import Setting, { AppType } from '@joplin/lib/models/Setting';
import { _ } from '@joplin/lib/locale';
import { ConfigScreenStyles } from './configScreenStyles';
import { UpdateSettingValueCallback } from './types';
import SettingsButton from './SettingsButton';
import SettingTextInput from './SettingTextInput';
import Dropdown from '../../Dropdown';
import { themeStyle } from '../../global-style';
import { listModels } from '../../../services/voiceTyping/remote/api';
import { serverHostname } from '../../../services/voiceTyping/remote/apiUtils';

interface Props {
	baseUrl: string;
	apiKey: string;
	model: string;
	styles: ConfigScreenStyles;
	themeId: number;
	updateSettingValue: UpdateSettingValueCallback;
}

type ConnectionStatus =
	{ state: 'idle' }
	| { state: 'checking' }
	| { state: 'ok'; models: string[] }
	| { state: 'error'; message: string };

const modelKey = 'voiceTyping.remote.model';

export const searchText = () => [_('Test connection'), _('Available models')];

// Replaces the default text input for the model setting, adding a connection test that
// also loads the server's models so one can be picked from a list.
const VoiceTypingRemoteConfig: React.FC<Props> = props => {
	const [status, setStatus] = useState<ConnectionStatus>({ state: 'idle' });
	// SettingTextInput only reads its value on mount. Remount it when a model is picked.
	const [modelInputKey, setModelInputKey] = useState(0);
	const styleSheet = props.styles.styleSheet;
	const theme = themeStyle(props.themeId);

	const { baseUrl, apiKey, updateSettingValue } = props;
	const onTestConnection = useCallback(async () => {
		setStatus({ state: 'checking' });
		try {
			const models = await listModels({ baseUrl, apiKey });
			setStatus({ state: 'ok', models });
		} catch (error) {
			setStatus({ state: 'error', message: error.message });
		}
	}, [baseUrl, apiKey]);

	const onModelPicked = useCallback((model: string) => {
		void updateSettingValue(modelKey, model);
		setModelInputKey(key => key + 1);
	}, [updateSettingValue]);

	const modelItems = useMemo(() => {
		if (status.state !== 'ok') return [];
		const items = [{ label: _('Server default'), value: '' }];
		const models = status.models.includes(props.model) || !props.model ? status.models : [props.model, ...status.models];
		return items.concat(models.map(model => ({ label: model, value: model })));
	}, [status, props.model]);

	const renderStatus = () => {
		let message = '';
		if (status.state === 'checking') {
			message = _('Checking... Please wait.');
		} else if (status.state === 'ok') {
			message = _('Connected. The server lists %d model(s).', status.models.length);
		} else if (status.state === 'error') {
			message = _('Error: %s', status.message);
		}
		if (!message) return null;

		return <View style={{ marginTop: 10 }}>
			<Text style={styleSheet.descriptionText}>{message}</Text>
		</View>;
	};

	const renderModelPicker = () => {
		if (status.state !== 'ok' || !status.models.length) return null;

		return <View style={styleSheet.settingContainer}>
			<Text style={styleSheet.settingText}>{_('Available models')}</Text>
			<Dropdown
				items={modelItems}
				selectedValue={props.model}
				itemListStyle={{ backgroundColor: theme.backgroundColor }}
				headerStyle={{ color: theme.color, fontSize: theme.fontSize }}
				itemStyle={{ color: theme.color, fontSize: theme.fontSize }}
				onValueChange={onModelPicked}
				accessibilityHint={_('Available models')}
			/>
		</View>;
	};

	const host = props.baseUrl.trim() ? serverHostname(props.baseUrl) : '';
	const md = Setting.settingMetadata(modelKey);
	return <View>
		<View style={styleSheet.settingContainer}>
			<Text style={styleSheet.warningText}>
				{host ? _('Remote transcription is enabled: recorded audio will be sent to %s.', host) : _('Remote transcription is enabled: recorded audio will be sent to the server set above.')}
			</Text>
		</View>
		<SettingTextInput
			key={`model-${modelInputKey}`}
			settingId={modelKey}
			value={props.model}
			label={md.label()}
			styles={props.styles}
			themeId={props.themeId}
			updateSettingValue={updateSettingValue}
			description={<Text style={styleSheet.settingDescriptionText}>{md.description(AppType.Mobile)}</Text>}
		/>
		{renderModelPicker()}
		<SettingsButton
			title={_('Test connection')}
			description={_('Checks the server URL and API key, and loads the list of available models.')}
			clickHandler={onTestConnection}
			disabled={status.state === 'checking'}
			statusComponent={renderStatus()}
			styles={props.styles}
		/>
	</View>;
};

export default VoiceTypingRemoteConfig;
