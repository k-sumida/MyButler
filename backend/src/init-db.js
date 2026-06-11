const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { initDatabase } = require('./db');

initDatabase();
console.log('Database initialized successfully.');
