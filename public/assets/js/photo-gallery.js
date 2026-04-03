// Photo Gallery Modal Component with URL Routing
// Uses Alpine.js for reactivity and History API for URL management
// Supports two modes:
// 1. Full mode (photography index): JSON data store with URL routing
// 2. Simple mode (homepage): Data attributes on buttons for lightbox only
window.photoGallery = function() {
  return {
    // Data store
    photos: [],
    currentIndex: -1,
    galleryUrl: '/photos/',
    galleryTitle: 'Photography',
    googleMapsApiKey: null,
    googleMapsProxyUrl: null,
    googleMapsSettings: { zoom: 15, size: '640x360', scale: 2, maptype: 'roadmap' },

    // Mode detection
    isFullMode: false, // true if JSON data store exists (photography index page)
    sourceUrl: null, // URL to return to (tracks where user came from)

    // Modal state
    photoModal: {
      isOpen: false,
      photo: null,
      // Legacy fields for simple mode
      image: '',
      alt: '',
      caption: '',
      date: '',
      captionVisible: true,
    },

    // UI state for reduced layout
    showInfo: false, // Whether info is visible (both overlay and panel when applicable)
    infoTimer: null, // Timer for auto-hiding info overlay

    // Initialization - accepts optional custom data element ID
    init(dataElementId = 'photo-gallery-data') {
      // Store the data element ID for later use
      this.dataElementId = dataElementId;

      // Check if we're in full mode (JSON data store exists)
      const dataEl = document.getElementById(dataElementId);
      this.isFullMode = !!dataEl;

      // Capture the current page URL as the source to return to
      this.sourceUrl = window.location.pathname;

      if (this.isFullMode) {
        this.loadPhotoData();
        this.setupHistoryListener();
      } else {
        // Simple mode: collect photos from data attributes
        this.loadPhotosFromDataAttributes();
      }

      // Verify modal exists in DOM (rendered by photo-modal.html include in base.html)
      if (!this.verifyModalHTML()) {
        return; // Cannot proceed without modal
      }

      // Setup keyboard navigation
      this.setupKeyboardNavigation();

      // Store reference globally for modal access
      window.photoGalleryInstance = this;

      // Check if we should open a photo based on initial URL (full mode only)
      if (this.isFullMode) {
        this.checkInitialUrl();
      }
    },

    // Load photo data from embedded JSON (full mode)
    loadPhotoData() {
      const dataEl = document.getElementById(this.dataElementId);
      if (!dataEl) return;

      try {
        const data = JSON.parse(dataEl.textContent);
        this.photos = data.photos || [];
        this.galleryUrl = data.galleryUrl || '/photos/';
        this.galleryTitle = data.galleryTitle || 'Photography';
        this.googleMapsApiKey = data.googleMapsApiKey;
        this.googleMapsProxyUrl = data.googleMapsProxyUrl;
        if (data.googleMapsSettings) {
          this.googleMapsSettings = { ...this.googleMapsSettings, ...data.googleMapsSettings };
        }
      } catch (e) {
        console.error('Failed to parse photo gallery data:', e);
      }
    },

    // Load photos from data attributes (simple mode - homepage)
    loadPhotosFromDataAttributes() {
      // First check for hidden data container
      const allPhotosContainer = document.getElementById('photo-gallery-all-photos');
      if (allPhotosContainer) {
        const buttons = allPhotosContainer.querySelectorAll('.gallery-photo-data');
        buttons.forEach((button) => {
          this.photos.push({
            image: button.dataset.image,
            imageAlt: button.dataset.alt,
            title: button.dataset.caption,
            date: button.dataset.date,
          });
        });
      } else {
        // Fallback: collect from visible buttons
        const buttons = this.$el.querySelectorAll('figure button[data-image]');
        buttons.forEach((button) => {
          this.photos.push({
            image: button.dataset.image,
            imageAlt: button.dataset.alt,
            title: button.dataset.caption,
            date: button.dataset.date,
          });
        });
      }
    },

    // Check if we should open a photo based on initial URL (full mode only)
    checkInitialUrl() {
      const currentPath = window.location.pathname;
      const normalizedGalleryUrl = this.galleryUrl.replace(/\/$/, '');

      // If we're not on the gallery root (and not on a pagination page), try to open the photo
      if (currentPath !== this.galleryUrl &&
          currentPath !== normalizedGalleryUrl &&
          !currentPath.includes('/page/')) {

        const photo = this.findPhotoByUrl(currentPath);
        if (photo) {
          // When opening from direct URL, set source to gallery (not the photo URL itself)
          this.sourceUrl = this.galleryUrl;
          // Small delay to ensure DOM is ready
          setTimeout(() => this.openPhotoFull(photo, false), 100);
        }
      }
    },

    // Format date string for display
    formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    },

    // Escape HTML special characters to prevent XSS
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    // Decode HTML entities (for content that may be double-escaped)
    decodeHtml(text) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      return textarea.value;
    },

    // Setup popstate listener for back/forward navigation (full mode only)
    setupHistoryListener() {
      window.addEventListener('popstate', (event) => {
        if (event.state && event.state.photoUrl) {
          // Navigate to photo
          const photo = this.findPhotoByUrl(event.state.photoUrl);
          if (photo) {
            this.openPhotoFull(photo, false);
          }
        } else {
          // Close modal (returned to gallery)
          this.closeModal(false);
        }
      });
    },

    // Setup keyboard navigation for modal (only once)
    setupKeyboardNavigation() {
      // Prevent duplicate listeners if init() is called multiple times
      if (window._photoGalleryKeyboardSetup) return;
      window._photoGalleryKeyboardSetup = true;

      window.addEventListener('keydown', (event) => {
        // Only handle keys when modal is open
        if (!window.photoGalleryInstance?.photoModal.isOpen) return;

        switch (event.key) {
          case 'Escape':
            window.photoGalleryInstance.closeModal(true);
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
            // Go forward in time (previous photo)
            event.preventDefault();
            window.photoGalleryInstance.previous();
            break;
          case 'ArrowRight':
          case 'ArrowDown':
            // Go back in time (next photo)
            event.preventDefault();
            window.photoGalleryInstance.next();
            break;
          case 'i':
          case 'I':
            window.photoGalleryInstance.toggleInfo();
            break;
        }
      });
    },

    // Find photo by URL
    findPhotoByUrl(url) {
      const normalizedUrl = url.replace(/\/$/, '');
      return this.photos.find(p => p.url.replace(/\/$/, '') === normalizedUrl);
    },

    // Find photo index
    findPhotoIndex(photo) {
      return this.photos.findIndex(p => p.url === photo.url);
    },

    // Open photo from grid click (by URL) - full mode
    openPhotoByUrl(url) {
      const photo = this.findPhotoByUrl(url);
      if (photo) {
        this.openPhotoFull(photo, true);
      }
    },

    // Open photo from button click (by element) - simple mode (homepage)
    openPhoto(buttonElement) {
      const image = buttonElement.dataset.image;
      const alt = buttonElement.dataset.alt;
      const caption = buttonElement.dataset.caption;
      const date = buttonElement.dataset.date;

      // Find current photo index
      this.currentIndex = this.photos.findIndex(p => p.image === image);

      // Create a photo object for the modal
      const photo = {
        image: image,
        imageAlt: alt,
        title: caption,
        date: date,
        dateFormatted: this.formatDate(date),
      };

      // Open in simple mode (no URL routing)
      this.openPhotoSimple(photo);
    },

    // Open photo in simple mode (no URL routing) - for homepage
    // preserveInfoState: if true, keep current info panel state (used when navigating)
    openPhotoSimple(photo, preserveInfoState = false) {
      this.photoModal.photo = photo;
      this.photoModal.isOpen = true;

      // Update modal UI
      this.updateModalUI(preserveInfoState);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    },

    // Open photo in full mode (with URL routing) - for photography index
    // preserveInfoState: if true, keep current info panel state (used when navigating)
    openPhotoFull(photo, pushState = true, preserveInfoState = false) {
      this.photoModal.photo = photo;
      this.photoModal.isOpen = true;
      this.currentIndex = this.findPhotoIndex(photo);

      // Update URL
      if (pushState) {
        history.pushState(
          { photoUrl: photo.url, fromGallery: true },
          photo.title,
          photo.url
        );
      }

      // Update page title
      document.title = `${photo.title} - ${this.galleryTitle} - Edward Jensen`;

      // Update modal UI
      this.updateModalUI(preserveInfoState);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    },

    // Close modal
    closeModal(pushState = true) {
      if (!this.photoModal.isOpen) return;

      this.photoModal.isOpen = false;
      this.photoModal.photo = null;
      this.currentIndex = -1;

      // Clear info timer
      this.clearInfoTimer();

      // Reset UI state (keep showInfo state for next open)
      this.showInfo = false;

      // Update URL back to gallery (full mode only)
      if (this.isFullMode && pushState) {
        history.pushState(
          { fromGallery: false },
          this.galleryTitle,
          this.galleryUrl
        );
        // Update page title
        document.title = `${this.galleryTitle} - Edward Jensen`;
      }

      // Hide modal
      const modalDiv = document.getElementById('photo-modal-overlay');
      if (modalDiv) {
        modalDiv.style.display = 'none';
      }

      // Restore body scroll
      document.body.style.overflow = '';
    },

    // Handle back button click - close modal and navigate to source URL
    handleBackClick() {
      const targetUrl = this.sourceUrl || this.galleryUrl;

      // Close the modal first (without pushing state, we'll navigate instead)
      this.photoModal.isOpen = false;
      this.photoModal.photo = null;
      this.currentIndex = -1;
      this.clearInfoTimer();
      this.showInfo = false;

      // Hide modal
      const modalDiv = document.getElementById('photo-modal-overlay');
      if (modalDiv) {
        modalDiv.style.display = 'none';
      }

      // Restore body scroll
      document.body.style.overflow = '';

      // Navigate to the source URL
      window.location.href = targetUrl;
    },

    // Navigate to next photo (preserves info panel state)
    next() {
      if (this.hasNext()) {
        this.clearInfoTimer(); // Clear any running timer
        this.currentIndex++;
        const nextPhoto = this.photos[this.currentIndex];
        if (this.isFullMode) {
          this.openPhotoFull(nextPhoto, true, true); // preserve info state
        } else {
          this.openPhotoSimple(nextPhoto, true); // preserve info state
        }
      }
    },

    // Navigate to previous photo (preserves info panel state)
    previous() {
      if (this.hasPrevious()) {
        this.clearInfoTimer(); // Clear any running timer
        this.currentIndex--;
        const prevPhoto = this.photos[this.currentIndex];
        if (this.isFullMode) {
          this.openPhotoFull(prevPhoto, true, true); // preserve info state
        } else {
          this.openPhotoSimple(prevPhoto, true); // preserve info state
        }
      }
    },

    hasNext() {
      return this.currentIndex < this.photos.length - 1;
    },

    hasPrevious() {
      return this.currentIndex > 0;
    },

    // Start the info auto-hide timer (5 seconds) - only when no details panel
    startInfoTimer() {
      this.clearInfoTimer();
      this.showInfo = true;
      this.infoTimer = setTimeout(() => {
        this.showInfo = false;
        this.updateInfoVisibility();
      }, 5000);
    },

    // Clear the info timer
    clearInfoTimer() {
      if (this.infoTimer) {
        clearTimeout(this.infoTimer);
        this.infoTimer = null;
      }
    },

    // Toggle info visibility (unified: overlay + panel)
    toggleInfo() {
      this.clearInfoTimer();
      this.showInfo = !this.showInfo;
      this.updateInfoVisibility();
    },

    // Update info visibility in DOM (both overlay and details panel)
    updateInfoVisibility() {
      const photo = this.photoModal.photo;
      const hasDetails = this.hasAdditionalDetails(photo);

      const overlayInfo = document.getElementById('modal-photo-overlay-info');
      const overlayBg = document.getElementById('modal-photo-overlay-bg');
      const detailsPanel = document.getElementById('modal-details-panel');
      const detailsToggle = document.getElementById('modal-details-toggle');
      const mainContent = document.getElementById('modal-main-content');

      if (hasDetails) {
        // Photo has details: show/hide panel, hide overlay when panel is open
        if (detailsPanel) {
          detailsPanel.style.display = this.showInfo ? '' : 'none';
        }
        if (overlayInfo) {
          // Hide overlay when details panel is visible
          overlayInfo.style.opacity = this.showInfo ? '0' : '1';
          overlayInfo.style.pointerEvents = this.showInfo ? 'none' : 'auto';
        }
        if (overlayBg) {
          // Hide overlay background when details panel is visible
          overlayBg.style.opacity = this.showInfo ? '0' : '1';
        }
        if (mainContent) {
          // Adjust layout when panel is visible
          mainContent.classList.toggle('lg:mr-[400px]', this.showInfo);
        }
      } else {
        // No details: just toggle overlay visibility
        if (overlayInfo) {
          overlayInfo.style.opacity = this.showInfo ? '1' : '0';
          overlayInfo.style.pointerEvents = this.showInfo ? 'auto' : 'none';
        }
        if (overlayBg) {
          overlayBg.style.opacity = this.showInfo ? '1' : '0';
        }
      }

      // Update toggle button state
      if (detailsToggle && hasDetails) {
        detailsToggle.innerHTML = this.showInfo
          ? '<i class="ph ph-info-fill"></i>'
          : '<i class="ph ph-info"></i>';
        detailsToggle.title = this.showInfo ? 'Hide info (i)' : 'Show info (i)';
      }
    },

    // Check if photo has any additional details (EXIF, location, or content)
    hasAdditionalDetails(photo) {
      if (!photo) return false;
      return this.hasExifData(photo) || this.hasLocationData(photo) || (photo.content || '').trim();
    },

    // Check if photo has EXIF data
    hasExifData(photo) {
      if (!photo || !photo.exif) return false;
      const e = photo.exif;
      return e.camera || e.lens || e.focalLength || e.aperture || e.shutterSpeed || e.iso;
    },

    // Check if photo has location data
    hasLocationData(photo) {
      if (!photo || !photo.location) return false;
      // Need either proxy URL or API key to display the map
      return photo.location.lat && photo.location.lng && (this.googleMapsProxyUrl || this.googleMapsApiKey);
    },

    // Generate Google Maps Static API URL (supports both proxy and direct API key)
    // Settings are centralized in _config.yml under google_maps
    getMapImageUrl(photo) {
      if (!this.hasLocationData(photo)) return null;
      const loc = photo.location;
      const s = this.googleMapsSettings;
      
      // Select zoom level based on location precision
      let zoom = s.zoom_default || s.zoom || 12;
      if (loc.precision === 'precise') {
        zoom = s.zoom_precise || 15;
      } else if (loc.precision === 'approximate') {
        zoom = s.zoom_approximate || 12;
      }
      
      const params = `center=${loc.lat},${loc.lng}&zoom=${zoom}&size=${s.size}&scale=${s.scale}&maptype=${s.maptype}`;

      if (this.googleMapsProxyUrl) {
        // Use proxy (production) - API key is added server-side
        return `${this.googleMapsProxyUrl}?${params}`;
      } else if (this.googleMapsApiKey) {
        // Use direct API key (dev/staging)
        return `https://maps.googleapis.com/maps/api/staticmap?${params}&key=${this.googleMapsApiKey}`;
      }
      return null;
    },

    // Verify modal HTML exists in DOM (rendered by photo-modal.html include)
    verifyModalHTML() {
      const modalRoot = document.getElementById('photo-modal-root');
      if (!modalRoot) {
        console.error('Photo modal root element not found. Ensure photo-modal.html is included in base.html.');
        return false;
      }
      return true;
    },

    // Update modal UI with current photo data
    // preserveInfoState: if true, keep current showInfo state (used when navigating)
    updateModalUI(preserveInfoState = false) {
      const photo = this.photoModal.photo;
      if (!photo) return;

      const overlay = document.getElementById('photo-modal-overlay');
      const image = document.getElementById('modal-photo-image');
      const detailsToggle = document.getElementById('modal-details-toggle');

      // Details panel elements
      const date = document.getElementById('modal-photo-date');
      const tags = document.getElementById('modal-photo-tags');
      const content = document.getElementById('modal-photo-content');
      const exifSection = document.getElementById('modal-exif-section');
      const exifGrid = document.getElementById('modal-exif-grid');
      const locationSection = document.getElementById('modal-location-section');
      const locationName = document.getElementById('modal-location-name');
      const locationMap = document.getElementById('modal-location-map');
      const prevBtn = document.getElementById('modal-prev-btn');
      const nextBtn = document.getElementById('modal-next-btn');
      const backLink = document.getElementById('modal-back-link');
      const photoCounter = document.getElementById('modal-photo-counter');

      // Overlay elements
      const overlayDate = document.getElementById('modal-overlay-date');
      const overlayTags = document.getElementById('modal-overlay-tags');

      // Show modal overlay
      if (overlay) overlay.style.display = '';

      // Update image
      if (image) {
        image.src = photo.image;
        image.alt = photo.imageAlt;
      }

      // Check if we have any additional details to show
      const hasContent = (photo.content || '').trim();
      const hasExif = this.hasExifData(photo);
      const hasLocation = this.hasLocationData(photo);
      const hasDetails = hasContent || hasExif || hasLocation;

      // Format tags HTML (smaller badges for overlay - use opaque bg for a11y)
      const overlayTagsHtml = (photo.tags && photo.tags.length > 0)
        ? photo.tags.map(tag =>
            `<span class="bg-black backdrop-blur-sm text-white px-2 py-0.5 rounded text-xs">#${this.escapeHtml(tag)}</span>`
          ).join('')
        : '';

      // Format tags HTML (for details panel)
      const tagsHtml = (photo.tags && photo.tags.length > 0)
        ? photo.tags.map(tag =>
            `<span class="bg-brand-orange/20 text-brand-orange px-2 py-1 rounded-md text-xs font-semibold border border-brand-orange/30">#${tag}</span>`
          ).join('')
        : '';

      const dateFormatted = photo.dateFormatted || this.formatDate(photo.date);

      // Update overlay info (create h1 only if title exists)
      const overlayTitleContainer = document.getElementById('modal-overlay-title-container');
      if (overlayTitleContainer) {
        if (photo.title) {
          overlayTitleContainer.innerHTML = `<h1 class="font-header font-bold text-2xl lg:text-3xl text-white bg-black px-3 py-1 rounded-lg inline-block truncate max-w-full">${this.escapeHtml(this.decodeHtml(photo.title))}</h1>`;
        } else {
          overlayTitleContainer.innerHTML = '';
        }
      }
      if (overlayDate) {
        overlayDate.textContent = dateFormatted;
        if (photo.date) overlayDate.setAttribute('datetime', photo.date);
      }
      if (overlayTags) overlayTags.innerHTML = overlayTagsHtml;

      // Show/hide details toggle button based on whether photo has additional details
      if (detailsToggle) {
        detailsToggle.style.display = hasDetails ? '' : 'none';
      }

      // Update details panel content (create h1 only if title exists)
      const titleContainer = document.getElementById('modal-photo-title-container');
      if (titleContainer) {
        if (photo.title) {
          titleContainer.innerHTML = `<h1 class="font-header font-bold text-2xl text-white mb-1">${this.escapeHtml(this.decodeHtml(photo.title))}</h1>`;
        } else {
          titleContainer.innerHTML = '';
        }
      }
      if (date) {
        date.textContent = dateFormatted;
        if (photo.date) date.setAttribute('datetime', photo.date);
      }
      if (tags) tags.innerHTML = tagsHtml;

      // Update content
      if (content) {
        if (hasContent) {
          content.textContent = this.decodeHtml(photo.content.trim());
          content.style.display = '';
        } else {
          content.style.display = 'none';
        }
      }

      // Update EXIF section
      if (exifSection && exifGrid) {
        if (hasExif) {
          const e = photo.exif;
          let exifHtml = '';

          if (e.camera) exifHtml += `<div><dt class="text-brand-grey-light">Camera</dt><dd class="text-brand-smoke">` + e.camera + `</dd></div>`;
          if (e.lens) exifHtml += `<div><dt class="text-brand-grey-light">Lens</dt><dd class="text-brand-smoke">` + e.lens + `</dd></div>`;
          if (e.focalLength) exifHtml += `<div><dt class="text-brand-grey-light">Focal Length</dt><dd class="text-brand-smoke">` + e.focalLength + `</dd></div>`;
          if (e.aperture) exifHtml += `<div><dt class="text-brand-grey-light">Aperture</dt><dd class="text-brand-smoke">` + e.aperture + `</dd></div>`;
          if (e.shutterSpeed) exifHtml += `<div><dt class="text-brand-grey-light">Shutter Speed</dt><dd class="text-brand-smoke">` + e.shutterSpeed + `</dd></div>`;
          if (e.iso) exifHtml += `<div><dt class="text-brand-grey-light">ISO</dt><dd class="text-brand-smoke">` + e.iso + `</dd></div>`;

          exifGrid.innerHTML = exifHtml;
          exifSection.style.display = '';
        } else {
          exifSection.style.display = 'none';
        }
      }

      // Update location section (map is now aspect-video)
      if (locationSection && locationMap) {
        if (hasLocation) {
          if (locationName) {
            // Build location string from components
            const locationParts = [
              photo.location.name,
              photo.location.neighborhood,
              photo.location.city,
              photo.location.state,
              photo.location.country
            ].filter(Boolean);
            
            locationName.textContent = locationParts.join(', ');
            locationName.style.display = locationParts.length > 0 ? '' : 'none';
          }
          locationMap.src = this.getMapImageUrl(photo);
          const altLocation = [photo.location.city, photo.location.state].filter(Boolean).join(', ');
          locationMap.alt = `Map showing photo location${altLocation ? ': ' + altLocation : ''}`;
          locationSection.style.display = '';
        } else {
          locationSection.style.display = 'none';
        }
      }

      // Update navigation buttons
      if (prevBtn) prevBtn.disabled = !this.hasPrevious();
      if (nextBtn) nextBtn.disabled = !this.hasNext();

      // Update photo counter
      if (photoCounter && this.photos.length > 0) {
        photoCounter.textContent = `${this.currentIndex + 1} / ${this.photos.length}`;
      }

      // Update back link (use source URL, with appropriate label)
      if (backLink) {
        const backUrl = this.sourceUrl || this.galleryUrl;
        backLink.href = backUrl;

        // Set appropriate label based on where we came from
        const backLinkText = document.getElementById('modal-back-link-text');
        if (backLinkText) {
          if (backUrl === '/' || backUrl === '') {
            backLinkText.textContent = 'Home';
            backLink.title = 'Back to home';
          } else if (backUrl.startsWith('/photos')) {
            backLinkText.textContent = 'Gallery';
            backLink.title = 'Back to gallery';
          } else {
            backLinkText.textContent = 'Back';
            backLink.title = 'Go back';
          }
        }
      }

      // Handle info visibility
      if (!preserveInfoState) {
        // First open: start with info visible, then auto-hide after 5 seconds
        // (only if photo doesn't have details - if it has details, info stays hidden)
        if (hasDetails) {
          // Photo has details: start with info hidden (user can toggle with click or 'i')
          this.showInfo = false;
        } else {
          // No details: show overlay info with auto-hide timer
          this.showInfo = true;
          this.startInfoTimer();
        }
      }
      // Apply current info visibility state
      this.updateInfoVisibility();

      // Scroll details panel to top if visible
      const detailsPanel = document.getElementById('modal-details-panel');
      if (detailsPanel && this.showInfo) {
        detailsPanel.scrollTo(0, 0);
      }
    }
  };
};
