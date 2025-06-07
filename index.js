
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

const COMMENTS_DIR = path.join(__dirname, 'comments');

// Ensure the comments directory exists
if (!fs.existsSync(COMMENTS_DIR)) fs.mkdirSync(COMMENTS_DIR);

app.post('/api/comments/:messageID', (req, res) => {
  const file = path.join(COMMENTS_DIR, `${req.params.messageID}.txt`);
  const { name, comment } = req.body;

  if (!name || !comment) {
    return res.status(400).json({ error: 'Name and comment are required.' });
  }

  let comments = [];
  if (fs.existsSync(file)) {
    // File exists: read and parse existing comments
    try {
      const data = fs.readFileSync(file, 'utf8');
      comments = JSON.parse(data);
      if (!Array.isArray(comments)) comments = [];
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read existing comments.' });
    }
  } else {
    // File does not exist: will create a new one
    comments = [];
  }

  comments.push({ name, comment });

  try {
    fs.writeFileSync(file, JSON.stringify(comments, null, 2));
    res.json({ success: true, message: 'Comment added.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write comment.' });
  }
});

app.get('/api/comments/:messageID', (req, res) => {
  const file = path.join(COMMENTS_DIR, `${req.params.messageID}.txt`);
  if (!fs.existsSync(file)) return res.json([]);
  try {
    const comments = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read comments.' });
  }
});

app.listen(3000, () => console.log('API running on port 3000'));
