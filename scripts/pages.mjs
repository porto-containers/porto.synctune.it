// Published Porto documents, grouped for the docs navigation.
// `source` is the path in porto-containers/porto; `slug` names docs/<slug>.html.
export const sections = [
  {
    id: "start",
    title: "Get started",
    audience: "users",
    pages: [
      { source: "README.md", slug: "overview", title: "Overview and quickstart", summary: "What Porto does, platform support, the four-step quickstart and important limitations." },
      { source: "docs/installation.md", slug: "installation", title: "Installation", summary: "Install a release, verify downloads, build from source and handle desktop updates." },
      { source: "docs/daily-use.md", slug: "daily-use", title: "Daily use", summary: "Keep Porto available at login or boot, navigate the dashboard and find resources." },
      { source: "docs/diagnostics.md", slug: "diagnostics", title: "Diagnostics", summary: "Health checks, redacted support bundles and confirmed repairs." },
      { source: ".github/skills/porto/SKILL.md", slug: "agent-skill", title: "Porto agent skill", summary: "Let coding agents install Porto and drive projects, containers, clusters and VMs." },
    ],
  },
  {
    id: "projects",
    title: "Projects and runtimes",
    audience: "users",
    pages: [
      { source: "docs/project-management.md", slug: "project-management", title: "Project management", summary: "Discovery, dependency setup, lifecycle, ports, readiness, state and logs." },
      { source: "docs/branch-management.md", slug: "branch-management", title: "Branch management", summary: "Branch switching, concurrent instances, managed worktrees and cleanup." },
      { source: "docs/runtimes.md", slug: "runtimes", title: "Local runtimes", summary: "Docker endpoint, containers, Compose, Kubernetes resources and Linux VMs." },
      { source: "docs/docker-engine.md", slug: "docker-engine", title: "Porto Docker Engine", summary: "Docker context setup, native containerd architecture and API compatibility." },
      { source: "docs/resource-management.md", slug: "resource-management", title: "Resource management", summary: "Engine budgets, Resource Saver and architecture policies." },
      { source: "docs/networking.md", slug: "networking", title: "Local networking", summary: "Project hostnames, HTTP and HTTPS routing, certificates and DNS." },
    ],
  },
  {
    id: "kubernetes",
    title: "Kubernetes",
    audience: "users",
    pages: [
      { source: "docs/kubernetes-upgrades.md", slug: "kubernetes-upgrades", title: "Cluster upgrades", summary: "Distribution-specific upgrades, volume restoration and recovery." },
      { source: "docs/kubernetes-autoscaling.md", slug: "kubernetes-autoscaling", title: "Autoscaling", summary: "Local Karpenter workers, KEDA triggers, budgets and ownership." },
      { source: "docs/kubernetes-gitops.md", slug: "kubernetes-gitops", title: "GitOps delivery", summary: "Flux and Argo CD discovery, bootstrap, reconciliation and handoff." },
    ],
  },
  {
    id: "data",
    title: "Data and images",
    audience: "users",
    pages: [
      { source: "docs/data-management.md", slug: "data-management", title: "Runtime data management", summary: "Inspection, protected cleanup, local backups, migration and native files." },
      { source: "docs/data-compatibility.md", slug: "data-compatibility", title: "Data compatibility", summary: "Data and backup APIs, archive format, persisted schemas and upgrade recovery." },
      { source: "docs/image-inspection.md", slug: "image-inspection", title: "Image analysis", summary: "Dive layers, Syft SBOMs and Grype vulnerability matching." },
    ],
  },
  {
    id: "integrations",
    title: "Environments and integrations",
    audience: "users",
    pages: [
      { source: "docs/remote-environments.md", slug: "remote-environments", title: "Remote environments", summary: "Authenticated enrollment, Edge fleets, scoped actions and revocation." },
      { source: "docs/extensions.md", slug: "extensions", title: "Extensions", summary: "Verified installation, grants, isolated actions and views, and authoring." },
      { source: "docs/windows-integration.md", slug: "windows-integration", title: "Windows integration", summary: "Selected WSL tooling, shared paths, native credentials and native Windows containers." },
      { source: "docs/integrations.md", slug: "integrations", title: "Optional integrations", summary: "sql-not-so-lite, Etcqlite, KillSwitch and Sendbox." },
      { source: "docs/kill-switch.md", slug: "kill-switch", title: "KillSwitch", summary: "Requirements, commands, port ownership and troubleshooting." },
    ],
  },
  {
    id: "develop",
    title: "Develop and release",
    audience: "contributors",
    pages: [
      { source: "docs/ci-cd.md", slug: "ci-cd", title: "CI and releases", summary: "Local validation, GitHub Actions, packaging, release steps and artifacts." },
      { source: "docs/installed-acceptance.md", slug: "installed-acceptance", title: "Installed-package acceptance", summary: "Release qualification gates for installed desktop packages." },
      { source: "ui/README.md", slug: "dashboard", title: "Dashboard source", summary: "The React control surface: routes, structure and development." },
      { source: "ui/electron/README.md", slug: "desktop-app", title: "Desktop app source", summary: "The Electron host: security model, daemon startup and packaging." },
      { source: "docs/product.md", slug: "product", title: "Product overview", summary: "Intended users, purpose, positioning and product principles." },
      { source: "docs/design.md", slug: "design", title: "Design system", summary: "Visual language, layout, components and interaction rules." },
      { source: "AGENTS.md", slug: "agents", title: "Agent instructions", summary: "Repository guidance for coding agents working on Porto." },
    ],
  },
];

export const pages = sections.flatMap((section) => section.pages.map((page) => ({ ...page, section })));

// Repository files that are vendored for link mapping but not rendered as pages.
export const indexSource = "docs/README.md";
export const vendored = [...pages.map((page) => page.source), indexSource];

export const site = {
  origin: "https://porto.synctune.it",
  repository: "porto-containers/porto",
  name: "Porto",
};
