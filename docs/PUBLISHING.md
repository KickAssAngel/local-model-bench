# Publishing Local Model Bench

This checklist is for publishing Local Model Bench as a public GitHub project.

## 1. Decide The Public Identity

Choose:

- repository name, for example `local-model-bench`,
- GitHub account or organization,
- short project description,
- public maintainer name for the license and README if you want it to be more personal.

The project currently uses the neutral copyright holder `Local Model Bench contributors`.

## 2. Configure Funding

Open `.github/FUNDING.yml` and uncomment only the services you actually use.

Examples:

```yaml
github: your-github-user
buy_me_a_coffee: your-buy-me-a-coffee-user
ko_fi: your-kofi-user
custom:
  - "https://paypal.me/your-paypal-name"
```

GitHub shows a Sponsor button only when valid funding entries are present on the default branch.

## 3. Review Private Data

Do not publish:

- `runs`,
- server log files,
- private prompts,
- private model outputs,
- local SSH or machine names,
- screenshots with sensitive model results,
- API keys or `.env` files.

The `.gitignore` already excludes the usual local files, but review the first commit before pushing.

## 4. Create The GitHub Repository

On GitHub:

1. Create a new public repository.
2. Do not add a README or license from the GitHub UI, because this project already includes them.
3. Copy the repository URL.

From the project folder:

```bash
git init
git add .
git status
git commit -m "Initial public release"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

Before `git commit`, check `git status` carefully. The `runs` folder and logs should not appear.

## 5. Enable Repository Features

In GitHub repository settings:

- enable Issues,
- enable Sponsorships after `FUNDING.yml` contains real links,
- optionally enable Discussions,
- optionally protect the `main` branch if other people start contributing.

## 6. Create The First Release

After the first push:

1. Go to Releases.
2. Create a new tag, for example `v0.1.0`.
3. Title: `Local Model Bench 0.1.0`.
4. Summarize the current features from `CHANGELOG.md`.
5. Attach a ZIP archive only if you want users to download a clean package from Releases.

GitHub also provides automatic source code ZIP downloads for every release.

## 7. After Publishing

Check the public repository as if you were a new user:

- README renders correctly.
- Sponsor button appears if funding is configured.
- `runs` is not visible.
- Start instructions work on a fresh copy.
- Issues and templates are available.

Then share the repository link wherever you want feedback.
