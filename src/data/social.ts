export interface SocialItem {
  site: string;
  url: string;
  icon: string;
  text?: string;
}

export const social: SocialItem[] = [
  {
    site: "LinkedIn",
    url: "https://www.linkedin.com/in/edwardjensen",
    icon: "linkedin-logo",
    text: "Connect on LinkedIn",
  },
  {
    site: "Bluesky",
    url: "https://bsky.app/profile/edwardjensen.net",
    icon: "butterfly",
    text: "Follow on Bluesky",
  },
  {
    site: "GitHub",
    url: "https://www.github.com/edwardjensen",
    icon: "github-logo",
  },
  {
    site: "RSS",
    url: "/feed.xml",
    icon: "rss",
    text: "Subscribe to RSS",
  },
  {
    site: "JSON Feed",
    url: "/feed.json",
    icon: "brackets-curly",
  },
];
