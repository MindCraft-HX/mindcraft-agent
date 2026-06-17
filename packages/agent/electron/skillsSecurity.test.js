const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const {
  assertSafeSkillName,
  resolveRelativeSourceDir,
  resolveSkillTargetDir,
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
