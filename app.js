'use strict';

const APP_BUILD = '0.1.0-alpha.1';
const TYPE_ORDER = ['original', 'reply', 'quote'];
const SORT_LABELS = {
  ai: 'AI relevance',
  newest: 'Newest first',
  likes: 'Most likes',
  reposts: 'Most reposts',
  replies: 'Most replies',
  followers: 'Largest author audience',
};
const INLINE_EXCLUDE_RE = /\/\s*exclude\s+brand\s+posts\s+@?([A-Za-z0-9_]{1,15})\b/i;
const FILTER_DEFAULTS = {
  links: 'any', media: 'any', language: '', verified: 'any', promotional: 'include',
  hashtags: 'any', cashtags: 'any', mentions: 'any', geo: 'any', radius_unit: 'km',
};
const SECTION_ORDER_STORAGE = 'signaldesk.advancedFilterOrder.v1';
const SECTION_OPEN_STORAGE = 'signaldesk.advancedFilterOpen.v1';
const SAVED_SEARCHES_STORAGE = 'signaldesk.savedSearches.v1';
const MAX_SAVED_SEARCHES = 50;
const MAX_CLOSED_REFINEMENT_VIEWS = 10;
const LLM_MODELS = Object.freeze({
  openai: Object.freeze([
    ['gpt-5.6-sol', 'GPT-5.6 Sol · highest capability'],
    ['gpt-5.6-terra', 'GPT-5.6 Terra · balanced'],
    ['gpt-5.6-luna', 'GPT-5.6 Luna · fastest and lowest cost'],
  ]),
  anthropic: Object.freeze([
    ['claude-fable-5', 'Fable 5 · highest capability'],
    ['claude-opus-5', 'Opus 5 · complex professional work'],
    ['claude-sonnet-5', 'Sonnet 5 · balanced'],
    ['claude-haiku-4-5-20251001', 'Haiku 4.5 · fastest'],
  ]),
});

const element = (selector) => document.querySelector(selector);
const elements = {
  connection: element('#connection'),
  status: element('#status'),
  statusDetail: element('#status-detail'),
  settingsButton: element('#settings-button'),
  resetApplication: element('#reset-application'),
  savedSearchesButton: element('#saved-searches-button'),
  savedSearches: element('#saved-searches'),
  savedSearchesClose: element('#saved-searches-close'),
  savedSearchesScrim: element('#saved-searches-scrim'),
  savedSearchName: element('#saved-search-name'),
  saveSearch: element('#save-search'),
  savedSearchFeedback: element('#saved-search-feedback'),
  savedSearchList: element('#saved-search-list'),
  settingsDialog: element('#settings-dialog'),
  settingsForm: element('#settings-form'),
  settingsClose: element('#settings-close'),
  settingsCancel: element('#settings-cancel'),
  settingsSave: element('#settings-save'),
  settingsIntro: element('#settings-intro'),
  settingsError: element('#settings-error'),
  dataLocation: element('#data-location'),
  openDataLocation: element('#open-data-location'),
  xBearerToken: element('#x-bearer-token'),
  llmApiKey: element('#llm-api-key'),
  llmProvider: element('#llm-provider'),
  llmModel: element('#llm-model'),
  llmCustomModelRow: element('#llm-custom-model-row'),
  llmCustomModel: element('#llm-custom-model'),
  clearLlm: element('#clear-llm'),
  clearLlmRow: element('#clear-llm-row'),
  updateDialog: element('#update-dialog'),
  updateTitle: element('#update-title'),
  updateDetail: element('#update-detail'),
  updateProgress: element('#update-progress'),
  updatePercent: element('#update-percent'),
  updateProgressBar: element('#update-progress-bar'),
  updateError: element('#update-error'),
  updateLater: element('#update-later'),
  updatePrimary: element('#update-primary'),
  query: element('#query'),
  lookback: element('#lookback'),
  limit: element('#limit'),
  retrievalOrder: element('#retrieval-order'),
  sort: element('#sort'),
  llmRefiner: element('#llm-refiner'),
  llmRefinerTitle: element('#llm-refiner-title'),
  llmConversation: element('#llm-conversation'),
  llmInstructionLabel: element('#llm-instruction-label'),
  llmRefinerModel: element('#llm-refiner-model'),
  llmInstruction: element('#llm-instruction'),
  llmAction: element('#llm-action'),
  llmApply: element('#llm-apply'),
  llmProgress: element('#llm-progress'),
  llmProgressSteps: [...document.querySelectorAll('[data-llm-step]')],
  llmFeedback: element('#llm-feedback'),
  types: [...document.querySelectorAll('[data-post-type]')],
  filters: [...document.querySelectorAll('[data-filter]')],
  excludeBrand: element('#exclude-brand'),
  brandField: element('#brand-field'),
  brandHandle: element('#brand-handle'),
  search: element('#search'),
  preview: element('#query-preview'),
  previewState: element('#preview-state'),
  apiParameters: element('#api-parameters'),
  requestUrl: element('#request-url'),
  advancedCount: element('#advanced-count'),
  advancedContent: element('.advanced-content'),
  filterSections: [...document.querySelectorAll('[data-filter-section]')],
  sectionOrderStatus: element('#section-order-status'),
  report: element('#report'),
  reportTitle: element('#report-title'),
  message: element('#message'),
  export: element('#export'),
  statPosts: element('#stat-posts'),
  statRequested: element('#stat-requested'),
  statAuthors: element('#stat-authors'),
  statEngagement: element('#stat-engagement'),
  statSentiment: element('#stat-sentiment'),
  statSentimentScore: element('#stat-sentiment-score'),
  sentimentCard: element('.sentiment-card'),
  statImpressions: element('#stat-impressions'),
  sentimentOverview: element('#sentiment-overview'),
  diagnostics: element('#diagnostics'),
  reportDetails: element('.report-details'),
  resultsTabs: element('#results-tabs'),
  resultsViewTitle: element('#results-view-title'),
  resultSortControl: element('#result-sort-control'),
  aiSortOption: element('#sort-ai'),
  resultCount: element('#result-count'),
  sortProof: element('#sort-proof'),
  results: element('#results'),
};

let backendReady = false;
let lastResponse = null;
let sourceResponse = null;
let refinementViews = [];
let closedRefinementViews = [];
let activeResultsView = 'original';
let refinementViewSequence = 0;
let originalRefinementDraft = { instruction: '', mode: 'filter' };
let previewTimer = null;
let previewSequence = 0;
let searchInFlight = false;
let llmInFlight = false;
let llmConfigured = false;
let llmProgressTimer = null;
let draggedSection = null;
let desktopConfiguration = null;
let settingsRequired = false;
let currentUpdateState = { status: 'idle', currentVersion: APP_BUILD };
let savedSearchesCache = [];
let searchController = null;
let llmController = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

function formatNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '0';
}

function formatScore(value) {
  if (value === null || value === undefined) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(3)}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch (_) {
    return '';
  }
}

function selectedTypes() {
  return elements.types.filter((input) => input.checked).map((input) => input.dataset.postType);
}

function sectionNodes() {
  return [...elements.advancedContent.children].filter((node) => node.matches('[data-filter-section]'));
}

function readStoredLayout(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

function storeLayout(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Reordering still works when storage is unavailable.
  }
}

function sectionName(section) {
  return section.querySelector('.section-title strong')?.textContent.trim() || 'Filter section';
}

function updateSectionMoveButtons() {
  const sections = sectionNodes();
  sections.forEach((section, index) => {
    section.querySelector('[data-section-move="up"]').disabled = index === 0;
    section.querySelector('[data-section-move="down"]').disabled = index === sections.length - 1;
  });
}

function persistSectionOrder() {
  storeLayout(SECTION_ORDER_STORAGE, sectionNodes().map((section) => section.dataset.filterSection));
}

function persistSectionOpenState() {
  storeLayout(SECTION_OPEN_STORAGE, Object.fromEntries(
    sectionNodes().map((section) => [section.dataset.filterSection, section.open])
  ));
}

function announceSectionPosition(section) {
  const sections = sectionNodes();
  const position = sections.indexOf(section) + 1;
  elements.sectionOrderStatus.textContent = `${sectionName(section)} moved to position ${position} of ${sections.length}`;
}

function moveSection(section, direction) {
  const sections = sectionNodes();
  const index = sections.indexOf(section);
  if (direction === 'up' && index > 0) {
    elements.advancedContent.insertBefore(section, sections[index - 1]);
  } else if (direction === 'down' && index < sections.length - 1) {
    const anchor = sections[index + 2] || elements.advancedContent.querySelector('.operator-note');
    elements.advancedContent.insertBefore(section, anchor);
  } else {
    return;
  }
  persistSectionOrder();
  updateSectionMoveButtons();
  announceSectionPosition(section);
  section.querySelector(`[data-section-move="${direction}"]`).focus();
}

