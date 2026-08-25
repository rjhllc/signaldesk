'use strict';

const { describe, expect, test } = require('bun:test');
const {
  backendEnvironment,
  emptyConfiguration,
  normalizeCredentialInput,
  normalizeSavedSearches,
  publicConfiguration,
} = require('./configuration.cjs');

describe('desktop credential configuration', () => {
  test('prefills OpenAI defaults so only an API key is needed', () => {
    const configuration = emptyConfiguration();
    expect(configuration.llmProvider).toBe('openai');
    expect(configuration.llmBaseUrl).toBe('https://api.openai.com/v1');
    expect(configuration.llmModel).toBe('gpt-5.6-sol');
    expect(publicConfiguration(configuration).llmConfigured).toBe(false);
  });

  test('requires an X Bearer Token on first run', () => {
    expect(() => normalizeCredentialInput({ xBearerToken: '' }, emptyConfiguration()))
      .toThrow('Paste an X API Bearer Token');
  });

  test('keeps saved secrets when replacement fields are blank', () => {
    const current = {
      xBearerToken: 'saved-x-token',
      llmApiKey: 'saved-ai-key',
      llmProvider: 'openai',
      llmBaseUrl: 'https://api.openai.com/v1',
      llmModel: 'gpt-5.6-sol',
    };
    const result = normalizeCredentialInput({
      xBearerToken: '',
      llmApiKey: '',
      llmProvider: 'openai',
      llmModel: 'gpt-5.6-terra',
      clearLlm: false,
    }, current);
    expect(result).toEqual({
      xBearerToken: 'saved-x-token',
      llmApiKey: 'saved-ai-key',
      llmProvider: 'openai',
      llmBaseUrl: 'https://api.openai.com/v1',
      llmModel: 'gpt-5.6-terra',
    });
  });

  test('requires a new key and applies Anthropic defaults when provider changes', () => {
    const current = {
      xBearerToken: 'saved-x-token',
      llmApiKey: 'saved-openai-key',
      llmProvider: 'openai',
      llmBaseUrl: 'https://api.openai.com/v1',
      llmModel: 'gpt-5.6-sol',
    };
    expect(() => normalizeCredentialInput({
      xBearerToken: '',
      llmProvider: 'anthropic',
      llmApiKey: '',
    }, current)).toThrow('new provider API key');
    expect(normalizeCredentialInput({
      xBearerToken: '',
      llmProvider: 'anthropic',
      llmApiKey: 'new-anthropic-key',
    }, current)).toEqual({
      xBearerToken: 'saved-x-token',
      llmApiKey: 'new-anthropic-key',
      llmProvider: 'anthropic',
      llmBaseUrl: 'https://api.anthropic.com/v1',
      llmModel: 'claude-fable-5',
    });
  });

  test('removes the optional key while retaining provider defaults', () => {
    const result = normalizeCredentialInput({
      xBearerToken: '',
      llmProvider: 'anthropic',
      clearLlm: true,
    }, {
      xBearerToken: 'saved-x-token',
      llmApiKey: 'saved-ai-key',
      llmProvider: 'anthropic',
      llmBaseUrl: 'https://api.anthropic.com/v1',
      llmModel: 'claude-opus-5',
    });
    expect(result).toEqual({
      xBearerToken: 'saved-x-token',
      llmApiKey: '',
      llmProvider: 'anthropic',
      llmBaseUrl: 'https://api.anthropic.com/v1',
      llmModel: 'claude-fable-5',
    });
  });

  test('never exposes secret values to the renderer', () => {
    const visible = publicConfiguration({
      xBearerToken: 'secret-x-value',
      llmApiKey: 'secret-ai-value',
      llmProvider: 'anthropic',
      llmBaseUrl: 'https://api.anthropic.com/v1',
      llmModel: 'claude-opus-5',
    });
    expect(visible).toEqual({
      xConfigured: true,
      llmApiKeyConfigured: true,
      llmConfigured: true,
      llmProvider: 'anthropic',
      llmModel: 'claude-opus-5',
      configurationError: '',
    });
    expect(JSON.stringify(visible)).not.toContain('secret-');
  });

  test('passes credentials only to a loopback ephemeral backend', () => {
    const environment = backendEnvironment({
      xBearerToken: 'new-x',
      llmApiKey: 'new-ai',
      llmProvider: 'anthropic',
      llmBaseUrl: 'https://api.anthropic.com/v1',
      llmModel: 'claude-opus-5',
    }, {
      PATH: 'kept',
      X_BEARER_TOKEN: 'old-x',
      OPENAI_API_KEY: 'inherited-key',
      HOST: '0.0.0.0',
      PORT: '4173',
      CORS_ORIGIN: '*',
    });
    expect(environment.PATH).toBe('kept');
    expect(environment.X_BEARER_TOKEN).toBe('new-x');
    expect(environment.LLM_PROVIDER).toBe('anthropic');
    expect(environment.LLM_MODEL).toBe('claude-opus-5');
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(environment.CORS_ORIGIN).toBeUndefined();
    expect(environment.HOST).toBe('127.0.0.1');
    expect(environment.PORT).toBe('0');
  });

  test('validates encrypted saved-search payloads before persistence', () => {
    const searches = normalizeSavedSearches([{
      id: 'saved-1',
      name: 'RWA daily',
      savedAt: '2026-08-25T20:00:00.000Z',
      snapshot: { query: 'tokenized assets', filters: { links: 'include' } },
    }]);
    expect(searches[0].snapshot.filters.links).toBe('include');
    expect(() => normalizeSavedSearches(new Array(51).fill(searches[0])))
      .toThrow('At most 50');
  });
});
