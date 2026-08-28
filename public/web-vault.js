'use strict';

(() => {
  const DATABASE_NAME = 'signaldesk.browser-vault.v1';
  const DATABASE_VERSION = 1;
  const STORE_NAME = 'vault';
  const DEVICE_KEY_RECORD = 'device-key';
  const CREDENTIAL_RECORD = 'credentials';
  const SAVED_SEARCHES_RECORD = 'saved-searches';
  const MAX_SAVED_SEARCHES = 50;
  const DEFAULT_MODELS = Object.freeze({
    openai: 'gpt-5.6-sol',
    anthropic: 'claude-fable-5',
  });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let databasePromise = null;
  let deviceKeyPromise = null;

  function requireBrowserCrypto() {
    if (!window.isSecureContext || !window.crypto?.subtle || !window.indexedDB) {
      throw new Error('Encrypted browser storage requires HTTPS and a current browser');
    }
  }

  function openDatabase() {
    requireBrowserCrypto();
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onerror = () => reject(new Error('SignalDesk could not open encrypted browser storage'));
      request.onblocked = () => reject(new Error('Close other SignalDesk tabs, then try again'));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
    return databasePromise;
  }

  async function readRecord(name) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('SignalDesk could not read encrypted browser storage'));
    });
  }

  async function writeRecord(name, value) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, name);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('SignalDesk could not save encrypted browser storage'));
      transaction.onabort = () => reject(new Error('SignalDesk could not save encrypted browser storage'));
    });
  }

  async function initializeDeviceKey() {
    requireBrowserCrypto();
    const existing = await readRecord(DEVICE_KEY_RECORD);
    if (existing?.type === 'secret' && existing.algorithm?.name === 'AES-GCM') return existing;

    const candidate = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DEVICE_KEY_RECORD);
      let selectedKey = null;
      request.onsuccess = () => {
        const stored = request.result;
        if (stored?.type === 'secret' && stored.algorithm?.name === 'AES-GCM') {
          selectedKey = stored;
        } else {
          selectedKey = candidate;
          store.put(candidate, DEVICE_KEY_RECORD);
        }
      };
      transaction.oncomplete = () => resolve(selectedKey);
      transaction.onerror = () => reject(new Error('SignalDesk could not initialize encrypted browser storage'));
      transaction.onabort = () => reject(new Error('SignalDesk could not initialize encrypted browser storage'));
    });
  }

  function deviceKey() {
    if (!deviceKeyPromise) {
      deviceKeyPromise = initializeDeviceKey().catch((error) => {
        deviceKeyPromise = null;
        throw error;
      });
    }
    return deviceKeyPromise;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function seal(recordName, value) {
    const key = await deviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const additionalData = encoder.encode(`signaldesk:${recordName}:v1`);
    const cleartext = encoder.encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      cleartext,
    );
    return {
      version: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  async function unseal(recordName, record) {
    if (!record || record.version !== 1 || typeof record.iv !== 'string' || typeof record.ciphertext !== 'string') {
      throw new Error('Encrypted browser data uses an unsupported format');
    }
    try {
      const key = await deviceKey();
      const cleartext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: base64ToBytes(record.iv),
          additionalData: encoder.encode(`signaldesk:${recordName}:v1`),
        },
        key,
        base64ToBytes(record.ciphertext),
      );
      return JSON.parse(decoder.decode(cleartext));
    } catch (_) {
      throw new Error('Encrypted browser data could not be decrypted; forget this browser to reset it');
    }
  }

  function emptyConfiguration() {
    return {
      xBearerToken: '',
      llmApiKey: '',
      llmProvider: 'openai',
      llmModel: DEFAULT_MODELS.openai,
    };
  }

  function cleanText(value, label, maximum) {
    const result = String(value ?? '').trim();
    if (result.length > maximum) throw new Error(`${label} is too long`);
    return result;
  }

  function cleanSecret(value, label) {
    const result = cleanText(value, label, 10000);
    if (/[\r\n]/.test(result)) throw new Error(`${label} must be one line`);
    return result;
  }

  function validateStoredConfiguration(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Encrypted browser credentials are invalid');
    }
    const configuration = {
      xBearerToken: cleanSecret(value.xBearerToken, 'Saved X Bearer Token'),
      llmApiKey: cleanSecret(value.llmApiKey, 'Saved AI API key'),
      llmProvider: cleanText(value.llmProvider, 'Saved AI provider', 40),
      llmModel: cleanText(value.llmModel, 'Saved AI model', 200),
    };
    if (!DEFAULT_MODELS[configuration.llmProvider]) {
      throw new Error('Saved AI provider must be OpenAI or Anthropic');
    }
    if (configuration.llmApiKey && !configuration.llmModel) {
      throw new Error('Saved AI credentials require a model');
    }
    return configuration;
  }

  async function readConfiguration() {
    const record = await readRecord(CREDENTIAL_RECORD);
    return record ? validateStoredConfiguration(await unseal(CREDENTIAL_RECORD, record)) : emptyConfiguration();
  }

  function publicConfiguration(configuration) {
    return {
      xConfigured: Boolean(configuration.xBearerToken),
      llmApiKeyConfigured: Boolean(configuration.llmApiKey),
      llmConfigured: Boolean(configuration.llmApiKey && configuration.llmModel),
      llmProvider: configuration.llmProvider,
      llmModel: configuration.llmModel || DEFAULT_MODELS[configuration.llmProvider],
      dataLocation: `Encrypted site storage for ${window.location.host}`,
    };
  }

  function normalizeCredentialInput(input, current) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Credential settings must be an object');
    }
    const next = { ...current };
    const replacementToken = cleanSecret(input.xBearerToken, 'X Bearer Token');
    if (replacementToken) next.xBearerToken = replacementToken;
    if (!next.xBearerToken) throw new Error('Paste an X API Bearer Token to continue');

    const provider = cleanText(input.llmProvider ?? next.llmProvider, 'API provider', 40).toLowerCase();
    if (!DEFAULT_MODELS[provider]) throw new Error('API provider must be OpenAI or Anthropic');
    const providerChanged = provider !== next.llmProvider;
    next.llmProvider = provider;

    if (input.clearLlm) {
      next.llmApiKey = '';
      next.llmModel = DEFAULT_MODELS[provider];
    } else {
      const replacementKey = cleanSecret(input.llmApiKey, 'AI API key');
      if (providerChanged && next.llmApiKey && !replacementKey) {
        throw new Error('Enter the new provider API key when changing providers');
      }
      if (replacementKey) next.llmApiKey = replacementKey;
      const model = cleanText(input.llmModel ?? next.llmModel, 'AI model', 200);
      next.llmModel = model || DEFAULT_MODELS[provider];
    }
    if (next.llmApiKey && !next.llmModel) throw new Error('Choose or enter an AI model');
    return next;
  }

  async function getConfiguration() {
    return publicConfiguration(await readConfiguration());
  }

  async function saveConfiguration(input) {
    try {
      const current = await readConfiguration();
      const next = normalizeCredentialInput(input, current);
      await writeRecord(CREDENTIAL_RECORD, await seal(CREDENTIAL_RECORD, next));
      return { ok: true, configuration: publicConfiguration(next) };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  async function getRequestHeaders(target) {
    const configuration = await readConfiguration();
    if (target === 'x') {
      if (!configuration.xBearerToken) throw new Error('Add an X Bearer Token in Credentials');
      return { Authorization: `Bearer ${configuration.xBearerToken}` };
    }
    if (target === 'llm') {
      if (!configuration.llmApiKey || !configuration.llmModel) {
        throw new Error('Add an AI provider key and model in Credentials');
      }
      return {
        Authorization: `Bearer ${configuration.llmApiKey}`,
        'X-SignalDesk-LLM-Provider': configuration.llmProvider,
        'X-SignalDesk-LLM-Model': configuration.llmModel,
      };
    }
    throw new Error('Unknown credential target');
  }

  async function getSavedSearches() {
    try {
      const record = await readRecord(SAVED_SEARCHES_RECORD);
      if (!record) return { items: [], error: '' };
      const value = await unseal(SAVED_SEARCHES_RECORD, record);
      if (!Array.isArray(value)) throw new Error('Encrypted saved searches are invalid');
      return { items: value.slice(0, MAX_SAVED_SEARCHES), error: '' };
    } catch (error) {
      return { items: [], error: error.message || String(error) };
    }
  }

  async function saveSavedSearches(searches) {
    try {
      if (!Array.isArray(searches)) throw new Error('Saved searches must be an array');
      const items = JSON.parse(JSON.stringify(searches.slice(0, MAX_SAVED_SEARCHES)));
      if (items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error('Saved searches contain an invalid item');
      }
      await writeRecord(SAVED_SEARCHES_RECORD, await seal(SAVED_SEARCHES_RECORD, items));
      return { ok: true, items };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  async function forgetBrowser() {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('SignalDesk could not clear encrypted browser storage'));
      transaction.onabort = () => reject(new Error('SignalDesk could not clear encrypted browser storage'));
    });
    deviceKeyPromise = null;
    localStorage.removeItem('signaldesk.advancedFilterOrder.v1');
    localStorage.removeItem('signaldesk.advancedFilterOpen.v1');
    return { ok: true };
  }

  window.signaldeskRuntime = Object.freeze({
    getConfiguration,
    saveConfiguration,
    getRequestHeaders,
    getSavedSearches,
    saveSavedSearches,
    forgetBrowser,
  });
})();
