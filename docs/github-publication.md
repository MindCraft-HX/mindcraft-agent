# GitHub Publication Workflow

> Last reviewed: 2026-07-16
>
> Gitee is the internal development source of truth. GitHub is the public
> mirror and external collaboration surface. Do not let the two repositories
> evolve independently.

## Remote And Branch Roles

| Location | Remote | Branch | Purpose |
| --- | --- | --- | --- |
| Gitee | `origin` | `develop` | Internal day-to-day development and source of truth. |
| Gitee | `origin` | `master` | Historical branch; do not use for new work or public releases. |
| GitHub | `github` | `develop` | Optional public development mirror and external contribution target. |
| GitHub | `github` | `main` | Public stable release branch and GitHub default branch. |

The local `develop` branch must track `origin/develop`. A normal `git push`
therefore continues to update Gitee only.

## Daily Development

Work and push as usual:

```powershell
git switch develop
git pull --rebase origin develop
git push origin develop
```

Do not use `git push --mirror`, and do not push `master`, feature branches,
private tags, or internal-only files to GitHub by default.

## Public Release Or Mirror Update

After a change is ready for public disclosure:

1. Confirm the working tree is clean and `develop` is current with Gitee.
2. Run the relevant verification, normally `npm test`, `npm run test:contract`,
   and `npm run build`.
3. Review `git status`, staged files, and `.gitignore` for credentials, private
   data, packaged artifacts, and local notes.
4. Update the public development mirror, then advance the stable branch:

```powershell
git push github develop
git push github develop:main
```

The second command is intentional: it fast-forwards GitHub `main` to the
reviewed Gitee `develop` commit. Do not force-push GitHub `main`.

## External Contributions

- Point GitHub issues and pull requests at GitHub `develop`, not `main`.
- Review and test external changes before accepting them.
- Bring accepted GitHub work back to Gitee `develop` first, then publish it
  back to GitHub with the commands above. Do not merge a GitHub-only change
  and leave the internal source behind.
- Keep `main` protected in GitHub settings: require pull requests/checks when
  a team begins contributing, and disallow force pushes and branch deletion.

## Initial Setup

Keep the internal and public remotes distinct:

```powershell
git remote -v
# origin  <internal development remote>
# github  https://github.com/MindCraft-HX/mindcraft-agent.git
```

If setting up a new clone, add the public remote explicitly:

```powershell
git remote add github https://github.com/MindCraft-HX/mindcraft-agent.git
```

Set GitHub's default branch to `main` in repository settings. Keep Gitee
`develop` as the internal development default where appropriate.
