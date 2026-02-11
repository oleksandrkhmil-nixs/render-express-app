import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 8000;

app.use(express.json());
app.use(cors());

// Define a type for your move object (adjust this based on your actual data structure)
interface RequestBody {
  id?: number;
  name?: string;
  // Add other properties as needed
}

app.get('/', (req: Request, res: Response) => {
  res.send('Hello world!');
});

app.post('/post', (req: Request, res: Response) => {
  console.log(req.body);

  // You need to define what 'move' is or get it from somewhere
  // This is just an example - replace with your actual data
  const move: RequestBody = req.body; // or whatever your move data is

  res.json(move);
});

app.get('/healthz', (req: Request, res: Response) => {
  res.json({ status: 'OK' });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
