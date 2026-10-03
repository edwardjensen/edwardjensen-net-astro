import { SITE_TITLE } from "../config";

export const copy = {
  home: {
    heading: `${SITE_TITLE} explores the intersection of nonprofit technology and mission-driven impact.`,
    intro:
      "On these pages, I share insights from inside the work of nonprofit IT: strategy, leadership, and institutional resilience—along with photography, reflections on urban life, civic participation, and whatever else crosses my path as someone deeply invested in mission-driven work.",
    metaDescription:
      "Insights from inside the work of nonprofit IT: strategy, leadership, and institutional resilience—along with photography, reflections on urban life, and civic participation.",
  },
  hi: {
    heading: `It's nice to meet you! I'm ${SITE_TITLE}.`,
    introPrefix:
      "My work focuses on harnessing technology and data to amplify mission impact for nonprofit organizations. I am the Director of Information Technology for",
    introSuffix: "in Minneapolis.",
    intro2:
      "On these pages, I share insights from inside the work. As a nonprofit IT leader, I focus on technology strategy, institutional resilience, knowledge enterprise development: the tactical realities of advancing IT within mission-driven organizations.",
    metaDescription:
      "My work focuses on harnessing technology and data to amplify mission impact for nonprofit organizations.",
    metaTitle: `Let's Connect — ${SITE_TITLE}`,
    writingSection: "Here's some of what I write about.",
    writingSubheader:
      "These essays represent my approach to nonprofit technology strategy and the challenges I often encounter in my work.",
    ctaHeading: "Let's stay connected!",
    ctaLink: "Explore the full archive here.",
    /** The /hi/{tag}/ page for an event: heading used when the CMS has none. */
    eventHeadingFallback: (event: string) => `Great to meet you at ${event}!`,
    eventMetaTitle: (event: string) => `Great to meet you at ${event}`,
    eventMetaDescription: "Leave your details so we can stay in touch.",
    intake: {
      heading: "Leave your details",
      lede: "Only your name is needed. Everything else is up to you.",
      nameLabel: "Your name",
      required: "(required)",
      submit: "Send my details",
      sending: "Sending…",
      noscript: "This form needs JavaScript to check that you're a person. You can find me on LinkedIn instead.",
      thanksHeading: "Thank you",
      thanks: "Your details are with me. I'll look them over and follow up.",
      honeypotLabel: "Leave this empty",
      /** Keyed by the intake service's error codes (see src/lib/intake.ts). */
      errors: {
        name: "Please enter your name.",
        captcha: "Please complete the check that shows you're a person, then send again.",
        expired: "This form is no longer taking responses.",
        invalid: "This form couldn't be sent. Please try again later.",
        too_large: "That's too much text to send. Please shorten it and try again.",
        network: "That didn't go through. Check your connection and try again.",
      },
    },
  },
};
