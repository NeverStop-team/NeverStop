# NeverStop — Official Website

A responsive, static website for the NeverStop competitive esports team.

## Design
- High-contrast editorial design: monochrome foundations and NeverStop red accents
- Cinematic dark home hero with original team logo (no external imagery)
- Responsive roster, news, recruit, partner and member pages
- Accessible keyboard focus, skip link and Escape-close mobile navigation
- Lightweight scroll reveal and page transitions with reduced-motion support
- Plain HTML, CSS and JavaScript; no framework, dependencies or build step

## Preview locally
Open `index.html` in any modern browser, or run a simple static server such as `python3 -m http.server 8080`.

## Deployment
All files use relative links, so they can be served from a subdirectory (including GitHub Pages project sites). Publish the repository root with GitHub Pages or any static host.

## Main pages
`index.html`, `about.html`, `members.html`, `news.html`, `sponsor.html`, `recruit.html`, `contact.html`, and player profile pages.

The team information and external community links are carried over from the existing site.

## Seamless page transitions (November 2026)
- Links load same-site HTML in the background and replace only `#page-content`.
- Header/footer stay in place, with URL, title, navigation state and browser history synchronized.
- HTML destinations are prefetched, cached during a visit, and can be opened directly.
- Graceful fallback to normal navigation if asynchronous page fetching fails.
- No additional libraries or build tools required.

## Logo asset refresh
The original `logo.png` is retained as a backup. The site's header, hero and footer use `logo-transparent.png`, a standalone PNG version of the existing official NeverStop emblem with the solid-black background color marked transparent. Layout and proportions are tuned for the square mark. All routes remain static HTML.

## Page-motion refinement (November 2026)
- Transitions begin only when the next HTML page is ready; the old page remains visible while loading.
- Short exit, headline/content stagger and red header trace for an intentional, responsive feel.
- Keeps SPA-style navigation, prefetching, browser history and reduced-motion accessibility.

## Natural homepage direction (November 27, 2026)
The homepage uses a restrained light editorial hero with Japanese team messaging and direct links to the real Apex Legends roster. Reviewed ZETA DIVISION, REJECT, Fnatic and Team Liquid official sites for content hierarchy. No new generated images or fake achievements; existing JS navigation and content are unchanged.
