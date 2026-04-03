export const googleMaps = {
  zoom_precise: 15,
  zoom_approximate: 12,
  zoom_default: 12,
  size: "320x160",
  scale: 2,
  maptype: "roadmap",
  // Cloudflare Worker proxy — keeps the Google Maps API key server-side
  // API key itself is NOT here; it is stored as a Cloudflare Worker secret
  proxy_url: "https://ejnetmaps.edwardjensenprojects.com/staticmap",
};