function dragInsertionPoint(clientY) {
  return sectionNodes()
    .filter((section) => section !== draggedSection)
    .reduce((closest, section) => {
      const box = section.getBoundingClientRect();
      const offset = clientY - box.top - (box.height / 2);
      return offset < 0 && offset > closest.offset ? { offset, section } : closest;
    }, { offset: Number.NEGATIVE_INFINITY, section: null }).section;
}

function finishSectionDrag() {
  if (!draggedSection) return;
  const section = draggedSection;
  section.classList.remove('dragging');
  draggedSection = null;
  persistSectionOrder();
  updateSectionMoveButtons();
  announceSectionPosition(section);
}

function initializeFilterSections() {
  const storedOrder = readStoredLayout(SECTION_ORDER_STORAGE, []);
  const byId = new Map(elements.filterSections.map((section) => [section.dataset.filterSection, section]));
  const orderedIds = Array.isArray(storedOrder)
    ? [...storedOrder.filter((id) => byId.has(id)), ...byId.keys()].filter((id, index, values) => values.indexOf(id) === index)
    : [...byId.keys()];
  const note = elements.advancedContent.querySelector('.operator-note');
  orderedIds.forEach((id) => elements.advancedContent.insertBefore(byId.get(id), note));

  const openState = readStoredLayout(SECTION_OPEN_STORAGE, {});
  elements.filterSections.forEach((section) => {
    if (Object.prototype.hasOwnProperty.call(openState, section.dataset.filterSection)) {
      section.open = Boolean(openState[section.dataset.filterSection]);
    }
    section.addEventListener('toggle', persistSectionOpenState);
    section.querySelectorAll('.section-tool').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const direction = button.dataset.sectionMove;
        if (direction) moveSection(section, direction);
      });
    });
    const handle = section.querySelector('.section-drag');
    handle.addEventListener('dragstart', (event) => {
      draggedSection = section;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', section.dataset.filterSection);
      window.requestAnimationFrame(() => section.classList.add('dragging'));
    });
    handle.addEventListener('dragend', finishSectionDrag);
  });

  elements.advancedContent.addEventListener('dragover', (event) => {
    if (!draggedSection) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const before = dragInsertionPoint(event.clientY);
    const anchor = before || elements.advancedContent.querySelector('.operator-note');
    if (anchor !== draggedSection) elements.advancedContent.insertBefore(draggedSection, anchor);
  });
  elements.advancedContent.addEventListener('drop', (event) => {
    if (!draggedSection) return;
    event.preventDefault();
    finishSectionDrag();
  });
  updateSectionMoveButtons();
}

function filterPayload() {
  return Object.fromEntries(elements.filters.map((input) => [input.dataset.filter, input.value.trim()]));
}

function requestPayload() {
  const selectedSort = elements.sort.value;
  return {
    query: elements.query.value.trim(),
    lookback: elements.lookback.value,
    limit: Number(elements.limit.value),
    retrieval_order: elements.retrievalOrder.value,
    sort: selectedSort === 'ai' ? sourceResponse?.meta?.sort || 'newest' : selectedSort,
    types: selectedTypes(),
    exclude_brand: elements.excludeBrand.checked,
    brand_handle: elements.brandHandle.value.trim(),
    filters: filterPayload(),
  };
}

function setConnection(state, title, detail) {
  elements.connection.dataset.state = state;
  elements.status.textContent = title;
  elements.statusDetail.textContent = detail;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_) {
    throw new Error(`Backend returned HTTP ${response.status} without JSON`);
  }
}

function cloneResponse(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function refinementViewFor(viewId) {
  return refinementViews.find((view) => view.id === viewId) || null;
}

function activeRefinementView() {
  return refinementViewFor(activeResultsView);
}

function responseForResultsView(viewId) {
  return viewId === 'original' ? sourceResponse : refinementViewFor(viewId)?.response || null;
}

function composerStateForView(viewId = activeResultsView) {
  return refinementViewFor(viewId)?.composer || originalRefinementDraft;
}

function saveActiveRefinementDraft() {
  const composer = composerStateForView();
  composer.instruction = elements.llmInstruction.value;
  composer.mode = elements.llmAction.value;
}

function renderLlmConversation() {
  const turns = activeRefinementView()?.turns || [];
  elements.llmConversation.classList.toggle('hidden', !turns.length);
  elements.llmConversation.innerHTML = turns.map((turn, index) => {
    const summary = turn.mode === 'rank'
      ? `Ranked ${formatNumber(turn.reviewedCount)} posts`
      : `Kept ${formatNumber(turn.keptCount)} of ${formatNumber(turn.reviewedCount)}`;
    return `<li><div><strong>You · turn ${index + 1}</strong><small>${escapeHtml(summary)}</small></div><p>${escapeHtml(turn.instruction)}</p></li>`;
  }).join('');
}

function renderLlmComposer() {
  const view = activeRefinementView();
  const composer = composerStateForView();
  elements.llmRefinerTitle.textContent = view
    ? `Refine ${view.label} in a new tab`
    : 'Create an AI view from the posts already pulled';
  elements.llmInstructionLabel.textContent = view
    ? `Follow up on ${view.label}`
    : 'What should SignalDesk prioritize?';
  elements.llmInstruction.placeholder = view
    ? 'Tell SignalDesk what it missed or what should change.'
    : 'Use natural language to curate, filter, and sort your results.';
  elements.llmInstruction.value = composer.instruction;
  elements.llmAction.value = composer.mode;
  if (!llmInFlight) {
    elements.llmApply.textContent = view ? 'Refine in new tab' : 'Create new tab';
  }
  renderLlmConversation();
}

function resetRefinementWorkspace() {
  refinementViews = [];
  closedRefinementViews = [];
  activeResultsView = 'original';
  refinementViewSequence = 0;
  originalRefinementDraft = { instruction: '', mode: 'filter' };
  renderLlmComposer();
}

function updateLlmControls() {
  const hasPosts = Boolean(sourceResponse?.data?.length);
  elements.llmApply.disabled = !llmConfigured || !hasPosts || llmInFlight;
  elements.llmAction.disabled = llmInFlight;
  elements.llmInstruction.disabled = llmInFlight;
  elements.search.disabled = !backendReady || searchInFlight || llmInFlight;
  elements.resultsTabs.querySelectorAll('[data-close-results-view]').forEach((button) => {
    button.disabled = llmInFlight;
  });
  if (!llmInFlight) {
    elements.llmApply.textContent = activeRefinementView() ? 'Refine in new tab' : 'Create new tab';
  }
}

function setLlmFeedback(message, state = '') {
  elements.llmFeedback.textContent = message;
  elements.llmFeedback.dataset.state = state;
}

function setLlmProgress(activeIndex, detail = '', state = '') {
  elements.llmProgress.classList.remove('hidden');
  elements.llmProgressSteps.forEach((step, index) => {
    const stepState = index < activeIndex
      ? 'complete'
      : index === activeIndex && state === 'error'
        ? 'error'
        : index === activeIndex
          ? 'current'
          : '';
    step.dataset.state = stepState;
    const status = step.querySelector('small');
    status.textContent = index < activeIndex
      ? 'Complete'
      : index === activeIndex
        ? detail
        : 'Waiting';
  });
}

function completeLlmProgress(detail) {
  elements.llmProgress.classList.remove('hidden');
  elements.llmProgressSteps.forEach((step, index) => {
    step.dataset.state = 'complete';
    step.querySelector('small').textContent = index === elements.llmProgressSteps.length - 1 ? detail : 'Complete';
  });
}

function resetLlmProgress() {
  window.clearInterval(llmProgressTimer);
  llmProgressTimer = null;
  elements.llmProgress.classList.add('hidden');
  elements.llmProgressSteps.forEach((step) => {
    step.dataset.state = '';
    step.querySelector('small').textContent = 'Waiting';
  });
}

function fallbackSavedSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_SEARCHES_STORAGE) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SAVED_SEARCHES) : [];
  } catch (_) {
    return [];
  }
}

async function initializeSavedSearches() {
  const api = desktopApi();
  if (api?.getSavedSearches) {
    try {
      const result = await api.getSavedSearches();
      savedSearchesCache = Array.isArray(result?.items) ? result.items : [];
      const legacy = fallbackSavedSearches();
      if (!savedSearchesCache.length && legacy.length && !result?.error) {
        const migrated = await api.saveSavedSearches(legacy);
        if (migrated?.ok) {
          savedSearchesCache = migrated.items || legacy;
          localStorage.removeItem(SAVED_SEARCHES_STORAGE);
        }
      }
      if (result?.error) {
        elements.savedSearchFeedback.textContent = result.error;
        elements.savedSearchFeedback.dataset.state = 'error';
      }
    } catch (_) {
      savedSearchesCache = [];
    }
  } else {
    savedSearchesCache = fallbackSavedSearches();
  }
  renderSavedSearches();
}

