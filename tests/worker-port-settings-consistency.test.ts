import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SettingsDefaultsManager } from '../src/shared/SettingsDefaultsManager.js';

const workerUtilsSourcePath = join(
  __dirname,
  '..',
  'src',
  'shared',
  'worker-utils.ts',
);

const runtimeSourcePath = join(
  __dirname,
  '..',
  'src',
  'npx-cli',
  'commands',
  'runtime.ts',
);
const installSourcePath = join(
  __dirname,
  '..',
  'src',
  'npx-cli',
  'commands',
  'install.ts',
);
const uninstallSourcePath = join(
  __dirname,
  '..',
  'src',
  'npx-cli',
  'commands',
  'uninstall.ts',
);
const opencodeSourcePath = join(
  __dirname,
  '..',
  'src',
  'integrations',
  'opencode-plugin',
  'index.ts',
);

const runtimeSource = readFileSync(runtimeSourcePath, 'utf-8');
const installSource = readFileSync(installSourcePath, 'utf-8');
const uninstallSource = readFileSync(uninstallSourcePath, 'utf-8');
const opencodeSource = readFileSync(opencodeSourcePath, 'utf-8');
const workerUtilsSource = readFileSync(workerUtilsSourcePath, 'utf-8');

const originalEnv = {
  CLAUDE_MEM_DATA_DIR: process.env.CLAUDE_MEM_DATA_DIR,
};

function restoreEnv(): void {
  if (originalEnv.CLAUDE_MEM_DATA_DIR === undefined) {
    delete process.env.CLAUDE_MEM_DATA_DIR;
  } else {
    process.env.CLAUDE_MEM_DATA_DIR = originalEnv.CLAUDE_MEM_DATA_DIR;
  }
}

describe('Worker port settings consistency', () => {
  let tempDir: string;
  let defaultDataDirSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    tempDir = join(tmpdir(), `claude-mem-port-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    restoreEnv();
  });

  afterEach(() => {
    defaultDataDirSpy?.mockRestore();
    defaultDataDirSpy = null;
    restoreEnv();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers CLAUDE_MEM_DATA_DIR env over the bootstrap settings file', () => {
    const defaultDataDir = join(tempDir, '.claude-mem');
    const bootstrapSettingsPath = join(defaultDataDir, 'settings.json');
    const redirectedDataDir = join(tempDir, 'redirected-data');
    const envDataDir = join(tempDir, 'env-data');

    mkdirSync(defaultDataDir, { recursive: true });
    mkdirSync(redirectedDataDir, { recursive: true });
    mkdirSync(envDataDir, { recursive: true });
    writeFileSync(
      bootstrapSettingsPath,
      JSON.stringify({ CLAUDE_MEM_DATA_DIR: redirectedDataDir }, null, 2),
      'utf-8',
    );
    process.env.CLAUDE_MEM_DATA_DIR = envDataDir;

    expect(SettingsDefaultsManager.resolveUserSettingsPath()).toBe(
      join(envDataDir, 'settings.json'),
    );
  });

  it('resolves the user settings path from the bootstrap settings file data dir override', () => {
    const defaultDataDir = join(tempDir, '.claude-mem');
    const bootstrapSettingsPath = join(defaultDataDir, 'settings.json');
    const redirectedDataDir = join(tempDir, 'redirected-data');

    mkdirSync(defaultDataDir, { recursive: true });
    mkdirSync(redirectedDataDir, { recursive: true });
    writeFileSync(
      bootstrapSettingsPath,
      JSON.stringify({ CLAUDE_MEM_DATA_DIR: redirectedDataDir }, null, 2),
      'utf-8',
    );

    defaultDataDirSpy = spyOn(
      SettingsDefaultsManager as unknown as { getDefaultDataDir: () => string },
      'getDefaultDataDir',
    ).mockReturnValue(defaultDataDir);

    expect(SettingsDefaultsManager.resolveUserSettingsPath()).toBe(
      join(redirectedDataDir, 'settings.json'),
    );
  });

  it('loadUserSettings reads the resolved user settings file', () => {
    const defaultDataDir = join(tempDir, '.claude-mem');
    const bootstrapSettingsPath = join(defaultDataDir, 'settings.json');
    const redirectedDataDir = join(tempDir, 'redirected-data');
    const redirectedSettingsPath = join(redirectedDataDir, 'settings.json');

    mkdirSync(defaultDataDir, { recursive: true });
    mkdirSync(redirectedDataDir, { recursive: true });
    writeFileSync(
      bootstrapSettingsPath,
      JSON.stringify({ CLAUDE_MEM_DATA_DIR: redirectedDataDir }, null, 2),
      'utf-8',
    );
    writeFileSync(
      redirectedSettingsPath,
      JSON.stringify({ CLAUDE_MEM_WORKER_PORT: '37777' }, null, 2),
      'utf-8',
    );

    defaultDataDirSpy = spyOn(
      SettingsDefaultsManager as unknown as { getDefaultDataDir: () => string },
      'getDefaultDataDir',
    ).mockReturnValue(defaultDataDir);

    expect(SettingsDefaultsManager.loadFromFile(
      SettingsDefaultsManager.resolveUserSettingsPath(),
    ).CLAUDE_MEM_WORKER_PORT).toBe('37777');
  });

  it('shared worker utils resolve settings through loadUserSettings', () => {
    expect(workerUtilsSource).toContain('SettingsDefaultsManager.loadUserSettings()');
    expect(workerUtilsSource).not.toContain("SettingsDefaultsManager.get('CLAUDE_MEM_DATA_DIR')");
  });

  it('runtime search resolves worker port from loadUserSettings', () => {
    expect(runtimeSource).toContain("SettingsDefaultsManager.loadUserSettings().CLAUDE_MEM_WORKER_PORT");
    expect(runtimeSource).not.toContain("SettingsDefaultsManager.get('CLAUDE_MEM_WORKER_PORT')");
  });

  it('install and uninstall commands resolve worker port from loadUserSettings', () => {
    expect(installSource).toContain("SettingsDefaultsManager.loadUserSettings().CLAUDE_MEM_WORKER_PORT");
    expect(uninstallSource).toContain("SettingsDefaultsManager.loadUserSettings().CLAUDE_MEM_WORKER_PORT");
  });

  it('OpenCode plugin resolves worker port from loadUserSettings', () => {
    expect(opencodeSource).toContain('SettingsDefaultsManager.loadUserSettings().CLAUDE_MEM_WORKER_PORT');
    expect(opencodeSource).not.toContain('37700 + (uid % 100)');
  });
});
