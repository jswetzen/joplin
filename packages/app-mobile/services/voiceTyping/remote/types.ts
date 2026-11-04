export interface ServerOptions {
	baseUrl: string;
	apiKey: string;
}

export interface TranscribeOptions extends ServerOptions {
	model: string;
	language: string;
	prompt: string;
}

export interface TranscriptionRequest {
	result: Promise<string>;
	cancel(): void;
}