async function storeSavedSearches(searches) {
  const next = searches.slice(0, MAX_SAVED_SEARCHES);
  const api = desktopApi();
  if (api?.saveSavedSearches) {
    const result = await api.saveSavedSearches(next);
    if (!result?.ok) throw new Error(result?.error || 'SignalDesk could not save searches');
    savedSearchesCache = Array.isArray(result.items) ? result.items : next;
  } else {
    localStorage.setItem(SAVED_SEARCHES_STORAGE, JSON.stringify(next));
    savedSearchesCache = next;
  }
}

function currentSearchSnapshot() {
  return {
    query: elements.query.value,
    lookback: elements.lookback.value,
    limit: elements.limit.value,
    retrievalOrder: elements.retrievalOrder.value,
    sort: elements.sort.value,
    types: selectedTypes(),
    excludeBrand: elements.excludeBrand.checked,
    brandHandle: elements.brandHandle.value,
    filters: filterPayload(),
    advancedOpen: element('#advanced-panel').open,
    sectionOrder: sectionNodes().map((section) => section.dataset.filterSection),
    sectionsOpen: Object.fromEntries(sectionNodes().map((section) => [section.dataset.filterSection, section.open])),
    llmInstruction: elements.llmInstruction.value,
    llmAction: elements.llmAction.value,
  };
}

function renderSavedSearches() {
  const searches = savedSearchesCache;
  elements.savedSearchList.innerHTML = searches.length
    ? searches.map((saved) => {
      const date = new Date(saved.savedAt);
      const when = Number.isNaN(date.getTime()) ? 'Saved search' : date.toLocaleString();
      const query = String(saved.snapshot.query || '').trim() || 'No query';
      return `<article class="saved-search-card"><button class="saved-search-load" type="button" data-saved-load="${escapeHtml(saved.id)}"><strong>${escapeHtml(saved.name)}</strong><small>${escapeHtml(query)} · ${escapeHtml(when)}</small></button><button class="saved-search-delete" type="button" data-saved-delete="${escapeHtml(saved.id)}" aria-label="Delete ${escapeHtml(saved.name)}">×</button></article>`;
    }).join('')
    : '<div class="saved-search-empty">No saved searches yet.</div>';
}

function openSavedSearches() {
  renderSavedSearches();
  if (!elements.savedSearchName.value.trim()) elements.savedSearchName.value = elements.query.value.trim().slice(0, 80);
  elements.savedSearches.dataset.open = 'true';
  elements.savedSearches.setAttribute('aria-hidden', 'false');
  elements.savedSearchesScrim.classList.remove('hidden');
  document.body.classList.add('saved-searches-open');
  window.setTimeout(() => elements.savedSearchName.focus(), 0);
}

function closeSavedSearches() {
  elements.savedSearches.dataset.open = 'false';
  elements.savedSearches.setAttribute('aria-hidden', 'true');
  elements.savedSearchesScrim.classList.add('hidden');
  document.body.classList.remove('saved-searches-open');
  elements.savedSearchFeedback.textContent = '';
  elements.savedSearchesButton.focus();
}

async function saveCurrentSearch() {
  const snapshot = currentSearchSnapshot();
  if (!snapshot.query.trim()) {
    elements.savedSearchFeedback.textContent = 'Enter a search query before saving this setup.';
    elements.savedSearchFeedback.dataset.state = 'error';
    return;
  }
  const name = elements.savedSearchName.value.trim() || snapshot.query.trim();
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const searches = [...savedSearchesCache];
    searches.unshift({ id, name: name.slice(0, 80), savedAt: new Date().toISOString(), snapshot });
    await storeSavedSearches(searches);
    elements.savedSearchName.value = '';
    elements.savedSearchFeedback.textContent = `Saved “${name.slice(0, 80)}” persistently on this computer.`;
    elements.savedSearchFeedback.dataset.state = 'success';
    renderSavedSearches();
  } catch (error) {
    elements.savedSearchFeedback.textContent = `Could not save this search: ${error.message}`;
    elements.savedSearchFeedback.dataset.state = 'error';
  }
}

function setSelectValue(select, value) {
  if ([...select.options].some((option) => option.value === String(value ?? ''))) {
    select.value = String(value ?? '');
  }
}

function applySavedSearch(snapshot) {
  elements.query.value = String(snapshot.query || '');
  setSelectValue(elements.lookback, snapshot.lookback);
  setSelectValue(elements.limit, snapshot.limit);
  setSelectValue(elements.retrievalOrder, snapshot.retrievalOrder);
  setSelectValue(elements.sort, snapshot.sort);
  const types = Array.isArray(snapshot.types) ? snapshot.types : ['original'];
  elements.types.forEach((input) => { input.checked = types.includes(input.dataset.postType); });
  if (!selectedTypes().length) elements.types[0].checked = true;
  elements.excludeBrand.checked = Boolean(snapshot.excludeBrand);
  elements.brandHandle.value = String(snapshot.brandHandle || '');
  elements.brandField.classList.toggle('hidden', !elements.excludeBrand.checked);
  elements.filters.forEach((input) => {
    const key = input.dataset.filter;
    const value = snapshot.filters?.[key] ?? FILTER_DEFAULTS[key] ?? '';
    if (input.matches('select')) setSelectValue(input, value);
    else input.value = String(value);
  });
  const advancedPanel = element('#advanced-panel');
  advancedPanel.open = Boolean(snapshot.advancedOpen);
  if (Array.isArray(snapshot.sectionOrder)) {
    snapshot.sectionOrder.forEach((id) => {
      const section = elements.filterSections.find((candidate) => candidate.dataset.filterSection === id);
      if (section) elements.advancedContent.appendChild(section);
    });
  }
  sectionNodes().forEach((section) => {
    section.open = Boolean(snapshot.sectionsOpen?.[section.dataset.filterSection]);
  });
  elements.llmInstruction.value = String(snapshot.llmInstruction || '');
  setSelectValue(elements.llmAction, snapshot.llmAction || 'filter');
  persistSectionOrder();
  persistSectionOpenState();
  updateSectionMoveButtons();
  schedulePreview();
}

function loadSavedSearch(id) {
  const saved = savedSearchesCache.find((item) => item.id === id);
  if (!saved) return;
  applySavedSearch(saved.snapshot);
  closeSavedSearches();
  elements.query.focus();
}

async function deleteSavedSearch(id) {
  try {
    await storeSavedSearches(savedSearchesCache.filter((item) => item.id !== id));
    renderSavedSearches();
    elements.savedSearchFeedback.textContent = 'Saved search deleted.';
    elements.savedSearchFeedback.dataset.state = 'success';
  } catch (error) {
    elements.savedSearchFeedback.textContent = `Could not delete that search: ${error.message}`;
    elements.savedSearchFeedback.dataset.state = 'error';
  }
}

function desktopApi() {
  return window.signaldeskDesktop || null;
}
function resetSignalDesk() {
  searchController?.abort();
  llmController?.abort();
  searchController = null;
  llmController = null;
  previewSequence += 1;
  elements.query.value = '';
  elements.lookback.value = '1wk';
  elements.limit.value = '50';
  elements.retrievalOrder.value = 'recency';
  elements.sort.value = 'newest';
  elements.types.forEach((input) => { input.checked = input.dataset.postType === 'original'; });
  elements.excludeBrand.checked = false;
  elements.brandHandle.value = '';
  elements.brandField.classList.add('hidden');
  elements.filters.forEach((input) => {
    const value = FILTER_DEFAULTS[input.dataset.filter] ?? '';
    input.value = value;
  });
  element('#advanced-panel').open = false;
  sectionNodes().forEach((section) => { section.open = false; });
  lastResponse = null;
  sourceResponse = null;
  searchInFlight = false;
  llmInFlight = false;
  resetRefinementWorkspace();
  resetLlmProgress();
  elements.report.classList.add('hidden');
  elements.results.innerHTML = '';
  elements.diagnostics.innerHTML = '';
  elements.sentimentOverview.innerHTML = '';
  elements.export.disabled = true;
  elements.search.disabled = !backendReady;
  elements.search.querySelector('span').textContent = 'Search';
  updateResultsTabs();
  updateLlmControls();
  setLlmFeedback('Run a search, then describe the posts you need.');
  void previewNow(true);
  elements.query.focus();
}

function showUpdateDialog() {
  if (settingsRequired || !elements.settingsDialog.classList.contains('hidden')) return;
  elements.updateDialog.classList.remove('hidden');
  document.body.classList.add('update-open');
  window.setTimeout(() => elements.updatePrimary.focus(), 0);
}

function hideUpdateDialog() {
  elements.updateDialog.classList.add('hidden');
  document.body.classList.remove('update-open');
}

