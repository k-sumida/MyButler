const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { initDatabase } = require('./db');

initDatabase()
  .then(() => console.log('Database initialized successfully.'))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
