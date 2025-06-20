import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const NOAA_TOKEN = process.env.NOAA_TOKEN;

const cache = {};
const delay = ms => new Promise(res => setTimeout(res, ms));

// Fetch 1991–2020 data for a datatype (TMIN/TMAX)
async function fetchData(stationId, datatype) {
  const results = [];
  const startYear = 1991;
  const endYear = 2020;

  for (let year = startYear; year <= endYear; year++) {
    const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&stationid=${stationId}&datatypeid=${datatype}&startdate=${year}-01-01&enddate=${year}-12-31&units=metric&limit=1000`;

    const response = await fetch(url, {
      headers: { token: NOAA_TOKEN },
    });

    if (!response.ok) {
      console.error(`NOAA fetch error (${datatype}, ${year}): ${response.status}`);
      continue;
    }

    const json = await response.json();
    if (json.results) results.push(...json.results);

    await delay(300); // Rate limit protection
  }

  return results;
}

// ✅ GET stations in NC
app.get('/api/stations', async (req, res) => {
  try {
    const allStations = [];
    let offset = 0;
    const limit = 1000;
    let totalCount = Infinity;

    while (offset < totalCount) {
      const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/stations?datasetid=GHCND&locationid=FIPS:37&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: { token: NOAA_TOKEN },
      });

      if (!response.ok) break;

      const data = await response.json();
      if (!data.results) break;

      if (totalCount === Infinity && data.metadata?.resultset?.count) {
        totalCount = data.metadata.resultset.count;
      }

      const filtered = data.results
        .filter(s => s.latitude && s.longitude)
        .map(s => ({
          id: s.id,
          name: s.name,
          lat: s.latitude,
          lon: s.longitude,
        }));

      allStations.push(...filtered);
      offset += limit;
      await delay(300);
    }

    res.json(allStations);
  } catch (err) {
    console.error('Station fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// ✅ GET climate data for a specific station & date
app.get('/api/station', async (req, res) => {
  const { id, month, day } = req.query;
  if (!id || !month || !day) {
    return res.status(400).json({ error: 'Missing station id, month, or day' });
  }

  const cacheKey = `${id}-${month}-${day}`;
  if (cache[cacheKey]) return res.json(cache[cacheKey]);

  try {
    const [tminRaw, tmaxRaw] = await Promise.all([
      fetchData(id, 'TMIN'),
      fetchData(id, 'TMAX'),
    ]);

    const filterByDate = (data) =>
      data.filter(d => {
        const date = new Date(d.date);
        return (
          date.getUTCMonth() + 1 === parseInt(month) &&
          date.getUTCDate() === parseInt(day)
        );
      });

    const toFahrenheit = d => (d.value / 10) * 9 / 5 + 32;

    const tmin = filterByDate(tminRaw).map(d => ({
      year: new Date(d.date).getUTCFullYear(),
      value: toFahrenheit(d),
    }));

    const tmax = filterByDate(tmaxRaw).map(d => ({
      year: new Date(d.date).getUTCFullYear(),
      value: toFahrenheit(d),
    }));

    const result = { tmin, tmax };
    cache[cacheKey] = result;

    res.json(result);
  } catch (err) {
    console.error('Climate fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch station data' });
  }
});

app.get('/', (req, res) => {
  res.send('NOAA backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
