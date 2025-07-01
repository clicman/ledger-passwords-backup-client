const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'out')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'out', 'index.html'));
});

const server = app.listen(0, () => {
  console.log(
    `Express server running at http://localhost:${server.address().port}`,
  );
});

module.exports = { server };
