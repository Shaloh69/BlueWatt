const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const TARGET = 'https://bluewatt-api-ydhd.onrender.com';

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  on: {
    error: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(502).json({ error: 'Proxy error', detail: err.message });
    },
  },
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on :${PORT} → ${TARGET}`));
