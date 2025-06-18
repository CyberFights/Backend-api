
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const app = express();

app.use(express.json());

// --- Directories ---
const COMMENTS_DIR = path.join(__dirname, 'comments');
const DATA_DIR = path.join(__dirname, 'tournaments');
const USERS_DIR = path.join(__dirname, 'users');
const IMAGES_DIR = path.join(__dirname, 'images');

// Ensure directories exist
[COMMENTS_DIR, DATA_DIR, USERS_DIR, IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// --- Helper Functions (Tournament) ---
function sanitizeName(name) {
  return name.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
}
function getDataFile(name) {
  return path.join(DATA_DIR, sanitizeName(name) + '.json');
}
function listTournamentFiles() {
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''));
}
function loadData(tournamentName) {
  const file = getDataFile(tournamentName);
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    return JSON.parse(raw);
  }
  return null;
}
function saveData(tournamentName, data) {
  const file = getDataFile(tournamentName);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function deleteData(tournamentName) {
  const file = getDataFile(tournamentName);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// --- Multer for User Image Uploads ---
const upload = multer({ dest: IMAGES_DIR });

// --- User Registration ---
app.post('/register', upload.single('image'), async (req, res) => {
  const { username, password, stats, info, email, age, nativeLanguage, colorPreference } = req.body;
  if (!username || !password) return res.status(400).send('Username and password required');
  const userPath = path.join(USERS_DIR, `${sanitizeName(username)}.json`);
  if (fs.existsSync(userPath)) return res.status(409).send('Username already exists');
  const hashedPassword = await bcrypt.hash(password, 10);
  const userData = { username, password: hashedPassword, stats, info, email, age, nativeLanguage, colorPreference };
  fs.writeFileSync(userPath, JSON.stringify(userData, null, 2));
  // Save image if uploaded
  if (req.file) {
    const ext = path.extname(req.file.originalname) || '.jpg';
    fs.renameSync(req.file.path, path.join(IMAGES_DIR, `${sanitizeName(username)}${ext}`));
  }
  res.send('ok');
});

// --- User Login ---
app.get('/login', async (req, res) => {
  const { username, password } = req.query;
  const userPath = path.join(USERS_DIR, `${sanitizeName(username)}.json`);
  if (!fs.existsSync(userPath)) return res.status(404).send('User not found');
  const user = JSON.parse(fs.readFileSync(userPath));
  const match = await bcrypt.compare(password, user.password);
  res.send(match ? 'ok' : 'invalid');
});

// --- Update User Info ---
app.post('/update', async (req, res) => {
  const { username, password, ...updates } = req.body;
  const userPath = path.join(USERS_DIR, `${sanitizeName(username)}.json`);
  if (!fs.existsSync(userPath)) return res.status(404).send('User not found');
  const user = JSON.parse(fs.readFileSync(userPath));
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).send('Unauthorized');
  Object.assign(user, updates);
  fs.writeFileSync(userPath, JSON.stringify(user, null, 2));
  res.send('Updated');
});

// --- Get All User Info (POST) ---
app.post('/userinfo', async (req, res) => {
  const { username, password } = req.body;
  const userPath = path.join(USERS_DIR, `${sanitizeName(username)}.json`);
  if (!fs.existsSync(userPath)) return res.status(404).send('User not found');
  const user = JSON.parse(fs.readFileSync(userPath));
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).send('Unauthorized');
  // Exclude password from response
  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

// --- Tournament & Comments API ---

app.get('/', (req, res) => {
  res.send('Tournament API is running!');
});

// Comments API
app.post('/api/comments/:messageID', (req, res) => {
  const file = path.join(COMMENTS_DIR, `${req.params.messageID}.txt`);
  const { name, comment } = req.body;

  if (!name || !comment) {
    return res.status(400).json({ error: 'Name and comment are required.' });
  }

  let comments = [];
  if (fs.existsSync(file)) {
    try {
      const data = fs.readFileSync(file, 'utf8');
      comments = JSON.parse(data);
      if (!Array.isArray(comments)) comments = [];
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read existing comments.' });
    }
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

// Tournament CRUD
app.post('/tournament', (req, res) => {
  const { name, description, themeColor, streamUrl, sponsor, customFields } = req.body;
  if (!name || !name.trim()) return res.status(400).send('Tournament name required');
  const file = getDataFile(name);
  if (fs.existsSync(file)) return res.status(409).send('Tournament already exists');
  const data = {
    meta: {
      name: name.trim(),
      description: description || "",
      themeColor: themeColor || "",
      streamUrl: streamUrl || "",
      sponsor: sponsor || {},
      status: "Registration Open",
      customFields: customFields || {}
    },
    participants: [],
    bracket: [],
    matches: [],
    roundNumber: 0,
    standings: []
  };
  saveData(name, data);
  res.send({ tournamentName: name.trim() });
});

app.get('/tournaments', (req, res) => {
  res.send({ tournaments: listTournamentFiles() });
});

app.get('/tournament', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  const data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  res.send(data.meta);
});

app.patch('/tournament', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  const data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  Object.assign(data.meta, req.body);
  saveData(tournament, data);
  res.send(data.meta);
});

app.post('/tournament/rename', (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).send('Both oldName and newName required');
  const oldFile = getDataFile(oldName);
  const newFile = getDataFile(newName);
  if (!fs.existsSync(oldFile)) return res.status(404).send('Old tournament not found');
  if (fs.existsSync(newFile)) return res.status(409).send('New tournament name already exists');
  fs.renameSync(oldFile, newFile);
  let data = loadData(newName);
  data.meta.name = newName;
  saveData(newName, data);
  res.send({ oldName, newName });
});

app.post('/tournament/delete', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).send('Tournament name required');
  deleteData(name);
  res.send({ deleted: name });
});

