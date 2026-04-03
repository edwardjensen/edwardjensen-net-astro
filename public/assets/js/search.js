/**
 * Site Search Handler
 * 
 * Provides Lunr.js-based site search functionality with Alpine.js integration.
 * Used by the search-results.html component.
 */

function searchHandler() {
  return {
    queryInput: '',
    results: [],
    data: {},
    index: null,
    isSearching: false,
    searchTimeout: null,

    /**
     * Decode HTML entities in search results
     * @param {string} html - HTML string with entities
     * @returns {string} - Decoded plain text
     */
    decodeHtml(html) {
      const txt = document.createElement('textarea');
      txt.innerHTML = html;
      return txt.value;
    },

    /**
     * Initialize the search index
     * Fetches the search index JSON and builds the Lunr.js index
     */
    async init() {
      try {
        // Fetch the search index
        const response = await fetch('/search-index.json');
        const searchData = await response.json();
        
        // Build a map of documents for quick lookup
        searchData.documents.forEach(doc => {
          this.data[doc.id] = doc;
        });

        // Build Lunr index
        this.index = lunr(function() {
          this.ref('id');
          this.field('title', { boost: 10 });
          this.field('excerpt', { boost: 5 });
          this.field('content');
          this.field('type');

          searchData.documents.forEach(doc => {
            this.add(doc);
          });
        });
      } catch (error) {
        console.error('Failed to load search index:', error);
      }
    },

    /**
     * Perform a debounced search
     * Waits 1.5 seconds after the last keystroke before searching
     */
    performSearch() {
      // Clear existing timeout
      clearTimeout(this.searchTimeout);
      
      // Set a new timeout for debounced search (1.5 seconds)
      this.searchTimeout = setTimeout(() => {
        if (!this.index) return;
        
        this.isSearching = true;
        
        const query = this.queryInput.trim();
        
        if (query.length === 0) {
          this.results = [];
          this.isSearching = false;
          return;
        }

        // Perform the search with Lunr
        try {
          // Enhance query with wildcards for better matching
          const enhancedQuery = query
            .split(' ')
            .map(term => term + '*')
            .join(' ');
          
          this.results = this.index.search(enhancedQuery);
        } catch (error) {
          // If search fails, try with the original query
          console.log('Search error, trying original query:', error);
          this.results = this.index.search(query);
        }

        this.isSearching = false;
      }, 1500); // 1.5 second debounce
    }
  };
}

// Initialize search when page loads
document.addEventListener('alpine:init', () => {
  // Alpine is ready, the x-data initialization will handle it
});

// Also try immediate initialization for compatibility
document.addEventListener('DOMContentLoaded', () => {
  // Give Alpine a moment to initialize
  setTimeout(() => {
    const searchElement = document.querySelector('[x-data*="searchHandler"]');
    if (searchElement && searchElement.__x) {
      searchElement.__x.init();
    }
  }, 100);
});
