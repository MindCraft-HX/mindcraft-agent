// const sqlite3 = require('sqlite3').verbose();

// class dbService {
//     constructor(dbFilePath) {
//         this.db = this.openDb(dbFilePath);
//     };

//     openDb(dbFilePath) {
//         return new sqlite3.Database(dbFilePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
//             if (err) {
//                 console.error(err.message);
//             }
//             console.log('Connected to the SQLite database.');
//         });
//     };

//     getUrls(callback) {
//         this.db.all('SELECT * FROM urls', [], (err, rows) => {
//             callback(err, rows);
//         });
//     };

//     addUrl(url, callback) {
//         this.db.run('INSERT INTO urls(url) VALUES(?)', [url], (err) => {
//             callback(err);
//         });
//     };

//     //初始化
//     initializeDb() {
//         this.db.run('CREATE TABLE IF NOT EXISTS urls (id INTEGER PRIMARY KEY, url TEXT)', (err) => {
//             if (err) {
//                 console.error(err.message);
//             } else {
//                 console.log('Table created or already exists.');
//             }
//         });
//     };
    
//     // 增删改查
// };
// module.exports = dbService;