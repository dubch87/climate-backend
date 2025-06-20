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

app.get('/api/stations', async (req, res) => {
  try {
    const allStations = [];
    let offset = 0;
    const limit = 1000;
    let totalCount = Infinity;

    while (offset < totalCount) {
      const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/stations?datasetid=GHCND&locationid=FIPS:37&limit=${limit}&offset=${offset}`; // FIPS:37 = North Carolina

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

      // Avoid NOAA rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    res.json(allStations);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});



// Root route
app.get('/', (req, res) => {
  res.send('NOAA backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
