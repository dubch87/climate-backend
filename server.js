import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const NOAA_TOKEN = process.env.NOAA_TOKEN;

const cache = {}; // In-memory cache to avoid re-querying

// Delay helper to throttle API requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/api/stations', async (req, res) => {
  try {
    const allStations = [];
    let offset = 0;
    const limit = 1000;
    let totalCount = Infinity;

    while (offset < totalCount) {
      const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/stations?datasetid=GHCND&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: { token: NOAA_TOKEN },
      });

      if (!response.ok) {
        console.error(`NOAA error at offset ${offset}: ${response.status}`);
        break;
      }

      const data = await response.json();
      if (!data.results) break;

      if (totalCount === Infinity && data.metadata?.resultset?.count) {
        totalCount = data.metadata.resultset.count;
      }

      //const filtered = data.results
      //  .filter(s => s.latitude && s.longitude)
      //  .map(s => ({
      //    id: s.id,
      //    name: s.name,
      //    lat: s.latitude,
      //    lon: s.longitude,
      //  }));

      const filtered = data.results
        .filter(s => s.latitude && s.longitude && s.state === 'NC')
        .map(s => ({
          id: s.id,
          name: s.name,
          lat: s.latitude,
          lon: s.longitude,
        }));

      allStations.push(...filtered);
      offset += limit;

      // Optional throttle to avoid rate limiting
      await delay(300);
    }

    res.json(allStations);
  } catch (error) {
    console.error('Error fetching all stations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Optional root route
app.get('/', (req, res) => {
  res.send('NOAA backend is running.');
});

app.listen(PORT, () => {
  // server started
});
