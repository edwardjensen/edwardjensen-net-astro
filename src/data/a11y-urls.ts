// Accessibility test URLs
// Edit src/data/a11y-urls.json to add or remove URLs.
// This file re-exports that list so Astro components can import it with types.
import urlList from "./a11y-urls.json";
export const a11yUrls: string[] = urlList;
