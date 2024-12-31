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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configuration
const config = {
    resultsPerPage: 30 // Default results per page
};

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const { productName, page = 1, limit = config.resultsPerPage } = req.query;
        const currentPage = parseInt(page);
        const itemsPerPage = parseInt(limit);
        const offset = (currentPage - 1) * itemsPerPage;

        console.log('Search request:', { productName, page: currentPage, limit: itemsPerPage });

        // Validate empty search
        if (!productName || productName.trim() === '') {
            return res.status(400).send(`
                <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <span class="block sm:inline">Please enter a search term</span>
                </div>
                <table class="min-w-full table-auto">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total In</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Out</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="empty-state">
                            <td colspan="7" class="px-6 py-4 text-center text-gray-500">Use the search form above to find products</td>
                        </tr>
                    </tbody>
                </table>
            `);
        }

        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(DISTINCT s.cSTKdesc) as total
            FROM eisdata.stock s
            LEFT JOIN eisdata.stockgroup sg ON s.cSTKfkGRP = sg.cGRPpk
            WHERE LOWER(s.cSTKdesc) LIKE LOWER(?)
        `;
        
        const [countResult] = await pool.promise().query(countQuery, [`%${productName.trim()}%`]);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        // Base query with pagination
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
            WHERE LOWER(s.cSTKdesc) LIKE LOWER(?)
            GROUP BY 
                s.cSTKdesc,
                sg.cGRPdesc,
                s.nstkhbeli,
                w.cWHSdesc
            ORDER BY s.cSTKdesc
            LIMIT ? OFFSET ?
        `;

        const [results] = await pool.promise().query(searchQuery, [`%${productName.trim()}%`, itemsPerPage, offset]);
        console.log(`Found ${results.length} results on page ${currentPage}`);

        // Generate HTML response with pagination
        const paginationControls = `
            <div class="flex items-center justify-between border-gray-200 bg-white px-4 py-3 sm:px-6">
                <div class="flex flex-1 justify-between sm:hidden">
                    ${currentPage > 1 ? `
                        <button 
                            hx-get="/search?productName=${encodeURIComponent(productName)}&page=${currentPage - 1}&limit=${itemsPerPage}"
                            hx-target="#results"
                            class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Previous
                        </button>
                    ` : ''}
                    ${currentPage < totalPages ? `
                        <button 
                            hx-get="/search?productName=${encodeURIComponent(productName)}&page=${currentPage + 1}&limit=${itemsPerPage}"
                            hx-target="#results"
                            class="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Next
                        </button>
                    ` : ''}
                </div>
                <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                        <p class="text-sm text-gray-700">
                            Showing <span class="font-medium">${offset + 1}</span> to <span class="font-medium">${Math.min(offset + results.length, totalItems)}</span> of <span class="font-medium">${totalItems}</span> results
                        </p>
                    </div>
                    <div>
                        <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                            ${currentPage > 1 ? `
                                <button 
                                    hx-get="/search?productName=${encodeURIComponent(productName)}&page=${currentPage - 1}&limit=${itemsPerPage}"
                                    hx-target="#results"
                                    class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                                >
                                    <span class="sr-only">Previous</span>
                                    <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                            ` : ''}

                            ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const pageNum = i + 1;
                                return `
                                    <button
                                        hx-get="/search?productName=${encodeURIComponent(productName)}&page=${pageNum}&limit=${itemsPerPage}"
                                        hx-target="#results"
                                        class="relative inline-flex items-center px-4 py-2 text-sm font-semibold ${currentPage === pageNum ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
                                    >
                                        ${pageNum}
                                    </button>
                                `;
                            }).join('')}

                            ${currentPage < totalPages ? `
                                <button 
                                    hx-get="/search?productName=${encodeURIComponent(productName)}&page=${currentPage + 1}&limit=${itemsPerPage}"
                                    hx-target="#results"
                                    class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                                >
                                    <span class="sr-only">Next</span>
                                    <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                        <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                                    </svg>
                                </button>
                            ` : ''}
                        </nav>
                    </div>
                </div>
            </div>
        `;

        const tableHtml = `
            <div class="space-y-4">
                <!-- Top pagination -->
                ${totalPages > 1 ? paginationControls : ''}

                <!-- Results summary -->
                <div class="text-sm text-gray-600">
                    Showing ${offset + 1} to ${Math.min(offset + results.length, totalItems)} of ${totalItems} results
                </div>

                <!-- Results table -->
                <div class="overflow-x-auto">
                    <table class="min-w-full table-auto">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total In</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Out</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results.length === 0 ? `
                                <tr class="empty-state">
                                    <td colspan="7" class="px-6 py-4 text-center text-gray-500">No results found</td>
                                </tr>
                            ` : results.map(row => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">${row.productname || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">${row.productcategory || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">${formatCurrency(row.price)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">${row.location || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">${formatNumber(row.total_in)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">${formatNumber(row.total_out)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm" data-value="${row.saldo}">${formatNumber(row.saldo)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Bottom pagination -->
                ${totalPages > 1 ? paginationControls : ''}
            </div>
        `;

        res.send(tableHtml);

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).send(`
            <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong class="font-bold">Error!</strong>
                <span class="block sm:inline">An error occurred while searching. Please try again.</span>
            </div>
        `);
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
