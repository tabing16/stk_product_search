require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// MySQL connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection at startup
pool.promise().query('SELECT COUNT(*) as count FROM eisdata.stockgroup')
    .then(([rows]) => {
        console.log('Database connection successful');
        console.log('Total records in stockgroup:', rows[0].count);
    })
    .catch(err => {
        console.error('Database connection error:', err);
        process.exit(1);
    });

app.use(express.static('public'));
app.use(express.static('public/js')); // Serve static files from public/js directory
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const { productName, page = 1, limit = 10 } = req.query;
        console.log('Search request:', { productName, page, limit });

        // Base query
        let searchQuery = `
            SELECT DISTINCT
                s.cSTKdesc productname,
                sg.cGRPdesc productcategory,
                s.nstkhbeli price,
                w.cWHSdesc location,
                COALESCE(SUM(id.nIVDqtyin), 0) total_in,
                COALESCE(SUM(id.nIVDqtyout), 0) total_out,
                COALESCE(SUM(id.nIVDqtyin) - SUM(id.nIVDqtyout), 0) saldo
            FROM 
                eisdata.stock s
                LEFT JOIN eisdata.stockgroup sg ON s.cSTKfkGRP = sg.cGRPpk
                LEFT JOIN eisdata.stockdetail sd ON s.cSTKpk = sd.cSTDfkSTK
                LEFT JOIN eisdata.invoicedetail id ON s.cSTKpk = id.cIVDfkSTK
                LEFT JOIN eisdata.invoice i ON id.cIVDfkINV = i.cINVpk
                LEFT JOIN eisdata.warehouse w ON i.cINVfkWHS = w.cWHSpk
            WHERE 1=1
        `;

        const params = [];

        // Add search conditions
        if (productName && productName.trim()) {
            searchQuery += ' AND LOWER(s.cSTKdesc) LIKE LOWER(?)';
            params.push(`%${productName.trim()}%`);
        }

        // Add GROUP BY and ORDER BY
        searchQuery += `
            GROUP BY 
                s.cSTKdesc,
                sg.cGRPdesc,
                s.nstkhbeli,
                w.cWHSdesc
            ORDER BY s.cSTKdesc
            LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `;

        console.log('Executing query:', searchQuery.replace(/\s+/g, ' '));
        console.log('Parameters:', params);

        // Get the total count of filtered results
        let countQuery = `
            SELECT COUNT(DISTINCT s.cSTKdesc) as count
            FROM 
                eisdata.stock s
                LEFT JOIN eisdata.stockgroup sg ON s.cSTKfkGRP = sg.cGRPpk
                LEFT JOIN eisdata.stockdetail sd ON s.cSTKpk = sd.cSTDfkSTK
                LEFT JOIN eisdata.invoicedetail id ON s.cSTKpk = id.cIVDfkSTK
                LEFT JOIN eisdata.invoice i ON id.cIVDfkINV = i.cINVpk
                LEFT JOIN eisdata.warehouse w ON i.cINVfkWHS = w.cWHSpk
            WHERE 1=1
        `;

        if (productName && productName.trim()) {
            countQuery += ' AND LOWER(s.cSTKdesc) LIKE LOWER(?)';
        }

        const [filteredCount] = await pool.promise().query(countQuery, params);
        const totalFilteredResults = filteredCount[0].count;
        console.log('Total filtered results:', totalFilteredResults);

        // Execute the main search query
        const [results] = await pool.promise().query(searchQuery, params);
        console.log(`Found ${results.length} results`);
        
        // Log some sample results if any
        if (results.length > 0) {
            console.log('Sample result:', results[0]);
        }

        // If no results found with exact match, try broader search
        if (results.length === 0 && productName && productName.trim()) {
            console.log('No results found. Trying broader search...');
            
            // Split search term into words
            const words = productName.trim().split(/\s+/);
            const conditions = words.map(() => 'LOWER(s.cSTKdesc) LIKE LOWER(?)').join(' OR ');
            
            // Modify the query for broader search
            let broadQuery = searchQuery.replace(
                'AND LOWER(s.cSTKdesc) LIKE LOWER(?)',
                `AND (${conditions})`
            );
            
            // Create parameters array for broader search
            const broadParams = words.map(word => `%${word}%`);
            
            console.log('Executing broader query:', broadQuery.replace(/\s+/g, ' '));
            console.log('Broader parameters:', broadParams);
            
            const [broadResults] = await pool.promise().query(broadQuery, broadParams);
            console.log(`Found ${broadResults.length} results with broader search`);
            
            if (broadResults.length > 0) {
                console.log('Sample broad result:', broadResults[0]);
            }
            
            const startIndex = (page - 1) * limit + 1;
            const endIndex = Math.min(page * limit, totalFilteredResults);
            const totalResults = totalFilteredResults;

            // Generate pagination controls HTML using the new pagination function
            const paginationControlsHtml = buildPaginationHtml(totalResults, page, productName, limit);

            // Generate table HTML with mobile-responsive design
            const tableHtml = `
                <div class="overflow-x-auto border rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">In</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Out</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${broadResults.length === 0 ? `
                                <tr>
                                    <td colspan="7" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">No results found</td>
                                </tr>
                            ` : broadResults.map(item => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${item.productname || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.productcategory || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(item.price) || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.location || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatNumber(item.total_in) || '0'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatNumber(item.total_out) || '0'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatNumber(item.saldo) || '0'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            // Return the complete HTML with both top and bottom pagination controls
            res.send(`
                <div class="space-y-6">
                    ${paginationControlsHtml}
                    ${tableHtml}
                    ${paginationControlsHtml}
                </div>
            `);
        } else {
            const startIndex = (page - 1) * limit + 1;
            const endIndex = Math.min(page * limit, totalFilteredResults);
            const totalResults = totalFilteredResults;

            // Generate pagination controls HTML using the new pagination function
            const paginationControlsHtml = buildPaginationHtml(totalResults, page, productName, limit);

            // Generate table HTML with mobile-responsive design
            const tableHtml = `
                <div class="overflow-x-auto border rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">In</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Out</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${results.length === 0 ? `
                                <tr>
                                    <td colspan="7" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">No results found</td>
                                </tr>
                            ` : results.map(item => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${item.productname || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.productcategory || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(item.price) || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.location || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatNumber(item.total_in) || '0'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatNumber(item.total_out) || '0'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatNumber(item.saldo) || '0'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            // Return the complete HTML with both top and bottom pagination controls
            res.send(`
                <div class="space-y-6">
                    ${paginationControlsHtml}
                    ${tableHtml}
                    ${paginationControlsHtml}
                </div>
            `);
        }
    } catch (error) {
        console.error('Search error:', error);
        // Log the full error details
        console.error('Detailed error:', {
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage,
            sql: error.sql
        });
        res.status(500).json({ 
            error: 'An error occurred during search',
            details: error.message
        });
    }
});

