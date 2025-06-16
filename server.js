import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const NOAA_TOKEN = process.env.NOAA_TOKEN;

const cache = {}; // In-memory cache to avoid re-querying

// Delay helper to throttle API requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/api/station', async (req, res) => {
  const { id, month, day } = req.query;

  if (!id || !month || !day) {
    return res.status(400).json({ error: 'Missing station id, month, or day.' });
  }

  const cacheKey = `${id}_${month}_${day}`;
  if (cache[cacheKey]) {
    return res.json(cache[cacheKey]);
  }

  const startYear = 1991;
  const endYear = 2020;
  const tminData = [];
  const tmaxData = [];

  for (let year = startYear; year <= endYear; year++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&stationid=${id}&startdate=${date}&enddate=${date}&datatypeid=TMIN,TMAX&limit=1000&`;

    try {
      const response = await fetch(url, {
        headers: { token: NOAA_TOKEN },
      });

      if (!response.ok) {
        continue; // skip if failed
      }

      const data = await response.json();
      if (!data.results) continue;

      let tmin = null;
      let tmax = null;

      data.results.forEach(r => {
        const valueC = r.value / 10;
        const valueF = (valueC * 9/5) + 32;

        if (r.datatype === 'TMIN') tmin = valueF;
        if (r.datatype === 'TMAX') tmax = valueF;
      });

      if (tmin !== null) tminData.push({ year, value: tmin });
      if (tmax !== null) tmaxData.push({ year, value: tmax });

    } catch (err) {
      // silently skip
    }

    await delay(250); // wait 250ms between requests to avoid hitting API limits
  }

  const result = { tmin: tminData, tmax: tmaxData };
  cache[cacheKey] = result;
  res.json(result);
});

// Optional root route
app.get('/', (req, res) => {
  res.send('NOAA backend is running.');
});

app.listen(PORT, () => {
  // server started
});
