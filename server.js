const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'laimue_db'
});

let dbReady = false;

db.connect((err) => {
    if (err) {
        console.error('เชื่อมต่อ MySQL ไม่สำเร็จ:', err);
        return;
    }
    db.query(
        `CREATE TABLE IF NOT EXISTS translation_history (
            id INT NOT NULL AUTO_INCREMENT,
            user_id INT NOT NULL,
            recognized_text TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            CONSTRAINT translation_history_user_fk
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        (schemaError) => {
            if (schemaError) {
                console.error('เตรียมตารางประวัติใน MySQL ไม่สำเร็จ:', schemaError);
                return;
            }
            dbReady = true;
            console.log('เชื่อมต่อฐานข้อมูล MySQL และตรวจสอบตารางประวัติสำเร็จ!');
        }
    );
});

function databaseUnavailable(res) {
    if (dbReady) return false;
    res.status(503).json({ error: 'ฐานข้อมูลยังไม่พร้อมใช้งาน กรุณาตรวจสอบการเชื่อมต่อ MySQL' });
    return true;
}

function parseUserId(value) {
    const userId = Number(value);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

app.post('/api/login', (req, res) => {
    if (databaseUnavailable(res)) return;
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    if (!username || username.length > 60) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้ 1-60 ตัวอักษร' });
    }

    db.query('INSERT IGNORE INTO users (username) VALUES (?)', [username], (err) => {
        if (err) {
            console.error('สร้างหรือค้นหาผู้ใช้ไม่สำเร็จ:', err);
            return res.status(500).json({ error: 'ไม่สามารถบันทึกชื่อผู้ใช้ลงฐานข้อมูลได้' });
        }
        db.query('SELECT id, username FROM users WHERE username = ?', [username], (selectErr, results) => {
            if (selectErr) {
                console.error('ค้นหาผู้ใช้ไม่สำเร็จ:', selectErr);
                return res.status(500).json({ error: 'ไม่สามารถค้นหาชื่อผู้ใช้ในฐานข้อมูลได้' });
            }
            if (results.length === 0) return res.status(500).json({ error: 'ไม่พบผู้ใช้หลังบันทึกข้อมูล' });
            res.json({ success: true, user: results[0] });
        });
    });
});

app.post('/api/history', (req, res) => {
    if (databaseUnavailable(res)) return;
    const userId = parseUserId(req.body.user_id);
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!userId || !text) return res.status(400).json({ error: 'ต้องระบุผู้ใช้และข้อความที่ต้องการบันทึก' });

    db.query(
        'INSERT INTO translation_history (user_id, recognized_text) VALUES (?, ?)',
        [userId, text],
        (err, result) => {
            if (err) {
                console.error('บันทึกข้อมูลไม่สำเร็จ:', err);
                return res.status(500).json({ error: 'บันทึกประวัติลงฐานข้อมูลไม่สำเร็จ' });
            }
            db.query(
                'SELECT id, recognized_text, created_at FROM translation_history WHERE id = ? AND user_id = ?',
                [result.insertId, userId],
                (selectErr, rows) => {
                    if (selectErr) {
                        console.error('อ่านประวัติที่เพิ่งบันทึกไม่สำเร็จ:', selectErr);
                        return res.status(500).json({ error: 'บันทึกแล้วแต่ไม่สามารถอ่านประวัติกลับได้' });
                    }
                    res.status(201).json({ success: true, record: rows[0] });
                }
            );
        }
    );
});

app.get('/api/history', (req, res) => {
    if (databaseUnavailable(res)) return;
    const userId = parseUserId(req.query.user_id);
    const queryText = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitValue = Number(req.query.limit || 20);
    const offsetValue = Number(req.query.offset || 0);
    if (!userId) return res.status(400).json({ error: 'รหัสผู้ใช้ไม่ถูกต้อง' });
    if (queryText.length > 200) return res.status(400).json({ error: 'คำค้นหาต้องไม่เกิน 200 ตัวอักษร' });
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100 ||
        !Number.isInteger(offsetValue) || offsetValue < 0 || offsetValue > 1000000) {
        return res.status(400).json({ error: 'ช่วงหน้าประวัติไม่ถูกต้อง' });
    }

    const where = queryText ? 'user_id = ? AND INSTR(recognized_text, ?) > 0' : 'user_id = ?';
    const params = queryText ? [userId, queryText] : [userId];
    db.query(`SELECT COUNT(*) AS total FROM translation_history WHERE ${where}`, params, (countErr, countRows) => {
        if (countErr) {
            console.error('นับประวัติไม่สำเร็จ:', countErr);
            return res.status(500).json({ error: 'ค้นหาประวัติในฐานข้อมูลไม่สำเร็จ' });
        }
        db.query(
            `SELECT id, recognized_text, created_at FROM translation_history WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
            [...params, limitValue, offsetValue],
            (err, rows) => {
                if (err) {
                    console.error('ดึงประวัติไม่สำเร็จ:', err);
                    return res.status(500).json({ error: 'ดึงประวัติจากฐานข้อมูลไม่สำเร็จ' });
                }
                res.json({ records: rows, total: countRows[0].total, limit: limitValue, offset: offsetValue });
            }
        );
    });
});

app.delete('/api/history', (req, res) => {
    if (databaseUnavailable(res)) return;
    const userId = parseUserId(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'รหัสผู้ใช้ไม่ถูกต้อง' });

    db.query('DELETE FROM translation_history WHERE user_id = ?', [userId], (err, result) => {
        if (err) {
            console.error('ล้างประวัติไม่สำเร็จ:', err);
            return res.status(500).json({ error: 'ล้างประวัติในฐานข้อมูลไม่สำเร็จ' });
        }
        res.json({ success: true, deleted: result.affectedRows });
    });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`Backend Server กำลังทำงานที่ http://localhost:${port}`);
});