import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const NOAA_TOKEN = process.env.NOAA_TOKEN;

const cache = {}; // Simple in-memory cache

app.get('/api/station', async (req, res) => {
  const { id, month, day } = req.query;

  if (!id || !month || !day) {
    return res.status(400).json({ error: 'Missing station id, month, or day.' });
  }

  const cacheKey = `${id}_${month}_${day}`;
  if (cache[cacheKey]) {
    console.log(`Cache hit: ${cacheKey}`);
    return res.json(cache[cacheKey]);
  }

  const startYear = 1991;
  const endYear = 2020;
  const tminData = [];
  const tmaxData = [];

  for (let year = startYear; year <= endYear; year++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&stationid=${id}&startdate=${date}&enddate=${date}&datatypeid=TMIN,TMAX&limit=1000`;

    try {
      const response = await fetch(url, {
        headers: { token: NOAA_TOKEN },
      });

      if (!response.ok) {
        console.error(`NOAA API error for ${date}: ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();

      if (!data.results) continue;

      data.results.forEach(r => {
        const yr = new Date(r.date).getUTCFullYear();
        const valueC = r.value / 10;
        const valueF = (valueC * 9/5) + 32;


        if (r.datatype === 'TMIN') tminData.push({ year: yr, value: valueF });
        if (r.datatype === 'TMAX') tmaxData.push({ year: yr, value: valueF });
      });
    } catch (err) {
      console.error(`Error fetching for ${date}:`, err.message);
    }
  }

  const result = { tmin: tminData, tmax: tmaxData };
  cache[cacheKey] = result; // Cache it
  res.json(result);
});

app.get('/', (req, res) => {
  res.send('NOAA backend is running.');
});

app.listen(PORT, () => {
  console.log(`NOAA backend running on port ${PORT}`);
});
