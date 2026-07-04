'use strict';

const CLAUDE_TIER_KEYS = ['haiku', 'sonnet', 'opus', 'reasoning'];
const MINDCRAFT_APP_LOCALES = ['zh-CN', 'en-US'];

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isClaudeTier(value) {
  return CLAUDE_TIER_KEYS.includes(String(value || '').toLowerCase());
}

function normalizeClaudeTierData(config = {}, metadata = {}) {
  const env = config && typeof config.env === 'object' && config.env ? config.env : {};
  const tierModels = {
    haiku: trimString(metadata?.tierModels?.haiku || env.ANTHROPIC_DEFAULT_HAIKU_MODEL),
    sonnet: trimString(metadata?.tierModels?.sonnet || env.ANTHROPIC_DEFAULT_SONNET_MODEL),
    opus: trimString(metadata?.tierModels?.opus || env.ANTHROPIC_DEFAULT_OPUS_MODEL),
    reasoning: trimString(metadata?.tierModels?.reasoning || env.ANTHROPIC_REASONING_MODEL),
  };

  let selectedTier = isClaudeTier(metadata?.selectedTier) ? String(metadata.selectedTier).toLowerCase() : '';
  const configModel = trimString(config?.model);
  const envModel = trimString(env.ANTHROPIC_MODEL);
  const concreteModel = !isClaudeTier(configModel) ? configModel : (!isClaudeTier(envModel) ? envModel : '');

  if (!selectedTier && isClaudeTier(configModel)) selectedTier = configModel.toLowerCase();
  if (!selectedTier && concreteModel) selectedTier = 'sonnet';
  if (!selectedTier) selectedTier = 'sonnet';

  if (concreteModel && !tierModels[selectedTier]) {
    tierModels[selectedTier] = concreteModel;
  }

  return { tierModels, selectedTier };
}

function normalizeClaudeStoredConfig(config = {}) {
  const source = config && typeof config === 'object' ? { ...config } : {};
  delete source.reasoningEffort;
  delete source.apiFormat;
  delete source.permissionPolicy;
  delete source.theme;
  delete source.website;
  delete source.note;
  if (MINDCRAFT_APP_LOCALES.includes(source.language)) delete source.language;

  const env = source.env && typeof source.env === 'object' ? { ...source.env } : {};
  const key = trimString(source.key || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY);
  const url = trimString(source.url || env.ANTHROPIC_BASE_URL);
  if (key) env.ANTHROPIC_AUTH_TOKEN = key;
  if (url) env.ANTHROPIC_BASE_URL = url;
  if (Object.keys(env).length) source.env = env;
  else delete source.env;

  const { tierModels, selectedTier } = normalizeClaudeTierData(source, {});
  if (selectedTier) source.model = selectedTier;
  const primary = tierModels[selectedTier];
  if (primary) {
    source.env = source.env && typeof source.env === 'object' ? source.env : {};
    source.env.ANTHROPIC_MODEL = primary;
  }

  source.key = key;
  source.url = url;
  return source;
}

function normalizeClaudeProviderStorageShape({ config = {}, metadata = {}, provider = {} } = {}) {
  const rawConfig = config && typeof config === 'object' ? config : {};
  const nextMetadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};

  const providerLanguage = provider.language || rawConfig.appLanguage || rawConfig.language;
  if (!nextMetadata.appLanguage && MINDCRAFT_APP_LOCALES.includes(providerLanguage)) {
    nextMetadata.appLanguage = providerLanguage;
  }
  if (!nextMetadata.appLanguage && provider.language) {
    nextMetadata.appLanguage = provider.language;
  }

  const permissionPolicy = provider.permissionPolicy || rawConfig.permissionPolicy;
  if (!nextMetadata.permissionPolicy && permissionPolicy) {
    nextMetadata.permissionPolicy = permissionPolicy;
  }

  const website = provider.website || rawConfig.website;
  if (!nextMetadata.website && website) {
    nextMetadata.website = website;
  }

  const note = provider.note || rawConfig.note;
  if (!nextMetadata.note && note) {
    nextMetadata.note = note;
  }

  const configWithProviderFields = {
    ...rawConfig,
    key: provider.key || rawConfig.key || '',
    url: provider.url || rawConfig.url || '',
    effortLevel: provider.effortLevel !== undefined ? provider.effortLevel : rawConfig.effortLevel,
  };
  const nextConfig = normalizeClaudeStoredConfig(configWithProviderFields);
  const tierData = normalizeClaudeTierData(nextConfig, {
    tierModels: provider.tierModels || nextMetadata.tierModels,
    selectedTier: provider.selectedTier || nextMetadata.selectedTier,
  });

  nextMetadata.tierModels = tierData.tierModels;
  nextMetadata.selectedTier = tierData.selectedTier;
  if (!nextMetadata.appLanguage) nextMetadata.appLanguage = 'zh-CN';
  if (!nextMetadata.permissionPolicy) nextMetadata.permissionPolicy = 'ask';
  if (!nextMetadata.website) nextMetadata.website = '';
  if (!nextMetadata.note) nextMetadata.note = '';

  return { config: nextConfig, metadata: nextMetadata };
}

module.exports = {
  CLAUDE_TIER_KEYS,
  MINDCRAFT_APP_LOCALES,
  trimString,
  isClaudeTier,
  normalizeClaudeTierData,
  normalizeClaudeStoredConfig,
  normalizeClaudeProviderStorageShape,
};
