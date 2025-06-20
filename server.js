import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';  // Make sure to install node-fetch if needed

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const NOAA_TOKEN = process.env.NOAA_TOKEN;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cToF(celsius) {
  return (celsius * 9/5) + 32;
}

// Endpoint to get all NC stations
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

      if (!response.ok) {
        console.error(`NOAA error at offset ${offset}: ${response.status}`);
        break;
      }

      const data = await response.json();

      if (!data.results) break;

      if (totalCount === Infinity && data.metadata?.resultset?.count) {
        totalCount = data.metadata.resultset.count;
        console.log('Total stations in NC:', totalCount);
      }

      console.log(`Fetched ${data.results.length} stations at offset ${offset}`);

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
  } catch (error) {
    console.error('Error fetching all stations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to get Tmin and Tmax data for a station on given month/day for current year
app.get('/api/station', async (req, res) => {
  const { id, month, day } = req.query;

  if (!id || !month || !day) {
    return res.status(400).json({ error: 'Missing id, month or day parameter' });
  }

  try {
    const year = new Date().getFullYear();
    const monthPadded = month.toString().padStart(2, '0');
    const dayPadded = day.toString().padStart(2, '0');
    const startDate = `${year}-${monthPadded}-${dayPadded}`;
    const endDate = startDate;

    const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&stationid=${id}&startdate=${startDate}&enddate=${endDate}&units=metric&limit=1000`;

    const response = await fetch(url, {
      headers: { token: NOAA_TOKEN },
    });

    if (!response.ok) {
      console.error(`NOAA API error fetching data for ${id}: ${response.status}`);
      return res.status(404).json({ error: 'Data not found' });
    }

    const data = await response.json();

    const tmin = [];
    const tmax = [];

    if (data.results) {
      data.results.forEach(record => {
        if (record.datatype === 'TMIN') {
          tmin.push({ value: cToF(record.value / 10), year });
        }
        if (record.datatype === 'TMAX') {
          tmax.push({ value: cToF(record.value / 10), year });
        }
      });
    }

    res.json({ tmin, tmax });
  } catch (error) {
    console.error('Error fetching station data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Root endpoint for sanity check
app.get('/', (req, res) => {
  res.send('NOAA backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