function renderUpdateState(state) {
  if (!state || typeof state !== 'object') return;
  currentUpdateState = state;
  const version = String(state.version || '');
  const currentVersion = String(state.currentVersion || APP_BUILD);
  elements.updateError.textContent = '';
  elements.updateProgress.classList.add('hidden');
  elements.updatePrimary.disabled = false;
  elements.updateLater.disabled = false;
  elements.updateLater.textContent = 'Later';
  if (state.status === 'available') {
    elements.updateTitle.textContent = `SignalDesk ${version} is available`;
    elements.updateDetail.textContent = `You are running ${currentVersion}. Download the official GitHub release now?`;
    elements.updatePrimary.textContent = 'Download update';
    showUpdateDialog();
    return;
  }
  if (state.status === 'downloading') {
    const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
    elements.updateTitle.textContent = `Downloading SignalDesk ${version}`;
    elements.updateDetail.textContent = 'The app remains usable while the update downloads.';
    elements.updateProgress.classList.remove('hidden');
    elements.updateProgress.setAttribute('aria-valuenow', String(Math.round(percent)));
    elements.updatePercent.textContent = `${Math.round(percent)}%`;
    elements.updateProgressBar.style.width = `${percent}%`;
    elements.updatePrimary.textContent = 'Downloading…';
    elements.updatePrimary.disabled = true;
    elements.updateLater.textContent = 'Hide';
    showUpdateDialog();
    return;
  }
  if (state.status === 'downloaded') {
    elements.updateTitle.textContent = `SignalDesk ${version} is ready`;
    elements.updateDetail.textContent = 'Restart SignalDesk to replace the old application files. Your encrypted credentials and settings remain in place.';
    elements.updatePrimary.textContent = 'Restart and install';
    showUpdateDialog();
    return;
  }
  if (state.status === 'error' && !elements.updateDialog.classList.contains('hidden')) {
    elements.updateTitle.textContent = 'SignalDesk could not update';
    elements.updateDetail.textContent = 'The current version is unchanged and remains usable.';
    elements.updateError.textContent = String(state.message || 'Update failed');
    elements.updatePrimary.textContent = 'Close';
    showUpdateDialog();
  }
}

async function handleUpdatePrimary() {
  const api = desktopApi();
  if (!api) return;
  elements.updateError.textContent = '';
  if (currentUpdateState.status === 'available') {
    elements.updatePrimary.disabled = true;
    const result = await api.downloadUpdate();
    if (!result?.ok) {
      elements.updateError.textContent = result?.error || 'Update download failed';
      elements.updatePrimary.disabled = false;
    }
    return;
  }
  if (currentUpdateState.status === 'downloaded') {
    elements.updatePrimary.disabled = true;
    elements.updatePrimary.textContent = 'Restarting…';
    const result = await api.installUpdate();
    if (!result?.ok) {
      elements.updateError.textContent = result?.error || 'Update install failed';
      elements.updatePrimary.disabled = false;
      elements.updatePrimary.textContent = 'Restart and install';
    }
    return;
  }
  hideUpdateDialog();
}

async function initializeUpdaterUi() {
  const api = desktopApi();
  if (!api?.getUpdateState || !api?.onUpdateState) return;
  api.onUpdateState(renderUpdateState);
  try {
    renderUpdateState(await api.getUpdateState());
  } catch (_) {
    // Update checks must never block the local research workflow.
  }
}

