# Node 26 LTS acceptance

- [x] Align package requirements, CI, containers, build target, provisioning and docs.
- [x] Exercise the release gate and package tests with freshly installed native dependencies.
- [ ] Test strict packed installs, native tools and embedded startup/reopen on available platforms; record limitations before merge.

Base: migration branch 58a61913, including the merged security patches. Runtime:
Node 26.13.1, npm 11.20.0, pnpm 10.33.0. The SQLite lockfile previously used
12.8.0, which does not declare Node 26 support. The upgrade stays on major 12
and requires at least 12.11.1. No workspace filesystem changes are needed.

Release gate and all package tests passed on macOS arm64 (1,842 backend, 1,644
frontend, 251 shared, 45 CLI). Installer preflight rejected Node 24 and a
same-major target requiring 26.13.2 on 26.13.1, before npm installation.
The GitHub Actions runner preference for JavaScript actions is separate from
the Node runtime selected for CC jobs.

Test tarball SHA-256: ef7cb6d6a99f5befa92dc95cf4ba7f0a1d21f1a453e09357df4a29d672900f82.
Each platform smoke uses that tarball, a fresh temporary npm project with
engine-strict enabled, a SQLite query, a real PTY, bundled ripgrep, and two
embedded startup/health/graceful shutdown cycles on the same workspace.

Strict packed-install and lifecycle smoke passed on macOS arm64 and Docker
Linux arm64. Local Docker cannot execute even /bin/uname on amd64 images; the
packed-runtime workflow covers the same check on native GitHub-hosted Linux x64.
Windows is outside this acceptance. No live user service was upgraded.
