# Product Search Application

A modern web application for searching and managing product inventory with real-time search capabilities.

## Features

- Real-time product search
- Beautiful and responsive UI
- Formatted currency and number display
- PostgreSQL database integration
- HTMX for seamless interactions

## Tech Stack

- **Frontend:**
  - HTML5
  - CSS3 with Tailwind CSS
  - HTMX for dynamic updates

- **Backend:**
  - Node.js
  - Express.js
  - MySQL
  - node-postgres for database connection

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd product_search_v2
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your PostgreSQL database and create a .env file:
   ```env
   DB_USER=your_username
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_PORT=5432
   DB_DATABASE=your_database_name
   ```

4. Run the SQL scripts to set up the database schema and indexes:
   ```bash
   psql -U your_username -d your_database_name -f add_fulltext_index.sql
   ```

5. Start the server:
   ```bash
   node server.js
   ```

6. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

1. Enter a product name in the search box
2. Results will appear automatically as you type
3. View product details including:
   - Product name
   - Category
   - Price (formatted in IDR)
   - Unit
   - Location
   - Stock information (Total In, Total Out, Balance)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Version History

- v1.0.0 (2024-12-31)
  - Initial release
  - Basic search functionality
  - Real-time updates
  - Responsive design
