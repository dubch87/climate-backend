import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const NOAA_TOKEN = process.env.NOAA_TOKEN;

const cache = {}; // simple in-memory cache by stationId

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchData(stationId, datatypeId) {
  const allResults = [];
  const limit = 1000;
  let offset = 1;
  let totalCount = Infinity;

  while (offset < totalCount) {
    const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&datatypeid=${datatypeId}&stationid=${stationId}&startdate=1991-01-01&enddate=2020-12-31&units=standard&limit=${limit}&offset=${offset}`;

    const res = await fetch(url, {
      headers: { token: NOAA_TOKEN },
    });

    if (!res.ok) {
      throw new Error(`NOAA API error for ${datatypeId} at offset ${offset}: ${res.status}`);
    }

    const data = await res.json();

    if (!data.results) break;

    allResults.push(...data.results);

    if (totalCount === Infinity && data.metadata?.resultset?.count) {
      totalCount = data.metadata.resultset.count;
    }

    offset += limit;

    await delay(300);
  }

  return allResults;
}

function aggregateByYear(data) {
  // Aggregate values by year, convert to Fahrenheit
  const grouped = {};

  data.forEach(d => {
    const year = new Date(d.date).getFullYear();
    const celsius = d.value / 10;
    const fahrenheit = (celsius * 9) / 5 + 32;

    if (!grouped[year]) grouped[year] = [];
    grouped[year].push({ year, value: fahrenheit });
  });

  // Flatten grouped data for plotting
  const result = [];
  for (const year in grouped) {
    result.push(...grouped[year]);
  }

  return result;
}

app.get('/api/station', async (req, res) => {
  const { id, month, day } = req.query;

  if (!id || !month || !day) {
    return res.status(400).json({ error: 'Missing station id, month, or day' });
  }

  const cacheKey = `${id}-${month}-${day}`;
  if (cache[cacheKey]) {
    return res.json(cache[cacheKey]);
  }

  try {
    const [tminRaw, tmaxRaw] = await Promise.all([
      fetchData(id, 'TMIN'),
      fetchData(id, 'TMAX'),
    ]);

    const filterByDate = (data) =>
      data.filter(d => {
        const date = new Date(d.date);
        return (
          date.getUTCMonth() + 1 === parseInt(month, 10) &&
          date.getUTCDate() === parseInt(day, 10)
        );
      });

    const convertToFahrenheit = (data) =>
      data.map(d => ({
        year: new Date(d.date).getUTCFullYear(),
        value: (d.value / 10) * 9 / 5 + 32, // tenths °C to °F
      }));

    const tmin = convertToFahrenheit(filterByDate(tminRaw));
    const tmax = convertToFahrenheit(filterByDate(tmaxRaw));

    const result = { tmin, tmax };
    cache[cacheKey] = result;

    res.json(result);
  } catch (err) {
    console.error('Error fetching daily station data:', err);
    res.status(500).json({ error: 'Data fetch failed' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.send('NOAA backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
