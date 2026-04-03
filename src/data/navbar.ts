export interface NavSubItem {
  title: string;
  url: string;
  icon?: string;
  requires?: string;
}

export interface NavItem {
  title: string;
  url: string;
  icon?: string;
  newTab?: boolean;
  items?: NavSubItem[];
}

export const navbar: NavItem[] = [
  {
    title: "Writings",
    url: "/writing",
    icon: "pen",
    items: [
      { title: "Current Archives", url: "/writing", icon: "pen" },
      { title: "Retired Posts", url: "/archive", icon: "archive" },
    ],
  },
  {
    title: "Collections",
    url: "/tags",
    icon: "cards",
    items: [
      { title: "AI", url: "/tags/ai", icon: "robot" },
      { title: "Friday Five", url: "/tags/friday-five", icon: "number-five" },
      { title: "...on Saint Paul", url: "/tags/on-saint-paul", icon: "buildings" },
    ],
  },
  {
    title: "Working Notes",
    url: "/notes",
    icon: "notebook",
  },
  {
    title: "Photos",
    url: "/photos",
    icon: "camera",
  },
  {
    title: "About",
    icon: "smiley",
    url: "/about",
    items: [
      { title: "About Me", url: "/about", icon: "hand-waving" },
      { title: "Portfolio", url: "/portfolio", icon: "briefcase", requires: "show_portfolio" },
      { title: "Uses", url: "/about/uses", icon: "backpack" },
    ],
  },
];