// Helper function to format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
    }).format(value || 0);
}

// Helper function to format numbers
function formatNumber(value) {
    return new Intl.NumberFormat('id-ID').format(value || 0);
}

// Pagination function with improved logic
function buildPaginationHtml(totalResults, currentPage, productName, limit) {
    const totalPages = Math.ceil(totalResults / limit);
    currentPage = parseInt(currentPage);
    
    // Calculate the range of page numbers to show
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    // Adjust the start if we're near the end
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    // Generate the page buttons
    const pageButtons = [];
    
    // Add first page and ellipsis if necessary
    if (startPage > 1) {
        pageButtons.push(createPageButton(1, currentPage, productName, limit));
        if (startPage > 2) {
            pageButtons.push('<span class="relative inline-flex items-center px-4 py-2 text-sm text-gray-700">...</span>');
        }
    }
    
    // Add page numbers
    for (let i = startPage; i <= endPage; i++) {
        pageButtons.push(createPageButton(i, currentPage, productName, limit));
    }
    
    // Add last page and ellipsis if necessary
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageButtons.push('<span class="relative inline-flex items-center px-4 py-2 text-sm text-gray-700">...</span>');
        }
        pageButtons.push(createPageButton(totalPages, currentPage, productName, limit));
    }

    const paginationControlsHtml = `
        <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
            <div class="text-sm text-gray-600">
                Showing ${totalResults === 0 ? 0 : (currentPage - 1) * limit + 1} to ${Math.min(currentPage * limit, totalResults)} of ${totalResults} results
            </div>
            <div class="inline-flex items-center gap-2">
                ${currentPage > 1 ? `
                    <button
                        hx-get="/search?productName=${encodeURIComponent(productName)}&page=${currentPage - 1}&limit=${limit}"
                        hx-target="#results"
                        class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 focus:z-10"
                    >
                        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                        Previous
                    </button>
                ` : `
                    <button
                        class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-300 bg-white border border-gray-300 rounded-l-md cursor-not-allowed"
                        disabled
                    >
                        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                        Previous
                    </button>
                `}
                
                ${pageButtons.join('')}
                
                ${currentPage < totalPages ? `
                    <button
                        hx-get="/search?productName=${encodeURIComponent(productName)}&page=${currentPage + 1}&limit=${limit}"
                        hx-target="#results"
                        class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 focus:z-10"
                    >
                        Next
                        <svg class="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ` : `
                    <button
                        class="relative inline-flex items-center px-3 py-2 text-sm font-medium text-gray-300 bg-white border border-gray-300 rounded-r-md cursor-not-allowed"
                        disabled
                    >
                        Next
                        <svg class="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                `}
            </div>
        </div>
    `;

    return paginationControlsHtml;
}

// Helper function to create page button
function createPageButton(pageNum, currentPage, productName, limit) {
    const isActive = currentPage === pageNum;
    return `
        <button
            hx-get="/search?productName=${encodeURIComponent(productName)}&page=${pageNum}&limit=${limit}"
            hx-target="#results"
            class="relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                isActive 
                ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' 
                : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
            }"
            ${isActive ? 'aria-current="page"' : ''}
        >
            ${pageNum}
        </button>
    `;
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