// Participant Management
app.post('/signup', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  const { name, email, team, extra } = req.body;
  if (!name || !name.trim()) return res.status(400).send('Name required');
  if (data.participants.some(p => p.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    return res.status(409).send('Participant already signed up');
  }
  data.participants.push({ name: name.trim(), email: email || "", team: team || "", extra: extra || {} });
  saveData(tournament, data);
  res.send({ participants: data.participants });
});

app.get('/participants', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  res.send({ participants: data.participants });
});

// Bracket Generation
app.post('/generate', (req, res) => {
  const { tournament, seeding } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  if (data.participants.length < 2) return res.status(400).send('Need at least 2 participants');
  // Seeding: if provided, use seeding array (array of names in order), else random
  let seeds = data.participants.map(p => p.name);
  if (seeding && Array.isArray(seeding)) {
    seeds = seeding;
  } else {
    seeds = seeds
      .map(x => ({ x, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ x }) => x);
  }
  // Pair up for bracket
  data.bracket = [];
  for (let i = 0; i < seeds.length; i += 2) {
    data.bracket.push([seeds[i], seeds[i + 1] || null]);
  }
  data.matches = data.bracket.map((pair, idx) => ({
    round: 1,
    matchIndex: idx,
    players: pair,
    winner: null,
    scores: [],
    chat: [],
    notes: ""
  }));
  data.roundNumber = 1;
  data.meta.status = "In Progress";
  saveData(tournament, data);
  res.send({ round: data.roundNumber, matches: data.bracket });
});

// Get Bracket and Matches
app.get('/bracket', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  res.send({
    tournamentName: data.meta.name,
    round: data.roundNumber,
    matches: data.bracket
  });
});

app.get('/matches', (req, res) => {
  const { tournament, round } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  let matches = data.matches;
  if (round) matches = matches.filter(m => m.round === Number(round));
  res.send({ matches });
});

// Update Match Result (Best-of-N, Chat, Notes)
app.post('/result', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  const { matchIndex, winner, scores, notes } = req.body;
  let match = data.matches.find(m => m.matchIndex === matchIndex && m.round === data.roundNumber);
  if (!match) return res.status(404).send('Match not found');
  if (!match.players.includes(winner)) return res.status(400).send('Winner must be one of the players');
  if (match.winner) return res.status(409).send('Winner already set for this match');
  match.winner = winner;
  if (scores) match.scores = scores;
  if (notes) match.notes = notes;
  // Advance winners if all matches in round are decided
  if (data.matches.filter(m => m.round === data.roundNumber && !m.winner).length === 0) {
    // Next round
    const winners = data.matches.filter(m => m.round === data.roundNumber).map(m => m.winner);
    if (winners.length > 1) {
      let nextBracket = [];
      for (let i = 0; i < winners.length; i += 2) {
        nextBracket.push([winners[i], winners[i + 1] || null]);
      }
      let nextMatches = nextBracket.map((pair, idx) => ({
        round: data.roundNumber + 1,
        matchIndex: idx,
        players: pair,
        winner: null,
        scores: [],
        chat: [],
        notes: ""
      }));
      data.bracket = nextBracket;
      data.matches.push(...nextMatches);
      data.roundNumber++;
    } else {
      // Tournament finished
      data.meta.status = "Finished";
      data.standings = [winners[0], ...data.participants.filter(p => p.name !== winners[0]).map(p => p.name)];
    }
  }
  saveData(tournament, data);
  res.send({ match });
});

// Match Chat/Notes
app.post('/match/chat', (req, res) => {
  const { tournament, matchIndex, round } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  let match = data.matches.find(m => m.matchIndex === Number(matchIndex) && m.round === Number(round));
  if (!match) return res.status(404).send('Match not found');
  const { user, message } = req.body;
  if (!user || !message) return res.status(400).send('User and message required');
  match.chat.push({ user, message, timestamp: new Date().toISOString() });
  saveData(tournament, data);
  res.send({ chat: match.chat });
});

// Standings
app.get('/standings', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  res.send({ standings: data.standings || [] });
});

// Export/Import
app.get('/export', (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  res.setHeader('Content-Disposition', `attachment; filename=${sanitizeName(tournament)}.json`);
  res.json(data);
});

app.post('/import', (req, res) => {
  const { name, data } = req.body;
  if (!name || !data) return res.status(400).send('Name and data required');
  if (fs.existsSync(getDataFile(name))) return res.status(409).send('Tournament already exists');
  saveData(name, data);
  res.send({ imported: name });
});

// Pagination for Participants
app.get('/participants/paged', (req, res) => {
  const { tournament, page = 1, perPage = 10 } = req.query;
  if (!tournament) return res.status(400).send('Tournament name required');
  let data = loadData(tournament);
  if (!data) return res.status(404).send('Tournament not found');
  const start = (Number(page) - 1) * Number(perPage);
  const end = start + Number(perPage);
  res.send({
    participants: data.participants.slice(start, end),
    total: data.participants.length,
    page: Number(page),
    perPage: Number(perPage)
  });
});

// --- Start Server ---
const PORT = 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));