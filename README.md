# porto.synctune.it

The website for [Porto](https://github.com/porto-containers/porto) at
[porto.synctune.it](https://porto.synctune.it): a showcase page plus Porto's user
and contributor documentation. Plain HTML, CSS and a small optional script.
No dependencies, package manager, CDN, web fonts, analytics or cookies.

- [Preview and Pages deployment](docs/deployment.md)
- [Content, Porto docs sync and assets](docs/maintenance.md)

The repository root is the finished site. `docs/*.html` and `sitemap.xml` are
generated from the Porto documents vendored in [`vendor/porto`](vendor/porto/)
(pinned in [`SOURCE.json`](vendor/porto/SOURCE.json)) by scripts that use only
Node.js built-in modules:

```sh
node scripts/build.mjs          # regenerate docs pages and shared page chrome
node --test tests/              # unit tests
node scripts/package.mjs dist   # copy the public files
node scripts/check-links.mjs dist [--external]
node scripts/serve.mjs dist     # preview at http://127.0.0.1:8080 with clean URLs
```

## License

[MIT](LICENSE). The vendored Porto documents, logo and screenshot come from
[porto-containers/porto](https://github.com/porto-containers/porto) under its
MIT license.
