'use strict';

const LLM_PROVIDERS = Object.freeze({
  openai: Object.freeze({
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-sol',
  }),
  anthropic: Object.freeze({
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-fable-5',
  }),
});
const DEFAULT_LLM_PROVIDER = 'openai';
const DEFAULT_LLM_BASE_URL = LLM_PROVIDERS[DEFAULT_LLM_PROVIDER].baseUrl;
const DEFAULT_LLM_MODEL = LLM_PROVIDERS[DEFAULT_LLM_PROVIDER].defaultModel;
const SECRET_ENVIRONMENT_KEYS = [
  'X_BEARER_TOKEN',
  'LLM_API_KEY',
  'LLM_PROVIDER',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'HOST',
  'PORT',
  'CORS_ORIGIN',
];

function emptyConfiguration() {
  return {
    xBearerToken: '',
    llmApiKey: '',
    llmProvider: DEFAULT_LLM_PROVIDER,
    llmBaseUrl: DEFAULT_LLM_BASE_URL,
    llmModel: DEFAULT_LLM_MODEL,
  };
}

function cleanText(value, label, maximum) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${label} must be text`);
  const result = value.trim();
  if (result.length > maximum) throw new Error(`${label} is too long`);
  if (result.includes('\0')) throw new Error(`${label} contains an invalid character`);
  return result;
}

function cleanSecret(value, label) {
  const result = cleanText(value, label, 10000);
  if (/[\r\n]/.test(result)) throw new Error(`${label} must be one line`);
  return result;
}

function normalizeCredentialInput(input, current = emptyConfiguration()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Credential settings must be an object');
  }

  const savedProvider = String(current.llmProvider || DEFAULT_LLM_PROVIDER);
  const next = {
    xBearerToken: cleanSecret(current.xBearerToken, 'Saved X Bearer Token'),
    llmApiKey: cleanSecret(current.llmApiKey, 'Saved AI API key'),
    llmProvider: LLM_PROVIDERS[savedProvider] ? savedProvider : DEFAULT_LLM_PROVIDER,
    llmBaseUrl: '',
    llmModel: cleanText(current.llmModel, 'Saved AI model', 200),
  };
  const replacementToken = cleanSecret(input.xBearerToken, 'X Bearer Token');
  if (replacementToken) next.xBearerToken = replacementToken;
  if (!next.xBearerToken) throw new Error('Paste an X API Bearer Token to continue');

  const requestedProvider = cleanText(input.llmProvider ?? next.llmProvider, 'API provider', 40);
  if (!LLM_PROVIDERS[requestedProvider]) throw new Error('API provider must be OpenAI or Anthropic');
  const providerChanged = requestedProvider !== next.llmProvider;
  next.llmProvider = requestedProvider;
  next.llmBaseUrl = LLM_PROVIDERS[requestedProvider].baseUrl;

  if (input.clearLlm === true) {
    next.llmApiKey = '';
    next.llmModel = LLM_PROVIDERS[requestedProvider].defaultModel;
  } else {
    const replacementKey = cleanSecret(input.llmApiKey, 'AI API key');
    if (providerChanged && next.llmApiKey && !replacementKey) {
      throw new Error('Enter the new provider API key when changing providers');
    }
    if (replacementKey) next.llmApiKey = replacementKey;
    if (providerChanged) next.llmModel = LLM_PROVIDERS[requestedProvider].defaultModel;
    if (input.llmModel !== undefined) next.llmModel = cleanText(input.llmModel, 'AI model', 200);
    if (next.llmApiKey && !next.llmModel) {
      next.llmModel = LLM_PROVIDERS[requestedProvider].defaultModel;
    }
  }

  return next;
}

function normalizeSavedSearches(value) {
  if (!Array.isArray(value)) throw new Error('Saved searches must be a list');
  if (value.length > 50) throw new Error('At most 50 saved searches are supported');
  const normalized = value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Every saved search must be an object');
    }
    const id = cleanText(item.id, 'Saved search id', 128);
    const name = cleanText(item.name, 'Saved search name', 80);
    const savedAt = cleanText(item.savedAt, 'Saved search date', 64);
    if (!id || !name || !savedAt) throw new Error('Saved search metadata is incomplete');
    if (!item.snapshot || typeof item.snapshot !== 'object' || Array.isArray(item.snapshot)) {
      throw new Error('Saved search settings must be an object');
    }
    return { id, name, savedAt, snapshot: JSON.parse(JSON.stringify(item.snapshot)) };
  });
  if (JSON.stringify(normalized).length > 256 * 1024) throw new Error('Saved searches are too large');
  return normalized;
}

function publicConfiguration(configuration, configurationError = '') {
  const value = configuration || emptyConfiguration();
  const provider = LLM_PROVIDERS[value.llmProvider] ? value.llmProvider : DEFAULT_LLM_PROVIDER;
  return {
    xConfigured: Boolean(value.xBearerToken),
    llmApiKeyConfigured: Boolean(value.llmApiKey),
    llmConfigured: Boolean(value.llmApiKey && value.llmModel),
    llmProvider: provider,
    llmModel: value.llmModel || LLM_PROVIDERS[provider].defaultModel,
    configurationError: configurationError || '',
  };
}

function backendEnvironment(configuration, baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  SECRET_ENVIRONMENT_KEYS.forEach((key) => delete environment[key]);
  environment.HOST = '127.0.0.1';
  environment.PORT = '0';
  environment.PYTHONUNBUFFERED = '1';
  environment.PYTHONUTF8 = '1';
  if (configuration.xBearerToken) environment.X_BEARER_TOKEN = configuration.xBearerToken;
  if (configuration.llmApiKey) environment.LLM_API_KEY = configuration.llmApiKey;
  if (configuration.llmProvider) environment.LLM_PROVIDER = configuration.llmProvider;
  if (configuration.llmBaseUrl) environment.LLM_BASE_URL = configuration.llmBaseUrl;
  if (configuration.llmModel) environment.LLM_MODEL = configuration.llmModel;
  return environment;
}

module.exports = {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDERS,
  backendEnvironment,
  emptyConfiguration,
  normalizeCredentialInput,
  normalizeSavedSearches,
  publicConfiguration,
};
