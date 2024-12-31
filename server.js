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

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const { productName } = req.query;
        console.log('Search request:', { productName });

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

        // Add GROUP BY
        searchQuery += `
            GROUP BY 
                s.cSTKdesc,
                sg.cGRPdesc,
                s.nstkhbeli,
                w.cWHSdesc
            ORDER BY s.cSTKdesc
            LIMIT 100
        `;

        console.log('Executing query:', searchQuery.replace(/\s+/g, ' '));
        console.log('Parameters:', params);

        // First, let's check if we have any products at all
        const [countResult] = await pool.promise().query('SELECT COUNT(*) as count FROM eisdata.stock');
        console.log('Total products in stock table:', countResult[0].count);

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
            
            // Generate HTML table rows
            const tableHtml = `
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
                        ${broadResults.length === 0 ? `
                            <tr class="empty-state">
                                <td colspan="7" class="px-6 py-4 text-center text-gray-500">No results found</td>
                            </tr>
                        ` : broadResults.map(row => `
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
            `;

            res.send(tableHtml);
        } else {
            // Generate HTML table rows
            const tableHtml = `
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
            `;

            res.send(tableHtml);
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
