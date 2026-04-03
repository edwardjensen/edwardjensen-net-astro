/**
 * Featured tags data — mirrors Jekyll's _featured-tags/ collection.
 * These are curated tag landing pages with hero images and descriptions.
 */

export interface FeaturedTag {
  title: string;
  tag: string;
  image: string;
  imageAlt: string;
  sortAscending?: boolean;
  description: string;
}

export const featuredTags: FeaturedTag[] = [
  {
    title: "AI",
    tag: "ai",
    image: "https://assets.edwardjensen.net/media/202511-meet-me-in-the-middle.jpeg",
    imageAlt: 'Handwritten text on a whiteboard or light grey surface reading "AI?".',
    description: "The world of AI is an ever-changing world. I attempt to make sense of it all.",
  },
  {
    title: "Friday Five",
    tag: "friday-five",
    image: "/assets/images/friday-five.jpeg",
    imageAlt:
      "A large white three-dimensional number 5 with black shadowing on a green textured background, with the text #friday-five in black serif font to the right.",
    description:
      'Every now and again, I\'ll come up with a list of five items that\'s shared on a Friday. Uncreatively, I call this the "Friday Five."',
  },
  {
    title: "On Saint Paul",
    tag: "on-saint-paul",
    image: "https://assets.edwardjensen.net/media/202601-onSaintPaul-v2.jpeg",
    imageAlt:
      "Aerial photograph of Saint Paul, Minnesota showing the Cathedral of Saint Paul with its large copper dome and cross-topped spire in the foreground, the downtown skyline and Xcel Energy Center arena in the background, autumn foliage throughout, under a clear blue sky. Text overlay reads: ...on Saint Paul.",
    description:
      "After sixteen years of living in downtown Phoenix and helping shape its urban transformation, I now live in downtown Saint Paul, Minnesota. I see the same potential here that I saw in Phoenix all those years ago. These writings explore what downtown Saint Paul can become, and what it will take to get there.",
  },
  {
    title: "Site Meta",
    tag: "site-meta",
    image: "/assets/images/site-meta.jpeg",
    imageAlt:
      'Code screenshot showing JavaScript/TypeScript code with syntax highlighting and white text overlaid reading "#site-meta".',
    description:
      "As changes to this site are made, I'll update some of the more interesting ideas here.",
  },
  {
    title: "The Build",
    tag: "the-build",
    image: "https://assets.edwardjensen.net/media/202512-thebuild.jpeg",
    imageAlt:
      'Collage of dozens of open books arranged in a grid pattern showing cream-coloured pages filled with printed text, with the words "the build" overlaid in large black serif font with white outline in the lower right portion of the image.',
    sortAscending: true,
    description:
      "Over the course of a few weeks, I used AI tools to help me build out a content management system (CMS) for this website. I'm not a software developer, but I shipped a production application in 10 days. In this series called \"The Build,\" I walk through some of the things I've learned--not just about software development, but about management, pacing, and how to keep sane while working on a big project.",
  },
];
