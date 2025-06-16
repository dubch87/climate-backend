const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');  // <-- This is essential

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
    const url = `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&stationid=${id}&startdate=${date}&enddate=${date}&datatypeid=TMIN,TMAX&limit=1000&units=metric`;

    try {
      const response = await fetch(url, {
        headers: { token: NOAA_TOKEN },
      });

      const data = await response.json();

      if (!data.results) continue;

      data.results.forEach(r => {
        const year = new Date(r.date).getUTCFullYear();
        const valueC = r.value / 10; // NOAA uses tenths of °C

        if (r.datatype === 'TMIN') tminData.push({ year, value: valueC });
        if (r.datatype === 'TMAX') tmaxData.push({ year, value: valueC });
      });
    } catch (err) {
      console.error(`Error fetching for ${date}:`, err.message);
    }
  }

  const result = { tmin: tminData, tmax: tmaxData };
  cache[cacheKey] = result; // Cache it
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`NOAA backend running on port ${PORT}`);
});
