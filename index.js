const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process?.env?.PORT ?? 8000;

app.use(express.json());

app.use(cors())

app.get('/', (req, res) => {
    res.send('Hello world!')
});

app.post('/post', (req, res) => {
  console.log(req.body)
  res.json(move);
});

app.get('/healthz', (req, res) => {
  res.send({status: 'OK'})
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
