// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'SecureZen',
  tagline: 'AI SOC Dashboard — Documentation Centre',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Deployed via GitHub Pages from a separate PUBLIC mirror repo
  // (KryaSolutions/securezen-docs) - the real source repo (securezen) is
  // private, and GitHub Pages refuses to publish from a private repo on
  // a free org plan. This website/ folder's content is pushed to that
  // mirror repo via `git subtree push`; a GitHub Actions workflow there
  // builds and publishes it. GitHub Pages project sites serve at
  // <org>.github.io/<repo>/, hence the /securezen-docs/ baseUrl below.
  url: 'https://kryasolutions.github.io',
  baseUrl: '/securezen-docs/',

  organizationName: 'KryaSolutions', // GitHub org name.
  projectName: 'securezen-docs', // Repo name (the public mirror, not the private source repo).

  // 60+ migrated docs carry legacy relative links (README.md, CHANGELOG.md,
  // links to files renamed/removed during migration) - warn instead of
  // hard-failing the build so the site still deploys while those get
  // cleaned up incrementally.
  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/KryaSolutions/securezen-docs/tree/main/',
          routeBasePath: '/', // serve docs at site root, no /docs/ prefix
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'SecureZen',
        logo: {
          alt: 'SecureZen Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://github.com/KryaSolutions/securezen-docs',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {label: 'Getting Started', to: '/getting-started/installation'},
              {label: 'Architecture', to: '/architecture/overview'},
              {label: 'Deployment', to: '/deployment/guide'},
            ],
          },
          {
            title: 'More',
            items: [
              {label: 'GitHub', href: 'https://github.com/KryaSolutions/securezen'},
              {label: 'Changelog', to: '/changelog'},
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} KRYA SOLUTIONS PRIVATE LIMITED. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
