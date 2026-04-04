/**
 * TypeScript interfaces for all Payload CMS REST API content types.
 * Derived from the API fixtures in contexts/fixtures/.
 * The cache worker serves data at: ${CONTENT_RELAY_URL}/v2/:collection
 */

export interface PayloadImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface PayloadRedirectFrom {
  id: string;
  path: string;
}

export interface PayloadEmbeddedWorkingNote {
  id: string;
  title: string;
  slug: string;
  date: string;
  contentHtml: string;
  tags: string[];
}

export interface PayloadEmbeddedBlock {
  blockType: "embeddedWorkingNote";
  doc: PayloadEmbeddedWorkingNote;
}

export interface PayloadPost {
  id: number;
  title: string;
  slug: string;
  date: string;
  /** Pre-rendered HTML from CMS. May contain <!-- embed:ID --> placeholders. */
  contentHtml: string;
  /** Embedded content blocks (working notes). May be null if no embeds. */
  blocks: PayloadEmbeddedBlock[] | null;
  image: PayloadImage | null;
  excerpt: string | null;
  categories: string[];
  tags: string[];
  /** Pre-rendered HTML string of post credits/attribution, or null. */
  postCredits: string | null;
  landingFeatured: boolean;
  renderWithLiquid: boolean;
  showImage: boolean;
  sitemap: boolean;
  redirectFrom: PayloadRedirectFrom[];
  _status: "published" | "draft";
  updatedAt: string;
  createdAt: string;
}

export interface PayloadWorkingNote {
  id: number;
  title: string;
  slug: string;
  date: string;
  /** Pre-rendered HTML from CMS. */
  contentHtml: string;
  tags: string[];
  sitemap: boolean;
  _status: "published" | "draft";
  updatedAt: string;
  createdAt: string;
}

export interface PayloadExif {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: string | null;
}

export interface PayloadLocation {
  lat: number | null;
  lng: number | null;
  /** Point of interest name. Maps to location.name in v2 API. */
  name: string | null;
  neighborhood: string | null;
  formatted: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  precision: "precise" | "approximate";
}

export interface PayloadPhoto {
  id: number;
  title: string;
  slug: string;
  date: string;
  image: PayloadImage;
  /** Pre-rendered HTML caption. Often empty string. */
  contentHtml: string;
  tags: string[];
  exif: PayloadExif | null;
  location: PayloadLocation | null;
  sitemap: boolean;
  _status: "published" | "draft";
  updatedAt: string;
  createdAt: string;
}

export interface PayloadHistoricPost {
  id: number;
  title: string;
  slug: string;
  date: string;
  contentHtml: string;
  image: PayloadImage | null;
  excerpt: string | null;
  categories: string[];
  tags: string[];
  postCredits: string | null;
  landingFeatured: boolean;
  renderWithLiquid: boolean;
  showImage: boolean;
  sitemap: boolean;
  redirectFrom: PayloadRedirectFrom[];
  _status: "published" | "draft";
  updatedAt: string;
  createdAt: string;
}

export interface PayloadPage {
  id: number;
  title: string;
  slug: string;
  /** Custom permalink set by CMS, e.g. '/about/' */
  permalink: string;
  image: PayloadImage | null;
  contentHtml: string;
  searchable: boolean;
  sitemap: boolean;
  redirectFrom: PayloadRedirectFrom[];
  _status: "published" | "draft";
  updatedAt: string;
  createdAt: string;
}

export interface PayloadListResponse<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  totalPages: number;
  page: number;
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
}