function configureProviderModels(provider, selectedModel = '') {
  const models = LLM_MODELS[provider] || LLM_MODELS.openai;
  elements.llmModel.innerHTML = [
    ...models.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`),
    '<option value="custom">Custom model ID…</option>',
  ].join('');
  if (models.some(([value]) => value === selectedModel)) {
    elements.llmModel.value = selectedModel;
    elements.llmCustomModel.value = '';
  } else if (selectedModel) {
    elements.llmModel.value = 'custom';
    elements.llmCustomModel.value = selectedModel;
  } else {
    elements.llmModel.value = models[0][0];
    elements.llmCustomModel.value = '';
  }
  elements.llmCustomModelRow.classList.toggle('hidden', elements.llmModel.value !== 'custom');
}

function selectedLlmModel() {
  return elements.llmModel.value === 'custom'
    ? elements.llmCustomModel.value.trim()
    : elements.llmModel.value;
}

function handleLlmProviderChange() {
  configureProviderModels(elements.llmProvider.value);
  elements.llmApiKey.value = '';
  elements.llmApiKey.placeholder = 'Paste the selected provider API key';
}

function handleLlmModelChange() {
  elements.llmCustomModelRow.classList.toggle('hidden', elements.llmModel.value !== 'custom');
  if (elements.llmModel.value === 'custom') elements.llmCustomModel.focus();
}

function populateSettings(configuration) {
  desktopConfiguration = configuration;
  elements.xBearerToken.value = '';
  elements.xBearerToken.required = !configuration.xConfigured;
  elements.xBearerToken.placeholder = configuration.xConfigured
    ? 'Saved securely · leave blank to keep it'
    : 'Paste your X API Bearer Token';
  elements.llmApiKey.value = '';
  elements.llmApiKey.placeholder = configuration.llmApiKeyConfigured
    ? 'Saved securely · leave blank to keep it'
    : 'Leave blank when unused';
  elements.llmProvider.value = configuration.llmProvider || 'openai';
  configureProviderModels(elements.llmProvider.value, configuration.llmModel);
  elements.clearLlm.checked = false;
  elements.clearLlmRow.classList.toggle('hidden', !configuration.llmApiKeyConfigured);
  elements.settingsIntro.textContent = configuration.xConfigured
    ? 'Update the saved credentials below. Blank secret fields keep their current values.'
    : 'Paste the X API Bearer Token used for searches. This is the only required credential.';
  elements.dataLocation.textContent = configuration.dataLocation || 'Available in the packaged desktop app';
  elements.settingsError.textContent = configuration.configurationError || '';
}

function showSettings(required = false) {
  settingsRequired = required || !desktopConfiguration?.xConfigured;
  elements.settingsClose.classList.toggle('hidden', settingsRequired);
  elements.settingsCancel.classList.toggle('hidden', settingsRequired);
  elements.settingsDialog.classList.remove('hidden');
  document.body.classList.add('settings-open');
  window.setTimeout(() => elements.xBearerToken.focus(), 0);
}

function closeSettings() {
  if (settingsRequired) return;
  elements.settingsDialog.classList.add('hidden');
  document.body.classList.remove('settings-open');
  elements.settingsError.textContent = '';
  elements.settingsButton.focus();
  if (['available', 'downloading', 'downloaded'].includes(currentUpdateState.status)) {
    renderUpdateState(currentUpdateState);
  }
}

async function openSettings(required = false) {
  const api = desktopApi();
  if (!api) return;
  elements.settingsButton.classList.remove('hidden');
  try {
    const configuration = await api.getConfiguration();
    populateSettings(configuration);
    showSettings(required);
  } catch (error) {
    desktopConfiguration = { xConfigured: false };
    elements.settingsError.textContent = error.message || String(error);
    showSettings(true);
  }
}
async function openLocalDataFolder() {
  const api = desktopApi();
  if (!api?.openDataLocation) return;
  elements.settingsError.textContent = '';
  const result = await api.openDataLocation();
  if (!result?.ok) {
    elements.settingsError.textContent = result?.error || 'SignalDesk could not open the local data folder';
  }
}

async function saveDesktopSettings(event) {
  event.preventDefault();
  const api = desktopApi();
  if (!api) return;
  const previousLabel = elements.settingsSave.textContent;
  elements.settingsSave.disabled = true;
  elements.settingsSave.textContent = 'Saving…';
  elements.settingsError.textContent = '';
  try {
    const model = selectedLlmModel();
    if (elements.llmApiKey.value.trim() && !model) throw new Error('Choose or enter an AI model');
    const result = await api.saveConfiguration({
      xBearerToken: elements.xBearerToken.value,
      llmApiKey: elements.llmApiKey.value,
      llmProvider: elements.llmProvider.value,
      llmModel: model,
      clearLlm: elements.clearLlm.checked,
    });
    if (!result?.ok || !result.url) throw new Error(result?.error || 'SignalDesk could not restart');
    window.location.replace(result.url);
  } catch (error) {
    elements.settingsError.textContent = error.message || String(error);
    elements.settingsSave.disabled = false;
    elements.settingsSave.textContent = previousLabel;
  }
}

async function initializeDesktopSettings() {
  const api = desktopApi();
  if (!api) return;
  elements.settingsButton.classList.remove('hidden');
  try {
    const configuration = await api.getConfiguration();
    populateSettings(configuration);
    if (!configuration.xConfigured || configuration.configurationError) {
      showSettings(!configuration.xConfigured);
    }
  } catch (error) {
    desktopConfiguration = { xConfigured: false };
    elements.settingsError.textContent = error.message || String(error);
    showSettings(true);
  }
}


async function checkHealth() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (data.build !== APP_BUILD) {
      backendReady = false;
      elements.search.disabled = true;
      setConnection('error', 'Stale backend blocked', `Browser ${APP_BUILD} · server ${data.build || 'unknown'}`);
      return;
    }
    if (!data.token_configured) {
      backendReady = false;
      elements.search.disabled = true;
      setConnection('error', 'X token unavailable', `Backend ${data.build}`);
      if (desktopApi()) void openSettings(true);
      return;
    }
    llmConfigured = Boolean(data.llm_configured);
    const providerLabel = data.llm_provider === 'anthropic' ? 'Anthropic' : 'OpenAI';
    elements.llmRefinerModel.textContent = llmConfigured
      ? `${providerLabel} · ${data.llm_model}`
      : 'AI not configured · add a provider key in Credentials';
    updateLlmControls();
    backendReady = true;
    elements.search.disabled = false;
    setConnection('live', 'Connected to X', `Backend ${data.build}`);
  } catch (error) {
    backendReady = false;
    llmConfigured = false;
    elements.search.disabled = true;
    elements.llmRefinerModel.textContent = 'Backend unavailable';
    updateLlmControls();
    setConnection('error', 'Backend unavailable', error.message);
  }
}

function validatePayload(payload) {
  if (!payload.query) throw new Error('Enter a topic, phrase, handle, or X query');
  if (!payload.types.length) throw new Error('Select at least one post type');
  if (payload.exclude_brand && !payload.brand_handle) throw new Error('Enter the brand X handle to exclude');
}

function renderRequestPreview(meta) {
  elements.preview.textContent = meta.query_used;
  elements.previewState.textContent = `${meta.query_characters}/${meta.query_limit} query characters · server-generated`;
  elements.requestUrl.textContent = meta.request_url;
  const facts = [
    ['endpoint', meta.endpoint],
    ['start_time', meta.start_time],
    ['max_results', meta.first_page_max_results],
    ['target cap', meta.requested_limit],
    ['X order', meta.retrieval_order],
    ['local sort', meta.sort],
  ];
  elements.apiParameters.innerHTML = facts.map(([label, value]) => `<span class="request-fact">${escapeHtml(label)} <b>${escapeHtml(value)}</b></span>`).join('');
  const count = meta.applied_filters?.length || 0;
  elements.advancedCount.textContent = count ? `${count} filter${count === 1 ? '' : 's'} applied` : 'None applied';
}

async function previewNow(silent = false) {
  const sequence = ++previewSequence;
  const payload = requestPayload();
  if (!payload.query) {
    elements.preview.textContent = '—';
    elements.previewState.textContent = 'Enter a search to preview';
    elements.apiParameters.innerHTML = '';
    elements.requestUrl.textContent = '—';
    return null;
  }
  try {
    validatePayload(payload);
    elements.previewState.textContent = 'Building request on the server…';
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);
    if (sequence !== previewSequence) return null;
    if (!response.ok || !data.ok) throw new Error(data.error || 'Could not build request');
    if (data.meta.build !== APP_BUILD) throw new Error('Preview came from a stale backend');
    renderRequestPreview(data.meta);
    return data.meta;
  } catch (error) {
    if (sequence !== previewSequence) return null;
    elements.preview.textContent = '—';
    elements.previewState.textContent = error.message;
    elements.apiParameters.innerHTML = '';
    elements.requestUrl.textContent = '—';
    if (!silent) elements.previewState.title = error.message;
    return null;
  }
}

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => previewNow(), 260);
}

function metricValue(post, sort, users) {
  const metrics = post.public_metrics || {};
  if (sort === 'ai') return Number(post.signaldesk_llm?.relevance_score || 0);
  if (sort === 'newest') return Date.parse(post.created_at || '') || 0;
  if (sort === 'likes') return Number(metrics.like_count || 0);
  if (sort === 'reposts') return Number(metrics.retweet_count || 0);
  if (sort === 'replies') return Number(metrics.reply_count || 0);
  if (sort === 'followers') return Number(users[post.author_id]?.public_metrics?.followers_count || 0);
  return 0;
}

function comparePostIdsDescending(left, right) {
  try {
    const leftId = BigInt(left.id || 0);
    const rightId = BigInt(right.id || 0);
    return rightId > leftId ? 1 : rightId < leftId ? -1 : 0;
  } catch (_) {
    return String(right.id || '').localeCompare(String(left.id || ''));
  }
}

function comparePosts(left, right, sort, users) {
  const primaryDifference = metricValue(right, sort, users) - metricValue(left, sort, users);
  if (primaryDifference) return primaryDifference;
  const createdDifference = String(right.created_at || '').localeCompare(String(left.created_at || ''));
  return createdDifference || comparePostIdsDescending(left, right);
}
function resortCurrentResults() {
  const response = responseForResultsView(activeResultsView);
  const view = activeRefinementView();
  if (!response?.data?.length || searchInFlight || llmInFlight) return;
  const sort = elements.sort.value;
  if (sort === 'ai' && !view) return;
  const users = Object.fromEntries((response.includes?.users || []).map((user) => [user.id, user]));
  response.data = [...response.data].sort((left, right) => comparePosts(left, right, sort, users));
  response.meta.sort = sort;
  response.meta.sort_label = SORT_LABELS[sort];
  const viewLabel = view ? view.label : 'Original';
  response.meta.sort_scope = `${SORT_LABELS[sort]} applied instantly to ${viewLabel}. No new X request was made.`;
  renderReport(cloneResponse(response), true);
  elements.message.textContent = `Reordered ${response.data.length} ${viewLabel} posts by ${SORT_LABELS[sort].toLowerCase()} · no new search`;
}

function assertResponseContract(data, payload) {
  if (data.build !== APP_BUILD || data.meta?.build !== APP_BUILD) {
    throw new Error(`Stale backend response blocked: expected ${APP_BUILD}, received ${data.build || 'unknown'}`);
  }
  if (data.meta.requested_limit !== payload.limit) throw new Error(`Backend ignored requested count ${payload.limit}`);
  if (data.meta.sort !== payload.sort) throw new Error(`Backend ignored local sort ${payload.sort}`);
  if (data.meta.retrieval_order !== payload.retrieval_order) throw new Error(`Backend ignored X retrieval order ${payload.retrieval_order}`);
  const actualTypes = JSON.stringify(data.meta.types || []);
  const expectedTypes = JSON.stringify(TYPE_ORDER.filter((type) => payload.types.includes(type)));
  if (actualTypes !== expectedTypes) throw new Error('Backend ignored selected post types');
  const posts = data.data || [];
  if (posts.some((post) => post.signaldesk_type === 'retweet')) throw new Error('Safety check failed: native repost returned');
  if (posts.some((post) => !payload.types.includes(post.signaldesk_type))) throw new Error('Safety check failed: unselected post type returned');
  if (posts.some((post) => !post.sentiment || !post.sentiment.label)) throw new Error('Sentiment result missing from a returned post');
  const users = Object.fromEntries((data.includes?.users || []).map((user) => [user.id, user]));
  const values = posts.map((post) => metricValue(post, payload.sort, users));
  if (values.some((value, index) => index > 0 && values[index - 1] < value)) {
    throw new Error(`Posts are out of order for ${SORT_LABELS[payload.sort]}`);
  }
}

function renderSentiment(summary) {
  const sentiment = summary || { label: 'unscored', score: null, scored_posts: 0, unscored_posts: 0, percentages: {} };
  elements.statSentiment.textContent = sentiment.label;
  elements.statSentimentScore.textContent = sentiment.score === null ? 'No English posts scored' : `${formatScore(sentiment.score)} · ${sentiment.scored_posts} scored`;
  elements.sentimentCard.dataset.sentiment = sentiment.label;
  const bars = ['positive', 'neutral', 'negative', 'mixed'];
  elements.sentimentOverview.innerHTML = `<div class="sentiment-copy"><strong>${escapeHtml(sentiment.label)} overall · ${escapeHtml(formatScore(sentiment.score))}</strong><p>${escapeHtml(sentiment.method || '')}. Coverage: ${formatNumber(sentiment.scored_posts)} scored, ${formatNumber(sentiment.unscored_posts)} unscored.</p></div><div class="sentiment-bars">${bars.map((label) => { const value = Number(sentiment.percentages?.[label] || 0); return `<div class="sentiment-bar ${label}"><span>${label}<b>${value.toFixed(1)}%</b></span><i style="--value:${Math.min(100, value)}%"></i></div>`; }).join('')}</div>`;
}

function renderDiagnostics(meta, sentiment) {
  const types = meta.types.map((type) => type === 'quote' ? 'quote posts' : `${type} posts`).join(', ');
  const partialMessage = meta.partial
    ? `<div class="diagnostic warning"><strong>Fewer than requested:</strong> X returned ${meta.result_count} matching posts before available pages ended. This is not a silent fixed cap.</div>`
    : '';
  const refinement = meta.llm_refinement;
  const refinementRows = (refinement?.removed || []).map((item) => `<li><code>${escapeHtml(item.id)}</code><span>Score ${formatNumber(item.relevance_score)} · ${escapeHtml(item.reason)}</span></li>`).join('');
  const conversation = refinement?.conversation || (refinement?.instruction ? [refinement.instruction] : []);
  const conversationRows = conversation.map((instruction, index) => `<li><code>Turn ${index + 1}</code><span>${escapeHtml(instruction)}</span></li>`).join('');
  const unchangedFilter = refinement?.mode === 'filter' && Number(refinement.removed_count) === 0
    ? '<p><strong>No posts were removed:</strong> the model marked every reviewed post as a match. Follow up with narrower criteria to reduce the set.</p>'
    : '';
  const refinementProof = refinement?.applied
    ? `<div class="diagnostic wide llm-proof"><span>AI result review · ${escapeHtml(refinement.model)}</span><strong>${escapeHtml(refinement.instruction)}</strong><p>${escapeHtml(refinement.mode === 'filter' ? 'Filtered and ranked' : 'Ranked without filtering')} · reviewed ${formatNumber(refinement.reviewed_count)} · kept ${formatNumber(refinement.kept_count)} · removed ${formatNumber(refinement.removed_count)} · existing results only, no new X search</p>${unchangedFilter}${conversation.length > 1 ? `<details><summary>Review ${conversation.length}-turn conversation</summary><ul>${conversationRows}</ul></details>` : ''}${refinementRows ? `<details><summary>Review removed posts</summary><ul>${refinementRows}</ul></details>` : ''}</div>`
    : '';
  const excludedTerms = meta.excluded_terms || [];
  const exclusionProof = excludedTerms.length
    ? `${excludedTerms.join(', ')} · ${formatNumber(meta.dropped_excluded_terms)} additional matches blocked locally`
    : 'None';
  elements.diagnostics.innerHTML = `
    <div class="diagnostic wide"><span>Exact query sent to X</span><code>${escapeHtml(meta.query_used)}</code></div>
    <div class="diagnostic"><span>Request scope</span><strong>${escapeHtml(meta.endpoint)} · start ${escapeHtml(meta.start_time)}</strong></div>
    <div class="diagnostic"><span>Count behavior</span><strong>max_results ${meta.first_page_max_results} · target ${meta.requested_limit}</strong></div>
    <div class="diagnostic"><span>Fetched</span><strong>${formatNumber(meta.api_posts_scanned)} posts · ${formatNumber(meta.api_pages)} page${meta.api_pages === 1 ? '' : 's'}</strong></div>
    <div class="diagnostic"><span>Filter proof</span><strong>${escapeHtml(types)} · ${formatNumber(meta.dropped_native_reposts)} reposts dropped</strong></div>
    <div class="diagnostic"><span>Excluded words or phrases</span><strong>${escapeHtml(exclusionProof)}</strong></div>
    <div class="diagnostic"><span>Orders</span><strong>X ${escapeHtml(meta.retrieval_order)} · local ${escapeHtml(meta.sort_label)}</strong></div>
    <div class="diagnostic"><span>Sentiment</span><strong>${escapeHtml(sentiment.method)} · ${formatNumber(sentiment.scored_posts)} scored</strong></div>
    ${refinementProof}
    ${partialMessage}`;
}

function postCard(post, users) {
  const user = users[post.author_id] || {};
  const metrics = post.public_metrics || {};
  const username = user.username || 'unknown';
  const profileImage = safeImageUrl(user.profile_image_url);
  const initial = String(user.name || username || 'X').trim().charAt(0).toUpperCase();
  const postUrl = `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(post.id)}`;
  const type = post.signaldesk_type || 'original';
  const typeLabel = type === 'quote' ? 'Quote post' : type === 'reply' ? 'Reply' : 'Original';
  const sentiment = post.sentiment || { label: 'unscored', score: null, confidence: 0 };
  const sentimentText = sentiment.score === null ? sentiment.label : `${sentiment.label} ${formatScore(sentiment.score)}`;
  const avatar = profileImage ? `<img src="${escapeHtml(profileImage)}" alt="" loading="lazy">` : escapeHtml(initial);
  const linkCount = post.entities?.urls?.length || 0;
  const aiReview = post.signaldesk_llm;
  const aiBadge = aiReview
    ? `<span class="ai-score" title="${escapeHtml(aiReview.reason)} · confidence ${Math.round(Number(aiReview.confidence || 0) * 100)}%">AI ${formatNumber(aiReview.relevance_score)}/100</span>`
    : '';
  return `<article class="result" data-post-id="${escapeHtml(post.id)}" data-post-type="${escapeHtml(type)}" data-sentiment="${escapeHtml(sentiment.label)}">
    <div class="result-head"><div class="author"><div class="avatar">${avatar}</div><div class="author-copy"><strong>${escapeHtml(user.name || 'X user')}</strong><span>@${escapeHtml(username)} · ${escapeHtml(formatDate(post.created_at))}</span></div></div><a class="result-link" href="${postUrl}" target="_blank" rel="noopener noreferrer">Open on X →</a></div>
    <p class="result-body">${escapeHtml(post.text || '')}</p>
    <div class="result-footer"><div class="badges"><span class="post-type ${escapeHtml(type)}">${escapeHtml(typeLabel)}</span><span class="sentiment-badge ${escapeHtml(sentiment.label)}" title="${escapeHtml(sentiment.method || '')}; confidence ${Math.round(Number(sentiment.confidence || 0) * 100)}%">${escapeHtml(sentimentText)}</span>${aiBadge}</div><div class="metrics"><span>Likes <b>${formatNumber(metrics.like_count)}</b></span><span>Reposts <b>${formatNumber(metrics.retweet_count)}</b></span><span>Replies <b>${formatNumber(metrics.reply_count)}</b></span><span>Quotes <b>${formatNumber(metrics.quote_count)}</b></span><span>Followers <b>${formatNumber(user.public_metrics?.followers_count)}</b></span><span>Links <b>${formatNumber(linkCount)}</b></span><span>Impressions <b>${formatNumber(metrics.impression_count)}</b></span></div></div>
  </article>`;
}
function updateResultsTabs() {
  const originalCount = sourceResponse?.data?.length || 0;
  const originalActive = activeResultsView === 'original';
  const refinementTabs = refinementViews.map((view) => {
    const active = view.id === activeResultsView;
    const latestInstruction = view.turns.at(-1)?.instruction || view.label;
    return `<div class="results-tab-shell" data-active="${active}" role="presentation">
      <button class="results-tab-select" type="button" role="tab" aria-selected="${active}" data-results-view="${escapeHtml(view.id)}" title="${escapeHtml(latestInstruction)}">${escapeHtml(view.label)} <span class="results-tab-count">${formatNumber(view.response.data?.length)}</span></button>
      <button class="results-tab-close" type="button" data-close-results-view="${escapeHtml(view.id)}" aria-label="Close ${escapeHtml(view.label)}" title="Close ${escapeHtml(view.label)}"${llmInFlight ? ' disabled' : ''}>×</button>
    </div>`;
  }).join('');
  elements.resultsTabs.innerHTML = `<div class="results-tab-shell" data-active="${originalActive}" role="presentation">
    <button class="results-tab-select" type="button" role="tab" aria-selected="${originalActive}" data-results-view="original">Original <span class="results-tab-count">${formatNumber(originalCount)}</span></button>
  </div>${refinementTabs}`;

  const view = activeRefinementView();
  const response = responseForResultsView(activeResultsView);
  elements.resultsViewTitle.textContent = view ? `${view.label} posts` : 'Original posts';
  elements.resultSortControl.classList.remove('hidden');
  elements.aiSortOption.hidden = !view;
  elements.sort.value = response?.meta?.sort || (view ? 'ai' : 'newest');
}

function activateResultsView(viewId) {
  const response = responseForResultsView(viewId);
  if (!response || viewId === activeResultsView) return;
  saveActiveRefinementDraft();
  activeResultsView = viewId;
  resetLlmProgress();
  renderReport(cloneResponse(response), true);
  renderLlmComposer();
}

function renderReport(data, preserveDetails = false) {
  lastResponse = data;
  const posts = data.data || [];
  const meta = data.meta;
  const refinement = meta.llm_refinement;
  const viewLabel = activeRefinementView()?.label || 'AI view';
  const analytics = data.analytics || { unique_authors: 0, totals: {}, sentiment: {} };
  const users = Object.fromEntries((data.includes?.users || []).map((user) => [user.id, user]));
  renderRequestPreview(meta);
  if (!preserveDetails) elements.reportDetails.open = false;
  elements.reportTitle.textContent = meta.topic_query;
  elements.message.className = '';
  if (refinement?.applied) {
    if (refinement.mode === 'rank') {
      elements.message.textContent = `${viewLabel} ranked all ${posts.length} original posts · no filtering and no new X search`;
    } else if (Number(refinement.removed_count) === 0) {
      elements.message.textContent = `${viewLabel} kept all ${posts.length} posts because the model marked every post as a match · no new X search`;
    } else {
      elements.message.textContent = `${viewLabel} kept ${posts.length} of ${refinement.reviewed_count} original posts · no new X search`;
    }
  } else {
    elements.message.textContent = `Returned ${posts.length} of ${meta.requested_limit} requested · scanned ${meta.api_posts_scanned} from X`;
  }
  elements.statPosts.textContent = formatNumber(posts.length);
  elements.statRequested.textContent = refinement?.applied
    ? `of ${formatNumber(refinement.reviewed_count)} original`
    : `of ${formatNumber(meta.requested_limit)} requested`;
  elements.statAuthors.textContent = formatNumber(analytics.unique_authors);
  elements.statEngagement.textContent = formatNumber(analytics.totals?.engagements);
  elements.statImpressions.textContent = formatNumber(analytics.totals?.impressions);
  elements.resultCount.textContent = `${formatNumber(posts.length)} result${posts.length === 1 ? '' : 's'}`;
  elements.sortProof.textContent = refinement?.applied && meta.sort === 'ai'
    ? `${refinement.model} ranked this AI view against your instruction · no new X search`
    : meta.sort_scope?.includes('No new X request')
      ? meta.sort_scope
      : `${meta.sort_label} across the ${posts.length} original posts shown`;
  elements.export.disabled = !posts.length;
  renderSentiment(analytics.sentiment);
  renderDiagnostics(meta, analytics.sentiment);
  elements.results.innerHTML = posts.length
    ? posts.map((post) => postCard(post, users)).join('')
    : refinement?.applied
      ? '<div class="empty-state"><strong>No posts met the AI instruction</strong><p>Follow up from this tab or switch to Original. The X results were not changed.</p></div>'
      : '<div class="empty-state"><strong>No matching X posts</strong><p>The live API returned no posts for this exact request.</p></div>';
  elements.llmRefiner.classList.toggle('hidden', !sourceResponse?.data?.length);
  updateResultsTabs();
  updateLlmControls();
}

async function applyLlmRefinement() {
  const instruction = elements.llmInstruction.value.replace(/\s+/g, ' ').trim();
  if (!llmConfigured) {
    setLlmFeedback('Add an LLM API key in Credentials before applying an AI review.', 'error');
    return;
  }
  if (!sourceResponse?.data?.length) {
    setLlmFeedback('Run a search with results before applying an AI review.', 'error');
    return;
  }
  if (!instruction) {
    setLlmFeedback('Describe what the AI should keep or prioritize.', 'error');
    elements.llmInstruction.focus();
    return;
  }

  const parentViewId = activeResultsView;
  const parentView = activeRefinementView();
  const parentTurns = (parentView?.turns || []).map((turn) => ({ ...turn }));
  const instructionHistory = parentTurns.map((turn) => turn.instruction);
  const mode = elements.llmAction.value;
  const parentComposer = composerStateForView(parentViewId);
  saveActiveRefinementDraft();
  llmInFlight = true;
  const controller = new AbortController();
  llmController = controller;
  updateLlmControls();
  const model = elements.llmRefinerModel.textContent;
  const nextViewNumber = refinementViewSequence + 1;
  let progressStep = 0;
  elements.llmApply.textContent = 'Creating new tab…';
  setLlmProgress(0, `Collecting ${sourceResponse.data.length} original posts`);
  setLlmFeedback(`Preparing all ${sourceResponse.data.length} original posts for ${model}…`);
  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    progressStep = 1;
    const waitingSince = Date.now();
    setLlmProgress(1, `Sending to ${model}`);
    setLlmFeedback(`Sending all ${sourceResponse.data.length} original posts to ${model}…`);
    llmProgressTimer = window.setInterval(() => {
      const seconds = Math.max(1, Math.round((Date.now() - waitingSince) / 1000));
      setLlmProgress(1, `Waiting for ${model} · ${seconds}s`);
      setLlmFeedback(`Waiting for ${model} to review ${sourceResponse.data.length} original posts · ${seconds}s elapsed`);
    }, 1000);
    const response = await fetch('/api/llm-filter', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        instruction_history: instructionHistory,
        mode,
        topic_query: sourceResponse.meta.topic_query,
        posts: sourceResponse.data,
        users: sourceResponse.includes?.users || [],
      }),
    });
    window.clearInterval(llmProgressTimer);
    llmProgressTimer = null;
    progressStep = 2;
    setLlmProgress(2, 'Parsing and checking every decision');
    setLlmFeedback(`Response received from ${model}. Validating every post decision…`);
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw new Error(data.error || `AI review failed with HTTP ${response.status}`);
    if (data.build !== APP_BUILD) throw new Error(`Stale AI response blocked: expected ${APP_BUILD}, received ${data.build || 'unknown'}`);
    if (!Array.isArray(data.data) || !data.llm_refinement?.applied) {
      throw new Error('AI review returned an invalid result');
    }
    const expectedConversation = [...instructionHistory, instruction];
    if (JSON.stringify(data.llm_refinement.conversation) !== JSON.stringify(expectedConversation)) {
      throw new Error('AI review did not preserve the refinement conversation');
    }

    progressStep = 3;
    refinementViewSequence = nextViewNumber;
    const viewLabel = `AI ${nextViewNumber}`;
    setLlmProgress(3, `Creating ${viewLabel} with ${data.data.length} posts`);
    setLlmFeedback(`AI response validated. Building ${viewLabel} without another X search…`);
    const refinedResponse = {
      ...cloneResponse(sourceResponse),
      data: data.data,
      includes: data.includes || { users: [] },
      analytics: data.analytics || {},
      meta: {
        ...cloneResponse(sourceResponse.meta),
        result_count: data.data.length,
        sort: 'ai',
        sort_label: SORT_LABELS.ai,
        sort_scope: `${SORT_LABELS.ai} applied by ${data.llm_refinement.model}. No new X request was made.`,
        llm_refinement: data.llm_refinement,
      },
    };
    const view = {
      id: `ai-${nextViewNumber}`,
      label: viewLabel,
      response: refinedResponse,
      turns: [...parentTurns, {
        instruction,
        mode,
        reviewedCount: data.llm_refinement.reviewed_count,
        keptCount: data.llm_refinement.kept_count,
      }],
      composer: { instruction: '', mode },
    };
    parentComposer.instruction = '';
    refinementViews.push(view);
    activeResultsView = view.id;
    renderReport(cloneResponse(view.response), true);
    renderLlmComposer();
    completeLlmProgress(`${viewLabel} ready · ${data.data.length} posts`);
    if (mode === 'rank') {
      setLlmFeedback(`${viewLabel} ranked all ${data.llm_refinement.reviewed_count} original posts. Rank mode does not remove posts, and no extra X search ran.`, 'success');
    } else if (Number(data.llm_refinement.removed_count) === 0) {
      setLlmFeedback(`${viewLabel} kept all ${data.llm_refinement.reviewed_count} posts because the model marked every post as a match. No extra X search ran; follow up with narrower criteria to reduce the set.`, 'success');
    } else {
      setLlmFeedback(`${viewLabel} kept ${data.llm_refinement.kept_count} of ${data.llm_refinement.reviewed_count} original posts and ranked them by fit. No extra X search ran.`, 'success');
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    window.clearInterval(llmProgressTimer);
    llmProgressTimer = null;
    setLlmProgress(progressStep, error.message, 'error');
    setLlmFeedback(`${error.message} · Existing result tabs were left unchanged.`, 'error');
  } finally {
    llmInFlight = false;
    if (llmController === controller) llmController = null;
    updateLlmControls();
  }
}

function closeRefinementView(viewId) {
  if (llmInFlight) return false;
  const index = refinementViews.findIndex((view) => view.id === viewId);
  if (index < 0) return false;
  const closingView = refinementViews[index];
  const wasActive = activeResultsView === viewId;
  const fallbackViewId = index > 0 ? refinementViews[index - 1].id : 'original';
  if (wasActive) saveActiveRefinementDraft();
  refinementViews.splice(index, 1);
  closedRefinementViews.push({ view: closingView, index });
  if (closedRefinementViews.length > MAX_CLOSED_REFINEMENT_VIEWS) {
    closedRefinementViews.shift();
  }
  resetLlmProgress();
  if (wasActive) {
    activeResultsView = fallbackViewId;
    renderReport(cloneResponse(responseForResultsView(fallbackViewId)), true);
    renderLlmComposer();
  } else {
    updateResultsTabs();
    updateLlmControls();
  }
  setLlmFeedback(`Closed ${closingView.label}. Press Ctrl+Z or Cmd+Z to restore it.`, 'success');
  return true;
}

function restoreLastClosedRefinementView() {
  if (llmInFlight || !closedRefinementViews.length) return false;
  saveActiveRefinementDraft();
  const closed = closedRefinementViews.pop();
  const insertAt = Math.min(closed.index, refinementViews.length);
  refinementViews.splice(insertAt, 0, closed.view);
  activeResultsView = closed.view.id;
  resetLlmProgress();
  renderReport(cloneResponse(closed.view.response), true);
  renderLlmComposer();
  setLlmFeedback(`Restored ${closed.view.label} with its follow-up history and draft.`, 'success');
  return true;
}

function showSearchError(error, meta) {
  lastResponse = null;
  sourceResponse = null;
  resetRefinementWorkspace();
  resetLlmProgress();
  elements.llmRefiner.classList.add('hidden');
  updateResultsTabs();
  updateLlmControls();
  setLlmFeedback('Run a successful search before applying an AI review.');
  elements.export.disabled = true;
  elements.message.className = 'error';
  elements.message.textContent = error.message;
  if (meta) renderRequestPreview(meta);
  elements.sentimentOverview.innerHTML = '';
  elements.reportDetails.open = true;
  elements.diagnostics.innerHTML = '<div class="diagnostic warning"><strong>Live request failed:</strong> ' + escapeHtml(error.message) + '</div>';
  elements.results.innerHTML = '<div class="empty-state"><strong>No results were substituted</strong><p>SignalDesk never falls back to demo posts.</p></div>';
}

async function runSearch() {
  const payload = requestPayload();
  searchInFlight = true;
  const controller = new AbortController();
  searchController = controller;
  sourceResponse = null;
  resetRefinementWorkspace();
  resetLlmProgress();
  elements.llmRefiner.classList.add('hidden');
  updateResultsTabs();
  updateLlmControls();
  setLlmFeedback('Waiting for the X search to finish.');
  elements.report.classList.remove('hidden');
  elements.report.scrollIntoView({ behavior: 'smooth', block: 'start' });
  let responseMeta = null;
  try {
    if (!backendReady) throw new Error('The matching backend build is not ready');
    validatePayload(payload);
    responseMeta = await previewNow(true);
    if (!responseMeta) throw new Error(elements.previewState.textContent || 'Could not build the X request');
    elements.search.disabled = true;
    elements.sort.disabled = true;
    elements.search.querySelector('span').textContent = 'Searching…';
    elements.export.disabled = true;
    elements.message.className = '';
    elements.message.textContent = 'Waiting for the official X API';
    elements.diagnostics.innerHTML = '';
    elements.results.innerHTML = '<div class="loading-state">Fetching live posts</div>';
    const response = await fetch('/api/report', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    const data = await readJson(response);
    if (data.meta) responseMeta = data.meta;
    if (!response.ok || !data.ok) throw new Error(data.error || `Search failed with HTTP ${response.status}`);
    assertResponseContract(data, payload);
    sourceResponse = cloneResponse(data);
    setLlmFeedback(
      data.data.length
        ? `Original is ready with ${data.data.length} posts. Describe what matters to create a separate AI tab.`
        : 'The X search returned no posts to review.'
    );
    renderReport(cloneResponse(sourceResponse));
  } catch (error) {
    if (error.name === 'AbortError') return;
    showSearchError(error, responseMeta);
  } finally {
    searchInFlight = false;
    if (searchController === controller) searchController = null;
    elements.search.disabled = !backendReady;
    elements.sort.disabled = false;
    elements.search.querySelector('span').textContent = 'Search';
    updateLlmControls();
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function postLinks(post) {
  return (post.entities?.urls || []).map((item) => item.expanded_url || item.url).filter(Boolean).join(' | ');
}

function downloadCsv() {
  if (!lastResponse?.data?.length) return;
  const meta = lastResponse.meta;
  const users = Object.fromEntries((lastResponse.includes?.users || []).map((user) => [user.id, user]));
  const rows = [[
    'query_used', 'start_time', 'lookback', 'x_retrieval_order', 'local_sort',
    'result_view', 'llm_model', 'ai_review_mode', 'ai_instruction', 'ai_relevance_score',
    'ai_reason', 'post_id', 'post_type', 'sentiment', 'sentiment_score',
    'sentiment_confidence', 'created_at', 'author_name', 'author_handle', 'author_followers',
    'text', 'links', 'likes', 'reposts', 'replies', 'quotes', 'bookmarks', 'impressions',
    'language', 'conversation_id', 'url',
  ]];
  lastResponse.data.forEach((post) => {
    const user = users[post.author_id] || {};
    const metrics = post.public_metrics || {};
    const sentiment = post.sentiment || {};
    const aiReview = post.signaldesk_llm || {};
    rows.push([
      meta.query_used, meta.start_time, meta.lookback, meta.retrieval_order, meta.sort,
      activeResultsView, meta.llm_refinement?.model || '',
      meta.llm_refinement?.mode || '', meta.llm_refinement?.instruction || '',
      aiReview.relevance_score ?? '', aiReview.reason || '', post.id,
      post.signaldesk_type, sentiment.label, sentiment.score, sentiment.confidence, post.created_at,
      user.name || '', user.username ? `@${user.username}` : '', user.public_metrics?.followers_count || 0,
      post.text || '', postLinks(post), metrics.like_count || 0, metrics.retweet_count || 0,
      metrics.reply_count || 0, metrics.quote_count || 0, metrics.bookmark_count || 0,
      metrics.impression_count || 0, post.lang || '', post.conversation_id || '',
      `https://x.com/${user.username || 'i'}/status/${post.id}`,
    ]);
  });
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const slug = meta.topic_query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'x-search';
  link.href = objectUrl;
  link.download = `signaldesk-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function updateBrandField() {
  elements.brandField.classList.toggle('hidden', !elements.excludeBrand.checked);
  if (elements.excludeBrand.checked) elements.brandHandle.focus();
  schedulePreview();
}

function handleQueryInput() {
  const directive = elements.query.value.match(INLINE_EXCLUDE_RE);
  if (directive) {
    elements.excludeBrand.checked = true;
    elements.brandHandle.value = `@${directive[1]}`;
    elements.brandField.classList.remove('hidden');
  }
  schedulePreview();
}

elements.query.addEventListener('input', handleQueryInput);
elements.lookback.addEventListener('change', schedulePreview);
elements.limit.addEventListener('change', schedulePreview);
elements.retrievalOrder.addEventListener('change', schedulePreview);
elements.sort.addEventListener('change', resortCurrentResults);
elements.brandHandle.addEventListener('input', schedulePreview);
elements.excludeBrand.addEventListener('change', updateBrandField);
elements.filters.forEach((input) => input.addEventListener('input', schedulePreview));
elements.types.forEach((input) => input.addEventListener('change', () => {
  if (!selectedTypes().length) input.checked = true;
  schedulePreview();
}));
elements.search.addEventListener('click', runSearch);
elements.export.addEventListener('click', downloadCsv);
elements.llmApply.addEventListener('click', applyLlmRefinement);
elements.resultsTabs.addEventListener('click', (event) => {
  const close = event.target.closest('[data-close-results-view]');
  if (close) {
    event.stopPropagation();
    closeRefinementView(close.dataset.closeResultsView);
    return;
  }
  const tab = event.target.closest('[data-results-view]');
  if (tab) activateResultsView(tab.dataset.resultsView);
});
elements.savedSearchesButton.addEventListener('click', openSavedSearches);
elements.savedSearchesClose.addEventListener('click', closeSavedSearches);
elements.savedSearchesScrim.addEventListener('click', closeSavedSearches);
elements.saveSearch.addEventListener('click', saveCurrentSearch);
elements.savedSearchList.addEventListener('click', (event) => {
  const load = event.target.closest('[data-saved-load]');
  if (load) {
    loadSavedSearch(load.dataset.savedLoad);
    return;
  }
  const remove = event.target.closest('[data-saved-delete]');
  if (remove) deleteSavedSearch(remove.dataset.savedDelete);
});
elements.resetApplication.addEventListener('click', () => { void resetSignalDesk(); });
elements.llmInstruction.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    void applyLlmRefinement();
  }
});
elements.query.addEventListener('keydown', (event) => { if (event.key === 'Enter') runSearch(); });
elements.brandHandle.addEventListener('keydown', (event) => { if (event.key === 'Enter') runSearch(); });
elements.settingsButton.addEventListener('click', () => { void openSettings(false); });
elements.openDataLocation.addEventListener('click', () => { void openLocalDataFolder(); });
elements.llmProvider.addEventListener('change', handleLlmProviderChange);
elements.llmModel.addEventListener('change', handleLlmModelChange);
elements.settingsForm.addEventListener('submit', saveDesktopSettings);
elements.settingsClose.addEventListener('click', closeSettings);
elements.settingsCancel.addEventListener('click', closeSettings);
elements.updateLater.addEventListener('click', hideUpdateDialog);
elements.updatePrimary.addEventListener('click', () => { void handleUpdatePrimary(); });
document.addEventListener('keydown', (event) => {
  const target = event.target;
  const editingText = target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'));
  const restoreShortcut = (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === 'z';
  if (restoreShortcut && !editingText && restoreLastClosedRefinementView()) {
    event.preventDefault();
    return;
  }
  if (event.key !== 'Escape') return;
  if (elements.savedSearches.dataset.open === 'true') {
    closeSavedSearches();
  } else if (!elements.settingsDialog.classList.contains('hidden')) {
    closeSettings();
  } else if (!elements.updateDialog.classList.contains('hidden')) {
    hideUpdateDialog();
  }
});

initializeFilterSections();
void initializeSavedSearches();
void initializeDesktopSettings();
void initializeUpdaterUi();
void checkHealth();
