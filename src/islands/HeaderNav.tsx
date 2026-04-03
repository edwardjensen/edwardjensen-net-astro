import { useEffect, useRef, useState } from "preact/hooks";
import { navbar } from "../data/navbar";
import { social } from "../data/social";

export default function HeaderNav() {
  const headerRef = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // Scroll-hide behaviour: hide on scroll down past 100px, show on scroll up
  useEffect(() => {
    let lastScroll = 0;

    const handleScroll = () => {
      const currentScroll = window.pageYOffset;
      if (currentScroll <= 0) {
        setHidden(false);
        lastScroll = currentScroll;
        return;
      }
      if (currentScroll > lastScroll && currentScroll > 100) {
        setHidden(true);
        setMobileOpen(false);
      } else {
        setHidden(false);
      }
      lastScroll = currentScroll;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [mobileOpen]);

  // Close mobile menu on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleAccordion = (index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <header
      ref={headerRef}
      role="banner"
      class={[
        "sticky top-0 z-40 bg-brand-smoke/80 dark:bg-brand-ink/80 backdrop-blur-sm",
        "border-b border-brand-grey/20 dark:border-brand-grey/30 transition-all duration-300",
        hidden ? "-translate-y-full" : "translate-y-0",
      ].join(" ")}
    >
      <div class="max-w-7xl mx-auto px-4 lg:px-8">
        <div class="flex items-center justify-between h-16 gap-4">

          {/* Site Title */}
          <div class="flex items-center shrink-0 h-full">
            <a
              href="/"
              class="font-header font-bold text-2xl text-heading hover:text-brand-chestnut transition-colors duration-200 flex items-center h-full lowercase no-underline"
              aria-label="Home"
            >
              Edward Jensen
            </a>
          </div>

          {/* Desktop Navigation */}
          <nav
            class="hidden lg:flex items-center gap-8 h-full flex-1 justify-center"
            role="navigation"
            aria-label="Main navigation"
          >
            <ul class="flex items-center gap-8 list-none m-0 p-0 h-full">
              {navbar.map((item) => (
                <li key={item.url} class="h-full flex items-center relative group">
                  {item.items ? (
                    <>
                      <a
                        href={item.url}
                        class="font-header text-lg text-body hover:text-brand-chestnut transition-colors duration-200 flex items-center h-full lowercase relative no-underline"
                        aria-haspopup="true"
                        aria-expanded="false"
                      >
                        <span class="group-hover:text-brand-chestnut transition-colors duration-200 relative inline-flex items-center">
                          {item.icon && (
                            <i
                              class={`ph ph-${item.icon} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-10 transition-opacity duration-200 text-4xl text-body pointer-events-none -z-10`}
                              aria-hidden="true"
                            />
                          )}
                          {item.title}
                        </span>
                        <i
                          class="ph ph-caret-down text-sm text-muted group-hover:text-body transition-transform duration-200 group-hover:rotate-180 ml-0.5"
                          aria-hidden="true"
                        />
                      </a>
                      <div class="dropdown-menu absolute left-0 mt-0 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 origin-top-left pt-2 pb-2 top-full">
                        <ul class="flex flex-col list-none m-0 p-0">
                          {item.items
                            .filter((sub) => !sub.requires)
                            .map((sub) => (
                              <li key={sub.url}>
                                <a
                                  href={sub.url}
                                  class="flex items-center justify-between px-4 py-2 nav-link-dropdown lowercase text-base"
                                >
                                  <span>{sub.title}</span>
                                  {sub.icon && (
                                    <i
                                      class={`ph ph-${sub.icon} text-lg text-muted ml-2`}
                                      aria-hidden="true"
                                    />
                                  )}
                                </a>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <a
                      href={item.url}
                      class="font-header text-lg text-body hover:text-brand-chestnut transition-colors duration-200 flex items-center h-full lowercase relative group no-underline"
                      target={item.newTab ? "_blank" : undefined}
                      rel={item.newTab ? "noopener noreferrer" : undefined}
                      aria-label={item.newTab ? `${item.title} (opens in new tab)` : undefined}
                    >
                      <span class="relative inline-flex items-center">
                        {item.icon && (
                          <i
                            class={`ph ph-${item.icon} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-10 transition-opacity duration-200 text-4xl text-body pointer-events-none -z-10`}
                            aria-hidden="true"
                          />
                        )}
                        {item.title}
                      </span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Desktop: Search + Social */}
          <div
            class="hidden lg:flex items-center gap-4 h-full"
            role="navigation"
            aria-label="Search and social media links"
          >
            <a
              href="/search"
              class="icon-interactive flex items-center h-full p-1 no-underline"
              aria-label="Search site content"
            >
              <i class="ph ph-magnifying-glass text-xl" aria-hidden="true" />
            </a>
            <div class="flex items-center gap-2 h-full">
              {social.map((item) => (
                <a
                  key={item.site}
                  href={item.url}
                  class="icon-interactive flex items-center h-full p-1 no-underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${item.site} (opens in new tab)`}
                >
                  <i class={`ph ph-${item.icon} text-xl`} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* Mobile Hamburger */}
          <div class="lg:hidden flex items-center gap-2 h-full">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              class="p-2 rounded-md nav-link-dropdown flex items-center h-full"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
            >
              <i class="ph ph-list text-2xl" aria-hidden="true" />
            </button>

            {mobileOpen && (
              <div
                class="dropdown-menu absolute top-16 right-0 w-48 py-2 origin-top"
                onKeyDown={(e) => e.key === "Escape" && setMobileOpen(false)}
              >
                <nav class="flex flex-col" role="navigation" aria-label="Mobile navigation">
                  <ul class="flex flex-col list-none m-0 p-0">
                    <li>
                      <a
                        href="/search"
                        class="px-4 py-2 nav-link-dropdown lowercase flex items-center gap-2"
                        onClick={() => setMobileOpen(false)}
                      >
                        <i class="ph ph-magnifying-glass" aria-hidden="true" />
                        search
                      </a>
                    </li>
                    {navbar.map((item, index) => (
                      <li key={item.url}>
                        {item.items ? (
                          <div>
                            <div class="flex items-center">
                              <a
                                href={item.url}
                                class="flex-1 px-4 py-2 nav-link-dropdown lowercase"
                                onClick={() => setMobileOpen(false)}
                              >
                                {item.title}
                              </a>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAccordion(index);
                                }}
                                class="px-4 py-2 nav-link-dropdown"
                                aria-expanded={expandedItems.has(index)}
                                aria-label={`Toggle ${item.title} submenu`}
                              >
                                <i
                                  class={`ph ph-caret-down transition-transform duration-200 ${expandedItems.has(index) ? "rotate-180" : ""}`}
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                            {expandedItems.has(index) && (
                              <ul class="flex flex-col list-none m-0 p-0 bg-brand-grey/10 dark:bg-brand-grey/20">
                                {item.items
                                  .filter((sub) => !sub.requires)
                                  .map((sub) => (
                                    <li key={sub.url}>
                                      <a
                                        href={sub.url}
                                        class="flex items-center justify-between px-8 py-2 text-sm text-muted hover:bg-brand-grey/15 dark:hover:bg-brand-grey/30 hover:text-brand-chestnut transition-colors duration-200 lowercase no-underline"
                                        onClick={() => setMobileOpen(false)}
                                      >
                                        <span>{sub.title}</span>
                                        {sub.icon && (
                                          <i
                                            class={`ph ph-${sub.icon} text-base text-muted ml-2`}
                                            aria-hidden="true"
                                          />
                                        )}
                                      </a>
                                    </li>
                                  ))}
                              </ul>
                            )}
                          </div>
                        ) : (
                          <a
                            href={item.url}
                            class="block px-4 py-2 nav-link-dropdown lowercase"
                            target={item.newTab ? "_blank" : undefined}
                            rel={item.newTab ? "noopener noreferrer" : undefined}
                            onClick={() => setMobileOpen(false)}
                          >
                            {item.title}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div class="border-t border-brand-grey/20 dark:border-brand-grey/30 mt-2 pt-2 px-2">
                    <div class="grid grid-cols-3 gap-2">
                      {social.map((item) => (
                        <a
                          key={item.site}
                          href={item.url}
                          class="icon-interactive flex items-center justify-center p-2 no-underline"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${item.site} (opens in new tab)`}
                        >
                          <i class={`ph ph-${item.icon} text-xl`} aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  </div>
                </nav>
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
