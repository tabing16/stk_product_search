// Configuration
const RESULTS_PER_PAGE = 10;  // Default results per page
const PAGINATE = 'pagination-controls';  // ID of pagination container
const VISIBLE_PAGES = 7;  // Number of visible page numbers

function pagination(total_results, current_page, results_per_page = RESULTS_PER_PAGE) {
    if (total_results === 0) return [];
    
    const total_pages = Math.ceil(total_results / results_per_page);
    const pages = [];
    
    // Always include first page, last page, current page, and some pages around current page
    const delta = Math.floor(VISIBLE_PAGES / 2);
    
    let start = Math.max(2, current_page - delta);
    let end = Math.min(total_pages - 1, current_page + delta);
    
    // Adjust if we're near the start or end
    if (current_page - delta < 2) {
        end = Math.min(total_pages - 1, VISIBLE_PAGES - 1);
    }
    if (current_page + delta > total_pages - 1) {
        start = Math.max(2, total_pages - VISIBLE_PAGES + 2);
    }
    
    // First page is always shown
    pages.push(1);
    
    // Add ellipsis after first page if needed
    if (start > 2) {
        pages.push('...');
    }
    
    // Add pages between start and end
    for (let i = start; i <= end; i++) {
        pages.push(i);
    }
    
    // Add ellipsis before last page if needed
    if (end < total_pages - 1) {
        pages.push('...');
    }
    
    // Last page is always shown if it's not already included
    if (total_pages > 1) {
        pages.push(total_pages);
    }
    
    return pages;
}

function buildPaginationHtml(total_results, current_page, productName, limit = RESULTS_PER_PAGE) {
    const pages = pagination(total_results, current_page, limit);
    const total_pages = Math.ceil(total_results / limit);
    
    if (pages.length === 0) return '';
    
    const firstButton = `
        <button
            hx-get="/search?productName=${encodeURIComponent(productName)}&page=1&limit=${limit}"
            hx-target="#results"
            class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 ${current_page <= 1 ? 'opacity-50 cursor-not-allowed' : ''}"
            ${current_page <= 1 ? 'disabled' : ''}
            aria-label="First page"
        >
            «
        </button>
    `;

    const prevButton = `
        <button
            hx-get="/search?productName=${encodeURIComponent(productName)}&page=${current_page - 1}&limit=${limit}"
            hx-target="#results"
            class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 ${current_page <= 1 ? 'opacity-50 cursor-not-allowed' : ''}"
            ${current_page <= 1 ? 'disabled' : ''}
            aria-label="Previous page"
        >
            ‹
        </button>
    `;

    const buttons = pages.map(page => {
        if (page === '...') {
            return `<span class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300">...</span>`;
        }
        
        const isCurrentPage = page === current_page;
        return `
            <button
                hx-get="/search?productName=${encodeURIComponent(productName)}&page=${page}&limit=${limit}"
                hx-target="#results"
                class="relative inline-flex items-center px-3 py-2 text-sm font-medium ${
                    isCurrentPage 
                    ? 'z-10 bg-blue-600 text-white border border-blue-600' 
                    : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                }"
                ${isCurrentPage ? 'aria-current="page"' : ''}
            >
                ${page}
            </button>
        `;
    }).join('');

    const nextButton = `
        <button
            hx-get="/search?productName=${encodeURIComponent(productName)}&page=${current_page + 1}&limit=${limit}"
            hx-target="#results"
            class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 ${current_page >= total_pages ? 'opacity-50 cursor-not-allowed' : ''}"
            ${current_page >= total_pages ? 'disabled' : ''}
            aria-label="Next page"
        >
            ›
        </button>
    `;

    const lastButton = `
        <button
            hx-get="/search?productName=${encodeURIComponent(productName)}&page=${total_pages}&limit=${limit}"
            hx-target="#results"
            class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 ${current_page >= total_pages ? 'opacity-50 cursor-not-allowed' : ''}"
            ${current_page >= total_pages ? 'disabled' : ''}
            aria-label="Last page"
        >
            »
        </button>
    `;

    const startIndex = ((current_page - 1) * limit) + 1;
    const endIndex = Math.min(current_page * limit, total_results);

    return `
        <div class="flex flex-col items-center gap-2 mb-4">
            <nav aria-label="Pagination" class="inline-flex rounded-md shadow-sm">
                ${firstButton}
                ${prevButton}
                ${buttons}
                ${nextButton}
                ${lastButton}
            </nav>
            <div class="text-sm text-gray-600">
                Showing ${startIndex} to ${endIndex} of ${total_results} results
            </div>
        </div>
    `;
}
