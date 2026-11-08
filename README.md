# paleoimaging.github.io

Public website of PaleoIMAGING, a Working Group of PAGES: <https://paleoimaging.github.io/>

It is a Jekyll site published by GitHub Pages directly from the `main` branch. There is no separate staging
website: changes are prepared on short-lived branches and checked by CI before they reach `main`.

## What is on the site

Home, About, Core Group, Working Groups (WG1 to WG4), Imaging techniques, Meetings (calendar, submission form,
archive and iCalendar feed), Where We Are, News and Search.

- Content guide for pages, working groups, techniques, news and past events: [docs/WEBSITE.md](docs/WEBSITE.md)
- Meetings calendar and submission workflow (schema, validation, configuration): [docs/MEETINGS.md](docs/MEETINGS.md)
- Open tasks and decisions: [TODO.md](TODO.md)

## Updating the site

1. Create a short-lived branch from `main` (`feature/...` or `fix/...`).
2. Make the change and preview it locally (see "Local preview and checks" in [docs/MEETINGS.md](docs/MEETINGS.md)).
3. Open a Pull Request to `main`. The **Build check** (`jekyll`) and **Validate meetings** (`validate`) checks must pass.
4. `main` is protected: changes need a reviewed Pull Request and passing checks. Merging publishes the site
   automatically (about two minutes).
5. Delete the branch after merging.

Meeting proposals submitted through the website arrive as Pull Requests on `main` and follow the same review rules.

## Release history

- **2026-11-08: website MVP published at the root URL** (PR #15, merge commit `8861217`). The separate preview site
  used for community review (`meetings-staging-site`) has been retired; there is no permanent staging website.
  Worker-side details: the private `meetings-portal` repository, `docs/STAGING-RETIREMENT.md`.
