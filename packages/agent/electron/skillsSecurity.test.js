const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  assertSafeSkillName,
  resolveRelativeSourceDir,
  resolveSkillTargetDir,
  copySkillDirAtomic,
  validateGithubUrl,
  normalizeGithubSkillSource,
  applyGitMirror,
} = require('./skillsSecurity')

test('rejects unsafe skill names', () => {
  for (const name of ['..', '.', '../x', 'a/b', 'a\\b', 'bad\nname']) {
    assert.throws(() => assertSafeSkillName(name), /Invalid skill name/)
  }
  assert.equal(assertSafeSkillName('demo-skill_1.2'), 'demo-skill_1.2')
})

test('project scope requires cwd and stays inside project skills root', () => {
  assert.throws(
    () => resolveSkillTargetDir({ agentName: 'claude', scope: 'project', cwd: '', skillName: 'demo' }),
    /Project cwd is required/,
  )

  const target = resolveSkillTargetDir({
    agentName: 'claude',
    scope: 'project',
    cwd: 'D:\\work\\repo',
    skillName: 'demo',
  })

  assert.equal(target.targetDir, path.resolve('D:\\work\\repo', '.claude', 'skills', 'demo'))
})

test('source subPath cannot escape cloned repository', () => {
  const root = path.resolve('D:\\tmp\\clone')
  assert.equal(resolveRelativeSourceDir(root, 'nested/skill'), path.resolve(root, 'nested/skill'))
  assert.throws(() => resolveRelativeSourceDir(root, '../outside'), /escapes cloned repository/)
  assert.throws(() => resolveRelativeSourceDir(root, 'C:\\outside'), /Invalid skill subPath|escapes cloned repository/)
})

test('source subPath cannot resolve through symlink outside cloned repository', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-realpath-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const root = path.join(tmp, 'clone')
  const outside = path.join(tmp, 'outside')
  const link = path.join(root, 'linked')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  try {
    fs.symlinkSync(outside, link, 'junction')
  } catch (_) {
    t.skip('symlink creation is not permitted in this environment')
    return
  }

  assert.throws(() => resolveRelativeSourceDir(root, 'linked'), /resolves outside cloned repository/)
})

test('copySkillDirAtomic rejects symlinks and keeps existing target', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-copy-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const source = path.join(tmp, 'source')
  const outside = path.join(tmp, 'outside')
  const target = path.join(tmp, 'target')
  fs.mkdirSync(source, { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(source, 'SKILL.md'), '# demo\n')
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret\n')
  fs.writeFileSync(path.join(target, 'SKILL.md'), '# old\n')
  try {
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(source, 'secret-link.txt'), 'file')
  } catch (_) {
    t.skip('symlink creation is not permitted in this environment')
    return
  }

  assert.throws(() => copySkillDirAtomic(source, target, 'demo'), /unsupported symlink/)
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), '# old\n')
})

test('only https github skill sources are accepted', () => {
  assert.equal(validateGithubUrl('https://github.com/org/repo'), 'https://github.com/org/repo')
  assert.equal(validateGithubUrl('https://github.com/org/repo/tree/main/skills/demo'), 'https://github.com/org/repo/tree/main/skills/demo')
  assert.throws(() => validateGithubUrl('git@github.com:org/repo.git'), /Invalid GitHub URL/)
  assert.throws(() => validateGithubUrl('https://evil.example/org/repo'), /Only https:\/\/github.com/)
  assert.throws(() => validateGithubUrl('https://github.com/org'), /Invalid GitHub repository URL/)
})

test('normalizes github tree urls into clone url and source subPath', () => {
  assert.deepEqual(
    normalizeGithubSkillSource('https://github.com/clawdbot/clawdbot/tree/main/skills/obsidian'),
    {
      gitUrl: 'https://github.com/clawdbot/clawdbot',
      subPath: 'skills/obsidian',
    },
  )
  assert.deepEqual(
    normalizeGithubSkillSource('https://github.com/org/repo.git', 'nested/skill'),
    {
      gitUrl: 'https://github.com/org/repo',
      subPath: 'nested/skill',
    },
  )
  assert.deepEqual(
    normalizeGithubSkillSource('https://github.com/org/repo/tree/main/ignored', 'catalog/path'),
    {
      gitUrl: 'https://github.com/org/repo',
      subPath: 'catalog/path',
    },
  )
})

test('mirror is applied only when it is a valid http url', () => {
  assert.equal(
    applyGitMirror('https://github.com/org/repo', 'https://gh-proxy.com/'),
    'https://gh-proxy.com/https://github.com/org/repo',
  )
  assert.equal(
    applyGitMirror('https://github.com/org/repo', 'not a url'),
    'https://github.com/org/repo',
  )
})
