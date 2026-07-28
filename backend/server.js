require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const contractsRouter = require('./routes/contracts');
const { startScheduler, runAllScrapers } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/contracts', contractsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Manually trigger a scrape run (e.g. curl -X POST http://localhost:3000/api/scrape-now)
app.post('/api/scrape-now', async (req, res) => {
  res.json({ started: true });
  runAllScrapers().catch((err) => console.error('Manual scrape failed:', err));
});

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Contract Tracker running on http://localhost:${PORT}`);
  startScheduler();
  // Run once at boot so the dashboard has data immediately
  runAllScrapers().catch((err) => console.error('Initial scrape failed:', err));
});
